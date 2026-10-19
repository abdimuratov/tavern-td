# Setting up the Relay

Versus can fall back to a relay, Cloudflare's TURN service, when two devices can't reach each other directly ([ADR-0005](adr/0005-a-turn-relay-for-versus.md)). The relay needs a Cloudflare account, a TURN key and a small Worker that turns the key into short-lived credentials. Only you can make those, once; it takes about ten minutes. Until then Versus works as before, without a relay.

Cloudflare renames its menus now and then, so a name below may differ a little from what you see. The steps stay the same.

## 1. A TURN key

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up, or log in.
2. In the left menu, open **Realtime**, then **TURN Server**.
3. **Create** a TURN key and name it `tavern-td`.
4. Cloudflare shows the key's **Key ID** and its **API token**. Copy both somewhere private for the next few minutes, such as a note you'll delete. The token is shown once; if you lose it, create a new key.

If Cloudflare asks for a payment method here, the free allowance (1,000 GB a month) still covers Versus many times over: a Run sends a few MB. If you'd rather not add a card, tell me and I'll explain the stand-in, a metered.ca free-plan URL, and what it costs in safety.

## 2. The Worker

1. In the left menu, open **Workers & Pages** (or **Compute (Workers)**), then **Create**.
2. Choose **Worker**, then the **Hello World** template.
3. Name it `tavern-turn` and press **Deploy**.
4. Press **Edit code**. Select everything in the editor and delete it.
5. Open [`workers/turn/worker.js`](../workers/turn/worker.js) from this repo, copy the whole file, and paste it into the editor.
6. Press **Deploy**.

## 3. The two variables

1. Go back to the Worker (the `tavern-turn` name at the top of the editor, or Workers & Pages → `tavern-turn`), and open **Settings**, then **Variables and Secrets**.
2. **Add** a variable:
   - Type **Text**, name `TURN_KEY_ID`, value the Key ID from step 1.
3. **Add** another:
   - Type **Secret**, name `TURN_KEY_API_TOKEN`, value the API token from step 1.
4. Press **Deploy** (or **Save and deploy**).
5. Delete the note where you kept the Key ID and the token.

## 4. Check it, if you like

The Worker's URL is on its overview page, like `https://tavern-turn.<your-subdomain>.workers.dev`.

- Opening that URL in a browser tab shows `{"error":"origin not allowed"}`. That's right: it answers only Tavern TD's own pages, and a tab you open by hand isn't one. It does show the Worker is up.
- For a full check on the Mac: open [abdimuratov.github.io/tavern-td](https://abdimuratov.github.io/tavern-td/) in Chrome, open the console (View → Developer → JavaScript Console), and run `fetch('https://tavern-turn.<your-subdomain>.workers.dev').then((r) => r.json()).then(console.log)` with your URL. It should print `iceServers` with two URLs, a username and a credential, and an `expiresAt`. `{"error":"relay not configured"}` means a variable is missing or misnamed; `Cloudflare TURN answered 401` (or 404) means the token or the Key ID is wrong.

Or skip the check: I'll run the real-relay test once I have the URL.

## 5. What to send me

**Only the Worker's URL**, `https://tavern-turn.<your-subdomain>.workers.dev`. Never the API token or the Key ID: they stay in Cloudflare, and nothing in the repo needs them. I'll put the URL in `RELAY_URL` (`src/net/relay.ts`) and run the real-relay test.

If the token ever leaks, open the TURN key in Realtime → TURN Server, make a new key, and put its Key ID and token in the Worker's two variables again. The URL stays the same.

## Optional: a usage alert

To hear if someone ever runs up traffic on your account: **Manage Account** → **Notifications** → **Add**, pick the usage-based billing alert, and set it for Realtime (TURN) at a few GB. At Tavern TD's scale it should never fire.

## Later

To change the Worker, paste the new `workers/turn/worker.js` over the old in **Edit code** and press **Deploy**; the variables stay. [workers/turn/README.md](../workers/turn/README.md) says what the Worker does, and its `wrangler.toml` serves anyone who prefers Cloudflare's command line.
