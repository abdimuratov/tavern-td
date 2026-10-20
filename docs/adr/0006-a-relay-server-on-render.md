# Versus meets in a room on our own small server, which relays when direct fails

_Supersedes [ADR-0005](0005-a-turn-relay-for-versus.md), and the "signaling server" alternative of [ADR-0004](0004-lockstep-versus-over-webrtc.md)._

Versus connected two devices by two codes passed by hand, over public STUN only (ADR-0004). Then it gained a Cloudflare TURN relay that was built but never switched on, since it needed a Cloudflare account, a TURN key and a Worker holding a secret (ADR-0005). Now Versus has a server of its own, the Relay: `server/` in this repo, one small Node service with `ws` on Render's free plan, deployed by the `render.yaml` Blueprint. The Host makes a room and gets a 4-character Room code, and the Guest types it or opens its link. Through the room's WebSocket the two apps swap WebRTC's offer, answer and trickled ICE candidates, and try a direct DataChannel first. If it isn't open 5 s after the Host has the answer, or ICE fails sooner, the Host sends both through the Relay: the server passes their Versus messages between the two sockets as opaque text. The session sees one Transport either way, and the Lobby says Direct or Relayed. The codes passed by hand stay as the fallback, "Use codes instead", for when the server can't be reached.

We chose this for five reasons:

- **Joining takes 4 characters,** typed or opened as a link, instead of two pastes of 150-character codes and a trip back.
- **No secret anywhere.** The server holds no credentials, and Render builds it from the public repo. You already run Catan the same way.
- **It carries every pair** that can reach an HTTPS server, symmetric and carrier-grade NAT included, which neither STUN nor codes could.
- **Traffic is small.** A Run sends about a kilobyte a second each way, a few MB in all, and through the server only when direct fails.
- **Direct stays first,** so most Runs pass only their handshake through the server.

Six alternatives lost:

- **Cloudflare Realtime TURN with a Worker minting credentials** (ADR-0005): it needs a Cloudflare account, a TURN key and a Worker with a secret, and its free tier may want a card. Render can't host TURN instead: it gives a service one HTTPS port and no UDP.
- **TURN from metered.ca or ExpressTURN:** their free credentials would sit in the public bundle for anyone to use up.
- **Socket.IO, as Catan uses:** about 40 KB more in the app for rooms, reconnects and fallbacks that take a few dozen lines here. `ws` on the server and the browser's own WebSocket are enough.
- **Someone else's signaling (Firebase, PeerJS's cloud, public MQTT or Nostr relays):** an account to keep or a stranger's server that sees both addresses, and still no relay.
- **Relaying every Run, with no WebRTC:** simpler, but every Run would pay the trip through the server's region and its bandwidth, and a server restart would drop every Run.
- **Codes only, as before:** two pastes, and some pairs of networks never connect.

## Consequences

- **Cold start.** Render's free plan puts the service to sleep after 15 minutes without traffic, and waking it takes about a minute. The main menu sends `GET /health` as it shows Line Wars' Versus row, so the wait overlaps menu time. Host and Join say "Waking the server… up to a minute" when the server takes a while, and keep trying for 90 s.
- **Restarts.** Render may restart a free service at any time, and the rooms live only in memory. A Direct Run carries on. A Relayed one loses its connection, and Reconnect makes the room again under the same code, since each app holds its seat's token.
- **Shared free hours.** The workspace's 750 free instance hours a month are shared with Catan. A room whose Guest never comes closes after 15 minutes, and a room that passes nothing between its two for 30 minutes closes too, so a forgotten tab keeps the server awake for 45 minutes at most.
- **Bandwidth.** Outbound bandwidth counts, and going over the free allowance suspends free services for the rest of the month. A Relayed Run is a few MB. Each socket may send at most 100 frames and 64 KiB a second on average, so one client can't run the allowance down quickly.
- **Privacy.** The server sees both players' IP addresses, as STUN servers do. A Relayed Run's commands pass through it as JSON: TLS protects them on the way, but they aren't end-to-end encrypted the way a DataChannel is. It keeps nothing on disk and logs only counts. A Direct Run passes only its WebRTC handshake through it.
- **Latency.** A Relayed message goes through Frankfurt, Render's region nearest you, so its round trip is both devices' round trips to Frankfurt added together. The Lobby's ping sets the Input Delay, so a slow relay means a longer delay, not desyncs.
- **Abuse.** The WebSocket accepts only the Pages origin, the Android app's and localhost. A script can fake an Origin, so each address may make 10 rooms and then 2 a minute, try 30 codes and then 10 a minute, and hold 16 sockets. The server holds at most 500 rooms and 1,000 sockets, and frames over 64 KiB close the socket.
- **One more thing deployed.** `render.yaml` builds only when `server/` changes. Until you create it ([render-setup.md](../render-setup.md)) and its URL goes into `RELAY_URL` (`src/net/relay.ts`), Host and Join use the codes as before.
- **It supersedes ADR-0005,** whose Worker, TURN credentials and gathering for relay candidates are gone, and ADR-0004's rejection of a signaling server, which weighed an account to keep and a third party seeing addresses. Render is an account you already keep, and the server is our own.
