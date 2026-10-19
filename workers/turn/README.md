# tavern-turn: the Relay's credentials

A Cloudflare Worker that hands Tavern TD short-lived credentials for Cloudflare's TURN service, the Relay that carries a Versus connection when the two devices can't reach each other directly ([ADR-0005](../../docs/adr/0005-a-turn-relay-for-versus.md)). The TURN key's API token lives only in this Worker's secrets. The app knows just the Worker's URL, `RELAY_URL` in `src/net/relay.ts`.

**What it does.** A `GET` to any path, from one of Tavern TD's origins (`https://abdimuratov.github.io`, the Android app's `https://localhost`, `capacitor://localhost`, and `http://localhost:<port>` or `http://127.0.0.1:<port>` for dev and tests), asks Cloudflare for credentials that live 6 hours and returns them with only two TURN URLs, UDP on port 3478 and TLS on 443:

```json
{ "iceServers": [{ "urls": ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], "username": "…", "credential": "…" }], "expiresAt": 1792540800000 }
```

Any other origin, or none, gets 403. `OPTIONS` gets 204 with the CORS headers. If Cloudflare fails or a variable is missing, it answers 502 with a short JSON error, never Cloudflare's body or the token.

**Its two variables**, set under the Worker's Settings → Variables and Secrets:

| Name | Type | Value |
|---|---|---|
| `TURN_KEY_ID` | Text | The TURN key's ID |
| `TURN_KEY_API_TOKEN` | Secret | The TURN key's API token |

**Redeploying** after a change to `worker.js`: open the Worker in the Cloudflare dashboard, Edit code, select everything in the editor, paste the whole of `worker.js` over it, and Deploy. The variables stay. Or, with the CLI, `npx wrangler deploy` in this folder (see `wrangler.toml`).

First-time setup, click by click: [docs/relay-setup.md](../../docs/relay-setup.md). The tests are in `tests/net/turn-worker.test.ts`.
