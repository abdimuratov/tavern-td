# Versus falls back to Cloudflare's TURN relay, with credentials minted by a small Worker

_Superseded on 2026-10-20 by [ADR-0006](0006-a-relay-server-on-render.md): a room server of our own on Render, which relays when direct fails. This relay was never switched on._

Versus connects two devices over WebRTC with public STUN only (ADR-0004), so a pair where both sit behind symmetric or carrier-grade NAT never connects. Now a TURN relay, the Relay, carries the connection when the devices can't reach each other directly. It is Cloudflare Realtime TURN. Its credentials are short-lived and come from a tiny Cloudflare Worker of our own, `tavern-turn` (`workers/turn/worker.js`). When the player opens Host or Join, the app GETs the Worker's public URL, and the Worker asks Cloudflare for credentials that live 6 hours and returns them with two TURN URLs: UDP on port 3478 and TLS on 443. The TURN key's API token is a secret of the Worker, set in Cloudflare's dashboard. The repo holds the Worker's source and, once it exists, its URL (`RELAY_URL` in `src/net/relay.ts`). Gathering isn't trickled, so every code carries a relay candidate as well. ICE still prefers a direct pair, so the Relay carries traffic only when direct fails. With no URL, or with the Worker out of reach, Versus connects as before, over STUN only.

We chose this for four reasons:

- **The free allowance dwarfs the traffic.** Cloudflare gives 1,000 GB a month free, and a Versus Run sends about a kilobyte a second each way: a few MB for a 16-minute Run.
- **No secret sits in the public repo or the bundle.** Only the Worker's URL is public, and what it hands out expires in 6 hours.
- **It's the company we already use for STUN.** `stun.cloudflare.com` already sees each player's address, so the Relay adds no new party.
- **There's nothing to run.** The Worker is one file pasted into the dashboard, on Workers' free plan (100,000 requests a day).

Four alternatives lost:

- **metered.ca with its API key in the app,** as its docs do from front-end code: the key would be public, and anyone could use up its free 500 MB. It stays a stand-in, since the app takes any URL that answers with ICE servers.
- **ExpressTURN's free plan:** a static username and password that would sit in the bundle for anyone to reuse, and no TLS on 443.
- **Credentials baked in at deploy from a GitHub Actions secret:** the build would put them in the public bundle all the same.
- **A self-run coturn:** a server to keep patched and paid for, for a game played among friends.

## Consequences

- **Privacy.** The Relay sees both players' addresses and when and how much they send, never what: the DataChannel is DTLS-encrypted end to end. Most connections never touch it, and the Lobby says Direct or Relayed.
- **Abuse.** The Worker's URL is public. It serves only Tavern TD's origins (Pages, the Android app's `https://localhost` and `capacitor://localhost`, and localhost for dev and tests), hands out 6-hour credentials and only the two URLs we use. A script can send any Origin it likes, so someone could still mint credentials and relay through the account. That is accepted: the free 1,000 GB absorbs it, and a Cloudflare usage notification can warn.
- **Cost.** $0 at our scale. Past 1,000 GB a month Cloudflare charges $0.05 a GB, and its free TURN tier may want a card on file.
- **Setup.** You make the Cloudflare account, the TURN key and the Worker once ([relay-setup.md](../relay-setup.md)) and send back only the Worker's URL; the token never leaves Cloudflare. Until then `RELAY_URL` is empty and Versus behaves exactly as before.
- **When the Relay is down,** whether the Worker or Cloudflare's TURN, the codes carry no relay candidate and Versus is STUN-only, as before. Making a code waits at most 3 s on the Worker. The code screens say "Relay unavailable: only direct connections will work", and a connection that fails says whether the Relay was in the codes.
- **Codes grow** by 7 bytes per IPv4 relay candidate: one host, one server-reflexive and one relay make a 153-character code instead of 144. Gathering stops 1 s after the first relay candidate rather than the first server-reflexive, a little later, and still within the 5 s cap.
- **It supersedes ADR-0004's TURN alternative,** "a paid or self-run relay, whose credentials can't live in a public repo": short-lived credentials from a Worker can live outside the repo.
