# Tavern TD — plan

A single-player collection of tower defense Game Modes, most recreating Warcraft 3 Classics. It runs on Mac, iPhone and Android, and it's for you and your friends, not the stores. Vocabulary follows [CONTEXT.md](../CONTEXT.md). Background is in [docs/research/](research/), and the hard-to-reverse decisions are in [docs/adr/](adr/).

## 0. Status

Planning finished on 2026-10-15. **Now: Phase 5.** Tick a box when its phase meets the exit bar in §3, and keep this list current.

Phase 0 finished on 2026-10-17. The Tavern TD icon opens the app offline on the Mac, the iPhone and the S24, and a tap on the board registers. The repo `abdimuratov/tavern-td` is public, CI deploys it to https://abdimuratov.github.io/tavern-td/, and `pnpm apk` builds and installs the Android app. TypeScript is pinned to 6.0 because typescript-eslint 8.71 doesn't support TS 7 yet.

Phase 1 progress (2026-10-17):
- Done: the deterministic game logic core (a tick takes ~0.05 ms with 300 creeps and 80 towers in Node), the renderer and input, and the platform layer. That covers autosave, Continue, Records, settings, save codes, sound and haptics.
- Done: Gem is ported from Gem TD+ ([gem-td-rules.md](research/gem-td-rules.md)) and playable from the main menu. The WebKit, Chromium and Node replay hashes match. A headless bot reaches Wave 10–21.
- Left: play a full Run, autosave and resume it on the Mac, the iPhone and the S24. Real-device checks are still owed for the iPhone notch side, the clipboard fallback for save codes, and Android haptics.
- Watch in play-testing: at fit zoom a gem is ~10 px on a phone, so placing needs a pinch first.

Phase 2 started on 2026-10-17 without waiting for that play-test, as you asked. The Phase 1 box stays open until the play-test is done.

Phase 2 progress (2026-10-17):
- Done: Element's rules are ported ([element-td-rules.md](research/element-td-rules.md)), and Element is playable from the main menu. New Run asks for All Pick or All Random, Full or Express, and Difficulty. Autosave, Continue, save codes, How to play and Records all work, with Records kept apart for Full and Express. The e2e test plays a Wave and resumes it in all four browsers.
- Left: play a full Run, autosave and resume it on the Mac, the iPhone and the S24.
- Watch in play-testing: at fit zoom a tower is ~18 pt on a phone, so placing wants a pinch first; a second tap within 26 pt of the Ghost still builds it.

Phase 3 started on 2026-10-18, again without waiting for the Phase 1 and 2 play-tests.

Phase 3 progress (2026-10-18):
- Done: the design doc, [original-design.md](original-design.md). It covers the grim-war world and its 3 Regions, 10 creeps and 3 bosses, the 30 towers, Tower Levels and Perks, the Talent trees, the unlock order and a plan for each of the 12 Stages. You chose the grim tone, soft counters, overlapping Waves and scarce Stars. It drops §4's interest, because the early call is the Original's greed lever.
- Done: the Original's deterministic rules ([original-design.md §14](original-design.md#14-filled-in-by-the-rules) lists what they assume):
  - Engine: several routes per Map, each Wave group naming its own; an air line per route for flyers; 2 × 2 Build Spots.
  - Towers: the 30 towers with Tier upgrades and Specialisations, First/Last/Strong/Close targeting, and every new effect (poison that prefers fresh creeps, Widow's Fang stacks, the ramping beam, the cloud, the bouncing bolt, freeze, Deadeye's armor-piercing). Damage types against armor types.
  - Creeps: the 13 creeps, Shields, the Bloater's split, and the three bosses' enrage, brood and Shields with calls. Bosses take half slows and ignore stuns.
  - Tower Levels with XP, Assists, Totem shares, Level bonuses and the 12 Perks.
  - Economy and pacing: Threat, the bounty pool, the end-of-Wave bonus, Breaks from a Wave's last spawn, early-call gold, 70%/100% refunds, 20 lives, Stars and Difficulty.
  - Progression as pure logic: Talent trees, Talents applied as Run settings, the unlock table, Star scoring and Stage Records.
  - Content: Stage 1, The Mill Road, with its Map, 8 Build Spots, air line and 12 Waves.
- Tested: 119 tests for the Original; the replay hash and snapshot tests pass, and WebKit and Chromium match Node on a fixed Original replay. A headless bot clears Stage 1 on Normal with Arrow and Cannon at Tiers 1–2: 3 Stars waiting out the Breaks, 3 calling early. It wins Easy (3 Stars) and Hard (2 Stars), and loses Insane during Wave 4. A tick takes about 6 µs.
- Done: the Original is playable from the main menu.
  - Campaign storage, kept apart from Run saves: Stage Records (best Stars, hardest Difficulty won, fastest win), Stages finished and Talents. A Run's end folds into it, and Quit waits for that write.
  - Main menu: the Original's card has Continue and Campaign.
  - Stage select: the war map on the tavern table, with the road north through the three Regions, a pin per built Stage, each Region's two-line intro, each Stage's line, Stars and Record, and New Run by Difficulty. Stages appear as they're added to `STAGES`.
  - Talents: a tree per unlocked family, rows bought in order with Stars, and a free reset.
  - In a Run: gold, lives, Wave, Threat, the Stars the lives left would win, Send Wave 1, and Send now with its early-call gold and the Break countdown. The wave preview tags each creep (Armored, Warded, Shield, Regen, Splits, Fast, Air, Boss).
  - The build ring: tap an empty Build Spot for the unlocked families and their prices, tap one for its Ghost and range, tap again to build. The tower panel has Upgrade, both Specialisations at Tier 3, targeting, Sell with its value, and the Tower Level, XP and Perks.
  - Mac hotkeys. On a ring, Q W E R T Y pick its families in order, and the same key again builds. On a selected tower, Q and W upgrade, T changes targeting and S sells.
  - The board: Region palettes, every route's road with arrows and its faint air line, each Build Spot as its own pad, and the six family shapes. Towers show Tier pips, a gold crest for a Specialisation, and the Tower Level, gold from 5. Each creep has its own silhouette. Effects cover beams, Blizzard's ring, clouds, bouncing bolts, slows, freezes, enrage, the Riftlord's Shield, splits, brood and Perks.
  - The end card shows the Stars won, what they added and what the win opened. How to play and Records are in place, and autosave, Continue and save codes work as in every Game Mode.
  - e2e in all four browsers: a Run built through the ring that sends a Wave, autosaves, reloads and continues; a won Stage storing its Stars and opening Talents; the ring's hotkeys.
- Assumed for the UI: Level 1 shows no number on the tower; the ring's hotkeys are WC3's top row; the end card times a win from Wave 1, as the Stage Record does.
- Done: all 12 Stages ([original-design.md §11](original-design.md#11-the-12-stages) has them as built). Each has its Map, air lines, 9–14 Build Spots and 12–20 Waves, with one line for the select screen. Plague Fords has two spawns that join halfway, Three Gates three that join in two steps, and Riftmaw the longest road. Bosses close Stages 4, 8 and 12.
- Done: the balance runner, `pnpm balance`. It plays balanced, greedy and single-family bots over seeds and Difficulties, with each Stage's unlocks and a decent player's Talents, and checks PLAN §4's targets. `pnpm test` runs a dozen whole Runs as a sample.
- Done: tuning ([original-design.md §15](original-design.md#15-balance-2026-10-18) lists every number changed). Stages now ramp up to their last Waves. Boss HP fell to 12, 12 and 24 Ghouls. Cannon hits 30% harder, and Plague Cauldron, Ranger Lodge and Deadeye were trimmed.
  - Met, over 20 seeds: the competent bot wins Easy 99%, Normal 65% (50–80% per Stage) and Insane 0%.
  - Not met: Arrow, Poison or Arcane alone still clear some Stages from Stage 5 on. My recommendation is to keep the soft counters and decide after the play-test (§15).
- Watch in play-testing: the bots go from ~60% on Normal to ~0% on Hard, so Hard may be too steep a step. Waves reach 30–70 creeps by Region 2.
- Left: a play-test of the whole Campaign on the Mac, the iPhone and the S24.

Phase 4 started on 2026-10-18, alongside Phase 3's last steps and without waiting for any play-test.

Phase 4 progress (2026-10-18):
- Done: the research, [maul-rules.md](research/maul-rules.md), read from Wintermaul X14's own map files plus later versions' listings. X14 has 30 Waves with air at 5, 14, 23 and 27. Waves never overlap, and the last boss leaking loses the game. It has 20 lives, kill bounty, no interest, 75% sells, no upgrades and no Block check. Juggling is allowed. The map has no licence, so we port rules only.
- Done: the design doc, [maul-design.md](maul-design.md). Four Races (Ironclad, Rimeborn, Mirefolk, Runecasters), each with a Wall and two lines that fork at Tier 3: 36 towers. One Map, the Crossing: two gates whose approaches meet at a Ford, then a shared lower field past two Posts to the exit. 40 Waves with six air Waves at uneven gaps and a boss every 10th. Breaks start after a clear, a second Race joins after Wave 15, and Blocks are refused while Juggling is allowed.
- My calls, open to change: one shared field rather than two separate lanes; interest kept although Wintermaul had none; nothing hits only air.
- Done: Maul's deterministic rules ([maul-design.md §12](maul-design.md#12-assumed-and-tuned) lists what they assume and how they were tuned):
  - Engine: a mazing Map can have several spawns, each Wave group names its gate, and the Block check keeps every gate connected. A Checkpoint can stand in several places, and flyers head for the nearest.
  - Building anywhere on open ground, mid-Wave too. Walls with a weak attack; Tier upgrades with a fork at Tier 3, and a second Race's towers after Wave 15. Sells return 75%, or everything spent during the current Break. Juggles are detected and counted.
  - Combat on the core's attacks: an attack-type table with each type's favourite armor, slows that share one key, venom that ticks per tower, spores and Blight armor, chain lightning, auras, unslowable Wraiths, Troll regen, and bosses that slow to half speed at most.
  - Pace and economy: 60 s before Wave 1, then 30 s Breaks after each clear; Send now pays nothing. The bounty pool, the end-of-Wave bonus and interest. 20 lives, and the last boss's leak ends the Run. Score and Records.
- Tested: 37 Maul tests, plus path tests for two spawns and a split Checkpoint. The replay hash and snapshot tests pass, and WebKit and Chromium match Node on a fixed Maul replay. A tick takes about 5 µs.
- Tuned with a headless bot, on seed 1: it wins Easy with every Race, wins Normal with two of four and reaches Wave 40 with the rest, wins Hard with one, and dies on Insane during Waves 7–12. The bounty pool had to double from §4's, because a maze costs gold that adds no damage.
- Done: Maul is playable from the main menu.
  - New Run picks the Race, with each Race's role under the choice, and the Difficulty.
  - HUD: gold, lives, Wave n/40, the Races, the interest due at the next clear, the juggle count, and an Air or Boss warning in the Break before one. Send now shows the countdown to the next Wave.
  - Build menu: the Wall and each Race's two Tier 1 towers. The 2 × 2 Ghost goes anywhere on open ground, shows its range and the path it would make from both gates, and turns red with the reason on a Block. A second Race's picker appears once Wave 15 is cleared.
  - Tower panel: role, attack type, damage, speed, range and what it hits; the upgrades, both forks at Tier 2, and a Wall's lines from every Race held; Sell with its value, noting a full refund during the Break.
  - Feedback: "Juggled: n creeps turned back", an air-Wave warning, a last-boss warning, chain lightning drawn between creeps. The wave preview tags Swarm, Fast, Armored, Regen, Unslowable, Air and Boss, with each creep's armor and what hits it hardest.
  - The board: both gates, both live routes and both air lines. Each Race has a colour, each line a shape, Walls are stone, and Tier 3 forks wear a crest.
  - Mac hotkeys: Q Wall, W and E the first Race's lines, R and T the second's. On a selected tower, Q W E R pick its upgrades and S sells.
  - How to play, autosave, Continue, save codes and Records work as in every Game Mode.
  - e2e in all four browsers: a Run that builds, upgrades a Wall in its panel, sends a Wave, autosaves and continues paused; a refused Block with its reason, and a save code exported mid-Wave that imports back. Every e2e page now plays its sound into a muted gain, so a test run is silent.
- Assumed for the UI: the build choice stays picked after a build, so a row of Walls is one tap each; the second Race joins free.
- Watch in play-testing: at fit zoom a tower is about 12 pt on a phone, so placing wants a pinch first. Maul's Runs are long, 35–45 min at 1×. Runecasters may be the strongest Race and Ironclad the weakest.
- Left: a play-test on the Mac, the iPhone and the S24.

Phase 5 started on 2026-10-18 without waiting for any play-test. Its first step is Line Wars against an AI; versus over WebRTC comes after.

Phase 5 progress (2026-10-18):
- Done: the research, [line-wars-rules.md](research/line-wars-rules.md). It reads Line Tower Wars: Reforged 2.7c's own script, a Dota 2 port with the same 36 Sends and their prices, and Castle Fight X's source. Changelogs and listings cover later Reforged versions and Wintermaul Wars.
  - Line Tower Wars has no Waves. Every creep is a Send someone bought, and it raises the sender's income at once, at a ratio that falls from 20% to 5% as Sends get dearer. Income is paid every 10 s.
  - A Leak moves a life from the defender to the sender. Sudden Death from about 25 min drains lives every tick.
  - Reforged's computer players differ by Difficulty only in an income bonus: +0%, +20% or +50%.
  - None of the maps has a licence, so we port rules only. Legion TD is left out, as you asked.
- Done: the design doc, [line-wars-design.md](line-wars-design.md), and [ADR-0003](adr/0003-two-sides-and-an-ai-in-one-sim.md) on fitting two Sides and an AI into one sim.
  - The Twin Fields: your Field and the Rival's, each 16 × 28 cells, side by side with 12 columns of rock between them. Yours is on the right, beside the HUD. Blocks are refused and Juggling is allowed.
  - Towers are Maul's four Races and 36 towers, one Race per Side. There are no Waves: 10 Sends made from Maul's creeps cost 24 to 800 gold after tuning. They unlock from 0:20 to 10:00, with Stock that refills and at most 40 creeps a Side alive at once.
  - Income is 10 plus what your Sends added, paid every 10 s, and the Run starts with 150 gold. Each Side has 30 lives, and a Leak steals lives once. Sudden Death from 15:00 drains a life from both Sides every Income tick, so every Run ends by 19:50.
  - The Rival's AI runs inside the sim, acts only through the same commands you use and draws only on a seeded RNG stream in the state. A replay of the seed and your commands reproduces it, and versus can later hand its Side to a person. Difficulty sets the Rival's income (×0.85 / 1 / 1.1 / 1.5 after tuning) and how well it plays.
- My calls, open to change: a Leak steals once rather than looping; no neutral Waves; Difficulty changes the Rival, not the creeps; flyers add half the income ratio; Sends are one tap, with no confirm. The AI's commands are not stored in the log, because the replay regenerates them.
- Needs your yes: three of Maul's creep names (Raider, Frost Wolf, Wraith) are names the research says to avoid. Line Wars calls them Brawler, Sleet Hound and Hollow, and I recommend Maul does too.
- Done: Line Wars' deterministic rules ([line-wars-design.md §16](line-wars-design.md#16-assumed-and-tuned) lists what they assume and how they were tuned):
  - Two Sides in one sim on the Twin Fields: each Side's gold, income, lives and Stock in the mode's state, every `lw.*` command naming its Side through one handler, building in your own Field only with Blocks refused and Juggling counted per Side. Maul's tree queries moved into a helper both modes share, and Maul's replay hashes are unchanged.
  - The 10 Sends with unlocks, Stock, restock and the cap of 40; the income tick and the Rival's factor; bounty to the defender; Leaks that steal once; Sudden Death's freeze, drain and tougher Sends, ending every Run by 19:50; score and the Record's "best steal".
  - The Rival's AI inside the sim: its blueprint maze, Danger, the air guard, the defense floor, greed and banked salvos, on five skill profiles. It acts only through the handler, its commands are never logged, and `['human', 'human']` runs none.
- Tested: 45 Line Wars tests. The replay hash, snapshot-restore (the AI's memory included) and AI-regeneration tests pass, and Chromium matches Node on a fixed Line Wars replay. A tick takes about 7 µs, a think tick about 24 µs.
- Tuned with `pnpm balance linewars` on 5 seeds a row: the competent bot wins Easy 5/5, Normal 3/5, Hard 1/5 and Insane 0/5, with a median Run of 17:45. Turtle, Rusher and Flyer lose Normal every time, and the seat check is 6/10. Send prices doubled, HP climbs faster than price, Hard's factor fell to ×1.1, and the AI's salvos got a bank of their own.
- Not met: one Normal Run in five reaches 19:50, and Normal Runs are long (median 19:30). The AI's worst think tick, about 0.6–0.9 ms in Node, may pass 4 ms on a phone.
- Done: Line Wars is playable from the main menu.
  - New Run asks for your Race (with each Race's role), the Rival's (Random first) and the Difficulty, each with the Rival's income factor and a line on how it plays.
  - The board: both Fields at fit zoom with yours on the right, your live route and the Rival's fainter, faint air fans, a band along each spawn strip and an exit box per Field. Each Side's Race hangs on a banner over the Divide, and every Send throws a small token across it, drawn by the board only. Towers and creeps wear Maul's looks. The HUD is 288 px wide in Line Wars, which costs the board nothing, since it is height-bound on a phone and on a 16:9 Mac.
  - HUD: gold and your Income with a ring counting down the Income tick ("+42 in 6 s"); pause and speed; the lives as one tug-of-war bar; the Rival's Race and Income with its factor; the Sudden Death clock, red from 15:00. The shared Wave counter, lives and Send Wave button are hidden.
  - The build menu (Wall, line A, line B), a 2 × 2 Ghost that only your Field takes, red with the reason on a Block or in the Rival's Field, and the tower panel with both forks and Sell, full until 0:20. A Rival's tower opens read-only.
  - The send menu: the ten Sends in a 5 × 2 grid at the bottom of the HUD, each with its creep's shape, price, +Income, Stock, a restock bar and its unlock countdown, and "Live n/40". One tap sends; a dim one says why on a tap, a long press or hover. "In your Field" lists the Rival's creeps by Send with tags, and the next unlock.
  - Feedback: "Air in 0:30", toasts for the Rival's flyers and bosses, "+n ♥ stolen", "−n ♥ … got through", juggles, unlocks and Sudden Death. The Rival's builds, upgrades, shots and kills are silent; its Sends arriving in your Field knock, with a soft horn for flyers and bosses. Android ticks a haptic on each of your Sends.
  - Mac hotkeys: Q Wall, W and E your lines; on your selected tower Q W E R its upgrades and S Sell; Z X C V B and A D F G H send; Space repeats your last Send.
  - The end card says Victory, Defeat or Draw with why, both Sides' lives, lives stolen, score and time. Records keep one board per Difficulty with "Best steal" in the Wave column. Autosave runs on `lw.checkpoint` (a new `checkpoint` reason), and Continue, save codes and How to play work as in every mode.
  - e2e in all four browsers: a Run built, upgraded and sent through the HUD that meets the Rival's Sends, autosaves at a checkpoint and continues; Mac hotkeys; a refused Block and a refused build in the Rival's Field; a save code that imports back; a won Run's end card and its Record.
- Assumed for the UI: the send menu sits at the bottom of the HUD, under the build menu and "In your Field", so it stays when a tower's panel takes their place on a phone; Continue leads with the Run's time ("4:10 in · Rimeborn vs Ironclad · Normal"), since the card already names the mode; a Leak toast sums one tick's Leaks.
- Left: a play-test on the Mac, the iPhone and the S24. Watch the send menu's tap targets (about 52 × 46 pt on a phone), whether the Rival's Field reads at fit zoom (a Snowling is about 3 pt), and the HUD's status block hiding while a tower is selected on a phone.
- Done: the design doc for versus, [versus-design.md](versus-design.md), and [ADR-0004](adr/0004-lockstep-versus-over-webrtc.md) on lockstep over WebRTC with codes passed by hand.
  - Connecting with no server: the Host's Join code goes out as a link with the code after `#`, a QR, the share sheet or a copy, and the Guest's Answer code comes back by share sheet or copy. A code is about 140–220 characters: only the ICE credentials, the DTLS fingerprint and up to 4 candidates, from which the other end rebuilds the SDP. Public STUN, no TURN. Without TURN some pairs of networks won't connect, most often two phones on mobile data; after 20 s the app says so and suggests one Wi-Fi.
  - Lockstep: the Host is Side 0 and the Guest Side 1. A Turn is 3 ticks; each device sends a Batch of its own Side's commands every Turn, 2–5 Turns ahead from the lobby's ping, and a Turn steps once both are in, Side 0's first. Both devices drop a Batch's commands for the other Side. The protocol version, `SNAPSHOT_VERSION`, a hash of `src/sim` and `src/content`, and the initial state's hash must match. A state hash every second costs 0.05–0.15 ms in Node mid-Run; the first Desync is repaired from the Host's state, and a second ends the Run with a report to copy.
  - Phones: 1× only. Either player pauses on the same tick, and both press Ready to resume. Going to the background pauses both. A lost connection is rejoined with a fresh pair of codes, and after 2 min the player who stayed may claim the win.
  - No autosave, Continue or save codes in Versus; a Versus Records board on each device; always Normal. The Guest sees its own Field on the right through a Viewer Side in the UI and a mirrored board. `src/sim` keeps its rules, state and hashes, and only `lwRecord` gains a Side.
  - The plug: a tick source in `RunController` that says which commands a tick applies, or that it can't step yet. The transport, codes, lockstep and session live in `src/net`, the screens in `src/ui/versus/`.
- My calls, open to change: a QR for the Join code only, with no scanning in the app; no custom TURN field yet; compatibility by the sim hash rather than the build, so an older APK still plays Pages; a first desync repaired once, a second ending the Run; no pause limit; claiming the win only for a player who stayed; nothing kept on disk, so a restarted Host app ends the Run; no handicap; the Guest's board mirrored.
- Next: the net layer and its tests over a fake transport, then the screens and an e2e test with two pages over loopback WebRTC.

- [x] Phase 0: foundations
- [ ] Phase 1: engine core + Gem
- [ ] Phase 2: Element
- [ ] Phase 3: Original
- [ ] Phase 4: Maul
- [ ] Phase 5: stretch

## 1. What we agreed

| Topic | Decision |
|---|---|
| Platforms | **Mac:** Safari "Add to Dock" or Chrome "Install app". **iPhone:** Safari "Add to Home Screen". **Android 16+:** APK installed over USB (Galaxy S24 Ultra, One UI 8.5); an AAB isn't needed for sideloading. No app stores. |
| Stack | TypeScript, PixiJS 8 and Vite as an installable web app; Capacitor 8 wraps it as the Android APK ([ADR-0001](adr/0001-typescript-web-app-not-native-engine.md)) |
| Hosting | Public GitHub repo `abdimuratov/tavern-td`, deployed to GitHub Pages |
| Game logic | Deterministic, with no drawing code, ready for versus play later ([ADR-0002](adr/0002-deterministic-simulation-core.md)) |
| Players | Single-player now; versus is a stretch goal |
| Look | 2D top-down, clean geometric shapes drawn in code, **landscape only**. The UI is designed fresh and doesn't copy WC3. |
| Game Modes | **Gem** (Gem TD), **Element** (Element TD), **Original** (our Campaign), **Maul** (Wintermaul), in that build order. Line Wars against an AI is the stretch goal. Legion TD is out (2026-10-18). |
| Faithfulness | Gem and Element copy the Classic 1:1 from public source code. Maul keeps faithful rules with our own numbers. Classics keep their randomness and have no progression. |
| Progression | Classics keep Records only. The Original has a Campaign, Stars, Talents and Tower Levels. |
| Difficulty | Easy, Normal, Hard and Insane in every mode. Normal uses the Classic's own numbers. |
| Every mode gets | 1×/2×/3× speed and pause; autosave every Wave and when the app is backgrounded; Continue; save export/import; wave preview; path preview while placing; Records |
| Controls | **Mac:** mouse plus WC3-style hotkeys. **Phone:** tap to preview, tap again to confirm, pinch to zoom, drag to pan. Haptics on Android only. |
| Sound | Generated retro sound effects, no music at first. On iPhone, sound plays even with the silent switch on. |
| Language | English UI only |

## 2. Architecture

```
tavern-td/
  src/
    sim/                 deterministic rules: no DOM, no Pixi, no Math.random (ADR-0002)
      core/              tick loop, seeded RNG, state, commands, events, snapshot/restore
      path/              grid flow fields, checkpoints, Block check, fixed routes, air lines
      combat/            targeting, projectiles, damage/armor tables, buffs and debuffs
      economy/           gold, bounty, interest, lives, sell refunds
      modes/             one folder per Game Mode: rules + command handlers
        gem/ element/ original/ maul/
    content/             typed data tables: towers, creeps, Waves, Maps, Recipes, Talents
    render/              PixiJS views over sim state, smoothing between ticks, effects, camera
    ui/                  menus and HUD (Preact + signals, DOM over the canvas)
    platform/            storage (IndexedDB), audio, haptics, app lifecycle, rotate screen
    app/                 boot and screen routing
  tests/                 vitest: unit, scenario, determinism, balance bots
  tools/                 balance runner CLI, Map preview
  android/               Capacitor project (minSdk 36 = Android 16, landscape locked)
```

**The game logic is one plain object plus a step function.**
- `GameState` is a serializable plain object, so an autosave is just `JSON` of the state.
- `step(state, commands)` advances one tick at 30 Hz and returns events (kills, leaks, Wave end) that the renderer and audio react to.
- The player can only change the game through **commands**: `PlaceTower`, `Sell`, `Upgrade`, `KeepGem`, `PickElement`, `StartWave` and so on, each stamped with its tick. A seed plus the command log replays a whole Run exactly. That gives us replay tests now and lockstep versus later.

**Each Game Mode plugs into a small interface.** It sets up its Map and Waves, handles its own commands, and hooks the Wave-end and kill events. The core code knows nothing about gems or elements.

**Pathing:**
- **Mazing modes (Gem, Maul):** a flow field built backwards from the exit through each checkpoint, rebuilt only when a tower or Rock appears or disappears. The Block check is a search over the grid run before every placement.
- **Fixed-route modes (Element, Original):** creeps move along polylines and track how far they've travelled.
- **Air creeps:** fly straight from checkpoint to checkpoint.

**Determinism guardrails:**
- An ESLint rule bans `Math.random`, `Math.sin/cos/pow/exp/hypot`, `Date` and `performance` inside `src/sim`.
- A test checks that the same seed and commands produce an identical state hash.
- A test snapshots a Run mid-way, restores it, and checks it continues identically.
- A Playwright test runs the same replay in WebKit and compares its hash with Node, to check Safari and Chrome agree.

**Rendering:**
- Geometric shapes are drawn once at boot into a texture atlas.
- Sprites are reused from pools instead of created and destroyed.
- Positions are smoothed between 30 Hz ticks, so the display runs smoothly at 60 or 120 Hz.

**Platform layer:**
- **Storage:** IndexedDB via `idb-keyval`, calling `navigator.storage.persist()`. Save export/import uses a compressed text code.
- **Lifecycle:** going to the background (`visibilitychange`) pauses and autosaves.
- **Audio:** Web Audio, with `navigator.audioSession.type = 'playback'`.
- **Haptics:** Capacitor's Haptics plugin, Android only.
- **Screen:** canvas size comes from `visualViewport` (iOS has a standalone-app `vh` bug), plus `viewport-fit=cover` and `black-translucent`.
- **Offline:** `vite-plugin-pwa` precaches everything. A "new version, reload" toast appears when an update is deployed.

**Performance budget:** one game-logic tick of 4 ms or less with 300 creeps and 80 towers on an iPhone. A steady 60 fps on the S24 and on an iPhone.

## 3. Phases

Every phase ends the same way. All tests pass, the deterministic replay is green, and a full Run can be played, autosaved and resumed on **Mac, iPhone and the S24**.

### Phase 0: foundations
- Create the repo (Vite, TypeScript strict, ESLint with the sim ban list, vitest, Playwright) and add GitHub Actions to typecheck, test, build and deploy to Pages on every push to `main`.
- Build the installable web app shell: manifest, icons, service worker, black-translucent status bar, rotate screen, an empty Pixi board with pan and zoom.
- Set up the Android pipeline: install JDK 21 and the Android command-line tools via Homebrew, set up Capacitor 8 with landscape locked and `minSdk 36`, write a local signing keystore, and add `pnpm apk` to build and `adb install` it.
- **Exit:** the Tavern TD icon opens the app offline on all three devices, and a tap on the board registers.

### Phase 1: engine core + Gem
1. **Game logic core:** tick loop, RNG, state, commands, events, snapshot; grid, flow fields, checkpoints, the Block check; ground and air creeps; towers with targeting and projectiles; lives; Waves.
2. **Rendering and input:** board, creeps, towers, projectiles, hit effects; tap-preview-confirm and mouse with hotkeys; HUD; speed and pause; live path line; wave preview.
3. **Gem rules, ported from [nvs/gem](https://github.com/nvs/gem) (Gem TD+):**
   - Each build phase places a 5-gem Draft; you keep one and the rest become Rocks.
   - 8 gem types × 6 qualities.
   - Merges, Recipes with their tiers, and slates.
   - Chance levels 0–8 and swap.
   - Gem TD's Map and checkpoints.
   - 50 Waves plus the damage test, with air and summon Waves.
4. **Saving:** autosave, Continue, Records, Difficulty select, save export/import.
5. **Polish:** sound effects, Android haptics, settings, a one-screen "how to play".

### Phase 2: Element
Ported from [MNoya/Element-TD](https://github.com/MNoya/Element-TD); every rule and number is in [element-td-rules.md](research/element-td-rules.md).
- **Path:** the port's walled lane with 12 corners, rotated to a 56 × 40 landscape Map. Towers stand on plots beside it, so they never Block, and a leaked creep walks the route again.
- **Towers:** 2 × 2. Arrow and Cannon to start. Lumber summons an Elemental, and killing it raises that Element a level. How many different Elements you hold unlocks single, dual and triple towers, and each Element's level (1–3) unlocks that tower's levels. Pure Essence buys the Pure towers and the Periodic tower.
- **Combat:** the 6-Element damage cycle (200% / 50%, 90% into Composite) and the Traits the Waves use: fast, heal, mechanical, undead, regen, bulky, vengeance and time lapse.
- **Economy:** 2% interest every 15 s (a leak pauses it until the Wave is cleared), 50 lives, a 250-gold start, no end-of-Wave gold.
- **Modes:** All Pick and All Random Elements, each in Full (55 Waves, then endless boss Waves for score) or Express (30 Waves).
- **Our choices where the port is unclear:** fast creeps get a 1 s haste every 3 s, creeps follow the lane's centre line, Easy is HP × 0.75, and a "send now" button in every break pays no bonus.

### Phase 3: Original (the Campaign)
1. **Design doc first** ([original-design.md](original-design.md), done 2026-10-18): the world and its 3 regions, the creep roster (about 12 types: armoured, magic-resistant, fast, swarm, flying, regenerating, splitting, shielded, bosses), the 30 towers, Talent trees and a rough plan for each of the 12 Stages.
2. **Rules:**
   - **Towers:** 6 Tower Families (Arrow, Cannon, Frost, Arcane, Poison, Totem). Each goes through Tiers 1–3, then picks one of 2 Specialisations, about 30 towers in all. Not every family can hit air.
   - **Maps:** Build Spots only, with no free placement.
   - **Tower Level:** gain XP from kills, up to level 10, with stats every level and a Perk at levels 5 and 10. XP resets every Run.
   - **Stars:** 3 if you keep 18 or more of 20 lives, 2 if you keep 6 or more, 1 otherwise.
   - **Talents:** a Talent tree per family, bought with Stars and reset for free.
   - **Unlocks:** new Tower Families unlock as you finish Stages.
   - **Early call:** calling the next Wave early pays bonus gold.
   - **No hero.** A "hero tower" can be reconsidered later.
3. **Content:** 12 Stages in 3 regions of 4, each with 10–20 Waves (about 8–15 minutes), plus a Stage-select screen.
4. **Later:** challenge versions of Stages that award extra Stars.

### Phase 4: Maul
- **Maps:** open-field mazing reusing Gem's pathing, but without Rocks. One Map with 1–2 spawns and checkpoints.
- **Races:** 4 Races with original names: physical/siege, frost/slow, poison/damage over time, arcane/splash. Each has about 6 towers with branching upgrades.
- **Juggling is allowed;** Blocks are rejected.
- **Waves:** 40, with a boss every 10 and telegraphed air Waves.
- **Numbers:** our own, starting from the research baseline below.

### Phase 5: stretch
- Line Wars against an AI: send creeps to raise your income.
- Then versus over WebRTC, using lockstep on the command log.

## 4. Balance method

- **Gem and Element:** port the tables as-is. Bots replay full Runs to confirm the port behaves like the original, for example that creep HP and wave timing match the source.
- **Original and Maul:** start from the baseline in [td-design-and-balance.md §9](research/td-design-and-balance.md):

  | Setting | Baseline |
  |---|---|
  | Creep HP | `20 × 1.10^(w−1)` |
  | Bounty | a pool of `10 × (1 + floor(w/4))` per Wave |
  | End-of-Wave bonus | `20 + 4w` |
  | Interest | 4%, capped at that Wave's bonus |
  | Sell refund | 70%, or 100% within the same build phase |
  | Basic tower damage | about 0.10 DPS per gold |

- **Difficulty:** creep HP × 0.75 / 1 / 1.3 / 1.6. Element uses its Classic's own Hard and Insane values.
- **Balance bots:** a headless `tools/balance` runner (`pnpm balance`) plays scripted strategies (greedy DPS, maze-heavy, single-family) across seeds and Difficulties, and reports Wave reached and win rate. Targets: a competent bot wins Easy ~95%, Normal ~60% and Insane under 10%. CI runs a small sample on every push.

## 5. Risks

| Risk | Mitigation |
|---|---|
| iPhone Safari quirks (viewport bug, muted audio, no orientation lock) | Hit them in Phase 0 on the real phone, not later |
| Pathing slows down with many creeps | Flow fields rebuilt only on placement, pooled entities, the performance budget test |
| Determinism quietly breaks | ADR-0002, the lint ban list, the replay hash test and the WebKit-vs-Node test |
| Classic sources are incomplete (JASS and Lua, some values missing) | Mark filled-in values `assumed` in the content tables; bots sanity-check them |
| Licences of the ported repos | Check nvs/gem and MNoya/Element-TD before porting. Port only rules and numbers; write our own text and draw our own shapes |
| Android sideloading verification (rolling out worldwide in 2027) | `adb install` is exempt; a free Limited Distribution account is the fallback |

## 6. Things only you can do

- **S24:** turn on Developer options and USB debugging, then connect it by cable when installing the APK.
- **iPhone:** open the Pages URL in Safari, then Share → Add to Home Screen.
- **GitHub:** approve creating the public `tavern-td` repo and turning on Pages. I'll ask before each step.
- **Play-test** at the end of each phase and tell me what feels off.

## 7. Parked for later

- Versus: a TURN relay, a handicap, and keeping a Versus Run on disk.
- Challenge Stages, music and more Races.
- A Remix mode (Gem's Draft plus Element's picks).
