// Tavern TD's Relay credentials (docs/adr/0005-a-turn-relay-for-versus.md).
//
// A Cloudflare Worker that hands the app short-lived credentials for
// Cloudflare's TURN service, so the TURN key's API token stays a secret of
// this Worker and never reaches the public repo or the app. One plain module
// with no dependencies and no build step: paste it into the dashboard's
// editor (docs/relay-setup.md), or deploy it with wrangler.
//
// Variables: TURN_KEY_ID (text) and TURN_KEY_API_TOKEN (secret).
//
// GET, any path, from one of Tavern TD's origins:
//   200 { "iceServers": [{ "urls": [...], "username": "…", "credential": "…" }], "expiresAt": <ms since 1970> }
// OPTIONS from one of them: 204. Any other origin, or none: 403.
// Cloudflare failing, or a variable missing: 502 with a short JSON error.

/** Credentials live 6 hours, longer than an evening of Rematches. Cloudflare allows up to 48. */
const TTL_SECONDS = 21600;

const MINT_URL = (keyId) => `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

/** The web app on GitHub Pages, and the Android app's WebView (and Capacitor's iOS one). */
const ORIGINS = new Set(['https://abdimuratov.github.io', 'https://localhost', 'capacitor://localhost']);

/** Dev servers and the e2e tests' preview, on any port. */
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/**
 * The two TURN URLs Tavern TD uses, matched by scheme, port and transport
 * but any host, should Cloudflare rename it: UDP on 3478, and TLS on 443,
 * which gets through most firewalls. The rest (port 53, TCP on 80 and 3478,
 * TLS on 5349, and STUN, which the app has) would only slow gathering down.
 */
const KEEP = [
  { scheme: 'turn', port: 3478, transport: 'udp' },
  { scheme: 'turns', port: 443, transport: 'tcp' },
];

function allowed(origin) {
  return origin !== null && (ORIGINS.has(origin) || DEV_ORIGIN.test(origin));
}

function kept(url) {
  const m = /^(turns?):(\[[^\]]*\]|[^:?/]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/i.exec(url);
  if (!m) return false;
  const scheme = m[1].toLowerCase();
  const port = m[3] ? Number(m[3]) : scheme === 'turns' ? 5349 : 3478;
  const transport = (m[4] || (scheme === 'turns' ? 'tcp' : 'udp')).toLowerCase();
  return KEEP.some((k) => k.scheme === scheme && k.port === port && k.transport === transport);
}

/** Cloudflare's TURN entries with only the URLs kept; entries left with none, or without credentials, go. */
function turnServers(body) {
  const list = body && Array.isArray(body.iceServers) ? body.iceServers : [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s.username !== 'string' || typeof s.credential !== 'string') continue;
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && kept(u));
    if (urls.length > 0) out.push({ urls, username: s.username, credential: s.credential });
  }
  return out;
}

function reply(status, body, origin, extra = {}) {
  const headers = { 'Cache-Control': 'no-store', Vary: 'Origin', ...extra };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (body === null) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (!allowed(origin)) return reply(403, { error: 'origin not allowed' }, null);
    if (request.method === 'OPTIONS') {
      return reply(204, null, origin, { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Max-Age': '86400' });
    }
    if (request.method !== 'GET') return reply(405, { error: 'method not allowed' }, origin, { Allow: 'GET, OPTIONS' });
    if (!env || !env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return reply(502, { error: 'relay not configured' }, origin);

    // Counted from before the request, so the app never thinks they last longer than they do.
    const minted = Date.now();
    let upstream;
    try {
      upstream = await fetch(MINT_URL(env.TURN_KEY_ID), {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      });
    } catch {
      return reply(502, { error: 'Cloudflare TURN unreachable' }, origin);
    }
    // Never Cloudflare's body: only its status, so nothing of the token or key can come back.
    if (!upstream.ok) return reply(502, { error: `Cloudflare TURN answered ${upstream.status}` }, origin);
    let body;
    try {
      body = await upstream.json();
    } catch {
      return reply(502, { error: 'Cloudflare TURN sent no JSON' }, origin);
    }
    const iceServers = turnServers(body);
    if (iceServers.length === 0) return reply(502, { error: 'Cloudflare TURN sent no usable server' }, origin);
    return reply(200, { iceServers, expiresAt: minted + TTL_SECONDS * 1000 }, origin);
  },
};
