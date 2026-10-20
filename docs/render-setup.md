# Setting up Versus' Relay on Render

The Relay is Versus' small server ([ADR-0006](adr/0006-a-relay-server-on-render.md)): Room codes, the WebRTC handshake, and a relay when two devices can't connect directly. It's `server/` in this repo, and the `render.yaml` at the repo's root describes it as one free Docker web service in Frankfurt. Nothing secret is involved: no keys, no environment variables to fill in. You do this once; it takes about five minutes, most of it waiting for the first build.

You already deploy Catan on Render, so use the same account and workspace. The two services share the workspace's 750 free hours a month, and a free service only uses hours while it's awake.

## Steps

1. Open https://dashboard.render.com and sign in as you do for Catan.
2. Top right, click **+ New**, then **Blueprint**.
3. Under **Connect a repository**, find **abdimuratov/tavern-td** and click **Connect**.
   - If it isn't listed, click **Configure account** (or **Configure GitHub**), give Render's GitHub app access to `tavern-td` (or to all repositories), save, and come back to this page.
4. On the next page:
   - **Blueprint Name:** `tavern-td` (any name will do).
   - **Branch:** `main`.
   - Render reads `render.yaml` and lists one service to create: **tavern-relay**, a web service, Docker, **Free**, Frankfurt. Nothing asks for a value.
5. Click **Deploy Blueprint** (older dashboards call it **Apply**).
6. Wait for the deploy. Click **tavern-relay** to watch its log: the Docker build takes a few minutes, and the deploy is done when the log shows `Tavern TD relay listening on port 10000` and the status says **Live**.
7. Copy the service's URL from the top of its page, under the name. It looks like `https://tavern-relay.onrender.com`; if that name was taken, Render adds a few characters, such as `https://tavern-relay-x1y2.onrender.com`.
8. Optional check: open that URL with `/health` on the end. It should show `ok`.
9. Paste the URL back to me in chat. That's all I need. I'll put it in `RELAY_URL` (`src/net/relay.ts`), check two pages connecting through it, Direct and Relayed, and push.

## Afterwards

- **It deploys itself.** Every push to `main` that changes `server/` or `render.yaml` rebuilds it; changes to the game alone don't.
- **It sleeps.** After 15 minutes with nobody in a room it spins down, and the next player waits up to a minute while it wakes. The main menu starts waking it as soon as Line Wars' Versus row shows, and Host and Join say "Waking the server… up to a minute".
- **It may restart** whenever Render likes. A Run connected Direct doesn't notice. A Relayed one drops, and Reconnect on both devices brings it back through the same room code.
- **Its log** has a line every 15 minutes while it's in use: rooms, sockets, and how much it relayed. It never logs addresses or codes.
- **If Render ever suspends it** (the free bandwidth ran out, or the hours did), Versus still works by "Use codes instead": the codes passed by hand, which connect directly only.
- **To remove it:** in the dashboard, open **tavern-relay** → **Settings** → **Delete Web Service**, and the Blueprint under **Blueprints** the same way. Then set `RELAY_URL` back to `''`, and Host and Join go straight to the codes.
