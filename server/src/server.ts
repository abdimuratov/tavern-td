import { randomBytes, randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { createBucket, createKeyedBuckets, type Bucket } from './limits.ts';
import { allowedOrigin } from './origins.ts';
import { createRooms, type Entered, type Member, type RoomsOptions, type Seat } from './rooms.ts';

// The Relay (docs/adr/0006-a-relay-server-on-render.md): one small Node
// service on Render's free plan. `GET /health` answers for Render's health
// check and for the app's warm-up. A WebSocket at `/room` makes or enters a
// room by its Room code, passes WebRTC's offer, answer and ICE candidates
// between the two apps in it, and when they can't reach each other directly,
// relays their Versus messages as opaque text. It keeps nothing on disk and
// logs only counts.

/** What the app and the Relay speak; a room is entered only by the same. */
export const PROTOCOL = 1;
/** The largest frame either way: Versus' own 64 KiB cap. A bigger one closes the socket. */
export const MAX_FRAME_BYTES = 64 * 1024;
export const ROOM_PATH = '/room';

export interface RelayLimits {
  /** Sockets open at once, in all. */
  readonly sockets: number;
  /** Sockets open at once from one address: a household's devices and a few tabs. */
  readonly socketsPerAddress: number;
  /** Rooms made from one address: a burst, then a few a minute. */
  readonly createBurst: number;
  readonly createsPerMinute: number;
  /** Joins and returns from one address, failed ones too, so codes can't be guessed quickly. */
  readonly enterBurst: number;
  readonly entersPerMinute: number;
  /** Frames from one socket: a burst for a rejoin's resends, then far above a Run's 12 a second. */
  readonly frameBurst: number;
  readonly framesPerSecond: number;
  /** Bytes from one socket: a burst for a rejoin's snapshot, then far above a Run's few KB a second. */
  readonly byteBurst: number;
  readonly bytesPerSecond: number;
}

export const LIMITS: RelayLimits = {
  sockets: 1000,
  socketsPerAddress: 16,
  createBurst: 10,
  createsPerMinute: 2,
  enterBurst: 30,
  entersPerMinute: 10,
  frameBurst: 1000,
  framesPerSecond: 100,
  byteBurst: 2 * 1024 * 1024,
  bytesPerSecond: 64 * 1024,
};

export interface RelayOptions extends Partial<Pick<RoomsOptions, 'maxRooms' | 'graceMs' | 'waitMs' | 'idleMs'>> {
  readonly now?: () => number;
  readonly log?: (line: string) => void;
  readonly limits?: Partial<RelayLimits>;
  /** How often each socket is pinged; one that didn't answer the last ping is dropped (30 s). */
  readonly heartbeatMs?: number;
  /** How often rooms whose time is up are closed (10 s). */
  readonly sweepMs?: number;
  /** A socket must make or enter a room this soon after opening (30 s). */
  readonly enterMs?: number;
  /** How often the counts are logged, when anything happened (15 min). */
  readonly reportMs?: number;
}

/** Why the Relay sends an error, besides a room's own Refusal or Ending. */
type Fault = 'version' | 'bad' | 'busy' | 'rate' | 'enter';

interface Conn {
  readonly ws: WebSocket;
  readonly address: string;
  readonly member: Member;
  readonly frames: Bucket;
  readonly bytes: Bucket;
  entered: boolean;
  alive: boolean;
}

/** The client's address: the first of X-Forwarded-For, which Render's proxy sets, else the socket's. */
export function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

const isObject = (x: unknown): x is { readonly [key: string]: unknown } => typeof x === 'object' && x !== null && !Array.isArray(x);

export function createRelayServer(opts: RelayOptions = {}) {
  const now = opts.now ?? Date.now;
  const log = opts.log ?? (() => {});
  const limits: RelayLimits = { ...LIMITS, ...opts.limits };
  const rooms = createRooms({
    now,
    randomInt: (n) => randomInt(n),
    token: () => randomBytes(16).toString('base64url'),
    ...(opts.maxRooms === undefined ? {} : { maxRooms: opts.maxRooms }),
    ...(opts.graceMs === undefined ? {} : { graceMs: opts.graceMs }),
    ...(opts.waitMs === undefined ? {} : { waitMs: opts.waitMs }),
    ...(opts.idleMs === undefined ? {} : { idleMs: opts.idleMs }),
  });
  const creates = createKeyedBuckets(limits.createBurst, limits.createsPerMinute / 60, now);
  const enters = createKeyedBuckets(limits.enterBurst, limits.entersPerMinute / 60, now);
  const conns = new Set<Conn>();
  const perAddress = new Map<string, number>();
  let relayedFrames = 0;
  let relayedBytes = 0;
  let opened = 0;

  const http = createServer(answer);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false });

  function answer(req: IncomingMessage, res: ServerResponse): void {
    const path = new URL(req.url ?? '/', 'http://relay').pathname;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }).end('Method not allowed\n');
      return;
    }
    if (path === '/health') {
      // A plain GET from the app, so the browser sends no preflight; it may read the answer only from our pages.
      const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
      const origin = req.headers.origin;
      if (allowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
      res.writeHead(200, headers).end('ok\n');
      return;
    }
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end("Tavern TD's Versus relay: room codes, and a relay when two devices can't connect directly. https://github.com/abdimuratov/tavern-td\n");
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found\n');
  }

  function refuse(socket: Duplex, status: number, text: string): void {
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(req.url ?? '/', 'http://relay').pathname;
    if (path !== ROOM_PATH) return refuse(socket, 404, 'Not Found');
    if (!allowedOrigin(req.headers.origin)) return refuse(socket, 403, 'Forbidden');
    const address = clientAddress(req);
    if (conns.size >= limits.sockets || (perAddress.get(address) ?? 0) >= limits.socketsPerAddress) {
      return refuse(socket, 503, 'Service Unavailable');
    }
    wss.handleUpgrade(req, socket, head, (ws) => connected(ws, address));
  });

  function connected(ws: WebSocket, address: string): void {
    opened++;
    const member: Member = {
      send(text) {
        if (ws.readyState === ws.OPEN) ws.send(text);
      },
      close(code, reason) {
        ws.close(code, reason);
      },
    };
    const conn: Conn = {
      ws, address, member, entered: false, alive: true,
      frames: createBucket(limits.frameBurst, limits.framesPerSecond, now),
      bytes: createBucket(limits.byteBurst, limits.bytesPerSecond, now),
    };
    conns.add(conn);
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    const late = setTimeout(() => {
      if (!conn.entered) fault(conn, 'enter');
    }, opts.enterMs ?? 30_000);
    ws.on('message', (data: RawData, binary: boolean) => frame(conn, data, binary));
    ws.on('pong', () => {
      conn.alive = true;
    });
    ws.on('error', () => {
      // A close follows.
    });
    ws.on('close', () => {
      clearTimeout(late);
      conns.delete(conn);
      const left = (perAddress.get(address) ?? 1) - 1;
      if (left > 0) perAddress.set(address, left);
      else perAddress.delete(address);
      rooms.left(member);
    });
  }

  function send(conn: Conn, message: object): void {
    conn.member.send(JSON.stringify(message));
  }

  /** Says what went wrong and closes the socket. */
  function fault(conn: Conn, why: Fault): void {
    send(conn, { t: 'error', why });
    conn.ws.close(1008, why);
  }

  function frame(conn: Conn, data: RawData, binary: boolean): void {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    const bytes = buf.byteLength;
    if (!conn.frames.take() || !conn.bytes.take(bytes)) return fault(conn, 'rate');
    if (binary) return fault(conn, 'bad');
    const text = buf.toString('utf8');
    let m: unknown;
    try {
      m = JSON.parse(text);
    } catch {
      return fault(conn, 'bad');
    }
    if (!isObject(m) || typeof m['t'] !== 'string') return fault(conn, 'bad');
    const t = m['t'];
    if (t === 'ping') return send(conn, { t: 'pong' });
    if (!conn.entered) return enter(conn, m);
    if ((t === 'signal' && isObject(m['d'])) || (t === 'relay' && typeof m['d'] === 'string')) {
      if (t === 'relay') {
        relayedFrames++;
        relayedBytes += bytes;
      }
      // Passed on exactly as it came: the Relay never reads what Versus says.
      rooms.forward(conn.member, text);
      return;
    }
    fault(conn, 'bad');
  }

  function enter(conn: Conn, m: { readonly [key: string]: unknown }): void {
    const t = m['t'];
    if (t !== 'create' && t !== 'join' && t !== 'return') return fault(conn, 'bad');
    if (m['v'] !== PROTOCOL) return fault(conn, 'version');
    const allowed = t === 'create' ? creates.take(conn.address) : enters.take(conn.address);
    if (!allowed) return fault(conn, 'busy');
    let entered: Entered;
    if (t === 'create') {
      entered = rooms.create(conn.member);
    } else if (t === 'join') {
      entered = rooms.join(conn.member, String(m['code']));
    } else {
      const seat = m['role'];
      if ((seat !== 'host' && seat !== 'guest') || typeof m['token'] !== 'string' || m['token'] === '') return fault(conn, 'bad');
      entered = rooms.rejoin(conn.member, String(m['code']), seat as Seat, m['token']);
    }
    if (!entered.ok) {
      send(conn, { t: 'error', why: entered.why });
      conn.ws.close(1000, entered.why);
      return;
    }
    conn.entered = true;
    send(conn, { t: 'room', code: entered.code, role: entered.seat, token: entered.token, peer: entered.peer });
  }

  const heartbeat = setInterval(() => {
    for (const conn of conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
  }, opts.heartbeatMs ?? 30_000);
  const sweep = setInterval(() => {
    rooms.sweep();
    creates.prune();
    enters.prune();
  }, opts.sweepMs ?? 10_000);
  const report = setInterval(() => {
    if (opened === 0 && relayedFrames === 0) return;
    const c = rooms.counts();
    log(`rooms ${c.rooms}, sockets ${conns.size}; since the last line: ${opened} sockets opened, ${relayedFrames} frames relayed (${Math.round(relayedBytes / 1024)} KB)`);
    opened = 0;
    relayedFrames = 0;
    relayedBytes = 0;
  }, opts.reportMs ?? 900_000);
  for (const timer of [heartbeat, sweep, report]) timer.unref();

  return {
    /** Listens on the port (0 for any free one) and resolves to the one it got. */
    listen(port: number): Promise<number> {
      return new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, () => resolve((http.address() as AddressInfo).port));
      });
    },
    close(): Promise<void> {
      clearInterval(heartbeat);
      clearInterval(sweep);
      clearInterval(report);
      for (const conn of conns) conn.ws.terminate();
      wss.close();
      return new Promise((resolve) => http.close(() => resolve()));
    },
    counts: () => ({ ...rooms.counts(), sockets: conns.size }),
  };
}
