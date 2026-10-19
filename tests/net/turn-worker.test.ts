import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type TurnEnv } from '../../workers/turn/worker.js';

// The Relay's credentials Worker (workers/turn/worker.js), called as
// Cloudflare calls it, with Cloudflare's TURN API mocked: which origins it
// serves, what it asks Cloudflare for, what it keeps of the answer, when the
// credentials expire, and how it fails without giving the token away.

const ENV = { TURN_KEY_ID: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', TURN_KEY_API_TOKEN: 'sekret-token-0123456789' } satisfies TurnEnv;
const NOW = 1_792_454_400_000;
const PAGES = 'https://abdimuratov.github.io';

/** Cloudflare's 201 from generate-ice-servers. */
const MINTED = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: [
        'turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp',
        'turn:turn.cloudflare.com:80?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp',
      ],
      username: 'bc91b63e2b5d759f8eb9f3b58062439e', credential: 'ebd71f1d3edbc2b0edae3cd5a6d82284',
    },
  ],
};

const upstream = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function call(o: { origin?: string | null; method?: string; env?: TurnEnv; path?: string } = {}): Promise<Response> {
  const headers = new Headers();
  const origin = o.origin === undefined ? PAGES : o.origin;
  if (origin !== null) headers.set('Origin', origin);
  return worker.fetch(new Request(`https://tavern-turn.example.workers.dev${o.path ?? '/'}`, { method: o.method ?? 'GET', headers }), o.env ?? ENV);
}

const minted = (body: unknown = MINTED, status = 201): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  upstream.mockReset();
  upstream.mockImplementation(async () => minted());
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the Relay\'s Worker', () => {
  it('asks Cloudflare for credentials that live 6 hours, with the token only in the Authorization header', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe(`https://rtc.live.cloudflare.com/v1/turn/keys/${ENV.TURN_KEY_ID}/credentials/generate-ice-servers`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: `Bearer ${ENV.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 21600 });
  });

  it('passes on only UDP on 3478 and TLS on 443, with when they expire, uncached and for the asking origin only', async () => {
    const res = await call({ path: '/ice?x=1' });
    expect(await res.json()).toEqual({
      iceServers: [{
        urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
        username: MINTED.iceServers[1]!.username, credential: MINTED.iceServers[1]!.credential,
      }],
      expiresAt: NOW + 6 * 3_600_000,
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGES);
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('matches the URLs by scheme, port and transport, so a renamed host still works', async () => {
    upstream.mockImplementation(async () => minted({
      iceServers: [{
        urls: ['turn:turn2.cloudflare.com:3478?transport=udp', 'turn:turn2.cloudflare.com:3478', 'turns:turn2.cloudflare.com:443?transport=tcp', 'turns:turn2.cloudflare.com:443', 'turn:turn2.cloudflare.com:443?transport=tcp'],
        username: 'u', credential: 'c',
      }],
    }));
    const body = await (await call()).json() as { iceServers: { urls: string[] }[] };
    expect(body.iceServers[0]!.urls).toEqual([
      'turn:turn2.cloudflare.com:3478?transport=udp', 'turn:turn2.cloudflare.com:3478', 'turns:turn2.cloudflare.com:443?transport=tcp', 'turns:turn2.cloudflare.com:443',
    ]);
  });

  it('serves Pages, the Android app, and localhost on any port for dev and tests', async () => {
    for (const origin of [PAGES, 'https://localhost', 'capacitor://localhost', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://localhost']) {
      const res = await call({ origin });
      expect(res.status, origin).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin'), origin).toBe(origin);
    }
  });

  it('refuses any other origin, or none, without asking Cloudflare', async () => {
    for (const origin of [
      null, 'https://evil.example', 'https://abdimuratov.github.io.evil.example', 'http://abdimuratov.github.io', 'https://localhost:8443',
      'http://localhost.evil.example', 'https://127.0.0.1', 'null',
    ]) {
      const res = await call({ origin });
      expect(res.status, String(origin)).toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin'), String(origin)).toBeNull();
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers a preflight with 204 and the CORS headers, and refuses other methods', async () => {
    const pre = await call({ method: 'OPTIONS', origin: 'http://localhost:4173' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4173');
    expect(pre.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(pre.headers.get('Vary')).toBe('Origin');
    expect((await call({ method: 'OPTIONS', origin: 'https://evil.example' })).status).toBe(403);
    const post = await call({ method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('Allow')).toBe('GET, OPTIONS');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers 502 with a short error when Cloudflare fails or a variable is missing, never echoing the token', async () => {
    const failures: [() => void, TurnEnv, string][] = [
      [() => upstream.mockImplementation(async () => new Response(JSON.stringify({ errors: [{ message: `bad token ${ENV.TURN_KEY_API_TOKEN}` }] }), { status: 401 })), ENV, 'Cloudflare TURN answered 401'],
      [() => upstream.mockImplementation(async () => {
        throw new TypeError('network down');
      }), ENV, 'Cloudflare TURN unreachable'],
      [() => upstream.mockImplementation(async () => new Response('<html>oops</html>', { status: 201 })), ENV, 'Cloudflare TURN sent no JSON'],
      [() => upstream.mockImplementation(async () => minted({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] })), ENV, 'Cloudflare TURN sent no usable server'],
      [() => {}, { TURN_KEY_ID: ENV.TURN_KEY_ID }, 'relay not configured'],
      [() => {}, { TURN_KEY_API_TOKEN: ENV.TURN_KEY_API_TOKEN }, 'relay not configured'],
      [() => {}, {}, 'relay not configured'],
    ];
    for (const [arrange, env, error] of failures) {
      upstream.mockReset();
      upstream.mockImplementation(async () => minted());
      arrange();
      const res = await call({ env });
      expect(res.status, error).toBe(502);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PAGES);
      const text = await res.text();
      expect(JSON.parse(text), error).toEqual({ error });
      expect(text).not.toContain(ENV.TURN_KEY_API_TOKEN);
    }
  });
});
