import type { Clock } from './clock';
import type { Room } from './room';
import type { Transport, TransportState } from './transport';

// The Relay (docs/adr/0006-a-relay-server-on-render.md, docs/versus-design.md
// §2): our small server on Render's free plan, `server/` in this repo. It
// gives out Room codes, passes WebRTC's offer and answer between the two apps
// in a room (room.ts), and when the two can't reach each other directly,
// relays their Versus messages. This module says where it is, wakes it ahead
// of need, and makes its relayed frames a Transport (route.ts picks Direct or
// Relayed). The fetch and the clock are injected, so the tests run in Node.

/**
 * The Relay's address: the `tavern-relay` service on Render. Empty would mean
 * no Relay, and Host and Join would go straight to the codes passed by hand.
 * docs/render-setup.md says how it was made.
 */
export const RELAY_URL = 'https://tavern-relay.onrender.com';

/** Tests point the app at a local Relay in an init script (e2e/fixtures.ts), or at none with ''. */
declare global {
  var TAVERN_RELAY_URL: string | undefined;
}

/** The Relay's address: the test hook's, else RELAY_URL, without a trailing slash. */
export function relayUrl(): string {
  return (globalThis.TAVERN_RELAY_URL ?? RELAY_URL).trim().replace(/\/+$/, '');
}

/** Where the room's WebSocket opens: `wss://…/room` for `https://…`. */
export function roomSocketUrl(base: string): string {
  return `${base.replace(/^http/i, 'ws')}/room`;
}

/** Where the warm-up and Render's health check knock. */
export function healthUrl(base: string): string {
  return `${base}/health`;
}

/**
 * - `idle`: not asked yet, or there's no Relay.
 * - `waking`: the health check hasn't answered yet: a cold start takes about a minute.
 * - `awake`: it answered.
 * - `down`: it failed, or took over 90 s.
 */
export type WakeState = 'idle' | 'waking' | 'awake' | 'down';

/** An answer counts as awake this long (10 min): Render's free plan sleeps after 15 min without traffic. */
export const AWAKE_MS = 600_000;
/** The warm-up waits this long for the cold start (90 s). */
export const WAKE_TIMEOUT_MS = 90_000;

export interface WakeDeps {
  /** The Relay's address, '' for none. Read on every call, so an init script may set it. */
  readonly url?: () => string;
  readonly fetch?: (url: string, init: RequestInit) => Promise<{ readonly ok: boolean }>;
  readonly clock: Pick<Clock, 'now'>;
  readonly timeoutMs?: number;
}

export interface Wake {
  /** Knocks on the Relay, unless it's already waking or answered in the last 10 minutes. */
  wake(): void;
  readonly state: WakeState;
  /** When the knock that's waking it began. */
  readonly since: number | null;
  /** Every change of state. Returns the unsubscribe. */
  on(listener: (state: WakeState) => void): () => void;
}

/**
 * The warm-up: a GET of `/health`, which the main menu sends as it shows Line
 * Wars' Versus row, so a sleeping Relay's cold start overlaps menu time. A
 * plain GET with no headers of ours, so no CORS preflight, and no cookies.
 */
export function createWake(deps: WakeDeps): Wake {
  const url = deps.url ?? relayUrl;
  const get = deps.fetch ?? ((u: string, init: RequestInit) => fetch(u, init));
  const listeners = new Set<(state: WakeState) => void>();
  let state: WakeState = 'idle';
  let since: number | null = null;
  let answered = -Infinity;
  const set = (next: WakeState): void => {
    state = next;
    for (const l of [...listeners]) l(next);
  };
  return {
    wake() {
      const base = url();
      if (base === '' || state === 'waking') return;
      if (state === 'awake' && deps.clock.now() - answered < AWAKE_MS) return;
      since = deps.clock.now();
      set('waking');
      get(healthUrl(base), { signal: AbortSignal.timeout(deps.timeoutMs ?? WAKE_TIMEOUT_MS), cache: 'no-store', credentials: 'omit' }).then(
        (res) => {
          if (res.ok) answered = deps.clock.now();
          set(res.ok ? 'awake' : 'down');
        },
        () => set('down'),
      );
    },
    get state() {
      return state;
    },
    get since() {
      return since;
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The relayed half of one connection (route.ts): Versus messages as `relay`
 * frames through the room, tagged with the attempt `n` that chose the Relay.
 * Open from the moment it's made, when both apps are in the room; closed for
 * good once either leaves it or the socket drops, as a DataChannel would be.
 */
export function relayTransport(room: Room, n: number): Transport {
  const st = room.status();
  let state: TransportState = st.state === 'open' && st.peer ? 'open' : 'closed';
  const messageListeners = new Set<(text: string) => void>();
  const stateListeners = new Set<(s: TransportState) => void>();
  const set = (next: TransportState): void => {
    if (state === next || state === 'closed') return;
    state = next;
    if (next === 'closed') off();
    for (const l of [...stateListeners]) l(next);
  };
  const off = room.on((e) => {
    if (e.type === 'relay' && e.n === n && state === 'open') {
      for (const l of [...messageListeners]) l(e.text);
    } else if (e.type === 'status' && (e.status.state !== 'open' || !e.status.peer)) {
      set('closed');
    }
  });
  if (state === 'closed') off();
  return {
    get state() {
      return state;
    },
    route: 'relayed',
    send(text) {
      if (state === 'open') room.relay(n, text);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onRoute() {
      // Relayed from the start: it never changes.
      return () => {};
    },
    close() {
      set('closed');
    },
  };
}
