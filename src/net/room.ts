import { after, type Clock } from './clock';
import type { Role } from './session';
import type { Route } from './transport';

// A Versus room on the Relay (docs/versus-design.md §2, server/src/server.ts):
// the WebSocket that makes (Host) or enters (Guest) a room by its Room code,
// says whether the Rival's app is in it, passes WebRTC's offer, answer and
// candidates between the two, and carries relayed frames. A dropped socket
// comes back by itself and takes its seat back by the room's token, so a phone
// that went to the background is found again. The socket and the clock are
// injected, so the tests run it in Node.

/** What the app and the Relay speak (server/src/server.ts `PROTOCOL`). */
export const ROOM_PROTOCOL = 1;
/** A Room code's letters and digits, as the Relay draws them (server/src/rooms.ts): no O or 0, no I or 1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

/** Whether text is a Room code as the Relay makes them. */
export function isRoomCode(text: string): boolean {
  return text.length === ROOM_CODE_LENGTH && [...text].every((c) => ROOM_CODE_ALPHABET.includes(c));
}
/** Making or entering a room keeps trying this long (90 s): a cold start on Render's free plan takes about a minute. */
export const OPEN_MS = 90_000;
/** A socket that hasn't opened this long after a drop (20 s) is given up and tried again. */
export const RETRY_CONNECT_MS = 20_000;
/** A keepalive this often (25 s), so no proxy drops a quiet socket. */
export const KEEPALIVE_MS = 25_000;
/** Waits before each new try after a socket drops: 1, 2, 4, 8, then 15 s. */
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 15_000];

/**
 * Why a room can't be had:
 * - `unreachable`: the Relay didn't answer in 90 s: offline, blocked, or down.
 * - `no-room`: no room has that code (a typo, or one closed long ago).
 * - `full`: the room already has its Guest.
 * - `taken`: the Host's room was lost and its code now belongs to another.
 * - `busy`: the Relay is at its limits, or this network made too many rooms.
 * - `version`: the Relay speaks another version of this protocol.
 * - `expired`: nobody joined the Host's room in 15 minutes.
 * - `closed`: the Relay closed the socket for another reason.
 */
export type RoomProblem = 'unreachable' | 'no-room' | 'full' | 'taken' | 'busy' | 'version' | 'expired' | 'closed';

/**
 * - `opening`: reaching the Relay to make or enter the room, trying for up to 90 s.
 * - `open`: in the room.
 * - `down`: the socket dropped once the room was open. It comes back by itself,
 *   unless the Relay closed an idle room, when the next connection reopens it.
 * - `failed`: see `problem`.
 */
export type RoomState = 'opening' | 'open' | 'down' | 'failed';

export interface RoomStatus {
  readonly role: Role;
  readonly state: RoomState;
  /** The Room code: the Guest's from the start, the Host's once the Relay gives one. */
  readonly code: string | null;
  /** The Rival's app is in the room. */
  readonly peer: boolean;
  /** When the room began opening, or last went down, on the injected clock. */
  readonly since: number;
  readonly problem: RoomProblem | null;
}

/** One ICE candidate, as `RTCIceCandidate.toJSON()` gives it. */
export interface IceCandidate {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
}

/**
 * What the two apps tell each other through the room while connecting
 * (route.ts). `n` numbers the Host's attempt, so a late answer to an older
 * offer is ignored. A null description means this device has no WebRTC, so
 * the connection goes through the Relay.
 */
export type Signal =
  | { readonly k: 'offer'; readonly n: number; readonly sdp: string | null; readonly session: string | null }
  | { readonly k: 'answer'; readonly n: number; readonly sdp: string | null }
  | { readonly k: 'ice'; readonly n: number; readonly c: IceCandidate }
  | { readonly k: 'route'; readonly n: number; readonly route: Route };

export type RoomEvent =
  | { readonly type: 'status'; readonly status: RoomStatus }
  | { readonly type: 'signal'; readonly signal: Signal }
  | { readonly type: 'relay'; readonly n: number; readonly text: string };

/** The part of a WebSocket the room uses. */
export interface RoomSocket {
  send(text: string): void;
  close(): void;
}

export interface SocketHandlers {
  open(): void;
  message(text: string): void;
  /** Also after an error, and after a socket that never opened. */
  close(): void;
}

export type OpenSocket = (url: string, on: SocketHandlers) => RoomSocket;

/** The browser's WebSocket. */
export const browserSocket: OpenSocket = (url, on) => {
  const ws = new WebSocket(url);
  ws.onopen = () => on.open();
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') on.message(e.data);
  };
  ws.onclose = () => on.close();
  return {
    send: (text) => ws.send(text),
    close: () => ws.close(),
  };
};

export interface RoomOptions {
  readonly role: Role;
  /** The Guest's Room code; the Host gets one from the Relay. */
  readonly code?: string;
  /** The room socket's address (relay.ts `roomSocketUrl`). */
  readonly url: string;
  readonly clock: Clock;
  readonly socket?: OpenSocket;
  readonly openMs?: number;
}

export interface Room {
  readonly role: Role;
  status(): RoomStatus;
  /** Every change of status, signal and relayed frame. Returns the unsubscribe. */
  on(listener: (e: RoomEvent) => void): () => void;
  /** To the Rival's app; dropped unless the room is open. */
  signal(s: Signal): void;
  /** A relayed frame of attempt n; dropped unless the room is open. */
  relay(n: number, text: string): void;
  /** Opens the socket again now, if it's down or the Relay was unreachable. */
  reopen(): void;
  close(): void;
}

const isObject = (x: unknown): x is { readonly [key: string]: unknown } => typeof x === 'object' && x !== null && !Array.isArray(x);
const isRoute = (x: unknown): x is Route => x === 'direct' || x === 'relayed';
const sdpOrNull = (x: unknown): x is string | null => x === null || typeof x === 'string';

/** A Signal from the Rival's app, or null for anything malformed. */
export function readSignal(d: unknown): Signal | null {
  if (!isObject(d) || typeof d['n'] !== 'number' || !Number.isSafeInteger(d['n'])) return null;
  const n = d['n'];
  switch (d['k']) {
    case 'offer':
      return sdpOrNull(d['sdp']) && sdpOrNull(d['session']) ? { k: 'offer', n, sdp: d['sdp'], session: d['session'] } : null;
    case 'answer':
      return sdpOrNull(d['sdp']) ? { k: 'answer', n, sdp: d['sdp'] } : null;
    case 'ice': {
      const c = d['c'];
      if (!isObject(c) || typeof c['candidate'] !== 'string') return null;
      const mid = c['sdpMid'];
      const line = c['sdpMLineIndex'];
      return {
        k: 'ice', n,
        c: { candidate: c['candidate'], sdpMid: typeof mid === 'string' ? mid : null, sdpMLineIndex: typeof line === 'number' ? line : null },
      };
    }
    case 'route':
      return isRoute(d['route']) ? { k: 'route', n, route: d['route'] } : null;
    default:
      return null;
  }
}

/** The Relay's errors that end the room for good; `idle` only rests it, and anything else is `closed`. */
const FINAL: Readonly<Record<string, RoomProblem>> = {
  'no-room': 'no-room', full: 'full', taken: 'taken', busy: 'busy', rate: 'busy', version: 'version', expired: 'expired',
};

export function openRoom(opts: RoomOptions): Room {
  const { clock, role } = opts;
  const connect = opts.socket ?? browserSocket;
  const openMs = opts.openMs ?? OPEN_MS;
  const listeners = new Set<(e: RoomEvent) => void>();
  let status: RoomStatus = { role, state: 'opening', code: opts.code ?? null, peer: false, since: clock.now(), problem: null };
  let token: string | null = null;
  let socket: RoomSocket | null = null;
  /** The current socket got its `room` answer. */
  let entered = false;
  /** The Relay's last `error` on this socket, read when it closes. */
  let error: string | null = null;
  let tries = 0;
  let closed = false;
  /** The Relay closed the idle room: nothing reopens it until reopen(). */
  let resting = false;
  let cancelWait: (() => void) | null = null;
  let cancelDeadline: (() => void) | null = null;
  let cancelKeepalive: (() => void) | null = null;

  const emit = (e: RoomEvent): void => {
    for (const l of [...listeners]) l(e);
  };
  const set = (next: Partial<RoomStatus>): void => {
    status = { ...status, ...next };
    emit({ type: 'status', status });
  };
  const send = (m: object): void => {
    if (socket && entered) socket.send(JSON.stringify(m));
  };

  function enterMessage(): object {
    if (token !== null && status.code !== null) return { t: 'return', v: ROOM_PROTOCOL, code: status.code, role, token };
    return role === 'host' ? { t: 'create', v: ROOM_PROTOCOL } : { t: 'join', v: ROOM_PROTOCOL, code: status.code };
  }

  function stopTimers(): void {
    cancelWait?.();
    cancelDeadline?.();
    cancelKeepalive?.();
    cancelWait = cancelDeadline = cancelKeepalive = null;
  }

  function dial(): void {
    cancelWait?.();
    cancelWait = null;
    entered = false;
    error = null;
    const s = connect(opts.url, {
      open() {
        if (socket === s) s.send(JSON.stringify(enterMessage()));
      },
      message(text) {
        if (socket === s) heard(text);
      },
      close() {
        if (socket === s) dropped();
      },
    });
    socket = s;
    if (status.state !== 'opening') {
      // Reopening after a drop: a socket that hangs is tried again. Opening has its own deadline.
      cancelDeadline?.();
      cancelDeadline = after(clock, RETRY_CONNECT_MS, () => {
        if (socket === s && !entered) giveUp(s);
      });
    }
  }

  /** Closes a socket that never got in, as if it dropped. */
  function giveUp(s: RoomSocket): void {
    s.close();
    if (socket === s) dropped();
  }

  function heard(text: string): void {
    let m: unknown;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (!isObject(m)) return;
    switch (m['t']) {
      case 'room': {
        if (typeof m['code'] !== 'string' || typeof m['token'] !== 'string') return;
        entered = true;
        token = m['token'];
        tries = 0;
        cancelDeadline?.();
        cancelDeadline = null;
        cancelKeepalive?.();
        cancelKeepalive = clock.every(KEEPALIVE_MS, () => send({ t: 'ping' }));
        set({ state: 'open', code: m['code'], peer: m['peer'] === true, problem: null });
        return;
      }
      case 'peer':
        if (entered) set({ peer: m['here'] === true });
        return;
      case 'signal': {
        const signal = entered ? readSignal(m['d']) : null;
        if (signal) emit({ type: 'signal', signal });
        return;
      }
      case 'relay':
        if (entered && typeof m['n'] === 'number' && typeof m['d'] === 'string') emit({ type: 'relay', n: m['n'], text: m['d'] });
        return;
      case 'error':
        error = typeof m['why'] === 'string' ? m['why'] : 'closed';
        return;
      default:
    }
  }

  function fail(problem: RoomProblem): void {
    stopTimers();
    const s = socket;
    socket = null;
    s?.close();
    set({ state: 'failed', peer: false, problem });
  }

  function dropped(): void {
    socket = null;
    const was = entered;
    entered = false;
    cancelKeepalive?.();
    cancelKeepalive = null;
    if (closed) return;
    const why = error;
    error = null;
    if (why !== null && why in FINAL) return fail(FINAL[why]!);
    if (why === 'idle') {
      resting = true;
      cancelDeadline?.();
      cancelDeadline = null;
      return set({ state: 'down', peer: false, since: clock.now() });
    }
    if (why !== null) return fail('closed');
    if (status.state === 'opening' && !was) {
      // Still opening: the deadline gives up; until then, try again soon.
      cancelWait = after(clock, BACKOFF_MS[Math.min(tries++, 1)]!, dial);
      return;
    }
    if (status.state !== 'down') set({ state: 'down', peer: false, since: clock.now() });
    cancelWait = after(clock, BACKOFF_MS[Math.min(tries++, BACKOFF_MS.length - 1)]!, dial);
  }

  function open(): void {
    cancelDeadline = after(clock, openMs, () => {
      if (status.state === 'opening') fail('unreachable');
    });
    dial();
  }

  open();

  return {
    role,
    status: () => status,
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signal(s) {
      if (status.state === 'open') send({ t: 'signal', d: s });
    },
    relay(n, text) {
      if (status.state === 'open') send({ t: 'relay', n, d: text });
    },
    reopen() {
      if (closed) return;
      if (status.state === 'down' && (resting || socket === null)) {
        resting = false;
        tries = 0;
        dial();
      } else if (status.state === 'failed' && status.problem === 'unreachable') {
        tries = 0;
        set({ state: 'opening', since: clock.now(), problem: null });
        open();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      stopTimers();
      const s = socket;
      socket = null;
      s?.close();
      listeners.clear();
    },
  };
}
