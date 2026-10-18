# Line Wars: design

Line Wars is the Game Mode that recreates Line Tower Wars as a duel. You maze your own Field, you buy creeps that walk your Rival's, and every creep you send raises your income. The Rival is an AI that runs inside the deterministic sim, so versus over WebRTC can later hand its Side to a person. Line Wars keeps Line Tower Wars' rules ([line-wars-rules.md](research/line-wars-rules.md)) and uses our own names, numbers, text and shapes. Its towers are Maul's ([maul-design.md](maul-design.md)). Words follow [CONTEXT.md](../CONTEXT.md), and §17 lists the new ones.

There are no Waves, so PLAN §4's Wave baseline doesn't apply. The Send table (§8) is the baseline instead, priced against Maul's tuned towers. A number marked **[tune]** was a first guess for the bots (§13); the tables now hold the tuned values, and §16 lists every change with the before and after. Anything the sources leave open is marked *assumed* (§16). How two Sides and an AI fit the engine is recorded in [ADR-0003](adr/0003-two-sides-and-an-ai-in-one-sim.md). §18 lists the calls you may want different.

## 1. At a glance

| Topic | Design |
|---|---|
| Shape | One duel against the Rival on one Map. A Run lasts 10–20 min and always ends by 19:50 |
| Map | The Twin Fields: two 16 × 28 Fields side by side, 12 columns of rock apart. Sends enter along the top and leak at the bottom. No Checkpoints (§3) |
| Sides | You (the east Field, beside the HUD) and the Rival (west). Each has its own Race, gold, income, lives and Stock |
| Towers | Maul's four Races and 36 towers, unchanged. One Race per Side for the whole Run (§6) |
| Mazing | Blocks refused; Juggling allowed (§5) |
| Sends | 10, from 24 to 800 gold, unlocking from 0:20 to 10:00. Each raises your income at once and for good. Stock refills; 40 of yours alive at most (§8) |
| Income | 10 plus what your Sends added, paid every 10 s. 150 gold to start. No interest (§9) |
| Lives | 30 each. A Leak moves lives from the defender to the sender, and the creep is removed (§10) |
| Sudden Death | From 15:00 income freezes, every income tick drains a life from both Sides, and new Sends get tougher |
| Waves | None. The Rival is the pressure |
| Difficulty | The Rival's income ×0.85 / 1 / 1.1 / 1.5 and how well its AI plays. Creeps are the same on every Difficulty (§12) |
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
- 10 Sends made from Maul's creeps, at 24 to 800 gold instead of 5 to 2,250,000. Income stays in the low hundreds.
- Maul's four Races and 36 towers instead of tech lines and Research Points.
- No tower-attacking Sends and no negative-income finishers. Flyers punish long mazes, and Sudden Death ends Runs.
- Flyers return half the income ratio of their neighbours. Wintermaul Reforged applied the same brake harder, with no income at all.
- Juggling is allowed, as in Maul.
- Difficulty is the Rival's income bonus plus its skill.
- 30 lives, and Sudden Death from 15:00, so every Run ends by 19:50.
- Our numbers, names, text and shapes. No name from research §7 is used. Three of Maul's creeps were renamed for that reason, in Maul too (§8).

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
  /** All gold earned (the start, every income tick, bounty; sales aside) and gold spent on Sends. */
  earned: number; spent: number;
  /** Creeps that leaked out of its Field, the lives they took, flyers among them, and the tick of the last. */
  leaked: number; lost: number; airLeaks: number; leakTick: number;
  /** Sends that entered its Field in the last 120 s: the AI's mix and defense floor read it. */
  inbound: { tick: number; send: SendId; hp: number }[];
  /** Bumped by every build, upgrade and sale in its Field, so the AI's cached maps of it rebuild. */
  version: number;
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

**Code.** Line Wars reads `MAUL_TOWERS`, `MAUL_DAMAGE_TABLE` and Maul's effect kinds as they are. The tree queries both modes need (next steps, build and upgrade refusals, sale value, juggle detection, Maul's placement reasons) live in `src/sim/modes/maul/tree.ts`, which takes the Races a player holds and its gold. Maul passes its Run's and still charges `state.gold`, with its replay hashes unchanged; Line Wars passes the acting Side's and charges that Side (`src/sim/modes/linewars/`). Chain lightning keeps Maul's `maul.chain` event in Line Wars too.

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

A Send is one creep, or a pack of them, made from Maul's creeps. Its HP is set here rather than by a Wave curve. Three of Maul's names were on research §7's lists, so Maul renamed those creeps: the Raider became the **Brawler**, the Frost Wolf the **Sleet Hound**, and the Wraith the **Hollow** (§18). A Send and its creeps take their names from Maul's creep table, and only a pack (Snowlings, Harpies) names its Send itself. The shapes are Maul's.

| Key | Send | Creep (Maul) | Creeps | Price | Income | Ratio | HP each | Armor | Speed | Bounty each | Steals each | Unlock | Stock cap | Restock |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Z | Snowlings | Snowling | 3 | 24 | +2 | 8.3% | 16 | Light 0 | 250 | 2 | 1 | 0:20 | 6 | 5 s |
| X | Brawler | Brawler | 1 | 40 | +3 | 7.5% | 100 | Medium 0 | 230 | 6 | 1 | 0:40 | 6 | 6 s |
| C | Sleet Hound | Sleet Hound | 1 | 60 | +4 | 6.7% | 140 | Light 0 | 360 | 8 | 1 | 1:20 | 5 | 8 s |
| V | Troll | Troll | 1 | 90 | +6 | 6.7% | 290 | Medium 1 | 220 | 10 | 1 | 2:00 | 5 | 10 s |
| B | Hollow | Hollow | 1 | 120 | +7 | 5.8% | 460 | Medium 0 | 240 | 12 | 1 | 3:00 | 4 | 12 s |
| A | Brute | Brute | 1 | 160 | +9 | 5.6% | 780 | Heavy 2 | 200 | 16 | 1 | 4:00 | 4 | 15 s |
| D | Harpies | Harpy | 2 | 200 | +5 | 2.5% | 220 | Light 0 | 260 | 8 | 1 | 5:00 | 3 | 20 s |
| F | Ice Golem | Ice Golem | 1 | 260 | +13 | 5% | 1,540 | Fortified 4 | 170 | 20 | 1 | 6:00 | 3 | 20 s |
| G | Tusked Warlord | Tusked Warlord | 1 | 500 | +20 | 4% | 3,900 | Hero 3 | 170 | 30 | 2 | 8:00 | 2 | 45 s |
| H | War Mammoth | War Mammoth | 1 | 800 | +28 | 3.5% | 7,200 | Hero 5 | 150 | 40 | 3 | 10:00 | 1 | 60 s |

Prices, HP and bounty are the tuned values (§16): every price and bounty doubled from the first guess and every income kept, and HP grows faster than price from the Troll up. Stock and restock are the first guesses. Traits are Maul's: Trolls heal 2% of their max HP a second, Hollows can't be slowed, and bosses can't be slowed below half speed (a stun still holds them).

- **Greed against pressure.** The income ratio falls from 8.3% to 3.5% as Sends get dearer, so payback stretches from 120 s to 286 s. HP per gold of price rises from 2.0 to 9.0 (the fast Sleet Hound trades a little for speed), so a dear Send packs more HP into one creep, which single-target towers struggle with. Cheap Sends grow your income; dear ones break mazes.
- **Unlock and Stock.** A Send unlocks at the same Run time for both Sides, with 1 in Stock. It then gains 1 every restock interval up to its cap. Restocking pauses while Stock is full and starts again from the moment one is bought.
- **The brakes.** Stock and restock cap how fast income can grow. With every Send unlocked and unlimited gold, a Side could add at most about 50 income a tick, and that would cost about 960 gold a tick. Until then, gold binds first. The first guess aimed at 25 income by 3:00, 90 by 8:00 and 200–300 by 15:00; the tuned competent bot reaches about 20 by 3:00, 40 by 5:00, 110 by 10:00 and 200–330 by 15:00 (§16).
- **Flyers.** Harpies fly straight over the maze, in about 7.6 s from spawn to exit. Their brake: half the income ratio of their neighbours, a Stock of 3, a 20 s restock, and an unlock at 5:00, announced 30 s ahead (§15).
- **The cap.** At most 40 of a Side's creeps can be alive in the other Field. A Snowling pack counts 3. A Send that would pass the cap is refused before it is paid for. The cap stops a Side that has stopped defending from being buried under an endless pile. It also keeps the tick within budget: at most 80 creeps and about 140 towers. That is more towers than PLAN §2's budget of 80 but far fewer creeps than its 300, so the tower-by-creep targeting work is under half the budget's.
- **Bounty** goes to the defender for each creep it kills: 25% of the price for Snowlings, falling to 5% for the Mammoth, as Reforged's falls with price. The AI's income bonus never touches bounty.
- **In Sudden Death** a Send's HP is multiplied by 1 + 0.1 for each minute since 15:00, measured by tick when it is bought. Creeps already in a Field keep their HP.

## 9. Income, gold and pace

| | Number |
|---|---|
| Start | 150 gold, 10 income, 30 lives each **[tune]** |
| Income tick | Every 10 s, the first at 0:10. Each Side is paid its income: 10 plus the income of every Send it has bought |
| The Rival's pay | ⌊income × the Difficulty's factor⌋: ×0.85, ×1, ×1.1 or ×1.5 (§12). Your pay is never scaled |
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
| `skills` | per AI Side: `easy`, `normal`, `hard`, `insane` or `competent` (tools only) | Side 1: the Difficulty; Side 0: `competent` |

### 11.2 What it may read

Its own Side in full. Of yours, only what the HUD shows of the Rival to you: your Field (towers, routes and creeps), your Race, your income and your lives. It never reads your gold or your Stock. In versus each person then sees exactly what the AI would have seen.

### 11.3 What it computes each think

- **Its route:** the ground route through its Field, traced from the spawn row's middle cell.
- **Its coverage:** for each cell of that route and each armor type, the damage per second its towers deal there. That is each covering tower's DPS × the table's multiplier (a Ley Shrine's bonus included), with poison at ×1, and with splash, multishot, chains and venom scaled by the weights in `content/linewars/ai.ts`. Each cell also keeps the strongest slow and the most armor stripped that reach it. Air coverage is the same, over samples of the straight line from the spawn row's middle to the exit's middle, counting only towers that hit air.
- **Potential:** the damage a lone creep of a given Send takes walking the rest of a route: the sum over its cells of the coverage against its armor type × its numeric armor's multiplier (less any armor stripped there) plus poison, × each step's length ÷ its speed under that cell's slow. Hollows ignore slows and bosses take at most half. A creep's **margin** is its potential ÷ its HP, divided by a crowd factor of 1 + 0.1 for every other creep of the same sender in that Field, at most 2. Each other creep counts only for the share of the walk it would survive alone (its HP ÷ its potential, at most 1), so Snowlings that die at once don't shield a Golem. Below 1, it will probably leak.
- **The same two maps of your Field,** for choosing Sends.
- **The mix:** the HP of your creeps that entered its Field in the last 120 s, split by armor type (uniform before any arrive), and the share of it that flew.
- **Upgrade value:** for each own tower and each next step, (the step's DPS against the mix − the tower's) × the route cells within the step's range ÷ the step's price. A tower that hits air adds its air cells × the air share, at least 0.15 once Harpies are unlocked. Tier 3 forks are valued the same way.

Cost: a route of up to about 160 cells and 63 air samples × up to 70 towers per Field, rebuilt only when that Side's towers or any path change. How much route each tower covers at each radius is kept until the path changes. In Node a tick averages 7 µs, a think tick 24 µs, and the worst think (several builds, each with its Block check and a new flow field) about 0.6–0.9 ms (§16).

### 11.4 Its rules, in priority order

Each think, the AI takes up to its actions-per-think. Each action is the first rule below that fires, and the rules are checked again after every action. A salvo counts as one action. A rule that *holds* keeps its gold and ends the think, except that the salvo bank (rule 6) may still buy a salvo, since no other rule can spend it.

1. **Opening** (until 0:20). Build the blueprint's first Wall and upgrade it at once to the Race's opening Tier 1, then build Walls in blueprint order. The opening Tier 1 is line A's, except for the Runecasters, who open with the Glyph because its splash meets the first Snowlings.
2. **Danger.** One of your creeps in its Field has a margin under 1, or (on Normal and above) it leaked in the last 20 s. Then it buys the best-value upgrade it can afford. If it can afford none, it holds its gold, but only when the cheapest worthwhile upgrade is at most one income tick of pay away; otherwise it plays on, so a flood can't freeze it.
3. **Maze.** While the blueprint is unfinished and Walls have had less than the maze share of all the gold it has earned (35%, or 25% on Easy), it builds the next blueprint Wall.
4. **Air guard.** From 4:30 (on Easy, only after a flyer leaks), it keeps at least 2 towers that hit air covering the air line's last third, 3 from 8:00 and 4 from 11:00. It does this by upgrading the Wall with the best air coverage.
5. **Defense floor.** Its towers are worth less than the larger of 40% of all gold earned and 150 + λ × the HP of your Sends that entered its Field in the last 60 s, that second part capped at 50% of all gold earned. Then it buys the best-value upgrade, holding as in rule 2. λ is per Difficulty (§12).
6. **Send**, with gold above its reserve (§12):
   - *The salvo bank.* From its salvo time (and for everyone in Sudden Death), 40% of every gold it earns goes into a bank that only salvos may spend, up to 20 income ticks of pay. Rules 2–5 and greed spend only the rest, so saving never stalls them.
   - *Salvo.* It plans against what the bank will hold after 10 ticks of pay (or the bank itself, if that is more): of the sets of Sends in Stock that much buys, the one expected to steal the most lives a gold, the bigger on a tie. A creep is expected to get through when its HP × its crowd factor beats the margin (1) × the potential your route deals it against its armor. The plan is built a Send at a time, the one adding the most lives a gold, or else the most crowd. Once the bank holds the plan's price, it buys it all in one action. When nothing in Stock would get through, the bank goes back to greed. A salvo that stole 2 or more lives is repeated before it plans anew. When you are down to 5 lives, Hard and Insane drop the reserve, may spend all their gold on it, and the margin falls to 0.8.
   - *Greed* (with the gold outside the bank, after any salvo): buy the Send in Stock with the best income ÷ price, × 3 when that Send's margin against your Field is under 1 (it would leak). In Sudden Death, when Sends add no income, it buys the most HP a gold instead.
   - *Flyers* (Insane): when your air potential is under 0.8 × a Harpy pair's HP, Harpies come first.
7. **Surplus.** Gold outside the bank above twice the reserve goes to the best-value upgrade.

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
| Rival's income | ×0.85 | ×1 | ×1.1 | ×1.5 |
| Thinks every | 2 s | 1 s | 0.5 s | 0.5 s |
| Actions a think | 1 | 2 | 3 | 4 |
| Maze | the first 6 of the 9 rows in build order; each Wall skipped with a 25% chance, leaving shortcuts | the full blueprint | full | full |
| Upgrade pick | at random among the best 3 | the best 75% of the time, else the second | the best | the best |
| λ (defense) | 0.3 | 0.4 | 0.5 | 0.55 |
| Reserve | none | ½ its income | its income | its income |
| Air guard | only after a flyer leaks | from 4:30 | from 4:30 | from 4:30 |
| Sends | greed only | salvos from 10:00, judging your maze by raw damage | salvos from 6:00, judging it by damage against each armor, so they hit your weak spot | as Hard, plus Harpies when your air is thin |
| After it leaks | nothing | Danger for 20 s | Danger for 20 s; λ +0.1 (at most +0.3, fading 0.1 a minute) | as Hard |

These are the tuned values (§16). Reforged's Normal bot gets +20% income. Ours gets none, so that Normal is a fair fight, and its skill is tuned to lose about 40% of the time to a competent player (§13).

**CONTEXT's Difficulty entry** should read: "The Easy, Normal, Hard or Insane setting chosen when starting a Run, which scales creep strength. In a Game Mode that recreates a Classic, Normal plays with the Classic's own numbers. In Line Wars it sets the Rival instead: its income and how well its AI plays; creeps are the same on every Difficulty."

## 13. Balance: how the bots tune it

- **The player-side bot is the AI itself** with the `competent` profile. That is Hard's rules at income ×1, thinking every 1 s with 3 actions, about a quick person's pace. Tools run it as `drivers: ['ai', 'ai']`, and New Run never offers that.
- **Scripted sanity bots** in `tests/sim/linewars/`, independent of the AI, like Maul's:
  - *Turtle:* never sends after the opening.
  - *Rusher:* Snowlings and Brawlers only, with no towers after the opening.
  - *Flyer:* Harpies whenever they are in Stock.
  - *Greedy:* always the best-ratio Send, defending only after a Leak.
- **The matrix:** `pnpm balance linewars` (`tools/balance/linewars.ts`) plays the competent bot against each Difficulty, the sanity bots against Normal, and the seat check, over seeds with the Race pairings rotated (each run of four seeds puts every Race once on each Side). It plays in one process, one Run at a time, 5 seeds a row by default; `--seeds`, `--difficulties`, `--bots` and `--json` narrow or widen it, and the full 4 × 4 × 10 × 4 = 640 Runs is a rare wide sweep. It reports win rate, median Run length, the share reaching 19:50, how Runs ended, lives stolen, income at 5, 10 and 15 min, leaks by Send, the refused AI commands (which must be 0) and the tick time, then checks the targets. `pnpm test` plays four whole Runs as a sample (`tests/sim/linewars/bot.test.ts`).
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
  - The life bar: "You 34 ▮▮▮▮▮▯▯▯ 26 Rival", one bar while the two still hold 60. Beside it, the Rival's Race and income ("Rimeborn · +31 ×1.1"), then the clock: "Sudden Death in 7:32", red from 15:00 with "−1 ♥ each tick".
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

## 16. Assumed, and tuned

The rules are in `src/sim/modes/linewars/` (mode id `linewars`) with the AI in its `ai/` folder, the content in `src/content/linewars/`, the tests and sanity bots in `tests/sim/linewars/`, and the balance runner in `tools/balance/linewars.ts`.

- *Assumed:* each creep of a Send enters at a random cell of the defending Field's spawn row, drawn from `state.rng`. A pack draws once per creep.
- *Assumed:* flyers fly from their spawn cell to the middle of their Field's exit row.
- *Assumed:* a Send unlocks with 1 in Stock and refills from that moment while below its cap; restock starts again from the moment one is bought from a full Stock. Unlocks are processed after the tick's logged commands, so a person can first buy a Send on the tick after its unlock, while the AI, thinking later in the tick, may buy it on the tick itself.
- *Assumed:* the Rival's pay is ⌊income × factor⌋ each tick, and the factor never touches bounty. Side 1 always gets the Run's factor, also when a person plays it, so versus should play Normal (×1).
- *Assumed:* the first income tick is at 0:10. The Sudden Death drain comes after that tick's pay, from 15:00 inclusive, and the 30th drain is at 19:50 (tick 35,700).
- *Assumed:* in Sudden Death the HP factor applies to Sends bought from 15:00 on, not to creeps already walking. It grows continuously with the tick of purchase (1 + 0.1 × minutes since 15:00), rounded to whole HP.
- *Assumed:* a steal never takes more lives than the defender has, which keeps the 60 conserved.
- *Assumed:* a draw is phase `lost` with `result: 'draw'`. The end card says "Draw". The income tie-break compares the frozen incomes before the Difficulty factor.
- *Assumed:* on the same tick, Side 0's commands apply before Side 1's, both in versus and against the AI. The core applies the log in its order, so versus's lockstep layer must order it; an AI Side 0 (tools) thinks before Side 1.
- *Assumed:* a tower's Side is its anchor's column's Field; a creep's Field is its spawn index (0–15 Side 0). Line Wars' creep specs keep Maul's creep ids (`raider`, `frost_wolf`, `wraith`…) so the board can draw Maul's shapes, with Maul's name, the Send's HP and steal, and an `lw.send` back-link.
- *Assumed:* the juggle test is Maul's (a live ground creep whose next step now points away from its last), counted for the Side that built or sold. Maul's chain lightning keeps its `maul.chain` event in Line Wars.
- *Assumed:* the score is Side 0's. A win's seconds left run from the end tick to 20:00, rounded down. `lwRecord(state).wave` is the lives your Leaks stole, the Records hook for "Best steal".
- *Assumed:* tests and tools may start both Sides with other gold or lives (`options.gold`, `options.lives`); New Run never does. A Line Wars Run refuses any Map but the Twin Fields.
- *Assumed:* the AI's memory (`LwAi`) holds its skill, its RNG, its maze flip and Easy's skipped Walls, its salvo time, the last salvo and its creeps, a salvo to repeat, the salvo bank, its λ boost, and the opening's first Wall. Its RNG is seeded from the Run's seed and its Side with `Math.imul`. It never sells and never juggles. Its Field maps and tower coverage are caches keyed by the state and its tower and path versions, so a restored Run rebuilds identical ones.
- *Assumed:* the AI's per-tower weights, think phases and every rule threshold in §11.4, as `src/content/linewars/ai.ts` lists them.
- *Tuned (2026-10-18)* with the competent bot and the four sanity bots, 5 seeds a row with the Race pairings rotated, one Run at a time (`pnpm balance linewars`). Before → after:
  - **Send prices doubled**, incomes kept, so every income ratio halved (16.7–7% → 8.3–3.5%): Snowlings 12 → 24, Brawler 20 → 40, Sleet Hound 30 → 60, Troll 45 → 90, Hollow 60 → 120, Brute 80 → 160, Harpies 100 → 200, Ice Golem 130 → 260, Warlord 250 → 500, Mammoth 400 → 800. At the first prices two AIs' incomes compounded to about 450 by 8:00 and 2,500 by 15:00, 5 to 10 times §8's curve; both mazes maxed out at 63 Tier 3s and nothing leaked after 10:00.
  - **Bounty doubled with price**, keeping its share: 1, 3, 4, 5, 6, 8, 4, 10, 15, 20 → 2, 6, 8, 10, 12, 16, 8, 20, 30, 40 a creep.
  - **HP:** Snowlings 8 → 16, Brawler 50 → 100, Sleet Hound 70 → 140, Harpies 110 → 220 (doubled with price); Troll 130 → 290, Hollow 190 → 460, Brute 300 → 780, Ice Golem 550 → 1,540, Warlord 1,300 → 3,900, Mammoth 2,400 → 7,200. HP per gold now climbs from 2.0 to 9.0 instead of 6.0: with HP only doubled, a competent maze killed everything but bosses and Runs drifted into Sudden Death. Cheap Sends stayed at 2.0–2.5 a gold, since at 3.0 a Snowling flood beat every opening.
  - **Hard's income factor ×1.2 → ×1.1.** Hard plays the competent bot's own rules, so at ×1.2 the income alone decided it: 0 wins of 5.
  - **λ:** Easy 0.8 → 0.3, Normal 1.1 → 0.4, Hard 1.3 → 0.5, Insane 1.4 → 0.55; and **new**, the floor's λ part is capped at 50% of all gold earned. At λ ≈ 1 the floor outgrew the income of whichever Side was sent at first; it stopped sending and lost on income every time.
  - **Danger's margin 1.2 → 1**, and Danger and the floor hold their gold only for an upgrade within one income tick of pay (before, they held whenever any upgrade was out of reach). Under a steady stream the AI froze and never sent again.
  - **Normal's salvos from 8:00 → 10:00.** With salvos from 8:00 Normal beat the competent bot 3 Runs of 5: salvos are the AI's strength, so a later start is a real handicap.
  - **The salvo margin 1.3 → 1, and the finishing margin 1 → 0.8.**
  - **Greed's bonus for a Send that would leak ×1.5 → ×3**, so greed buys a dear Send that gets through over another Snowling pack.
  - **The salvo rule changed shape.** "The cheapest set that beats your maze, saved for with rules 2–5 active" never fired: rules 2–5 spent the savings, and the plan grew with the gold. Now 40% of all gold earned from the salvo time goes into a bank only salvos spend (at most 20 ticks of pay), the plan is the most lives a gold that 10 ticks of pay would buy, and the crowd counts each other creep only for the share of the walk it would survive alone. In Sudden Death greed buys the most HP a gold, since Sends add no income.
  - Unchanged: the start (150 gold, 10 income, 30 lives), unlocks, Stock and restock, the live cap of 40, Sudden Death at 15:00 and its +10% a minute (+25% was tried and changed nothing measurable), maze shares, reserves, think intervals and actions.
  - **Results**, 5 seeds a row (50 Runs, 9 s in all; 0 refused AI commands):

    | | Wins | Median | Reaching 19:50 | Lives stolen, you / Rival | Income at 5 / 10 / 15 min, you · Rival |
    |---|---|---|---|---|---|
    | Competent v Easy | 5 / 5 | 16:07 | 0% | 23.8 / 2.6 | 43 / 111 / 328 · 48 / 172 / 416 |
    | Competent v Normal | 3 / 5 | 19:30 | 20% | 6.6 / 6.0 | 40 / 115 / 276 · 39 / 160 / 453 |
    | Competent v Hard | 1 / 5 | 18:40 | 0% | 7.4 / 10.8 | 40 / 107 / 195 · 44 / 100 / 299 |
    | Competent v Insane | 0 / 5 | 15:40 | 0% | 0.8 / 25.8 | 42 / 146 / 299 · 72 / 222 / 1,105 |
    | Turtle v Normal | 0 / 5 | 17:00 | 0% | 0 / 16.6 | 10 / 10 / 10 · 44 / 180 / 361 |
    | Rusher v Normal | 0 / 5 | 7:54 | 0% | 1.2 / 31.2 | 97 at 5 min · 41 (its Runs end before 10:00) |
    | Flyer v Normal | 0 / 5 | 17:41 | 0% | 5.2 / 16.4 | 66 / 106 / 171 · 45 / 178 / 402 |
    | Greedy v Normal | 1 / 5 | 18:30 | 0% | 11.4 / 13.6 | 96 / 619 / 2,100 · 49 / 216 / 563 |
    | Seat check: competent v competent, each pairing both ways, Side 0 | 6 / 10 | 18:44 | 10% | 10.5 / 10.0 | 38 / 99 / 220 · 40 / 100 / 188 |

    The competent Runs' median is 17:45, inside 12–18 min. Easy, Normal and Insane are on their aims; Hard's 20% is one Run short of ~30%.
  - **Not met:** one Normal Run of five reached 19:50 (the aim is under 10%). Close Normal duels run deep into Sudden Death: Normal's median is 19:30, and Easy's 16:07 is longer than §9's 10–14 min. With 5 seeds a row each Run moves a rate by 20 points, and the seat check's 60% is within that noise: swapping which Side thinks first moved it between 80% and 50%. "No Race pairing on Normal under 40% or over 80%" isn't measured, as 5 seeds play each pairing at most once.
  - **Tick time** with the AI thinking, in Node over three whole AI-against-AI Runs: 7 µs a tick on average, 24 µs on a think tick, 0.27 ms at the 99th percentile of think ticks and about 0.6–0.9 ms at worst, when one think builds several Walls (each a Block check and a new flow field). A phone running 5–10 times slower would spike to about 3–9 ms on those rare ticks, past PLAN §2's 4 ms; the steady cost stays far under it, at 29 creeps and 126 towers at most.
  - Watch in play-testing: once mazes stand, Leaks come mostly from bosses and Harpies, since a competent maze kills mid-tier Sends; a player who never defends until a Leak (Greedy) still beats Normal 1 Run in 5, with about four times its income by 10:00; Insane's ×1.5 snowballs to about 1,100 income by 15:00.

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

**Divide**:
The band of rock between the two Fields of the Line Wars Map, wider than any tower's reach, so no tower touches the other Field and no creep crosses it.
_Avoid_: wall (Maul's Wall), border, gap, river

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
- **Brawler, Sleet Hound and Hollow replace Maul's Raider, Frost Wolf and Wraith:** all three are on research §7's lists. You agreed, and Maul uses the new names too. The ids stay `raider`, `frost_wolf` and `wraith`, because ids are in every save and replay hash.
- **Juggling allowed, and the AI never juggles:** this matches Maul, costs gold, and can't stall a Run past 19:50.
- **One Race per Side, the Rival's random by default:** a second Race would arrive after the Run is decided.
- **No tower-attacking Sends:** they need new engine work, and flyers already punish long cheap mazes.
- **Flyers at half the income ratio:** this answers Wintermaul Wars' flyer complaint without making Harpies useless.
- **A 12-column Divide instead of Sides in the core's targeting:** it costs a phone almost no tower size and leaves the sim core untouched.
- **Your Field on the right, beside the HUD:** the build menu and your maze then sit under one thumb.
- **Sends are one tap, on Z X C V B and A D F G H, skipping S:** fast sending is the mode, and S must always mean Sell.
