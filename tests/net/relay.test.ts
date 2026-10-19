import { afterEach, describe, expect, it } from 'vitest';
import {
  createRelay, RELAY_KEEP_MS, RELAY_MARGIN_MS, relayServers, relayUrl, type Relay, type RelayDeps, type RelayResponse,
} from '../../src/net/relay';

// Fetching the Relay's credentials (docs/versus-design.md §2): what's kept of
// an answer, how long it's reused, and every way it can fail, over an
// injected fetch and clock.

const URL_ = 'https://tavern-turn.example.workers.dev/';
const T0 = 1_792_454_400_000;
const HOUR = 3_600_000;

/** What the Worker answers: Cloudflare's two kept URLs, credentials for 6 hours. */
const WORKER = {
  iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'user6h', credential: 'cred6h' }],
  expiresAt: T0 + 6 * HOUR,
};

/** Cloudflare's own answer, had the Worker passed it on whole: STUN and port 53 must go. */
const CLOUDFLARE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp',
        'turn:turn.cloudflare.com:80?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'bc91b63e', credential: 'ebd71f1d',
    },
  ],
};

/** metered.ca's credentials URL answers a plain array, with no expiry. */
const METERED = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: 'm1', credential: 'p1' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: 'm1', credential: 'p1' },
  { urls: 'turn:global.relay.metered.ca:443', username: 'm1', credential: 'p1' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'm1', credential: 'p1' },
];

const answer = (body: unknown, status = 200): RelayResponse => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** A Relay over a scripted fetch and a clock the test moves. */
function relay(script: (url: string, init: RequestInit) => Promise<RelayResponse>, o: Partial<RelayDeps> = {}) {
  const clock = { now: T0 };
  const calls: { url: string; init: RequestInit }[] = [];
  const get = createRelay({
    url: () => URL_,
    now: () => clock.now,
    fetch: (url, init) => {
      calls.push({ url, init });
      return script(url, init);
    },
    ...o,
  });
  return { get, calls, clock };
}

const servers = (r: Relay) => (r.ok ? r.servers : null);

afterEach(() => {
  globalThis.TAVERN_RELAY_URL = undefined;
});

describe('the Relay', () => {
  it('fetches the Worker\'s credentials with a plain GET and keeps them for an hour', async () => {
    const { get, calls } = relay(async () => answer(WORKER));
    const r = await get();
    expect(r).toEqual({ ok: true, servers: WORKER.iceServers, until: T0 + RELAY_KEEP_MS });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL_);
    // No headers of our own, so no CORS preflight; no cookies; never a cached answer.
    expect(calls[0]!.init.headers).toBeUndefined();
    expect(calls[0]!.init.method).toBeUndefined();
    expect(calls[0]!.init).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reuses them for each new connection, shares a fetch under way, and fetches afresh after an hour', async () => {
    const { get, calls, clock } = relay(async () => answer({ ...WORKER, expiresAt: clock.now + 6 * HOUR }));
    // The Host's screen prefetches and makes its code at once: one fetch.
    const [a, b] = await Promise.all([get(), get()]);
    expect(b).toBe(a);
    expect(calls).toHaveLength(1);
    // A Reconnect fifty minutes on still uses them.
    clock.now = T0 + 50 * 60_000;
    expect(await get()).toBe(a);
    expect(calls).toHaveLength(1);
    // An hour on, the next connection fetches new ones.
    clock.now = T0 + HOUR;
    const c = await get();
    expect(calls).toHaveLength(2);
    expect(c.ok && c.until).toBe(T0 + 2 * HOUR);
    expect(await get()).toBe(c);
  });

  it('fetches afresh 10 minutes before they expire, and never trusts a device clock that runs behind past an hour', async () => {
    // Credentials for 30 minutes: kept until 10 minutes before they expire.
    const short = relay(async () => answer({ ...WORKER, expiresAt: short.clock.now + 30 * 60_000 }));
    const s = await short.get();
    expect(s.ok && s.until).toBe(T0 + 30 * 60_000 - RELAY_MARGIN_MS);
    // A device clock 5 hours behind sees 11 hours left on 6-hour credentials; it still keeps them only an hour.
    const behind = relay(async () => answer({ ...WORKER, expiresAt: T0 + 11 * HOUR }));
    const r = await behind.get();
    expect(r.ok && r.until).toBe(T0 + RELAY_KEEP_MS);
  });

  it('uses credentials that expire within the margin once, without keeping them', async () => {
    const { get, calls } = relay(async () => answer({ ...WORKER, expiresAt: T0 + 5 * 60_000 }));
    expect(servers(await get())).toEqual(WORKER.iceServers);
    await get();
    expect(calls).toHaveLength(2);
  });

  it('takes metered.ca\'s plain array, keeping it an hour', async () => {
    const { get } = relay(async () => answer(METERED));
    const r = await get();
    expect(r.ok && r.until).toBe(T0 + RELAY_KEEP_MS);
    expect(servers(r)!.map((s) => s.urls)).toEqual([
      ['turn:global.relay.metered.ca:80'], ['turn:global.relay.metered.ca:80?transport=tcp'],
      ['turn:global.relay.metered.ca:443'], ['turns:global.relay.metered.ca:443?transport=tcp'],
    ]);
  });

  it('keeps only TURN URLs with credentials, and drops port 53 and STUN', () => {
    expect(relayServers(CLOUDFLARE)).toEqual([{
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turn:turn.cloudflare.com:80?transport=tcp',
        'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'bc91b63e', credential: 'ebd71f1d',
    }]);
    expect(relayServers([
      { urls: 'turn:[2001:db8::1]:53?transport=udp', username: 'u', credential: 'c' },
      { urls: ['turn:[2001:db8::1]:3478', 'turns:relay.example.com', 'TURN:relay.example.com:3478'], username: 'u', credential: 'c' },
      { urls: 'turn:relay.example.com:3478', username: '', credential: 'c' },
      { urls: 'turn:relay.example.com:3478', username: 'u' },
      { urls: 42, username: 'u', credential: 'c' },
      'turn:relay.example.com',
      null,
    ])).toEqual([{ urls: ['turn:[2001:db8::1]:3478', 'turns:relay.example.com', 'TURN:relay.example.com:3478'], username: 'u', credential: 'c' }]);
    expect(relayServers({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] })).toBeNull();
    expect(relayServers({ servers: [] })).toBeNull();
    expect(relayServers('nope')).toBeNull();
  });

  it('says the Relay is unreachable when the fetch fails or takes too long, and tries again next time', async () => {
    const down = relay(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await down.get()).toEqual({ ok: false, why: 'unreachable', detail: 'Failed to fetch' });
    await down.get();
    expect(down.calls).toHaveLength(2);

    // One that never answers (and ignores the abort) gives up at the timeout.
    const stuck = relay(() => new Promise(() => {}), { timeoutMs: 30 });
    const at = performance.now();
    expect(await stuck.get()).toEqual({ ok: false, why: 'unreachable', detail: 'timeout' });
    expect(performance.now() - at).toBeLessThan(1000);
    // One that does abort, as a browser's fetch does.
    const aborts = relay((_, init) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), { timeoutMs: 30 });
    expect(await aborts.get()).toEqual({ ok: false, why: 'unreachable', detail: 'timeout' });
    // A body that stalls past the timeout counts the same.
    const slowBody = relay(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }), { timeoutMs: 30 });
    expect(await slowBody.get()).toEqual({ ok: false, why: 'unreachable', detail: 'timeout' });
  });

  it('says the answer is bad on an HTTP error, a body that isn\'t JSON, or no TURN server in it', async () => {
    expect(await relay(async () => answer({ error: 'origin not allowed' }, 403)).get()).toEqual({ ok: false, why: 'bad-response', detail: 'HTTP 403' });
    expect(await relay(async () => answer({ error: 'relay not configured' }, 502)).get()).toEqual({ ok: false, why: 'bad-response', detail: 'HTTP 502' });
    const notJson = relay(async () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }));
    expect(await notJson.get()).toEqual({ ok: false, why: 'bad-response', detail: 'not JSON' });
    expect(await relay(async () => answer({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })).get())
      .toEqual({ ok: false, why: 'bad-response', detail: 'no TURN server with credentials' });
  });

  it('fetches nothing with no URL, as before there was a Relay', async () => {
    const none = relay(async () => answer(WORKER), { url: () => '' });
    expect(await none.get()).toEqual({ ok: false, why: 'no-url', detail: 'no Relay is set up' });
    expect(none.calls).toHaveLength(0);
    expect((await relay(async () => answer(WORKER), { url: () => '  ' }).get()).ok).toBe(false);
  });

  it('takes a test\'s URL from TAVERN_RELAY_URL, and fetches again for a different URL', async () => {
    globalThis.TAVERN_RELAY_URL = 'https://relay.test/ice';
    expect(relayUrl()).toBe('https://relay.test/ice');
    let url = 'https://relay.test/ice';
    const { get, calls } = relay(async () => answer(WORKER), { url: () => url });
    await get();
    url = 'https://other.test/ice';
    await get();
    expect(calls.map((c) => c.url)).toEqual(['https://relay.test/ice', 'https://other.test/ice']);
  });
});
