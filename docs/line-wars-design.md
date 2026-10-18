# Line Wars: design

Line Wars is the Game Mode that recreates Line Tower Wars as a duel. You maze your own Field, you buy creeps that walk your Rival's, and every creep you send raises your income. The Rival is an AI that runs inside the deterministic sim, so versus over WebRTC can later hand its Side to a person. Line Wars keeps Line Tower Wars' rules ([line-wars-rules.md](research/line-wars-rules.md)) and uses our own names, numbers, text and shapes. Its towers are Maul's ([maul-design.md](maul-design.md)). Words follow [CONTEXT.md](../CONTEXT.md), and §17 lists the new ones.

There are no Waves, so PLAN §4's Wave baseline doesn't apply. The Send table (§8) is the baseline instead, priced against Maul's tuned towers. A number marked **[tune]** is a first guess for the bots (§13). Anything the sources leave open is marked *assumed* (§16). How two Sides and an AI fit the engine is recorded in [ADR-0003](adr/0003-two-sides-and-an-ai-in-one-sim.md). §18 lists the calls you may want different.

## 1. At a glance

| Topic | Design |
|---|---|
| Shape | One duel against the Rival on one Map. A Run lasts 10–20 min and always ends by 19:50 |
| Map | The Twin Fields: two 16 × 28 Fields side by side, 12 columns of rock apart. Sends enter along the top and leak at the bottom. No Checkpoints (§3) |
| Sides | You (the east Field, beside the HUD) and the Rival (west). Each has its own Race, gold, income, lives and Stock |
| Towers | Maul's four Races and 36 towers, unchanged. One Race per Side for the whole Run (§6) |
| Mazing | Blocks refused; Juggling allowed (§5) |
| Sends | 10, from 12 to 400 gold, unlocking from 0:20 to 10:00. Each raises your income at once and for good. Stock refills; 40 of yours alive at most (§8) |
| Income | 10 plus what your Sends added, paid every 10 s. 150 gold to start. No interest (§9) |
| Lives | 30 each. A Leak moves lives from the defender to the sender, and the creep is removed (§10) |
| Sudden Death | From 15:00 income freezes, every income tick drains a life from both Sides, and new Sends get tougher |
| Waves | None. The Rival is the pressure |
| Difficulty | The Rival's income ×0.85 / 1 / 1.2 / 1.5 and how well its AI plays. Creeps are the same on every Difficulty (§12) |
| Left out | Rings of up to 12, tower-attacking Sends, tech and Research Points, negative-income finishers, leaver rules, catch-up gold. Legion TD entirely |

## 2. What is Line Tower Wars', and what is ours

**Line Tower Wars' rules (kept, from Reforged 2.7c unless noted):**
1. Each player mazes their own long field. Sends enter along its top and leak along its bottom. Blocks are refused.
2. No Waves. Every creep is a Send that a player bought for the field they attack.
3. A Send raises its buyer's income at once and for good. Dearer Sends return less income per gold and hit harder.
4. Income is paid every 10 s, with a countdown on screen.
5. Each Send unlocks at a set time and has a Stock that refills one at a time, and a player's live Sends are capped. These are the brakes on compounding.
6. A Send killed in your field pays you its bounty, a bigger share of the price for cheap Sends.
7. A Leak moves a life from the defender to the sender, and bosses move more (4.1d).
8. Sudden Death: income freezes, lives drain every income tick, and creeps get tougher (7.0a–10.0a).
9. Sells return 75% at any time.
10. Computer players differ by an income bonus that is announced, not hidden (8.7f).

**Ours:**
- 1v1 against an AI Rival, not a ring of up to 12. The rules say "the other Side" wherever a ring would say "your target".
- A Leak steals once and the creep is removed, as in the Dota port's 1v1. In 2.7c's loop one creep can steal on every pass (§10).
- 10 Sends made from Maul's creeps, at 12 to 400 gold instead of 5 to 2,250,000. Income stays in the low hundreds.
- Maul's four Races and 36 towers instead of tech lines and Research Points.
- No tower-attacking Sends and no negative-income finishers. Flyers punish long mazes, and Sudden Death ends Runs.
- Flyers return half the income ratio of their neighbours. Wintermaul Reforged applied the same brake harder, with no income at all.
- Juggling is allowed, as in Maul.
- Difficulty is the Rival's income bonus plus its skill.
- 30 lives, and Sudden Death from 15:00, so every Run ends by 19:50.
- Our numbers, names, text and shapes. No name from research §7 is used. Three of Maul's creeps get new names here for that reason (§8).

## 3. The Map: the Twin Fields

44 × 32 cells of 64 units, landscape. `.` is open ground, `,` walkable but never buildable, `#` rock.

```
,,,,,,,,,,,,,,,,############,,,,,,,,,,,,,,,,    0  spawn row: every cell is a spawn
,,,,,,,,,,,,,,,,############,,,,,,,,,,,,,,,,    1  spawn strip
................############................    2  Rival's Field  | the Divide |  Your Field
................############................    3   (west, side 1)  12 × rock   (east, side 0)
................############................    4
................############................    5
................############................    6
................############................    7
................############................    8
................############................    9
................############................   10
................############................   11
................############................   12
................############................   13
................############................   14
................############................   15  each Field: 16 × 28 open ground
................############................   16
................############................   17
................############................   18
................############................   19
................############................   20
................############................   21
................############................   22
................############................   23
................############................   24
................############................   25
................############................   26
................############................   27
................############................   28
................############................   29
,,,,,,,,,,,,,,,,############,,,,,,,,,,,,,,,,   30  exit strip
,,,,,,,,,,,,,,,,############,,,,,,,,,,,,,,,,   31  the exit row: reaching it is a Leak
```

- **Fields.** Columns 0–15 are the Rival's Field, and columns 28–43 are yours. Each is 16 cells wide (8 towers), as Reforged's are. It is 28 rows long (14 towers) where Reforged's is 31 towers, so that it fits a phone's height.
- **Spawns.** Every cell of row 0 is a spawn: 16 per Field and 32 on the Map, yours first (the Map's `spawns` list, with `spawn` its first). Each creep of a Send enters at a random cell of the defending Field's 16, drawn from the Run's RNG, as Reforged drops a Send at a random point of the strip. Row 1 is open too, so creeps can spread to wherever the maze begins.
- **The exit.** Row 31 of both Fields is the one exit region, in two pieces. Row 30 can't be built on either: it is a last open row under every maze, so a maze's final gap can sit anywhere along it.
- **No Checkpoints.** Reforged has none. A 16-wide Field mazes best as a serpentine from top to bottom, and a Checkpoint would only add a funnel and complicate the AI's maze.
- **The Divide.** The 12 columns of rock keep every tower out of reach of the other Field. The longest reach among Maul's towers is the Bombard's 800 units. The nearest a tower's centre can stand to a creep in the other Field is 864: 64 to its own Field's edge, 768 across, and 32 to the first cell's centre. A content test checks every range, splash, chain and aura against that. The core's targeting, splash and auras then need no idea of Sides.
- **Air.** Flyers fly straight from their spawn cell to the middle of their Field's exit row, the region's nearest part. Their lines fan in toward the bottom centre, and the board draws that fan faintly in both Fields.
- **On screen.** Both Fields show at fit zoom, yours on the right beside the HUD, so the build menu and your maze sit together under your right thumb. The Map is 44 columns to Maul's 48 and as tall, so at fit zoom a tower is about a tenth larger than Maul's (about 13 pt on a phone where Maul's is about 12). Zooming to your Field alone would gain only about 2%, because a phone's board is already nearly height-bound, so the default view shows both. The Divide carries each Side's Race banner, and a small token arcs across it for every Send. That arc is drawn by the board and never touches the sim.

## 4. Two Sides in one sim

The core `GameState` has one `gold`, one `lives`, and one list each of towers and creeps. Line Wars fits two Sides into it with no change to the sim core ([ADR-0003](adr/0003-two-sides-and-an-ai-in-one-sim.md)):

- **One Map, two disjoint Fields.** No walkable cell joins them. One flow field toward the one exit region serves both, because a creep can only reach its own Field's exit. One Block check serves both, because it requires every spawn to reach the exit and a build can only cut paths in its own Field.
- **Ownership is derived, not stored.** A tower's Side is the Field its cells are in: columns 28–43 are Side 0, columns 0–15 Side 1. A creep's Field is its `spawn` index (0–15 is Side 0's Field). Its sender is the other Side. No core entity gains a field.
- **Each Side's purse lives in `state.mode`.** Gold, income, lives and Stock are kept per Side. The core's `state.gold` is a copy of Side 0's gold, rewritten by Line Wars' purse helper on every change, which also emits `goldChanged`. Its only purpose is to keep the shared HUD and save summaries working, and nothing in Line Wars reads it. `state.lives` stays at 1, so the core's loss check never fires, and Line Wars ends the Run itself (§10).
- **No Waves.** `state.wave.total` is 0, and the phase stays `build` until the Run ends. The core's `startWave` is refused with "no Waves left", and its button is hidden.
- **Bounty and Leaks go through the hooks.** Every creep's core bounty is 0. `onKill` pays the Send's bounty to the Side whose Field the creep died in. `onLeak` returns 0 lives and `remove`, then moves the lives itself.

The mode's state, as the rules build will need it:

```ts
interface LwSide {
  driver: 'human' | 'ai';
  race: RaceId;
  gold: number;
  /** Per income tick, before the Rival's Difficulty factor. */
  income: number;
  lives: number;
  stock: { [send: string]: number };
  /** Tick of each Send's next +1 to Stock; -1 while it is locked or full. */
  restock: { [send: string]: number };
  /** Its creeps alive in the other Field, against the cap of 40. */
  live: number;
  sent: number; stolen: number; killed: number; bounty: number; turned: number; juggles: number;
}

interface LwState {
  sides: [LwSide, LwSide];
  /** Gold paid into each tower so far, every upgrade included, for its sale value. */
  towers: { [id: string]: number };
  result: 'playing' | 'side0' | 'side1' | 'draw';
  why: '' | 'lives' | 'drain' | 'income' | 'draw';
  endTick: number;
  score: number;
  /** The AI's memory for each AI-driven Side (§11), null for a human Side. */
  ai: [LwAi | null, LwAi | null];
}
```

**Commands.** Every command names its Side, and one handler applies them all, whether they come from the log or from the AI.

| Command | Fields | Refused when |
|---|---|---|
| `lw.build` | side, spec, col, row | the spot is outside that Side's Field; the spec isn't its Race's Wall or a Tier 1; not enough gold; any of Maul's placement reasons, a Block included |
| `lw.upgrade` | side, tower, to | the tower isn't that Side's; `to` isn't its next step; not enough gold |
| `lw.sell` | side, tower | the tower isn't that Side's |
| `lw.send` | side, send | locked; no Stock; not enough gold; 40 of that Side's creeps already alive |
| (every one) | | `side` isn't 0 or 1; it came from the log but the AI drives that Side ("the Rival's AI plays that Side"); the Run is over |

**Events.** Besides the core's (`placed`, `changed`, `removed`, `spawn`, `kill`, `rejected`, and `goldChanged` for Side 0), Line Wars emits mode events: `lw.income` (each Side's pay), `lw.sent` (Side, Send, creep ids, income gained), `lw.unlock`, `lw.leak` (creep, from, to, lives moved), `lw.sudden`, `lw.drain`, `lw.juggle`, `lw.ai` (the Side and the command the AI just applied), `lw.checkpoint` (autosave) and `lw.end` (result and why).

**The tick.** The core's `step` runs:
1. The logged commands of this tick. When both Sides are human (versus), Side 0's come before Side 1's, and the lockstep layer must keep that order.
2. Line Wars' `onTick`, in this order:
   1. Unlocks and restocks that are due.
   2. On an income tick (every 300 ticks, from tick 300): pay both Sides. In Sudden Death, drain a life from each, then settle the end if a Side is out.
   3. Troll regeneration, as Maul does it.
   4. The AI, for each AI-driven Side whose think tick this is, Side 0 before Side 1 (§11.1).
   5. Every sixth income tick, `lw.checkpoint`.
3. The core's auras, creeps (Leaks call `onLeak`), towers and projectiles (kills call `onKill`), and the end of the tick.

A Send, bought by a person in step 1 or by the AI in step 2.4, spawns before creeps move, so both kinds behave the same.

**Code.** Line Wars reads `MAUL_TOWERS`, `MAUL_DAMAGE_TABLE` and Maul's effect kinds as they are. Maul's `build.ts` charges `state.gold` directly. Its tree queries (`nextOf`, sale value, juggle detection) should move to a helper shared with Line Wars that takes a Side's Race and purse. Line Wars' own build, upgrade and sell then charge the Side that acts.

## 5. Building, Blocks and Juggling

- **In your own Field only**, any time. A tower covers 2 × 2 cells and snaps to the 64-unit grid, as in Maul.
- **Refused:** off the Map; on `,` or `#`; in the Rival's Field ("that's the Rival's Field"); over another tower; on a ground creep; and any **Block**. The Ghost turns red and says why.
- **Juggling is allowed**, and detected and counted per Side as in Maul. Each juggle costs the quarter lost on a sale. Holding the Rival's creeps by juggling gains nothing in the end. Stalled creeps still count against the Rival's cap, but you earn nothing meanwhile, and Sudden Death's tie-break goes to the higher income. The Rival's AI never juggles and never sells.
- **Sells:** 75% of everything the tower cost, rounded down. Until 0:20, before any Send can unlock, a sale returns everything, so a mis-tap in the opening is free. Maul's "full refund during the Break" has no equivalent, because Line Wars has no Break.
- **Upgrades** happen in place and never change the maze.

## 6. Races and towers

- **Maul's four Races and 36 towers, unchanged:** prices, stats, forks, effects and roles as in [maul-design.md §5](maul-design.md#5-races-and-towers). The build menu offers the Wall and the Race's two Tier 1 towers, and a Wall upgrades into either line.
- **One Race per Side for the whole Run.** Maul's second Race joins after Wave 15, about 16 minutes in. A Line Wars Run is nearly over by then.
- **Picking.** New Run asks for your Race and the Rival's. The Rival's is *Random* by default, drawn at setup from the Run's RNG, and New Run can name one instead. Mirror matches are allowed. The HUD shows the Rival's Race from the first tick, as Reforged's lobby shows its bots.
- **Air.** Every Race can hit air: only the Mortar and Spore Pod lines can't. Each Race has the same weak spots as in Maul, and Sends are where they now matter. Golems punish Pierce and Magic, and Hollows punish slows.

## 7. Damage and armor

Maul's attack-type table ([maul-design.md §6](maul-design.md#6-damage-and-armor)) as it is. Numeric armor works as in WC3, and poison skips the table and armor.

## 8. Sends

A Send is one creep, or a pack of them, made from Maul's creeps. Its HP is set here rather than by a Wave curve. Three of Maul's names are on research §7's lists, so the Sends made from those creeps are renamed: the Raider becomes the **Brawler**, the Frost Wolf the **Sleet Hound**, and the Wraith the **Hollow** (§18). The shapes are Maul's.

| Key | Send | Creep (Maul) | Creeps | Price | Income | Ratio | HP each | Armor | Speed | Bounty each | Steals each | Unlock | Stock cap | Restock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Z | Snowlings | Snowling | 3 | 12 | +2 | 16.7% | 8 | Light 0 | 250 | 1 | 1 | 0:20 | 6 | 5 s |
| X | Brawler | Raider | 1 | 20 | +3 | 15% | 50 | Medium 0 | 230 | 3 | 1 | 0:40 | 6 | 6 s |
| C | Sleet Hound | Frost Wolf | 1 | 30 | +4 | 13.3% | 70 | Light 0 | 360 | 4 | 1 | 1:20 | 5 | 8 s |
| V | Troll | Troll | 1 | 45 | +6 | 13.3% | 130 | Medium 1 | 220 | 5 | 1 | 2:00 | 5 | 10 s |
| B | Hollow | Wraith | 1 | 60 | +7 | 11.7% | 190 | Medium 0 | 240 | 6 | 1 | 3:00 | 4 | 12 s |
| A | Brute | Brute | 1 | 80 | +9 | 11.3% | 300 | Heavy 2 | 200 | 8 | 1 | 4:00 | 4 | 15 s |
| D | Harpies | Harpy | 2 | 100 | +5 | 5% | 110 | Light 0 | 260 | 4 | 1 | 5:00 | 3 | 20 s |
| F | Ice Golem | Ice Golem | 1 | 130 | +13 | 10% | 550 | Fortified 4 | 170 | 10 | 1 | 6:00 | 3 | 20 s |
| G | Tusked Warlord | Tusked Warlord | 1 | 250 | +20 | 8% | 1,300 | Hero 3 | 170 | 15 | 2 | 8:00 | 2 | 45 s |
| H | War Mammoth | War Mammoth | 1 | 400 | +28 | 7% | 2,400 | Hero 5 | 150 | 20 | 3 | 10:00 | 1 | 60 s |

Every price, income, HP, bounty, Stock and restock is **[tune]**. Traits are Maul's: Trolls heal 2% of their max HP a second, Hollows can't be slowed, and bosses can't be slowed below half speed (a stun still holds them).

- **Greed against pressure.** The income ratio falls from 16.7% to 7% as Sends get dearer, so payback stretches from 60 s to 143 s. HP per gold of price rises from 2.0 to 6.0, so a dear Send packs more HP into one creep, which single-target towers struggle with. Cheap Sends grow your income; dear ones break mazes.
- **Unlock and Stock.** A Send unlocks at the same Run time for both Sides, with 1 in Stock. It then gains 1 every restock interval up to its cap. Restocking pauses while Stock is full and starts again from the moment one is bought.
- **The brakes.** Stock and restock cap how fast income can grow. With every Send unlocked and unlimited gold, a Side could add at most about 50 income a tick, and that would cost about 480 gold a tick. Until then, gold binds first. With 40–50% of income going to Sends, a competent Side should reach about 25 income by 3:00, 90 by 8:00 and 200–300 by 15:00 **[tune]**.
- **Flyers.** Harpies fly straight over the maze, in about 7.6 s from spawn to exit. Their brake: half the income ratio of their neighbours, a Stock of 3, a 20 s restock, and an unlock at 5:00, announced 30 s ahead (§15).
- **The cap.** At most 40 of a Side's creeps can be alive in the other Field. A Snowling pack counts 3. A Send that would pass the cap is refused before it is paid for. The cap stops a Side that has stopped defending from being buried under an endless pile. It also keeps the tick within budget: at most 80 creeps and about 140 towers. That is more towers than PLAN §2's budget of 80 but far fewer creeps than its 300, so the tower-by-creep targeting work is under half the budget's.
- **Bounty** goes to the defender for each creep it kills: 25% of the price for Snowlings, falling to 5% for the Mammoth, as Reforged's falls with price. The AI's income bonus never touches bounty.
- **In Sudden Death** a Send's HP is multiplied by 1 + 0.1 for each minute since 15:00, measured by tick when it is bought. Creeps already in a Field keep their HP.

## 9. Income, gold and pace

| | Number |
|---|---|
| Start | 150 gold, 10 income, 30 lives each **[tune]** |
| Income tick | Every 10 s, the first at 0:10. Each Side is paid its income: 10 plus the income of every Send it has bought |
| The Rival's pay | ⌊income × the Difficulty's factor⌋: ×0.85, ×1, ×1.2 or ×1.5 (§12). Your pay is never scaled |
| Bounty | Per creep killed, to the defender (§8) |
| Interest | None. Sends are the greed lever, as in Line Tower Wars |
| Sells | 75%; 100% until 0:20 |
| Live cap | 40 creeps per Side |
| Sudden Death | From 15:00 (§10) |

**Pace.** 0:00–0:20 is the opening: build, with nothing to send yet. From 0:20 a Send unlocks every 20–120 s until the Mammoth at 10:00. From about 6:00 the Rival starts saving for salvos (§11), so leaks start to decide the Run. Sudden Death at 15:00 ends every Run by 19:50. Expect 10–14 min against Easy and 15–20 against the rest. The bots check this (§13).

## 10. Leaks, lives, and how a Run ends

- **30 lives each [tune].** Reforged gives 50 in 1v1, but a phone Run needs to end sooner.
- **A Leak moves lives.** The defender loses the creep's steal value (1, 2 for the Warlord, 3 for the Mammoth), and the sender gains as many, never more than the defender had. Then the creep is removed. It does not loop. Under 2.7c's 1v1 loop, one creep the defender can't kill steals on every pass, so a single gap snowballs into a lost Run. The Dota port's single steal keeps a Leak a setback.
- **Lives only move until Sudden Death,** so before 15:00 the two Sides always hold 60 between them. The HUD draws them as one tug-of-war bar.
- **Sudden Death, from 15:00 [tune]:**
  - Income freezes. Sends bought from now on add no income.
  - Each income tick, after paying, takes 1 life from each Side.
  - New Sends get tougher (§8).
- **The end.** A Side is out when its lives reach 0, and the Run ends that same tick.
  - A Leak that empties a Side ends the Run at once, and later Leaks that tick change nothing.
  - If a drain empties both Sides at once, the higher frozen income wins (`why: 'income'`). Equal incomes are a draw.
  - Line Wars sets the phase to `won` when Side 0 wins and `lost` otherwise, a draw included, and records `result` and `why`.
- **Every Run ends by 19:50.** Until 15:00 the two piles sum to 60, so the smaller holds at most 30. Each drain takes 2 from the sum. After n drains the smaller pile holds at most 30 − n, so it is empty after the 30th drain at 19:50. No stall can outlast that, whether from turtling, juggling or both Sides refusing to send.

## 11. The Rival's AI

### 11.1 Where it runs, and why replays and versus keep working

- **It is sim code**, in `src/sim/modes/linewars/ai/`, under ADR-0002 and the lint ban list. It uses only `+ − × ÷`, `sqrt` and comparisons, and it reads no clock.
- **It runs inside `step`**, in `onTick` after the logged commands (§4). It thinks once every *think interval* (§12), at a fixed point per Side. Side 0's AI (tools only) thinks on ticks that are a multiple of its interval, and Side 1's half an interval later.
- **It acts only through the handler.** Each think yields commands, up to its actions-per-think (a salvo is several Sends but one action). Each command names its Side and goes through the same `applyLwCommand` that log commands use. Each applied command pushes the same core and mode events a person's would, then `lw.ai` with the command. Before issuing a command the AI asks the same queries the UI asks (spot errors, prices, Stock). A refused AI command still emits `rejected`, and a test fails on any.
- **Its commands are never logged.** A replay is the seed, the options and the human Sides' commands, and it reproduces every AI action exactly. The replay-hash, snapshot-restore and WebKit-against-Node tests therefore cover the AI with no extra plumbing.
- **Its memory is plain JSON in `state.mode.ai`.** Autosave, Continue and save codes resume it mid-thought. It may cache derived data, as flow fields are cached, only when keyed on the state, so a restored Run rebuilds identical caches.
- **It draws from its own RNG stream**, an `RngState` in its memory seeded from the Run's seed and its Side with integer ops. That is still a seeded RNG held in the state (ADR-0002). It keeps the AI's small variations from shifting combat rolls, so two versions of the AI compare cleanly on the same seed. Spawn cells and combat keep using `state.rng`.
- **`RunOptions` switches it.** `options.drivers` names who drives each Side, by default `['human', 'ai']`. Versus will pass `['human', 'human']`: no AI runs, and Side 1's commands arrive in the lockstep log. Tools pass `['ai', 'ai']` for bot against AI (§13). `options.skills` sets an AI Side's skill profile for tools, and Side 1 defaults to the Run's Difficulty.

| Option | Values | Default |
|---|---|---|
| `race` | `ironclad`, `rimeborn`, `mirefolk`, `runecasters` | `ironclad` |
| `rivalRace` | `random` or a Race | `random` |
| `drivers` | `[human or ai, human or ai]` | `['human', 'ai']` |
| `skills` | per AI Side: `easy`, `normal`, `hard`, `insane` or `competent` (tools only) | Side 1: the Difficulty |

### 11.2 What it may read

Its own Side in full. Of yours, only what the HUD shows of the Rival to you: your Field (towers, routes and creeps), your Race, your income and your lives. It never reads your gold or your Stock. In versus each person then sees exactly what the AI would have seen.

### 11.3 What it computes each think

- **Its route:** the ground route through its Field, traced from the spawn row's middle cell.
- **Its coverage:** for each open cell of its Field and each armor type, the damage per second its towers deal there. That is each covering tower's DPS × the table's multiplier, with poison at ×1, and with splash, multishot, chains, slows and auras scaled by a per-tower weight in `content/linewars/ai.ts` **[tune]**. Air coverage is the same, over the cells under the straight line from the spawn row's middle to the exit's middle, counting only towers that hit air.
- **Potential:** the damage a lone creep of a given armor and speed takes walking the rest of a route: the sum of the cells' coverage × each step's length ÷ its speed, then × its numeric armor's multiplier. A creep's **margin** is its potential ÷ its HP, divided by a crowd factor of 1 + 0.1 for every other creep of the same sender in that Field, at most 2 **[tune]**. Below 1, it will probably leak.
- **The same two maps of your Field,** for choosing Sends.
- **The mix:** the HP of your creeps that entered its Field in the last 120 s, split by armor type (uniform before any arrive), and the share of it that flew.
- **Upgrade value:** for each own tower and each next step, (the step's DPS against the mix − the tower's) × the route cells within the step's range ÷ the step's price. A tower that hits air adds its air cells × the air share, at least 0.15 once Harpies are unlocked. Tier 3 forks are valued the same way.

Cost: about 450 cells × 70 towers distance checks per Field per think, under 0.5 ms on a phone **[tune]**. Your Field's maps are cached until your towers change.

### 11.4 Its rules, in priority order

Each think, the AI takes up to its actions-per-think. Each action is the first rule below that fires, and the rules are checked again after every action. A salvo counts as one action.

1. **Opening** (until 0:20). Build the blueprint's first Wall and upgrade it at once to the Race's opening Tier 1, then build Walls in blueprint order. The opening Tier 1 is line A's, except for the Runecasters, who open with the Glyph because its splash meets the first Snowlings.
2. **Danger.** One of your creeps in its Field has a margin under 1.2, or (on Normal and above) it leaked in the last 20 s. Then it buys the best-value upgrade it can afford. If it can afford none, it holds its gold and sends nothing this think.
3. **Maze.** While the blueprint is unfinished and Walls have had less than the maze share of all the gold it has earned (35%, or 25% on Easy) **[tune]**, it builds the next blueprint Wall.
4. **Air guard.** From 4:30 (on Easy, only after a flyer leaks), it keeps at least 2 towers that hit air covering the air line's last third, 3 from 8:00 and 4 from 11:00. It does this by upgrading the Wall with the best air coverage.
5. **Defense floor.** Its towers are worth less than the larger of 40% of all gold earned and 150 + λ × the HP of your Sends that entered its Field in the last 60 s. Then it buys the best-value upgrade. λ is per Difficulty (§12) **[tune]**.
6. **Send**, while gold exceeds its reserve (§12):
   - *Greed* (before its salvo time, and always on Easy): buy the Send in Stock with the best income ÷ price, × 1.5 when that Send's margin against your Field is under 1 (it would leak).
   - *Salvo* (from its salvo time, and for everyone in Sudden Death): plan the cheapest set of Sends in Stock whose combined HP beats 1.3 × your route's potential against their armors, crowd included. Save for it, with rules 2–5 still active, then buy it all in one action. When no salvo in Stock can beat your maze, it buys for greed instead. A salvo that stole 2 or more lives is repeated before it plans anew. When you are down to 5 lives, Hard and Insane drop the reserve and the 1.3 margin falls to 1.0.
   - *Flyers* (Hard and Insane): when your air potential is under 0.8 × a Harpy pair's HP, Harpies come first.
7. **Surplus.** Gold above twice the reserve goes to the best-value upgrade.

Seeded variation, all from its own RNG: which end its blueprint's first gap opens, a ±30 s jitter on its salvo time, Easy's skipped Walls, and the upgrade picks on Easy and Normal (§12).

**The blueprint.** A serpentine of 9 rows of 7 Walls, alternating their gap, 63 Walls and 630 gold in all, written in `content/linewars/ai.ts`. Its route is about 154 cells long: 43 s for a Brawler, 60 s for a Mammoth. Rows are built from the Field's middle outward (local rows 13, 10, 16, 7, 19, 4, 22, 1, 25), each from its closed end toward its gap. A Wall refused because a creep is in the way is retried at the next think.

```
,,,,,,,,,,,,,,,,   spawn strip
,,,,,,,,,,,,,,,,
................   lane
##############..   wall row: 7 Walls, gap at one end
##############..
................
..##############   the next row's gap at the other end
..##############
................
##############..
##############..
................
..##############
..##############
................
##############..   the middle row, built first
##############..
................
..##############
..##############
................
##############..
##############..
................
..##############
..##############
................
##############..
##############..
................
,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,   exit
```

## 12. Difficulty

Every mode has Easy, Normal, Hard and Insane (PLAN §1). In Line Wars, Difficulty sets how strong the Rival is, as Reforged's bots differ by an announced income bonus. Creeps stay the same on both Sides and on every Difficulty, so a Brawler is a Brawler whoever sends it, which versus will need. New Run shows each Difficulty's factor and a few words on how the Rival plays.

| | Easy | Normal | Hard | Insane |
|---|---|---|---|---|
| Rival's income | ×0.85 | ×1 | ×1.2 | ×1.5 |
| Thinks every | 2 s | 1 s | 0.5 s | 0.5 s |
| Actions a think | 1 | 2 | 3 | 4 |
| Maze | the first 6 of the 9 rows in build order; each Wall skipped with a 25% chance, leaving shortcuts | the full blueprint | full | full |
| Upgrade pick | at random among the best 3 | the best 75% of the time, else the second | the best | the best |
| λ (defense) | 0.8 | 1.1 | 1.3 | 1.4 |
| Reserve | none | ½ its income | its income | its income |
| Air guard | only after a flyer leaks | from 4:30 | from 4:30 | from 4:30 |
| Sends | greed only | salvos from 8:00, judging your maze by raw damage | salvos from 6:00, judging it by damage against each armor, so they hit your weak spot | as Hard, plus Harpies when your air is thin |
| After it leaks | nothing | Danger for 20 s | Danger for 20 s; λ +0.1 (at most +0.3, fading 0.1 a minute) | as Hard |

All **[tune]**. Reforged's Normal bot gets +20% income. Ours gets none, so that Normal is a fair fight, and its skill is tuned to lose about 40% of the time to a competent player (§13).

**CONTEXT's Difficulty entry** should read: "The Easy, Normal, Hard or Insane setting chosen when starting a Run, which scales creep strength. In a Game Mode that recreates a Classic, Normal plays with the Classic's own numbers. In Line Wars it sets the Rival instead: its income and how well its AI plays; creeps are the same on every Difficulty."

## 13. Balance: how the bots tune it

- **The player-side bot is the AI itself** with the `competent` profile. That is Hard's rules at income ×1, thinking every 1 s with 3 actions, about a quick person's pace. Tools run it as `drivers: ['ai', 'ai']`, and New Run never offers that.
- **Scripted sanity bots** in `tests/sim/linewars/`, independent of the AI, like Maul's:
  - *Turtle:* never sends after the opening.
  - *Rusher:* Snowlings and Brawlers only, with no towers after the opening.
  - *Flyer:* Harpies whenever they are in Stock.
  - *Greedy:* always the best-ratio Send, defending only after a Leak.
- **The matrix:** `pnpm balance linewars` plays your Race × the Rival's Race × seeds × Difficulty. Locally it plays at most 5 seeds, one Run at a time, with the Race pairings rotated across seeds; the full 4 × 4 × 10 × 4 = 640 Runs is a rare wide sweep. It reports win rate, median Run length, lives stolen, income at 5, 10 and 15 min, leaks by Send, and the refused AI commands (which must be 0).
- **Targets:**
  - Win rates (PLAN §4): the competent bot wins Easy about 95%, Normal about 60%, Hard about 30% and Insane under 10%.
  - Run length: median 12–18 min, with under 10% of Runs reaching the 19:50 limit on any Difficulty.
  - On Normal, no Race pairing under 40% or over 80%.
  - Turtle and Rusher lose Normal at least 90% of the time, and Flyer wins it at most 50%.
- **Knobs, coarse to fine:** the Rival's income factors; Send HP per gold; Send income ratios, Stock and restock; λ, the maze share, salvo times and pick noise; Sudden Death's start and growth. As in Maul, what the bots change goes into §16 with the results.
- **Seat check:** the Fields are mirror images, so the competent bot playing against itself should win about 50% from either Side.

## 14. Score and Records

- **Score:** 100 for each life your Leaks steal, plus the bounty of every kill. A win adds 1,000, 5 for each second left before 20:00, and 20 for each life left.
- **Records:** one board per Difficulty, kept on the device. It holds Runs played, wins, fastest win, best score and **best steal** (the most lives your Leaks took in a Run, shown where other modes show the best Wave). A draw counts as played, not won. Races share a board, as in Maul.
- `RunResult` maps as: `wave` = lives stolen, `score`, `won` = Side 0 won, `seconds` = the Run's length. The Records table needs one small hook so that Line Wars' Wave column reads "Best steal".

## 15. The screen

- **New Run** asks for your Race (four cards with their roles), the Rival's Race (Random first, then the four) and the Difficulty, with the Rival's income factor and one line on how it plays.
- **The board.** Both Fields at fit zoom, yours on the right (§3). Your Field shows your live route. The Rival's route is drawn too, fainter, so you can see where your Sends will walk. Air fans in both Fields. The Rival's towers can be tapped for a read-only panel ("Rival's tower"). Pinch and pan as in every mode.
- **HUD**, top to bottom, in the side column:
  - Gold, and your income with the income-tick countdown as a ring: "+42 in 6 s".
  - Pause and speed.
  - The life bar: "You 34 ▮▮▮▮▮▯▯▯ 26 Rival", one bar while the two still hold 60. Beside it, the Rival's Race and income ("Rimeborn · +31 ×1.2"), then the clock: "Sudden Death in 7:32", red from 15:00 with "−1 ♥ each tick".
  - The build menu: Wall, line A and line B, with prices (Q W E).
  - The send menu: the 10 Sends in a 5 × 2 grid. Each shows its shape, price and +income, a Stock badge, a thin restock bar, and, while locked, its unlock countdown. Below it, "Live 12/40".
  - "In your Field": the Rival's creeps now walking your Field, grouped by Send with counts and tags (Air, Boss, Fast, Armored, Regen, Unslowable), and the next unlock ("Harpies (Air) in 0:28"). This is Line Wars' wave preview.
  - On a short phone screen a selected tower's panel takes the place of the build menu and the "In your Field" list, and the send menu stays.
- **Feedback.** "Air in 0:30" in the 30 s before Harpies unlock. A toast when the Rival sends flyers or a boss. "+1 ♥ stolen" when your creep leaks, and "−2 ♥ Warlord got through" when one of theirs does. "Juggled: n creeps turned back" as in Maul. The Rival's builds, upgrades and kills make no sound, and its creeps arriving in your Field do (a soft horn for flyers and bosses).
- **Mac hotkeys.**
  - Building: Q builds a Wall, W and E your two lines' Tier 1, as in Maul.
  - On a selected tower of yours: Q W E R pick its upgrades in the panel's order, and S sells, as in Maul. The build keys step aside, and the Send keys stay.
  - Sending: Z X C V B send the five cheapest Sends, and A D F G H the next five (§8). S is skipped so that it always means Sell.
  - Space repeats your last Send. P pauses, 1–3 set the speed, Esc backs out.
- **Phone.**
  - Builds use tap to preview, tap again to confirm. Pick a tower in the build menu, tap your Field for the Ghost with its range and the new route, and tap again within 26 pt to build. The pick stays picked, as in Maul.
  - A Send is one tap with no confirm, because a mistaken Send still earns income and a confirm would slow the spam the mode is about. A dim Send button says why on a long press (locked, no Stock, gold, the cap).
  - Android ticks a haptic on each Send.
- **How to play**, one screen:
  - Two Fields: you maze yours, they maze theirs, and Sends walk the other Field.
  - Sends buy income.
  - Stock and unlocks.
  - Leaks steal lives.
  - Sudden Death ends every Run by 19:50.
  - Building (Maul's text, with "your Field only").
  - Races and armor.
  - Controls.
- **Autosave** every minute (every sixth income tick, on `lw.checkpoint`) and when the app is hidden. The app autosaves on `waveEnd` today, so it needs a `checkpoint` reason. Continue, save codes and Records work as in every Game Mode. Continue reads "Line Wars · Rimeborn vs Ironclad · Normal".

## 16. Assumed

- *Assumed:* each creep of a Send enters at a random cell of the defending Field's spawn row, drawn from `state.rng`. A pack draws once per creep.
- *Assumed:* flyers fly from their spawn cell to the middle of their Field's exit row.
- *Assumed:* a Send unlocks with 1 in Stock, and restock starts again from the moment one is bought from a full Stock.
- *Assumed:* the Rival's pay is ⌊income × factor⌋ each tick, and the factor never touches bounty.
- *Assumed:* the first income tick is at 0:10. The Sudden Death drain comes after that tick's pay, from 15:00 inclusive.
- *Assumed:* in Sudden Death the HP factor applies to Sends bought from 15:00 on, not to creeps already walking.
- *Assumed:* a steal never takes more lives than the defender has, which keeps the 60 conserved.
- *Assumed:* a draw is phase `lost` with `result: 'draw'`. The end card says "Draw".
- *Assumed:* on the same tick, Side 0's commands apply before Side 1's, both in versus and against the AI.
- *Assumed:* the AI's per-tower weights, think phases and every rule threshold in §11.4.
- *Not tuned yet.* There is no bot yet. The numbers in §8–§12 are first guesses from Maul's tuned towers and the capacity sums in §8.

## 17. New CONTEXT terms

A new section, **Line Wars (Line Tower Wars rules)**:

**Side**:
One of the two players in Line Wars, with its own Field, Race, gold, income, lives and Stock. Side 0 is you; Side 1 is the Rival.
_Avoid_: player (in code), team, slot, seat

**Rival**:
The other Side in Line Wars: played by the sim's AI now, by a remote player in versus later.
_Avoid_: enemy, opponent bot, CPU, computer, AI (in player text)

**Field**:
A Side's own 16 × 28 part of the Line Wars Map, between a spawn strip and an exit strip. Only that Side builds in it, and only the Rival's Sends walk it.
_Avoid_: lane (Element's Lane), line, board, arena

**Send**:
A creep, or a pack of them, bought in Line Wars for the Rival's Field. It enters at once and raises the buyer's income at once and for good.
_Avoid_: summon (Line Tower Wars' word), spawn, attack, wave

**Income**:
The gold a Side is paid each income tick in Line Wars: 10 plus the income of every Send it has bought.
_Avoid_: interest, salary, upkeep

**Income tick**:
The payout of Income every 10 s in Line Wars, counted down on the HUD.
_Avoid_: payday, round, cycle

**Stock**:
How many of one Send a Side can buy right now. It starts at 1 when the Send unlocks and refills one at a time up to its cap.
_Avoid_: charges, supply, food

**Sudden Death**:
Line Wars from 15:00: Income stops growing, every income tick takes a life from each Side, and new Sends get tougher. It ends every Run by 19:50.
_Avoid_: overtime, endgame, drain mode

**Changes to existing entries:**
- **Run:** "One playthrough of a Game Mode on a Map, from its start to victory or defeat." This drops "the first Wave".
- **Wave:** "One group of creeps sent along the path in a single go. In most Game Modes a Run is a fixed sequence of Waves; Line Wars has none, and every creep in it is a Send."
- **Difficulty:** as in §12.
- **Record:** add "Line Wars keeps Runs, wins, fastest win, best score and best steal: the most lives taken in a Run."
- **Leak:** add "In Line Wars it moves lives from the defending Side to the sender, and the creep is removed."
- **Juggling:** "Maul and Line Wars allow it, as Wintermaul did."
- **Race** and **Wall:** "In Maul and Line Wars". For Race, add "In Line Wars each Side has one Race for the whole Run."
- **Break:** add "Line Wars has none."

## 18. My calls, open to change

- **30 lives, Sudden Death at 15:00, every Run over by 19:50:** that keeps a phone Run near 20 min, and §10 proves the end.
- **A Leak steals once and the creep is removed:** under 2.7c's 1v1 loop, one gap in your maze would lose you the Run.
- **No neutral Waves:** the Rival is the pressure, and Waves hitting both Sides alike would only dilute the Sends.
- **Difficulty is the Rival's income and skill, with the same creeps:** that is Reforged's lever, it is open, and versus needs identical creeps. It changes CONTEXT's Difficulty entry.
- **Brawler, Sleet Hound and Hollow replace Maul's Raider, Frost Wolf and Wraith:** all three are on research §7's lists. Maul should adopt the new names too, which touches a finished mode and **needs your yes**.
- **Juggling allowed, and the AI never juggles:** this matches Maul, costs gold, and can't stall a Run past 19:50.
- **One Race per Side, the Rival's random by default:** a second Race would arrive after the Run is decided.
- **No tower-attacking Sends:** they need new engine work, and flyers already punish long cheap mazes.
- **Flyers at half the income ratio:** this answers Wintermaul Wars' flyer complaint without making Harpies useless.
- **A 12-column Divide instead of Sides in the core's targeting:** it costs a phone almost no tower size and leaves the sim core untouched.
- **Your Field on the right, beside the HUD:** the build menu and your maze then sit under one thumb.
- **Sends are one tap, on Z X C V B and A D F G H, skipping S:** fast sending is the mode, and S must always mean Sell.
