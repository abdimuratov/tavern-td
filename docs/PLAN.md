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
- Done on 2026-10-19: Challenges ([original-design.md §16](original-design.md#16-challenges-2026-10-19)). Each Stage has one: the Stage again under a named rule of one or two modifiers, themed to what the Stage brings. It opens once its Stage is won and always plays Normal, with your Talents and the Campaign's unlocks. Its first win pays one Star, so the Stages' 36 and the Challenges' 12 fill all six Talent trees. It keeps its own Record (won, fastest win) and never touches the Stage's.
  - Rules: a Challenge is a Run setting, and only a Challenge's Run names it in its state. The modifiers are the Build Spots kept, the families allowed, lives, starting gold, creep HP, no early-call gold, Break length, a Tier 2 cap and no Specialisations. Every Stage's Run, replay hash and bot result is unchanged, and older saves, save codes and stored Campaigns load as before.
  - Tuned with `pnpm balance --challenges`, using the least a player holds when each Challenge opens. The competent bot wins every Challenge 20–60% over seeds 1–5 and 25–40% over 20 seeds (33% on average), against 50–80% for the Stages on Normal.
  - War map: a won Stage's pin carries a diamond, dark while its Challenge is open and gold once it is won, and the Campaign counts "n of 48". The Stage panel has a Challenge block under the Difficulties: its name, its rule, "1 Star · Normal" or its fastest win, and Play Challenge. Before the Stage is won, the block is dimmed with "Win this Stage to open it".
  - In a Run: the Challenge's name beside Threat, then its Star and its rule as chips. Send now says "no gold" in Short Supply. The end card says "Challenge won", shows the Star and whether it added to the Campaign, the total of 48 and the time. A loss names the Wave it fell on. Play again, Continue and save codes keep it a Challenge, and a Stage's first win lists its Challenge under Opened.
  - Records gain a Challenge column and "k of 12 Challenges won", and How to play has a paragraph on Challenges.
  - Tested: 29 tests for the rules, the Campaign and storage (each modifier, the once-only Star, old saves, codes and Campaigns, replays, two whole bot wins), and 4 for the screens' helpers. An e2e opens The Burnt Mill from the war map and wins it. It checks the Star, the 48, the pin's mark, Records, the Talent budget, Play again and Continue, that the Challenge is shut before its Stage is won, and that the Stage panel fits a phone on its side, won or not. It passes in Chrome and on the iPhone project; the other two browsers are left to CI.
- My calls on Challenges, open to change: 1 Star each, paid once; Normal only; your Talents and current unlocks apply; any lives left wins; the bots judge each Challenge at the least you can hold when it opens; Fort Harrow keeps "+15% HP" because the bot never kills the Gravelord; the HUD marks a Challenge with the map's diamond, not the word; on a phone the Stage panel puts the Difficulties in one row, keeps the Region intro until the Stage is won (its locked Challenge shrinks to two short lines), and gives that room to the Challenge's rule and Play Challenge once it is won.
- Watch in play-testing: the bots go from ~60% on Normal to ~0% on Hard, so Hard may be too steep a step. Waves reach 30–70 creeps by Region 2.
- Watch in play-testing, Challenges: whether The Gravelord's Host, a plain +15% HP, feels like a Challenge or should target the boss; whether the tightest, Three Hordes' 18 s Breaks and Short Supply, feel fair to a person; and whether 48 Stars filling every tree takes the choice out of Talents too early.

Free placement (2026-10-19), at your request: a 2 × 2 tower goes on any Open ground beside the road, not only on a Build Spot ([original-design.md §17](original-design.md#17-free-placement-2026-10-19)).
- Done: the design. Every cell is road, Scenery or Open ground. Each Stage gets one or two pieces of Scenery (the mill and its pond, the Greyriver, the Rift and so on), none over an old Build Spot, so older saves keep their towers. `original.build` takes a cell instead of a Spot. The Burnt Mill and Glass Slope trade their kept Spots for Burnt ground and a Tower cap of 4 and 8. No interest still holds.
- Done: the rules, saves, bots and tests. `original.build` takes a top-left cell, and a refusal names the Map's edge, the road, the Scenery, another tower or the Tower cap. An older save or save code made on Build Spots loads onto its Stage's or Challenge's current Map with every tower where it stood; one that doesn't fit is refused. The other Game Modes' replays hash as before. The bots lay out their own places by the road each 2 × 2 sees, and a test guards the old Spots under Scenery and Burnt ground. Until the UI step, the board draws Open ground and Scenery plainly, and a tap opens the ring on the 2 × 2 it snaps to.
- Free placement, untuned: over seeds 1–5 the competent bot wins Easy 100%, Normal 73% (20% on Stages 6 and 8, 100% on six Stages), Hard 10% and Insane 0%. One family alone wins some Stages from 5 on, and the Challenges run 0–100%.
- Next: the retune of all 12 Stages and Challenges; then the UI.
- Left: a play-test of the whole Campaign on the Mac, the iPhone and the S24.

Phase 4 started on 2026-10-18, alongside Phase 3's last steps and without waiting for any play-test.

Phase 4 progress (2026-10-18):
- Done: the research, [maul-rules.md](research/maul-rules.md), read from Wintermaul X14's own map files plus later versions' listings. X14 has 30 Waves with air at 5, 14, 23 and 27. Waves never overlap, and the last boss leaking loses the game. It has 20 lives, kill bounty, no interest, 75% sells, no upgrades and no Block check. Juggling is allowed. The map has no licence, so we port rules only.
- Done: the design doc, [maul-design.md](maul-design.md). Four Races (Ironclad, Rimeborn, Mirefolk, Runecasters), each with a Wall and two lines that fork at Tier 3: 36 towers. One Map, the Crossing: two gates whose approaches meet at a Ford, then a shared lower field past two Posts to the exit. 40 Waves with six air Waves at uneven gaps and a boss every 10th. Breaks start after a clear, a second Race joins after Wave 15, and Blocks are refused while Juggling is allowed.
- My calls, open to change: one shared field rather than two separate lanes; interest kept although Wintermaul had none; nothing hits only air.
- Done: Maul's deterministic rules ([maul-design.md §12](maul-design.md#12-assumed-and-tuned) lists what they assume and how they were tuned):
  - Engine: a mazing Map can have several spawns, each Wave group names its gate, and the Block check keeps every gate connected. A Checkpoint can stand in several places, and flyers head for the nearest.
  - Building anywhere on open ground, mid-Wave too. Walls with a weak attack; Tier upgrades with a fork at Tier 3, and a second Race's towers after Wave 15. Sells return 75%, or everything spent during the current Break. Juggles are detected and counted.
  - Combat on the core's attacks: an attack-type table with each type's favourite armor, slows that share one key, venom that ticks per tower, spores and Blight armor, chain lightning, auras, unslowable Hollows, Troll regen, and bosses that slow to half speed at most.
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
  - Income is 10 plus what your Sends added, paid every 10 s, and the Run starts with 150 gold. Each Side has 30 lives, and a Leak steals lives once. Sudden Death from 11:00 drains a life from both Sides every Income tick and doubles every Leak's steal, so every Run ends by 15:50.
  - The Rival's AI runs inside the sim, acts only through the same commands you use and draws only on a seeded RNG stream in the state. A replay of the seed and your commands reproduces it, and versus can later hand its Side to a person. Difficulty sets the Rival's income (×0.85 / 1 / 1.2 / 1.5 after tuning) and how well it plays.
- My calls, open to change: a Leak steals once rather than looping; no neutral Waves; Difficulty changes the Rival, not the creeps; flyers add half the income ratio; Sends are one tap, with no confirm. The AI's commands are not stored in the log, because the replay regenerates them.
- Done: Maul now calls the Raider, Frost Wolf and Wraith the Brawler, Sleet Hound and Hollow, as Line Wars does, and Line Wars takes the names from Maul's creep table. The ids stay `raider`, `frost_wolf` and `wraith`, so saves load and replay hashes are unchanged.
- Done: Line Wars' deterministic rules ([line-wars-design.md §16](line-wars-design.md#16-assumed-and-tuned) lists what they assume and how they were tuned):
  - Two Sides in one sim on the Twin Fields: each Side's gold, income, lives and Stock in the mode's state, every `lw.*` command naming its Side through one handler, building in your own Field only with Blocks refused and Juggling counted per Side. Maul's tree queries moved into a helper both modes share, and Maul's replay hashes are unchanged.
  - The 10 Sends with unlocks, Stock, restock and the cap of 40; the income tick and the Rival's factor; bounty to the defender; Leaks that steal once; Sudden Death's freeze, drain, double steals and tougher Sends, ending every Run by 15:50; score and the Record's "best steal".
  - The Rival's AI inside the sim: its blueprint maze, Danger, the air guard, the defense floor, greed and banked salvos, on five skill profiles. It acts only through the handler, its commands are never logged, and `['human', 'human']` runs none.
- Tested: 45 Line Wars tests. The replay hash, snapshot-restore (the AI's memory included) and AI-regeneration tests pass, and Chromium matches Node on a fixed Line Wars replay. A tick takes about 7 µs, a think tick about 24 µs.
- Tuned with `pnpm balance linewars` on 5 seeds a row, checked on a second set of seeds: the competent bot wins Easy 5/5 and 5/5, Normal 2/5 and 3/5, Hard 1/5 and 0/5, and Insane 0/5 and 0/5; over 20 seeds it wins Normal 60% and Hard 25%. Normal's median Run is 14:10 and 15:20, Easy's 13:10 and 11:55, and no competent Run reaches 15:50. Turtle and Rusher lose Normal every time, Flyer wins it 1 Run in 10, and the seat check is 11/20. Send prices doubled, HP climbs faster than price, and the AI's salvos got a bank of their own. Sudden Death moved from 15:00 to 11:00 and its Leaks steal double, Normal saves for salvos only in Sudden Death, and Hard's factor is ×1.2.
- Not met: on one of the two sets of seeds each, Normal (2/5) and Hard (0/5) are a Run outside their aims; over 20 seeds both are on them. The AI's worst think tick was about 0.6–0.9 ms in Node; it is now 0.23–0.34 ms (about 1 ms on a phone), and 0.8 ms for the first think after a save loads (see Performance below).
- Done: Line Wars is playable from the main menu.
  - New Run asks for your Race (with each Race's role), the Rival's (Random first) and the Difficulty, each with the Rival's income factor and a line on how it plays.
  - The board: both Fields at fit zoom with yours on the right, your live route and the Rival's fainter, faint air fans, a band along each spawn strip and an exit box per Field. Each Side's Race hangs on a banner over the Divide, and every Send throws a small token across it, drawn by the board only. Towers and creeps wear Maul's looks. The HUD is 288 px wide in Line Wars, which costs the board nothing, since it is height-bound on a phone and on a 16:9 Mac.
  - HUD: gold and your Income with a ring counting down the Income tick ("+42 in 6 s"); pause and speed; the lives as one tug-of-war bar; the Rival's Race and Income with its factor; the Sudden Death clock, red from 11:00. The shared Wave counter, lives and Send Wave button are hidden.
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
- Done: the net layer for Versus, in `src/net/` ([versus-design.md §11](versus-design.md#11-filled-in-by-the-build) lists what it fills in):
  - Codes: Join and Answer codes from a browser's description and back, a rebuilt data-channel description for `setRemoteDescription`, links with `#join=`, and plain errors for a damaged code, another version or the wrong kind. One mDNS host and one server-reflexive candidate make a 144-character code, and two of each with IPv6 make 194.
  - The messages with their checks and the 64 KiB cap, snapshots deflated in 16 KiB parts, and the `TTDR1.` desync report.
  - The lockstep, as the controller's new tick source: Turns, Batches sealed Input Delay Turns ahead, the own-Side filter, pauses that stop both on one tick, Ready to resume, the app in the background, a hash check every second, a resync from the Host's state and an end on the second Desync, resends after a reconnect, and a rejoin from the Host's state. The controller gains `ticks` and `adopt`, and single-player plays as before.
  - The session: Hello with the version check, the lobby with Random drawn by the picker, pings that set the Input Delay, Start, Started and Go, Concede, claiming the win after 2 min, Rematch, reconnects and rejoins. `rtc.ts` wraps `RTCPeerConnection` with one negotiated DataChannel and gathering that stops 1 s after the first server-reflexive candidate.
  - `vite.config.ts` defines `__SIM_HASH__` and `__BUILD__`. `lwRecord` takes a Side, and the scripted bots play either Side. Every existing replay hash and bot result is unchanged.
- Tested: 32 tests in `tests/net/` and one in `tests/sim/linewars/`, about 2 s in all. Over a fake transport on a virtual clock, two controllers with a bot each play a whole Run at 40 ± 30 ms each way: 1,059 hash checks agree, both end alike, and either replay reaches the final hash. Also 300 ms of ping at D = 3 with no waits, a pause from each Side, the Guest away for 20 s, a dropped connection and its resends, a rejoin from nothing, a Desync repaired and a second ending both, and a peer sending the other Side's commands. The codes round-trip over hand-written Chrome, Safari, Android WebView and Firefox descriptions.
- Done: the Viewer Side, the mirrored board and the Versus Records board ([versus-design.md §11](versus-design.md#11-filled-in-by-the-build) lists what they fill in):
  - The play screen takes a Viewer Side, 0 unless a Versus Guest's is 1. Line Wars builds its commands for it and reads its gold, Income, lives, Sends, "In your Field", tower panel, routes, banners, sounds, toasts, hint, end card and Record from it. Side 1 winning is that device's Victory, though the sim calls it lost.
  - Viewer Side 1 draws the Map flipped left to right, so that device's Field is on the right beside the HUD. Taps, pans, pinches and zooms flip with it, and the banners' and labels' text is turned back so it reads. The sim and its world points don't change.
  - A Versus Run has no autosave and no save code, plays 1× with no speed buttons or 1–3 keys, and drops the Rival's ×factor. Its Record goes to a Versus row under Line Wars' table in Records; a conceded or claimed result records through one call, and a Desync records nothing.
  - `onForeground` joins `onBackground` in the lifecycle module. `window.tavernMirror()` plays Line Wars against the AI from Side 1, mirrored, with no network.
  - Tested: unit tests for the camera both ways, Side 1's commands, gold, status, end text and Record, the Versus Records and the foreground hook; an e2e test of the mirror in desktop Chrome. Single-player plays as before.
- Done: Versus is playable from the main menu ([versus-design.md §11](versus-design.md#11-filled-in-by-the-build) lists what it fills in):
  - Line Wars' card has Versus with Host and Join. A `#join=` link opens Join with the code filled in and drops it from the address, at launch or while the app is up. Join also takes a pasted code or a whole link, and on an iPhone (or in the Android app) it says to copy the link and paste it rather than open it.
  - The Host's screen shows the Join code as a link with Share, Copy and a QR (`uqr` 0.1.3, loaded only there), the code's age, a fresh code after 2 minutes, and a box for the Answer code. The Guest's shows its Answer code with Share and Copy, "Send this back to the Host." and "Connecting…". The APK shares through `@capacitor/share` 8.0.3, the web app through `navigator.share` where it exists. After 20 s without a connection the Host gets §3's "Couldn't reach the Rival" with New code and Menu. The Guest can't see when the Host pastes, so it shows those words below its code and keeps it up, with Paste a new code. The version message, a damaged code and a code of the wrong kind each say what's wrong.
  - The Lobby: each picks a Race (Random first) and sees the other's pick, the ping, both Ready states and "Slow connection: expect waits". The Host's app starts once both are Ready, and a 3-2-1 leads to Go.
  - In a Run: the lockstep is the tick source and the device's Side the Viewer Side. A tap clicks and buzzes as it's sent, a pending build shows as pulsing brackets on its footprint, and a pending Send shows a "+1" on its button until its tick lands. The HUD has a connection line: the ping, "Waiting for the Rival…" from 1 s, "Connection unstable…", "Reconnecting…". Going to the background tells the Rival, and coming back says so.
  - The pause sheet says who paused (or that an app went to the background, or the connection came back) and shows a Ready for each player, then "Resuming in 3…". The Connection lost sheet offers Reconnect, which is a fresh pair of codes on the same session, plus Concede, and Claim the win after 2 minutes for a player who stayed. A first Desync shows "Out of sync: fixing…". A second ends both Runs with no result, Copy desync report and Menu. The in-Run menu doesn't pause in Versus: it has Pause, Concede (with a confirm), How to play, Settings, and Copy desync report after a Desync.
  - The end card reads Victory, Defeat or Draw from the viewer's Side, without "on Normal". A Concede or claimed win comes from the session and records through `recordVersus`. Rematch replaces Play again while connected, and Menu leaves. A restarted Guest app rejoins from the Host's rejoin link ("Rejoin the Host's Run").
  - The "new version, reload" toast waits while a Versus Run is on, and How to play has a Versus paragraph. `window.tavern` adds `viewer` and, in Versus, `versus.status()` (the session, the lockstep and its last agreed hash).
- Tested: 21 unit tests in `tests/ui-versus.test.ts` cover link parsing, the link's address from the web app and the APK, device names, code ages and timeouts, the HUD line, board banners, the pause and lost sheets, the end text and pending marks. `e2e/versus.spec.ts` runs two browser contexts over loopback WebRTC on desktop Chrome. The Host's link opens Join on the Guest's page, the Answer goes back, and both pick, Ready and Go. Both build and send through the HUD; the Guest's tower is drawn right of the middle and its gold is its own. A Guest pause stops both on the same tick with the same agreed hash, Ready resumes both, and the Guest concedes; the Host's end card and Versus Record show the win and the Guest's the loss. A second test refuses a damaged code, an Answer code and another version's code in Join. The Line Wars e2e passes as before, and the debug APK builds with Gradle. The WebKit projects first check that two pages can open a DataChannel over loopback, and skip with the reason if Playwright's WebKit can't. On CI the Chromium projects (desktop Chrome and the Android emulation) pass it and both WebKit projects skip it. On the live Pages build, two tabs with the public STUN servers connected by link and Answer code, started a Run with the Guest's board mirrored, and agreed on 15 hash checks.
- Left: a two-device play-test of Versus. Untested: real phones; Safari taking a rebuilt code (WebKit parses descriptions with the same libwebrtc as Chrome, so it should); carrier and symmetric NAT; Wi-Fi that isolates clients; the S24's WebView (WebRTC, mDNS host candidates, the share sheet); the iPhone's share sheet and Safari suspending the page in the background; Reconnect, rejoin, Claim the win and a real Desync between two devices (each covered only by the net layer's Node tests).
- Watch in play-testing:
  - Whether the S24's APK and the iPhone connect on one Wi-Fi. Then the iPhone on mobile data against the Mac, and both phones on mobile data, where §3's message may be the answer.
  - Whether a code survives the trip through a messenger and back: the Host's page may be in the background while the Guest answers, and the Host's 20 s starts at its paste.
  - How 200–500 ms of Input Delay feels with the click and the faint marks, and whether "Waiting for the Rival…" shows up on a good connection.
  - Each phone sent to the background mid-Run (both stop, then Ready), and a Reconnect after Wi-Fi drops.
  - The Lobby and Host screen on a phone in landscape: the QR is 132 px there, and the Host's page scrolls.
- Next: the two-device play-test of Versus, then Phase 5's exit bar.

Performance (2026-10-19), on the dev Mac (M5 Pro). A phone core is taken as 3× slower, so a tick must stay under about 1.3 ms here to meet §2's 4 ms. Node ticks are whole bot Runs replayed, each tick the least of three plays; "worst" leaves out GC pauses. Frames are Chromium at the iphone and android projects' landscape sizes with the CPU slowed 4×, on the Mac's GPU, during each mode's busiest moment of a bot's Run (`TAVERN_PERF=1`, see `e2e/perf.spec.ts`).

| Game Mode | Node tick, mean / worst, before → after | Frames at ×4 CPU: interval mean / p95, main thread mean / p95 |
|---|---|---|
| Gem | 7.0 µs / 3.9 ms → 5.7 µs / 1.0 ms | 16.7 / 16.8 ms, 0.5–1.0 / 1.2–1.7 ms |
| Element | 2.3 / 50 µs → 2.2 / 43 µs; 300 creeps and 80 towers: 0.20 / 1.7 ms → 0.12 / 0.73 ms | 16.7 / 16.8 ms, 0.8–1.2 / 1.7–2.3 ms |
| Original | 6.6 / 63 µs → 6.4 / 38 µs (Stage 6) | 16.7 / 16.8 ms, 0.8–1.6 / 1.7–3.8 ms |
| Maul | 3.5 µs / 0.48 ms → 3.4 µs / 0.16 ms | 16.7 / 16.8 ms, 0.5–1.4 / 1.2–2.4 ms |
| Line Wars, Insane | 7.7 µs / 0.53 ms → 6.8 µs / 0.34 ms (AI thinks: 30 → 21 µs mean) | 16.7 / 16.8 ms, 1.8–2.4 / 5.0–6.4 ms |
| Versus | the state hash once a second: 0.1–0.2 ms; a Turn's messages: about 2 µs | not measured apart: Line Wars' board and HUD without an AI |

- What was slow: the flow fields (all of Gem's 8 regions after every Draft gem, Ghost preview and route line: 3.4 → 0.9 ms), Element's area queries reading every creep's statuses before its distance, the AI rebuilding its Field maps from scratch after every action, and the HUD's number formatting (Line Wars' costliest function in a frame). Every replay hash and bot result is unchanged.
- No frame missed 60 fps at ×4 in any mode, window, zoom or speed. Line Wars' HUD frames (4 a second) are the heaviest at ×4: 5–6 ms of main thread, 13–17 ms at worst.
- Guards in `pnpm test`: a perf test per Game Mode with budgets several times the Mac's numbers.

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
   - **Maps:** free placement on open ground beside the fixed road (changed from Build Spots only on 2026-10-19, at your request; [original-design.md §17](original-design.md#17-free-placement-2026-10-19)).
   - **Tower Level:** gain XP from kills, up to level 10, with stats every level and a Perk at levels 5 and 10. XP resets every Run.
   - **Stars:** 3 if you keep 18 or more of 20 lives, 2 if you keep 6 or more, 1 otherwise.
   - **Talents:** a Talent tree per family, bought with Stars and reset for free.
   - **Unlocks:** new Tower Families unlock as you finish Stages.
   - **Early call:** calling the next Wave early pays bonus gold.
   - **No hero.** A "hero tower" can be reconsidered later.
3. **Content:** 12 Stages in 3 regions of 4, each with 10–20 Waves (about 8–15 minutes), plus a Stage-select screen.
4. **Challenges** ([original-design.md §16](original-design.md#16-challenges-2026-10-19), done 2026-10-19): a challenge version of each Stage that awards an extra Star.

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
- Music and more Races.
- A Remix mode (Gem's Draft plus Element's picks).
