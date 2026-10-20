import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { allowedOrigin } from '../src/origins.ts';
import { clientAddress, createRelayServer, MAX_FRAME_BYTES, PROTOCOL, type RelayOptions } from '../src/server.ts';

// The Relay over real sockets on a free local port
// (docs/adr/0006-a-relay-server-on-render.md): the health check, who may
// connect, making and joining rooms, what passes between the two, and the
// limits.

const PAGES = 'https://abdimuratov.github.io';

let stop: (() => Promise<void>) | null = null;
afterEach(async () => {
  await stop?.();
  stop = null;
});

async function relay(opts: RelayOptions = {}): Promise<string> {
  const server = createRelayServer(opts);
  const port = await server.listen(0);
  stop = () => server.close();
  return `127.0.0.1:${port}`;
}

interface Client {
  readonly ws: WebSocket;
  /** The next message, parsed. */
  next(): Promise<Record<string, unknown>>;
  send(message: unknown): void;
  /** Resolves with the close code once the socket closes. */
  readonly closed: Promise<number>;
}

function client(host: string, origin: string | null = PAGES, path = '/room'): Promise<Client> {
  const ws = new WebSocket(`ws://${host}${path}`, origin === null ? {} : { origin });
  const queue: Record<string, unknown>[] = [];
  const waiting: ((m: Record<string, unknown>) => void)[] = [];
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as Record<string, unknown>;
    const w = waiting.shift();
    if (w) w(m);
    else queue.push(m);
  });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve({
      ws,
      closed,
      next: () => (queue.length > 0 ? Promise.resolve(queue.shift()!) : new Promise((r) => waiting.push(r))),
      send: (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    }));
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.once('error', reject);
  });
}

describe('The health check', () => {
  it('answers ok, readable only from our pages, and never cached', async () => {
    const host = await relay();
    const ours = await fetch(`http://${host}/health`, { headers: { Origin: PAGES } });
    expect(ours.status).toBe(200);
    expect(await ours.text()).toBe('ok\n');
    expect(ours.headers.get('access-control-allow-origin')).toBe(PAGES);
    expect(ours.headers.get('cache-control')).toBe('no-store');
    const theirs = await fetch(`http://${host}/health`, { headers: { Origin: 'https://example.com' } });
    expect(theirs.status).toBe(200);
    expect(theirs.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(`http://${host}/nothing`)).status).toBe(404);
    expect((await fetch(`http://${host}/health`, { method: 'POST' })).status).toBe(405);
  });
});

describe('Who may connect', () => {
  it('allows the Pages site, the Android app and localhost, and nobody else', () => {
    for (const o of [PAGES, 'https://localhost', 'capacitor://localhost', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://localhost']) {
      expect(allowedOrigin(o)).toBe(true);
    }
    for (const o of [undefined, 'null', 'https://example.com', 'https://abdimuratov.github.io.evil.com', 'http://localhost.evil.com', 'https://localhost:8443']) {
      expect(allowedOrigin(o)).toBe(false);
    }
  });

  it('refuses a socket from another origin, with none, or at another path', async () => {
    const host = await relay();
    await expect(client(host, 'https://example.com')).rejects.toThrow('HTTP 403');
    await expect(client(host, null)).rejects.toThrow('HTTP 403');
    await expect(client(host, PAGES, '/elsewhere')).rejects.toThrow('HTTP 404');
    const ok = await client(host, 'capacitor://localhost');
    ok.ws.close();
  });

  it('takes the address from X-Forwarded-For, as Render forwards it', () => {
    const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '10.0.0.1' } }) as never;
    expect(clientAddress(req({ 'x-forwarded-for': '203.0.113.7, 10.1.2.3' }))).toBe('203.0.113.7');
    expect(clientAddress(req({}))).toBe('10.0.0.1');
  });

  it('caps the sockets open from one address', async () => {
    const host = await relay({ limits: { socketsPerAddress: 2 } });
    const a = await client(host);
    const b = await client(host);
    await expect(client(host)).rejects.toThrow('HTTP 503');
    a.ws.close();
    await a.closed;
    const c = await client(host);
    for (const s of [b, c]) s.ws.close();
  });
});

describe('Rooms over sockets', () => {
  it('makes a room, joins it by code, and passes signals and relayed frames exactly as sent', async () => {
    const host = await relay();
    const h = await client(host);
    h.send({ t: 'create', v: PROTOCOL });
    const made = await h.next();
    expect(made).toMatchObject({ t: 'room', role: 'host', peer: false });
    expect(made['code']).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(typeof made['token']).toBe('string');

    const g = await client(host);
    g.send({ t: 'join', v: PROTOCOL, code: made['code'] });
    expect(await g.next()).toMatchObject({ t: 'room', role: 'guest', code: made['code'], peer: true });
    expect(await h.next()).toEqual({ t: 'peer', here: true });

    h.send({ t: 'signal', d: { k: 'offer', n: 1, sdp: 'v=0' } });
    expect(await g.next()).toEqual({ t: 'signal', d: { k: 'offer', n: 1, sdp: 'v=0' } });
    const raw = '{"t":"relay","n":1,"d":"{\\"v\\":1,\\"t\\":\\"ping\\",\\"at\\":5}"}';
    g.send(raw);
    expect(await h.next()).toEqual(JSON.parse(raw));
    h.send({ t: 'ping' });
    expect(await h.next()).toEqual({ t: 'pong' });

    g.ws.close();
    expect(await h.next()).toEqual({ t: 'peer', here: false });
    h.ws.close();
  });

  it('says why it refuses: no such room, a full one, another version', async () => {
    const host = await relay();
    const a = await client(host);
    a.send({ t: 'join', v: PROTOCOL, code: 'ZZZZ' });
    expect(await a.next()).toEqual({ t: 'error', why: 'no-room' });
    expect(await a.closed).toBe(1000);

    const h = await client(host);
    h.send({ t: 'create', v: PROTOCOL });
    const { code } = await h.next();
    const g = await client(host);
    g.send({ t: 'join', v: PROTOCOL, code });
    await g.next();
    const third = await client(host);
    third.send({ t: 'join', v: PROTOCOL, code });
    expect(await third.next()).toEqual({ t: 'error', why: 'full' });

    const old = await client(host);
    old.send({ t: 'create', v: 0 });
    expect(await old.next()).toEqual({ t: 'error', why: 'version' });
    expect(await old.closed).toBe(1008);
    for (const s of [h, g]) s.ws.close();
  });

  it('lets an app take its seat back by its token, and makes the room again if the server lost it', async () => {
    const host = await relay();
    const h = await client(host);
    h.send({ t: 'return', v: PROTOCOL, code: 'K7QX', role: 'host', token: 'secret' });
    expect(await h.next()).toMatchObject({ t: 'room', code: 'K7QX', role: 'host', token: 'secret', peer: false });
    const stranger = await client(host);
    stranger.send({ t: 'return', v: PROTOCOL, code: 'K7QX', role: 'host', token: 'guess' });
    expect(await stranger.next()).toEqual({ t: 'error', why: 'taken' });
    const g = await client(host);
    g.send({ t: 'join', v: PROTOCOL, code: 'K7QX' });
    expect(await g.next()).toMatchObject({ role: 'guest', peer: true });
    for (const s of [h, g]) s.ws.close();
  });

  it('closes a socket that sends nonsense, a binary frame, or a frame over 64 KiB', async () => {
    const host = await relay();
    const a = await client(host);
    a.send('not json');
    expect(await a.next()).toEqual({ t: 'error', why: 'bad' });
    expect(await a.closed).toBe(1008);

    const b = await client(host);
    b.ws.send(Buffer.from([1, 2, 3]));
    expect(await b.next()).toEqual({ t: 'error', why: 'bad' });

    const h = await client(host);
    h.send({ t: 'create', v: PROTOCOL });
    await h.next();
    h.send({ t: 'relay', d: 'x'.repeat(MAX_FRAME_BYTES) });
    expect(await h.closed).toBe(1009);
  });

  it('closes a socket that enters no room in time', async () => {
    const host = await relay({ enterMs: 50 });
    const a = await client(host);
    expect(await a.next()).toEqual({ t: 'error', why: 'enter' });
    expect(await a.closed).toBe(1008);
  });
});

describe('Limits', () => {
  it('limits the rooms one address makes', async () => {
    const host = await relay({ limits: { createBurst: 2 } });
    const made: Client[] = [];
    for (let i = 0; i < 2; i++) {
      const c = await client(host);
      c.send({ t: 'create', v: PROTOCOL });
      expect(await c.next()).toMatchObject({ t: 'room' });
      made.push(c);
    }
    const c = await client(host);
    c.send({ t: 'create', v: PROTOCOL });
    expect(await c.next()).toEqual({ t: 'error', why: 'busy' });
    for (const s of made) s.ws.close();
  });

  it('limits joins from one address, failed ones too', async () => {
    const host = await relay({ limits: { enterBurst: 2 } });
    for (const why of ['no-room', 'no-room', 'busy']) {
      const c = await client(host);
      c.send({ t: 'join', v: PROTOCOL, code: 'ZZZZ' });
      expect(await c.next()).toEqual({ t: 'error', why });
    }
  });

  it('closes a socket sending frames faster than its limit', async () => {
    const host = await relay({ limits: { frameBurst: 5, framesPerSecond: 1 } });
    const h = await client(host);
    h.send({ t: 'create', v: PROTOCOL });
    await h.next();
    for (let i = 0; i < 10; i++) h.send({ t: 'relay', d: 'x' });
    expect(await h.next()).toEqual({ t: 'error', why: 'rate' });
    expect(await h.closed).toBe(1008);
  });
});
