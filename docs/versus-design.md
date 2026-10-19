# Versus: design

Versus is Line Wars between two people on two devices, a Host and a Guest. Both devices run the whole deterministic sim ([ADR-0002](adr/0002-deterministic-simulation-core.md)) and send each other only commands, in lockstep, over a WebRTC DataChannel. There is no server: the devices find each other through two codes the players pass by hand. The rules are Line Wars' as built ([line-wars-design.md](line-wars-design.md)), with `drivers: ['human', 'human']` ([ADR-0003](adr/0003-two-sides-and-an-ai-in-one-sim.md)). Nothing in `src/sim` changes but one query (§8). Words follow [CONTEXT.md](../CONTEXT.md). [ADR-0004](adr/0004-lockstep-versus-over-webrtc.md) records the shape, and §10 lists the calls you may want different.

## 1. At a glance

| Topic | Design |
|---|---|
| Players | The Host plays Side 0 and the Guest Side 1. Each picks their own Race. Always Normal: no Difficulty, no income factor |
| Connecting | One reliable, ordered WebRTC DataChannel. The Host's Join code goes out as a link, a QR, the share sheet or a copy; the Guest's Answer code comes back by share sheet or copy. Public STUN only, no TURN, no server (§2) |
| Codes | About 140–220 characters each; the link adds 46 |
| Lockstep | A Turn is 3 ticks (100 ms). Every Turn each device sends a Batch of its Side's commands, empty or not, Input Delay Turns ahead (2–5, from the lobby's ping). A Turn steps only when both Batches are in, Side 0's commands first (§4) |
| Checks | The protocol version, `SNAPSHOT_VERSION` and a sim hash must match before the lobby, the initial state's hash before Go, and the state's hash every second |
| Desync | The first is repaired from the Host's state, with a report to copy. A second ends the Run with no result |
| Pace | 1× only. Either player pauses, on the same tick for both; play resumes once both press Ready |
| Phones | Going to the background pauses both. A lost connection is rejoined with a fresh pair of codes. After 2 min without the Rival, the player who stayed may claim the win |
| Saves | No autosave, Continue or save codes |
| Records | A Versus board in Line Wars' Records, kept on each device from its own Side |
| The Guest's screen | Its Field on the right, its gold, its commands: a Viewer Side in the UI and a mirrored board (§7) |

## 2. Connecting with no server

GitHub Pages only serves files, and a third-party signaling service would see both players' addresses. So the devices swap WebRTC's offer and answer by hand, as text.

**What a code holds.** A browser's SDP runs to 1–2 KB, but nearly all of it can be rebuilt. A code carries only what can't, as bytes in base64url after `TTDJ1.` (Join) or `TTDA1.` (Answer):

| Field | Bytes |
|---|---|
| Format, kind and flags | 3 |
| The sim hash's first 4 bytes (§4.6), so a version mismatch shows on paste | 4 |
| ICE ufrag and password, length-prefixed (Chrome and Safari make 4 and 24 characters) | 30 |
| DTLS fingerprint (SHA-256), setup role and mid | 35 |
| A count, then up to 4 UDP candidates: kind and family, port, then an IPv4 address (4), an IPv6 address (16) or an mDNS name's UUID (16) | 1, then 7 or 19 each |
| On a rejoin's Join code only, the session id (§5.4) | 8 |
| CRC-32, so a cut-off paste says "damaged" rather than failing later | 4 |

A device with one mDNS host and one IPv4 server-reflexive candidate makes 103 bytes, a 144-character code. With IPv6 too (two of each) it is 141 bytes, 194 characters, and four IPv6-sized candidates on a rejoin top out near 220. The other end rebuilds a standard data-channel SDP around these fields (`m=application 9 UDP/DTLS/SCTP webrtc-datachannel`, `a=sctp-port:5000`, `a=max-message-size:65536`, the candidates with priorities recomputed from their kind, `a=end-of-candidates`) for `setRemoteDescription`. Each device's own description stays the browser's, unmunged. TCP candidates and related addresses are dropped.

**Gathering is not trickled.** A code is made when gathering completes, 1 s after the first server-reflexive candidate, or after 5 s, whichever comes first. The ICE servers are two public STUN servers, `stun:stun.cloudflare.com:3478` and `stun:stun.l.google.com:19302`. They learn each device's public address, as any website does, and nothing else.

**How the codes travel.**
- The Host's screen shows the Join code as a link with the code in the fragment (`…/tavern-td/#join=TTDJ1.…`), so GitHub never receives it. Below it: Share (the share sheet), Copy, a QR of the link, and a box to paste the Answer code. Opening the link goes straight to Join with the code filled in, and the app drops the fragment from the address.
- Join also takes a pasted code or the whole link.
- The Guest's screen shows the Answer code with Share and Copy: "Send this back to the Host." It isn't a link, since opening it would start a browser instead of reaching the Host's waiting app.
- On an iPhone a link opens Safari, not the Home Screen app, and Safari keeps its own Records. So Join tells an iPhone player to copy the link, open Tavern TD and paste it.
- Android's WebView has no Web Share, so the APK shares through `@capacitor/share` (8.0.3, MIT). The web app uses `navigator.share` where it exists, and Copy works everywhere.

**QR: in, for the Join code only.** `uqr` 0.1.3 (MIT, no dependencies, pinned, loaded only by the Host screen) draws it as SVG. A link of about 250 characters fits a version 10 QR at level L, 57 × 57 modules, easy for a phone camera at 4 px a module. The friend scans it with their camera app; Tavern TD scans nothing. An Answer QR is out: the Host's device would need a camera permission and a decoder (Safari's `BarcodeDetector` is behind a flag) to save one paste.

**Freshness.** NAT mappings and WebRTC's own checks don't wait forever, so the swap should take a minute or two at most. Each screen shows how long its code has waited. After 2 min the Host's offers a fresh code, and the Guest's says to ask for one.

## 3. When it can't connect

Without a relay (TURN), two devices connect only if a NAT on one side lets the other's packets in. A pair where both sit behind symmetric NATs, or one symmetric and one port-restricted, never connects. Symmetric NATs are common on mobile data behind carrier-grade NAT, and on some office and campus Wi-Fi. Vendors put the sessions that need a relay at about 15–25% overall ([Twilio](https://twilio.com/en-us/stun-turn), [Fora Soft](https://www.forasoft.com/learn/video-streaming/articles-streaming/turn-bandwidth-calculator)). Two phones both on mobile data do worse, and on some carriers may fail more often than not. IPv6 on mobile data often helps, since it has no NAT. One Wi-Fi network almost always works (mDNS host candidates, unless the network isolates clients), and so do most pairs of home Wi-Fi.

**What the player sees.** "Connecting…" from the moment a device has both codes, and after 20 s:

> **Couldn't reach the Rival.** Some networks, often mobile data, block direct connections between two devices, and Tavern TD has no relay server. Put both devices on the same Wi-Fi, or on one phone's hotspot, then make a new code.

with New code (Host) or Paste a new code (Guest), and Menu.

**A custom TURN field is parked.** It needs a server, its credentials and someone to run it, and credentials can't live in a public repo. The code format already has room for relay candidates, so adding it later is a setting and one more ICE server.

## 4. Lockstep

### 4.1 Roles
The Host makes the Join code and plays Side 0. It sends Start, Go and Resume, and its state is the one a resync copies. Otherwise the devices are equals: each steps the whole sim.

### 4.2 Turns and Batches
- **Turn n** is ticks 3n, 3n + 1 and 3n + 2: 100 ms.
- **Batch (s, n)** holds Side s's commands for Turn n, all applied on tick 3n. A device sends one for every Turn, empty or not.
- **Input Delay D**, in Turns: as a device begins Turn n, it seals everything its player did since the last seal into its Batch n + D and sends it. Batches 0 to D − 1 are empty on both devices.
- **Tick 3n steps only once both Batches of Turn n are in.** Ticks 3n + 1 and 3n + 2 follow without asking.
- **Order:** Side 0's Batch, then Side 1's, as [ADR-0003](adr/0003-two-sides-and-an-ai-in-one-sim.md) requires.
- **Own Side only.** Before applying, each device drops from Side s's Batch every command that isn't an `lw.*` command naming `side: s`, and keeps at most the first 16 of the rest. It does this to both Batches, its own included, so a misbehaving peer can't move the other's pieces and the two states still agree. A device seals at most 16 of its own player's commands into one Batch and carries the rest to the next, so a burst of taps is late, never lost.
- **What both apply is what was sent.** A device applies its own Batch as it parses back from the text it sent, so both sims see identical command objects (a field JSON drops is gone on both).
- A Batch also carries a pause (§5.1) and a hash (§4.6) when it has one.

### 4.3 Input Delay
The lobby pings every 500 ms. At Start the Host sets D = ⌈(the 90th-percentile round trip ÷ 2 + 50 ms) ÷ 100 ms⌉, held between 2 and 5. That is 200 ms up to about 300 ms of ping, and 500 ms at worst; the 50 ms covers jitter and a frame's wait. D stays fixed for the Run, and above 800 ms the lobby warns "Slow connection: expect waits". A tap then lands 200–600 ms later, which a TD hides: the tap clicks and buzzes at once, and a pending build or Send shows faintly until its tick lands.

### 4.4 The clock
Each device runs its own 30 Hz clock from Go. A frame that runs long is made up at up to 2× speed, which can't change the outcome (ADR-0002). Time spent waiting for a Batch is not made up, so a device that waited doesn't then race ahead. Go starts both clocks within a few ms: the Guest counts 3 s down from receiving Go, the Host from sending it plus half the ping. Drift that remains is absorbed by §4.2's wait, since either device may run up to D × 100 ms less the one-way latency ahead of the other before it waits.

### 4.5 The channel and messages
One DataChannel, `negotiated: true, id: 0`, reliable and ordered: lockstep needs every Batch in order, and the Input Delay absorbs a retransmission. Messages are JSON text, `{ "v": 1, "t": … }`, where `v` is the protocol version. A Batch is 30–100 bytes, 10 a second each way. A message over 64 KiB, one that won't parse or one of an unknown kind ends the connection with the version message (§4.6). A snapshot is deflated and sent in 16 KiB parts.

| `t` | From | Holds | When |
|---|---|---|---|
| `hello` | both | protocol version, `SNAPSHOT_VERSION`, sim hash, build, session (null when new), last Turn stepped, last Batch received | first, on every connection |
| `pick`, `ready` | both | Race; Ready on or off, and in a Run the Turn of the pause | the lobby, and Ready to resume |
| `ping`, `pong` | both | the sender's clock | every 500 ms in the lobby, every 1 s while paused or on the end card |
| `start` | Host | session id, `RunOptions`, D, Turn length 3, hash every 30, the initial hash | both Ready |
| `started` | Guest | its initial hash | after building the Run |
| `go`, `resume` | Host | the Turn, the countdown | to start, and after a pause |
| `turn` | both | `n`, the commands, the pause's kind (`pause`, `away`, `link` or `sync`) and `[tick, hash]` when present | every Turn |
| `away`, `back` | both | | the app hidden or shown again |
| `desync` | both | the tick and both hashes | a hash differs |
| `snap` | Host | the Turn, its hash, part k of n of the deflated payload: the state, and on a rejoin also the options, the log, the Input Delay and the Guest's Batches | resync and rejoin |
| `end` | both | `concede` | Concede |
| `rematch` | both | | Rematch on the end card |

### 4.6 The handshake and the hash check
1. **Hello**, both ways. The **sim hash** is FNV-1a over `src/sim` (less `testing/`) and `src/content`, computed by `vite.config.ts` and defined beside `__PLATFORM__` as `__SIM_HASH__`, with the git commit as `__BUILD__`. Versus needs the protocol version, `SNAPSHOT_VERSION` and the sim hash to match, but not the build: an APK installed weeks ago still plays the newest Pages build until a rule or number changes. A mismatch shows both players "You have different versions of Tavern TD (yours a1b2c3d, the Rival's e4f5a6b). Update both: reload the web app, or reinstall the Android app." Codes carry the sim hash too, so a Join code from another version says so before connecting.
2. **The lobby:** each picks a Race (Random is drawn on the picker's device), sees the other's pick and the ping, and presses Ready.
3. **Start**, from the Host: a fresh seed from the app (never the sim), and the `RunOptions`: `mode: 'linewars'`, Normal, `race` the Host's, `rivalRace` the Guest's, `drivers: ['human', 'human']`. Also D, the Turn length, the hash interval, a session id, and `hashState(createRun(options))`.
4. **Started**, from the Guest, with its own initial hash. A mismatch stops there with the version message.
5. **Go**, from the Host: the 3 s countdown (§4.4).

**The hash check.** Each device hashes its state with `hashState` whenever `state.tick` reaches a multiple of 30, once a second, and adds `[tick, hash]` to the next Batch it seals. Each compares the Rival's hash with its own. Measured in Node over Line Wars Runs with 24–126 towers: 0.05 ms at 2 min (a 10 KB snapshot), 0.12 ms at 10 min (26 KB) and 0.15 ms at the busiest tick (34 KB), about four fifths of it in `JSON.stringify`. A phone ten times slower spends 1.5 ms once a second. Hashing every Turn would cost ten times that, to find a desync under a second sooner.

### 4.7 Desync
1. The device that finds a mismatch sends `desync`, and both show "Out of sync: fixing…".
2. The Host puts a pause in its next Batch, so both stop on the same tick.
3. The Host sends its state there (`snap`, 2–6 KB deflated in a Line Wars Run). The Guest keeps its own state for the report, adopts the Host's and checks its hash, and play resumes after a 3 s countdown with no Ready.
4. From then on both can Copy desync report, from the in-Run menu or the end card: a `TTDR1.` code with both builds and browsers, the tick, both hashes, the Run's replay and this device's own state at the pause. Replaying it in Node and WebKit shows which engine drifted and where.
5. A second desync ends the Run on both devices: "This Run can't go on: your two games disagreed twice. No result is recorded", with Copy report and Menu.

### 4.8 The replay
Each controller logs every command it applies with its tick, Side 0's first. The two logs are identical, so the seed, the options and the log replay the whole Run, in Node or any browser.

## 5. Pause, background and disconnects

### 5.1 Pause
- 1× only: the speed buttons and the 1–3 hotkeys are hidden.
- Either player pauses, with the button or P. The pause rides in their next Batch, n + D, so both stop at the start of Turn n + D, on the same tick.
- The pause sheet says who paused and shows a Ready for each player. Once both are Ready, the Host sends Resume and both count down 3 s, as at Go. There is no pause limit: it's between friends.
- In Versus the in-Run menu doesn't pause. It offers Pause, Concede, How to play and Settings, plus Copy desync report after a desync.

### 5.2 Background
When the app is hidden (`onBackground` in `src/platform/lifecycle.ts`), the device seals its next Batch at once, with a pause, and sends `away`. iOS then suspends the page and every platform stops its frames, so it sends nothing more. The other device plays on to that Turn and stops there: "The Rival's app is in the background." On return the device steps up to the pause and sends `back`, and both press Ready. If the connection didn't survive the trip, §5.4 applies.

### 5.3 How long before what

| Nothing from the Rival for | The player sees |
|---|---|
| 1 s with a Turn waiting | "Waiting for the Rival…" over a still board. Taps still queue |
| 5 s, or ICE `disconnected` | "Connection unstable…". ICE often recovers from a short drop by itself, so nothing else happens |
| 30 s, ICE `failed`, or the channel closed | The Connection lost sheet, with Reconnect and Concede |
| 2 min | Claim the win too, for the player who stayed (§5.5) |

### 5.4 Reconnect
A failed WebRTC connection can't be revived without signaling, and here the players are the signaling. So Reconnect is always a fresh swap with a new `RTCPeerConnection`, never `restartIce`: the Host's sheet makes a new Join code, marked as a rejoin with the session id, and the Guest's takes it as in §2. Each Hello then names the session, the last Turn it stepped and the last Batch it received.
- **When the channel closes,** each device seals its next Batch with a `link` pause, as it would going to the background. Neither can deliver it yet, so each plays on until it lacks a Batch.
- **Both still have the Run:** each resends the Batches the other lacks, and both stop at the first `link` pause, on the same tick, and press Ready. A device keeps all its Batches; a whole Run is about 12,000, a few hundred KB.
- **The Guest's app restarted:** the rejoin link offers "Rejoin the Host's Run". Once the Host is held at a Turn, it sends its state there, the options, the log, the Input Delay and every Guest Batch it holds from that Turn on, then resends its own Batches from there. The Guest takes those as its own, seals empty Batches up to Input Delay Turns ahead, and both play on to the Host's `link` pause and press Ready. The Guest loses at most its last half second of taps.
- **The Host's app restarted:** the Run is gone, because the Host's state is the one that counts and Versus keeps nothing on disk. The Guest waits out the 2 min and claims the win.

### 5.5 Concede, and claiming the win
- **Concede**, from the in-Run menu or the Connection lost sheet, sends `end` and leaves. The Rival's device shows "The Rival conceded" and a Victory.
- **Claim the win** appears 2 min after the Rival's last message, and only for a player whose own app stayed in front all that time. A player who went away can Reconnect or Concede. If both stayed (a router died), both may claim: Records are each device's own.
- Neither is a sim command; the Run just stops. §6 says how they count.

## 6. Saves, Records, Difficulty and the end card
- **No autosave, Continue or save codes.** A Versus Run can't go on without the Rival, and a save loaded alone would leave nobody playing Side 1. The Run in memory is the only copy, and Quit is Concede.
- **Records:** Line Wars gains a Versus board (`record/linewars/versus/normal`, through the existing `recordBoard` hook), shown as its own row. Each device records its own Side's result: Runs, wins, fastest win, best score and best steal. A draw counts as played. A concede counts as a loss for the player who conceded; a conceded or claimed win counts as a win with the score so far and no fastest-win time. A Run ended by a desync records nothing.
- **Difficulty:** none. Versus always plays Normal, because the sim scales Side 1's pay by the Difficulty whoever drives it (`payOf`), and only Normal is ×1. A handicap is parked: it would need a factor per Side in the sim.
- **The end card** is Line Wars' from the device's own Side: Victory, Defeat or Draw with why ("You took the Rival's last life"), both Sides' lives, lives stolen, score and time. While connected, Rematch replaces Play again: both return to the lobby with their picks, and the Host starts with a new seed. Menu leaves.
- The "new version, reload" toast waits until a Versus Run is over.

## 7. The Guest's screen: the Viewer Side

The sim names Sides absolutely; Side 0 is "you" only by the UI's habit. Versus gives the UI a **Viewer Side**: 0 everywhere except on the Guest's device, where it is 1.
- `RunView` gains `side`, set through `PlayOptions.viewer`. The Line Wars UI reads `me = view.side` and `them = other(me)` wherever it now writes 0 and 1: the commands it builds (`side: me`), `buildOptions`, `buildSpot`, `sendOptions`, `towerActions`, `inField`, `lwStatus().sides`, the live and faint routes, the banners ("You" over the viewer's Field), sounds and haptics (`d.side === me`, `d.to === me`), the hint, the end text and the Record.
- **The mirror.** On the Guest's device the board draws the Map flipped left to right, so its Field sits on the right beside the HUD. The world container gets `scale.x = −scale`, `screenToWorld` and `worldToClient` flip x, and the board's text (banners, labels) is flipped back so it reads. World coordinates, the sim and the Send arcs don't change, and taps still reach `placement` as world points.
- **Gold.** The core's `gold` is Side 0's copy, so the shared HUD asks a new `ModeUi.gold(state, side)`; Line Wars returns that Side's purse.
- **Who won.** `state.phase` is `won` only when Side 0 wins, so the end card and the Record read `result` against the viewer: `side1` is the Guest's Victory.
- **Versus only:** the Rival's line drops its ×factor, the speed buttons hide, Pause asks the lockstep (§5.1), and How to play adds a paragraph on Versus.

## 8. How it plugs into the app

The controller gains one seam, a **tick source**, and today's loop becomes the default one:

```ts
/** Where a Run's ticks get their commands (src/app/controller.ts). */
export interface TickSource {
  /** This device's player's command. Local play: the next tick. Lockstep: the next Batch. */
  submit(command: Command): void;
  /** The commands tick t applies, or null while it can't step (a Batch isn't in, or a pause lands on it). */
  take(tick: number): readonly Command[] | null;
  /** After each step: lockstep hashes on its interval here, and notices the Run's end. It seals Batches in take(), as each Turn begins. */
  stepped(state: GameState): void;
  /** 1, or 2 while this device is behind its own clock (§4.4). */
  pace(): number;
}
```

`RunControllerOptions.ticks` takes one. Without it, the controller builds the local source from its queue, speed and pause, and single-player behaves as now, with `tests/run-controller.test.ts` unchanged. With it, `send` goes to `submit`, `setSpeed` and `setPaused` do nothing, and a null from `take` holds the loop without banking time. A new `adopt(state)` swaps in a resynced or rejoined state and fires `onRun`, so the board and the HUD reset.

| Where | What |
|---|---|
| `src/net/codes.ts` | Join and Answer codes to and from the SDP fields, and the rebuilt SDP. Pure |
| `src/net/protocol.ts` | The messages, `NET_VERSION`, parsing and the size caps. Pure |
| `src/net/lockstep.ts` | The tick source: Turns, Batches, Input Delay, the own-Side filter, pause, hashes, desync and catch-up. Pure, over a `Transport` and an injected clock |
| `src/net/session.ts` | Hello, the lobby, Start and Go, reconnect, rejoin and concede. Pure, over a `Transport` |
| `src/net/rtc.ts` | The browser's `RTCPeerConnection` as a `Transport`: gathering, the DataChannel, 16 KiB parts, ICE states |
| `src/net/report.ts` | The desync report code |
| `src/app/versus.ts` | Runs a session, then `startPlay` with the lockstep source and the Viewer Side |
| `src/ui/versus/` | Host, Join, the lobby, the QR, and the waiting, pause, Connection lost and desync sheets |
| `tests/net/` | The fake transport and §9's tests |

- **`src/sim` keeps its rules, state and hashes.** Its one change is a pure query: `lwRecord(state, side = 0)` reports either Side, deriving Side 1's score from its tallies by the formula Side 0's follows (100 a life stolen, plus bounty, plus a win's bonus).
- `src/net` reaches the sim only through `src/sim/index.ts`, and only `rtc.ts` touches browser APIs, so the lockstep runs in Node tests.
- New dependencies: `uqr` 0.1.3 and `@capacitor/share` 8.0.3, both MIT and pinned.

## 9. Testing plan

**Step 2, unit tests in Node** (vitest, no browser):
- **Codes:** round trips over hand-written SDPs shaped like Chrome's, Safari's, the Android WebView's and Firefox's (mDNS hosts, IPv4 and IPv6 server-reflexives, TCP candidates to drop); the rebuilt SDP has every line `setRemoteDescription` needs; a cut-off code says damaged; another sim hash says version. Step 3's e2e test feeds the codes real browsers' SDPs.
- **Protocol:** malformed, oversized and unknown messages are refused; a Batch's commands for the other Side, and those past 16, are dropped on both devices.
- **Lockstep over a fake transport:** two devices in one process, each with a controller, its lockstep source and a scripted bot for its own Side (the Line Wars sanity bots, generalized to either Side), on a virtual clock. The fake delivers in order with a set latency and jitter, and can stall or close. Every test checks that both devices' hashes agree at every check, that the Run ends the same on both, and that either controller's replay reaches the same final hash. A whole Run is about 36,000 ticks a device at 7 µs plus 1,200 hashes, about a second for both.
  - One full Run to its end at 40 ± 30 ms each way; the rest a few minutes each.
  - 300 ms of ping with D = 3, and no wait while within it.
  - A pause from each Side, landing on the same tick.
  - The Guest away for 20 s.
  - The transport closing, then a reconnect that resends Batches.
  - A rejoin from nothing through the Host's state.
  - One state nudged to force a desync: one resync, then agreement. Nudged twice: both end on the desync.
  - A peer sending the other Side's commands: dropped, and the states still agree.
- **Records:** `lwRecord(state, 0)` equals the score the sim keeps, and Side 1's follows the same formula.

**Step 3, e2e** in Playwright, two browser contexts (separate storage) in one Chromium, on the `mac-chrome` project:
- The Host page makes a code. The test opens its link in the Guest page, reads the Answer code and pastes it into the Host's. Both pick, press Ready and Go.
- Both build and send through the HUD. The Guest's own tower is drawn right of the middle, its gold is its own, and the hash checks agree (`window.tavern` exposes the last one).
- A Guest pause stops both on the same tick, and Ready on both resumes. The Guest concedes, and the Host's end card and Versus Record show the win.
- Needed: no STUN in tests (an init script sets the ICE servers to none), and Chromium launched with `--allow-loopback-in-peer-connection` and `--disable-features=WebRtcHideLocalIpsWithMdns`, so host candidates are plain addresses rather than mDNS names a CI machine may not resolve.
- The WebKit projects run the same test behind a check that an `RTCPeerConnection` connects, and skip with the reason if Playwright's WebKit can't.

**Not testable here:** real phones (iOS suspending the page, the share sheets, mDNS in the S24's WebView), carrier and symmetric NAT, Wi-Fi that isolates clients, and the Capacitor WebView itself. MDN's data lists `RTCDataChannel` in Android's WebView wherever Chrome has it ([browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/RTCDataChannel.json)), and a data channel needs no camera or microphone permission, only the `INTERNET` permission the APK already has. The play-test: the S24's APK against the iPhone on one Wi-Fi; the iPhone on mobile data against the Mac on home Wi-Fi; both phones on mobile data; and each phone sent to the background mid-Run.

## 10. My calls, open to change

- **Codes swapped by hand, with the SDP rebuilt from a few fields,** as you recommended: a link with the code after `#`, the share sheet, Copy and a QR out; share sheet or Copy back.
- **A QR for the Join code only,** drawn by `uqr`. No scanning in the app and no Answer QR: one paste isn't worth a camera permission and a decoder.
- **No TURN, and no custom TURN field yet:** nobody to run one, and no safe place for its credentials. The code format leaves room.
- **Compatibility by the sim hash, not the build:** the APK updates rarely, and a UI change shouldn't split it from Pages.
- **Turns of 3 ticks and an Input Delay of 2–5 Turns from the lobby's ping, fixed for the Run:** 10 Batches a second, and a delay a TD hides.
- **A hash every 30 ticks:** 0.15 ms in Node, about 1.5 ms on a phone, once a second.
- **JSON on one reliable, ordered DataChannel:** a Batch must never be lost, and a Batch is tiny.
- **The first desync repaired from the Host's state, a second ending the Run with no result,** as you leaned.
- **1× only. Either player pauses; both press Ready to resume; no pause limit.**
- **Background pauses both, and reconnecting is always a fresh swap and a new connection,** never `restartIce`, which would need the same swap.
- **The win may be claimed after 2 min, only by a player who stayed.** Concede and claim aren't sim commands.
- **No autosave, Continue or save codes, and nothing kept on disk:** a restarted Guest app can rejoin, a restarted Host app ends the Run. Keeping a Versus Run on disk is parked.
- **A Versus Records board per device, honour-system,** with claimed wins counted but no fastest time.
- **Always Normal, with no handicap.**
- **The Guest's board mirrored,** so every player has their Field on the right beside the HUD.
- **One query in `src/sim` gains a Side** (`lwRecord`); nothing else there changes.
- **The seed is the Host app's alone,** and no player names: the other person is "the Rival".

## 11. Filled in by the build

Step 2, the net layer, is in `src/net/` (the app imports `src/net/index.ts`), its tests and the fake transport in `tests/net/`. Where it fills in or departs from the sections above:

- **Files.** Besides §8's: `transport.ts` (the `Transport` interface), `clock.ts` (the injected `Clock`, and `browserClock` on `performance.now()` and `setInterval`) and `version.ts` (`SIM_HASH` and `BUILD` from the defines, falling back to `00000000` and `dev` outside Vite). A lint rule keeps `Date`, `performance`, timers and browser APIs out of `src/net` except `rtc.ts` and `clock.ts`, and deep imports of `src/sim`.
- **The sim hash** is FNV-1a, over UTF-16 code units as `hashState` does, of each file's repo path, a NUL, its text with line ends made `\n` and a NUL, files sorted by path. `__BUILD__` is `git rev-parse --short=7 HEAD`, or `dev`. Vitest reads `vite.config.ts`, so tests see both.
- **`src/sim`** gains two exports and no rules: `SNAPSHOT_VERSION` from its index, for Hello, and `lwScore(state, side)`, the formula `lwRecord(state, side)` uses for Side 1. `lwRecord`'s `races` lists that Side's Race first.
- **Codes.** Byte 0 is the format (1), byte 1 the kind (1 Join, 2 Answer), byte 2 the flags (bit 0: a session id follows the candidates). Then the sim hash, the length-prefixed ufrag and password, the 32-byte fingerprint, the setup role (0 actpass, 1 active, 2 passive), the length-prefixed mid, the count and the candidates (kind in the high nibble, family in the low; port big-endian), the session id and the CRC-32 of all before it. Up to 4 UDP candidates of component 1 are kept, taking a host, a server-reflexive, a peer-reflexive and a relay in turn. A pasted code may be a bare code or any text with `#join=` (or `?join=`, `&join=`) before it; spaces and zero-width characters are dropped. Errors: `not-a-code`, `damaged`, `version`, `wrong-kind` (an Answer code in the Join box or the other way round) and `unsupported` (a description without a SHA-256 fingerprint or ICE credentials).
- **The rebuilt SDP** adds `a=group:BUNDLE` with the mid, gives each candidate the priority RFC 8445's formula makes from its kind and order, and writes `raddr 0.0.0.0 rport 0` on non-host candidates, as Chrome does when it hides addresses, since Firefox's parser wants a related address there. The code itself carries none.
- **Messages.** §4.5's table as built: `ready` carries the pause's Turn in a Run, a Batch's pause is a kind (`pause`, `away`, `link`, `sync`), `snap`'s options, log and Batches travel inside its deflated payload, and `rematch` is new. A refused message closes the channel; another version's Hello leaves it open, so the Rival still reads this Hello and shows the version message too. A snapshot inflating past 8 MiB, or of more than 256 parts, is refused.
- **Sealing and hashing.** A device seals in `take()`: as it reaches tick 3n it seals up to Batch n + D, before checking that Turn's Batches are in, so its Batches never wait on the Rival. `stepped()` hashes at multiples of 30 and carries the hash in the next Batch sealed.
- **Pauses.** A Turn whose Batch from either Side carries a pause holds both at its start. Once both are Ready the Host sends Resume, starts its countdown half a ping later than 3 s, and the Guest counts 3 s from receiving it. Resuming at Turn n clears every pause sealed for Turns up to n + D, so two pauses pressed together, or a pause and the app going to the background, stop the Run once. Pause while a pause is due does nothing. Going to the background while paused sends `away` and takes back this player's Ready, sealing no second pause.
- **The clock.** A device anchors its clock where it last started stepping (Go, a resume, or the end of a wait) and runs at 2× while it is more than 2 ticks behind it, at most 6 ticks a frame; any held time re-anchors, so waiting is never made up.
- **Desync.** Hash checks between a Desync and the tick that repaired it are void, as are any at or before a rejoin's tick. A second Desync ends both with outcome `desync`, and the report then holds the state at the second one. A resynced state whose hash isn't the Host's ends the Run as a second Desync does.
- **Input Delay.** The 90th percentile is by nearest rank over the last 20 round trips; with none yet, D is 3. The "slow connection" warning reads the same percentile.
- **Lobby and Start.** The session id is 16 hex digits from the app's random source, new at every Start, and names the Run for a rejoin. The Host starts the moment both are Ready. The Guest refuses a Start whose options aren't Line Wars, Normal, two human Sides and its own Race as the Rival's. A connection lost between Start and Go sends both back to the lobby once they reconnect.
- **Rematch.** Pressing it sends `rematch` and puts this device in the lobby with its pick; the Rival's device shows it's back, and the Host starts once both are Ready again. After a Run the Rival counts as away from the lobby until its `rematch` arrives.
- **Claiming the win** opens 2 min after the Rival's last message, while the Run is on, for a device that wasn't in the background at any moment since that message.
- **`rtc.ts`** labels the channel `tavern`. ICE servers are the option passed, else `globalThis.TAVERN_ICE_SERVERS` (e2e sets `[]`), else §2's two. ICE `disconnected` is `unstable`, `failed` or `closed` and a closed channel are `closed`. It collects candidates from `icecandidate` events as well as the description.
- **Tests** use hand-written fixture SDPs rather than captured ones (§9), since this step runs no browser; the bots in `tests/sim/linewars/bots.ts` play either Side through `sideBot`, with Side 1's maze Side 0's mirrored, and every existing bot Run and replay hash is unchanged.

Step 3a, the Viewer Side, the mirror and the Versus Records board, fills in §6 and §7 as follows:

- **The Viewer Side** is `RunView.side` (type `ViewerSide`, 0 or 1), set by `PlayOptions.viewer`. ModeUi methods that get only the state (`routes`, `feedback`, `endText`, `result`, `optionsOf`, and the new `gold`) take it as an optional last argument, 0 when left out, so the other Game Modes are unchanged. `ModeUi.look` may be a function of it: Line Wars' banners hang "You" over the Viewer Side's Field. Line Wars plays the end's sound from that Side's result, since the core's `won` is Side 0's.
- **Gold.** `ModeUi.gold(state, side)` gives the HUD that Side's purse; the core's `gold` stays Side 0's copy.
- **The mirror.** `BoardOptions.mirror`, on for Viewer Side 1. The camera keeps fitting, panning, zooming and clamping in view space, so they behave alike either way; `screenToWorld` and `worldToScreen` take the world's width as `mirror` and flip x, and `worldTransform` gives the world container a negative x scale with its origin at the world's right edge. Every Text in the terrain gets its x scale and rotation reversed, so a banner's word still runs up it. Entities do the same for a tower's number, and draw a creep's HP fill from its left end on screen and its shadow to the right, as on an unmirrored board.
- **Versus switches.** `PlayOptions.versus`: no autosave or clear, no save code (`PlaySession.exportCode` is absent, so the in-Run menu hides it), 1× with the speed buttons and 1–3 keys gone, the Rival's line without its ×factor, the app's own background pause left to the session, and the Record on the Versus board. `PlayOptions.ticks` passes the lockstep to the controller, and `PlayOptions.onPause` replaces what the pause button and P do.
- **The end text** keeps "on Normal": Versus always plays Normal, and the sim can't tell a Versus Run from a test with two human Sides.
- **Records.** A `RecordBoard` with `only: 'normal'` is a row named after it under the mode's table by Difficulty, not a table of its own: Line Wars' Versus row, `record/linewars/versus/normal`. A Run the sim ended is recorded at its end as single-player Runs are, so a draw counts as played. `Play.recordVersus(outcome)` (from `src/app/versus-records.ts`) records 'conceded' as a loss, 'rival-conceded' and 'claimed' as wins, each with the score so far and a time of 0, which the Record keeps as no fastest win; 'desync' and 'run' record nothing through it.
- **Lifecycle.** `onForeground(handler)` calls once per return after a trip `onBackground` counted (visible again, `pageshow` or `resume`), never on the first load.
- **A rehearsal without a network.** `window.tavernMirror(race?, rival?)` starts Line Wars with `drivers: ['ai', 'human']`, Viewer Side 1 and Versus' display, and records nothing; the sim takes that combination. The e2e test uses it to check the mirror, Side 1's gold and the commands naming Side 1.
