import { wallClock } from './clock';

// The Relay (docs/adr/0005-a-turn-relay-for-versus.md, docs/versus-design.md
// §2): the TURN server that carries a Versus connection when the two devices
// can't reach each other directly. Its short-lived credentials come from a
// small Cloudflare Worker (workers/turn/worker.js) at RELAY_URL, though any
// URL that answers with ICE servers will do. The fetch and the clock are
// injected, so the tests run in Node.

/**
 * The Worker's address, `https://tavern-turn.<subdomain>.workers.dev`. Empty
 * means no Relay: Versus connects as it did before, over public STUN only.
 * docs/relay-setup.md says how to make one.
 */
export const RELAY_URL = '';

/**
 * Tests point the Relay elsewhere in an init script: at a route Playwright
 * answers (e2e/versus.spec.ts), or at a real Worker (e2e/relay.spec.ts).
 */
declare global {
  var TAVERN_RELAY_URL: string | undefined;
}

/** A TURN server with its credentials, as RTCPeerConnection takes it. */
export interface RelayServer {
  readonly urls: readonly string[];
  readonly username: string;
  readonly credential: string;
}

/**
 * - `no-url`: no Relay is set up (RELAY_URL is empty).
 * - `unreachable`: the fetch failed or took over 3 s: offline, blocked, or refused by CORS.
 * - `bad-response`: an HTTP error, or no TURN server with credentials in what came back.
 */
export type RelayProblem = 'no-url' | 'unreachable' | 'bad-response';

export type Relay =
  | {
    readonly ok: true;
    readonly servers: readonly RelayServer[];
    /** Reused for every new connection until then, in ms since 1970. */
    readonly until: number;
  }
  | {
    readonly ok: false;
    readonly why: RelayProblem;
    /** For the console: an HTTP status, `timeout`, an error's message. */
    readonly detail: string;
  };

/** What getRelay reads of fetch's answer. */
export interface RelayResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface RelayDeps {
  /** The Relay's URL, '' for none. Read on every call, so an init script may set it. */
  readonly url?: () => string;
  readonly fetch?: (url: string, init: RequestInit) => Promise<RelayResponse>;
  /** Ms since 1970: the credentials expire at a time of day. */
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

/** A Relay that hasn't answered in this long counts as unreachable, so making a code never waits long on it. */
export const RELAY_TIMEOUT_MS = 3000;
/** Credentials are fetched again this long before they expire (10 min), so none runs out mid-Run. */
export const RELAY_MARGIN_MS = 600_000;
/**
 * The longest credentials are reused after their fetch, by this device's own
 * clock (1 h), so a device whose clock is hours behind never reuses expired
 * ones; also how long ones that name no expiry are kept.
 */
export const RELAY_KEEP_MS = 3_600_000;

/** The Relay's URL: the test hook's, else RELAY_URL. */
export function relayUrl(): string {
  return globalThis.TAVERN_RELAY_URL ?? RELAY_URL;
}

const isObject = (x: unknown): x is { readonly [key: string]: unknown } => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A `turn:` or `turns:` URL on any port but 53: DNS's port is often blocked, and waiting on it would hold up gathering. */
function keepUrl(url: string): boolean {
  const m = /^(turns?):(\[[^\]]*\]|[^:?/]*)(?::(\d+))?/i.exec(url.trim());
  if (!m) return false;
  const port = m[3] ? Number(m[3]) : m[1]!.toLowerCase() === 'turns' ? 5349 : 3478;
  return port !== 53;
}

/**
 * The TURN servers in a Relay's answer: Cloudflare's `{ iceServers: [...] }`
 * or metered.ca's plain array. Keeps the `turn:` and `turns:` URLs of entries
 * with a username and a credential, less port 53's; STUN goes, since rtc.ts
 * has its own. Null when nothing is left.
 */
export function relayServers(body: unknown): RelayServer[] | null {
  const list = Array.isArray(body) ? body : isObject(body) && Array.isArray(body['iceServers']) ? body['iceServers'] : null;
  if (!list) return null;
  const out: RelayServer[] = [];
  for (const entry of list as unknown[]) {
    if (!isObject(entry)) continue;
    const { username, credential } = entry;
    if (typeof username !== 'string' || typeof credential !== 'string' || username === '' || credential === '') continue;
    const raw = Array.isArray(entry['urls']) ? entry['urls'] as unknown[] : [entry['urls']];
    const urls = raw.filter((u): u is string => typeof u === 'string' && keepUrl(u)).map((u) => u.trim());
    if (urls.length > 0) out.push({ urls, username, credential });
  }
  return out.length > 0 ? out : null;
}

/**
 * A source of the Relay's servers. Each call is a fresh connection's (a Host
 * code, a Guest's answer, a Reconnect, a Rejoin): it reuses the last
 * credentials until 10 minutes before they expire and for at most 1 h,
 * shares a fetch already under way, and never throws. A failure isn't kept,
 * so the next connection tries again.
 */
export function createRelay(deps: RelayDeps = {}): () => Promise<Relay> {
  const url = deps.url ?? relayUrl;
  const get = deps.fetch ?? ((u: string, init: RequestInit) => fetch(u, init));
  const now = deps.now ?? wallClock;
  const timeoutMs = deps.timeoutMs ?? RELAY_TIMEOUT_MS;
  let kept: { readonly url: string; readonly relay: Relay & { readonly ok: true } } | null = null;
  let pending: { readonly url: string; readonly promise: Promise<Relay> } | null = null;

  async function fetchOnce(at: string): Promise<Relay> {
    const signal = AbortSignal.timeout(timeoutMs);
    // Also a timer of its own, in case a fetch ignores the signal.
    const late = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
    let res: RelayResponse;
    try {
      // A plain GET with no headers of our own, so the browser sends no CORS preflight; no cookies either.
      res = await Promise.race([get(at, { signal, cache: 'no-store', credentials: 'omit' }), late]);
    } catch (err) {
      return { ok: false, why: 'unreachable', detail: signal.aborted ? 'timeout' : err instanceof Error ? err.message : String(err) };
    }
    if (!res.ok) return { ok: false, why: 'bad-response', detail: `HTTP ${res.status}` };
    let body: unknown;
    try {
      body = await Promise.race([res.json(), late]);
    } catch {
      return signal.aborted ? { ok: false, why: 'unreachable', detail: 'timeout' } : { ok: false, why: 'bad-response', detail: 'not JSON' };
    }
    const servers = relayServers(body);
    if (!servers) return { ok: false, why: 'bad-response', detail: 'no TURN server with credentials' };
    const expires = isObject(body) ? body['expiresAt'] : undefined;
    const keep = now() + RELAY_KEEP_MS;
    const until = typeof expires === 'number' && Number.isFinite(expires) ? Math.min(expires - RELAY_MARGIN_MS, keep) : keep;
    return { ok: true, servers, until };
  }

  return () => {
    const at = url().trim();
    if (at === '') return Promise.resolve({ ok: false, why: 'no-url', detail: 'no Relay is set up' });
    if (kept && kept.url === at && now() < kept.relay.until) return Promise.resolve(kept.relay);
    if (pending && pending.url === at) return pending.promise;
    const promise = fetchOnce(at).then((relay) => {
      if (pending?.promise === promise) pending = null;
      // Credentials that expire within the margin still serve this connection, but aren't kept for the next.
      if (relay.ok && now() < relay.until) kept = { url: at, relay };
      return relay;
    });
    pending = { url: at, promise };
    return promise;
  };
}

/** The app's Relay: one cache, so Host and Join can fetch ahead what the code then uses. */
export const getRelay = createRelay();
