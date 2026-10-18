# Wintermaul rules reference

Researched 2026-10-18 for the Maul Game Mode. Vocabulary follows [CONTEXT.md](../../CONTEXT.md): a Wintermaul "level" is a Wave, an "element" is a Race, "the ship" is the exit, and losing a "chance" is a Leak.

**Sources and caveats.** The primary source is the extracted map files of **Wintermaul X14 Balanced Version** (script header: author dukewintermaul, generated 2007-01-21; description: "edited by Sum_Asinus"). They are mirrored in [RodinSevar/towerdefence `mpq_files/`](https://github.com/RodinSevar/towerdefence/tree/67b563f090dae7637ff1baa40487ac98362c8c74/mpq_files) at commit `67b563f`. I read `war3map.j` (triggers), `war3map.wts` (strings), `war3map.w3u` (unit data, with my own parser) and `war3map.wpm` (pathing) directly. Citations look like `war3map.j: Trig_Core_Funtion_Actions` or `wts 90`. A field the map leaves unset falls back to the WC3 base unit, shown as "·". Later versions come from listings and changelogs:

- [Epic War: Wintermaul TD (Final)](https://www.epicwar.com/maps/78651/)
- [wc3maps: X10 Final](https://wc3maps.com/map/96/Wintermaul_TD_X10_Final), read through [wc3-td-maps.md](wc3-td-maps.md) because the site now blocks fetches
- [Hive: Wintermaul One Revamped v4b](https://www.hiveworkshop.com/threads/wintermaul-one-revamped-v4b.212876/), plus its author's videos on [anti-block](https://www.youtube.com/watch?v=sM7nVXK8mw8) and [anti-juggle](https://www.youtube.com/watch?v=Thea1a-lLQo)
- [ENT forum: the Wintermaul One rule](https://entgaming.net/forum/viewtopic.php?t=84095), [W3Reforged: Wintermaul One](https://maps.w3reforged.com/maps/categories/maul/wintermaul-one) and [wintermaul.one](https://wintermaul.one/)

[StefanJonsson96/wintermaul `docs/RESEARCH.md`](https://github.com/StefanJonsson96/wintermaul/blob/main/docs/RESEARCH.md) is another fan's reading of the same X14 files; I re-checked every number it gives. **[unverified]** marks memory, a single weak source, or my own reading of code that I did not run in game.

---

## 1. Versions

| Version | Who, when | What changed | Source |
|---|---|---|---|
| Wintermaul TD v1.1 | Duke Wintermaul, 2003–04 **[date unverified]** | Creeps enter from three places along the top; the Wave 30 boss leaking loses the game | `wts 59`, the old help text still inside X14 |
| Wintermaul TD (Final) | Duke-Wintermaul, RoC 1.04–1.05 `.w3m` | 9 players, 42 towers, 30 levels | [Epic War](https://www.epicwar.com/maps/78651/) |
| X10 Final | — | 72 towers, 30 levels, 9 spawn locations | [wc3maps](https://wc3maps.com/map/96/Wintermaul_TD_X10_Final) |
| X13 Ultimate | dukewintermaul | Double starting gold, 4 more spawns, levels up to 50, two new Races, one Race swapped for another | `wts 94` |
| **X14 Balanced** | edited by Sum_Asinus, 2007 | Description lists 7 spawn locations, 60+ towers, 30 levels and a weaker final boss | `wts 90`, `war3map.j` header |
| Wintermaul One | Lunar Fenris (from *Wintermaul Solo* **[unverified]**); later Chorark and others | One lane per player; leaks pass to the next player; 92 versions up to 16.0.1 (2019) | [W3Reforged](https://maps.w3reforged.com/maps/categories/maul/wintermaul-one), [ENT](https://entgaming.net/forum/viewtopic.php?t=84095) |
| Wintermaul One Revamped | LightningZLaser, 2012 | Anti-block, anti-juggle, 50 lives by default, two Races each | [Hive](https://www.hiveworkshop.com/threads/wintermaul-one-revamped-v4b.212876/) |
| Wintermaul One Revolution | 2018–2020 | 49 Races, 40 Waves, All Pick / All Random / Double / Same Builder / infinite modes | [wintermaul.one](https://wintermaul.one/) |

Wintermaul Wars (PvP sends, income) is a different game and is covered only in [wc3-td-maps.md](wc3-td-maps.md).

## 2. At a glance (X14 unless noted)

| Rule | Value | Source |
|---|---|---|
| Waves | 30 real Waves; Wave 30 is the boss. Waves 31–50 are joke bonus Waves that cost no lives | `Trig_Set_Levels_Actions`, `Trig_Bonus_Load`, `wts 661` |
| Air Waves | 5, 14, 23, 27 | `Trig_Set_Tips_Actions` (tip 5); base units are flyers in `w3u` |
| Creeps per Wave | 20 per spawn region; 15 on air Waves; 1 on Wave 30 | `Trig_Set_Levels_Actions` |
| Timing | Wave 1 starts 60 s after setup. Every later Wave starts 30 s after the last creep of the previous one dies or leaks. Waves never overlap | `Trig_Next_Level_Actions` |
| Lives | 20 on Normal. A Leak costs 1. The Wave 30 boss leaking ends the Run | `InitGlobals`, `Trig_Unit_Board_Ship_Actions` |
| Difficulty | Changes lives only: 100 / 40 / 20 / 10 / 1 | `Trig_Very_Easy` … `Trig_Perfection` |
| Start | 60 gold and 1 lumber each | `Trig_Int_WinTD_Func013002/014002` |
| Income | Kill bounty to the killer; an end-of-Wave bonus that the script seems never to pay (§6) | `w3u` bounty fields, `Trig_Gold_and_Tips` |
| Interest | None. No trigger touches it | `war3map.j` |
| Lumber | Buys Races (and, per the tips, one Laser Cannon): 1 at the start, 1 more promised at Wave 15 (§6) | `Trig_Int_WinTD`, tips 9 and 20 |
| Sell | About 75% of the price, at any time, even mid-Wave | `Trig_Sell_Actions`, `w3u upoi` |
| Block | Not prevented. Blocked creeps attack towers, then walk straight to the exit | tips 1 and 4, `Trig_Prevent_Attack_Actions` |
| Juggling | Not prevented | no anti-juggle code in `war3map.j` |

## 3. Map, spawns and Checkpoints

**Layout.** Nine player areas sit in a 3 × 3 grid. Red, Blue and Teal are on top; Orange, Yellow and Purple are in the middle band; Green, Gray and Pink are at the bottom, with Gray in the centre (`war3mapUnits.doo` start locations). Gray is the "last defender" (`Trig_Gold_and_Tips_Actions`). Each area is a walled, buildable field, and ground creeps walk *through* it. There is no separate lane: the field is the lane, so you maze on the creep path. The top fields are 10 towers wide and about 23 tall (`war3map.wpm`, 128-unit cells).

Map rendered from `war3map.wpm` with one character per 384 units (3 × 3 towers). Land that no spawn can reach is drawn as wall.

```
####,SS,######S,S#######,SS,####    .  buildable; creeps walk here
####,,,,######,,,#######,,,,####    ,  walkable, no building (pens, necks)
####,..,######...#######,..,####    #  wall or unreachable
####....######...#######....####    S  top spawns (the original three places)
####....######...#######....####    s  spawns added in X13
####....######...#######....####    M  centre Checkpoint
####....######...#######....####    1  middle-band side Checkpoint
####....######...#######....####    2  bottom-corner Checkpoint
####....#######.########....####    3  bottom-centre Checkpoint (left, right)
#####,,#####s,...,s######,,#####    E  exit (the ship)
#####,,#######...########,,#####
####....,,...#...#....,,....####
##.s....,..............,..1.s,##
##...1..,......M.......,......##
##.,#..##################..#####
####...,##,,,s,#s,,,,###....####
####....#,,##########,##....####
####....,,############,,....####
####..####....###.3..#####..####
####...........3..#.........####
####..............#.........####
####..2....###...##......2..####
##############...###############
##############...###############
##############...###############
##############,E,###############
```

**Spawns.** Each Wave appears all at once, `Monster_Amount` creeps at each of 15 spawn regions. Two regions sit side by side at each top place and at the orange, purple, yellow and bottom-centre pens, and one more is at the bottom-centre Checkpoint (`Trig_Core_Funtion_Actions`). That last group joins no route, so its creeps seem to wait there to be killed **[my reading]**. One yellow region gets only 1 creep, which looks like a bug. Spawns fire even for empty player slots. A full house therefore meets about 281 creeps on a normal Wave. X10 had 9 spawn locations ([wc3maps](https://wc3maps.com/map/96/Wintermaul_TD_X10_Final)), and v1.1 had only the three top ones (`wts 59`).

**Checkpoints.** Each creep joins a route group (left, middle-left, middle-right, right, bottom-left, bottom-right) and gets a `move` order to the centre of its next region. Entering that region issues the next order (`Trig_Left_0` … `Trig_Right_4`, `Trig_Middle`). An older guide describes them as marked circles a creep must reach before it moves on ([gaming-tools](https://gaming-tools.com/warcraft-3/wintermaul/)).

| Group | Checkpoints, in order |
|---|---|
| Top-left (and top-right, mirrored) | bottom corner `2` → bottom centre `3` → exit |
| Top-centre (each half goes to its own side) | centre `M` → middle-band side `1` → `2` → `3` → exit |
| Orange, Purple, bottom-centre pens (X13+) | a bottom-band region → `2` → `3` → exit |

The left and right routes stay separate until the exit. Air creeps get the same orders, so they fly in straight lines from Checkpoint to Checkpoint over every maze.

**Leak.** A creep that enters the exit region is removed and costs 1 life (`Trig_Unit_Board_Ship_Actions`). Nothing loops: a leaked creep never walks the route again. Up the route, though, whatever one area fails to kill walks on into the next, and kills pay the killer. That is why the tips say to build *behind* a leaking player, not in front of them (tip 12). In **Wintermaul One** each player has a lane, and a leak costs that player a life and then moves into the next player's lane, round the circle from player 0 to 8 ([ENT](https://entgaming.net/forum/viewtopic.php?t=84095)).

## 4. Waves

Counts are per spawn region. "·" means the base unit's default.

| W | Kind | Count | HP | Armor | Speed | Bounty | | W | Kind | Count | HP | Armor | Speed | Bounty |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ground | 20 | 19 | · | 200 | 1 | | 16 | ground | 20 | 1,300 | 14 | 370 | 3 |
| 2 | ground | 20 | 60 | · | 230 | 1 | | 17 | ground (tip 6 warns of it) | 20 | 1,525 | 10 | 360 | 3 |
| 3 | ground | 20 | 113 | 2 | 260 | 1 | | 18 | ground | 20 | 2,125 | 10 | 360 | 3 |
| 4 | ground | 20 | 160 | · | · | 1 | | 19 | ground | 20 | 2,500 | 15 | 380 | 4 |
| 5 | **air** | 15 | 110 | · | · | 2 | | 20 | ground | 20 | 2,875 | 15 | 400 | 4 |
| 6 | ground, light | 20 | 265 | 3 | 280 | 2 | | 21 | ground, light | 20 | 3,125 | 16 | 350 | 4 |
| 7 | ground | 20 | 325 | 4 | 280 | 2–4 | | 22 | ground | 20 | 3,625 | 17 | 375 | 4 |
| 8 | ground | 20 | 375 | 5 | 300 | 2–4 | | 23 | **air** | 15 | 3,000 | 20 | 400 | · |
| 9 | ground | 20 | 400 | 7 | 320 | 2 | | 24 | ground | 20 | 4,250 | 18 | 385 | · |
| 10 | hover, fortified | 20 | 450 | 7 | 315 | 2 | | 25 | ground | 20 | 5,000 | 18 | 400 | 4 |
| 11 | ground | 20 | 625 | 8 | 300 | 2 | | 26 | ground | 20 | 5,625 | 19 | 400 | 4 |
| 12 | ground | 20 | 782 | 10 | 375 | 2 | | 27 | **air** | 15 | 5,250 | 19 | 425 | 4 |
| 13 | ground, light | 20 | 900 | 10 | · | 2 | | 28 | ground | 20 | 7,500 | 20 | 400 | 4 |
| 14 | **air** | 15 | 825 | 12 | 375 | 3 | | 29 | ground | 20 | 8,200 | 20 | 400 | 4 |
| 15 | ground | 20 | 1,375 | 12 | 350 | 3 | | 30 | **boss** | 1 | 70,000 | 15 | 400 | 100–190 |

Source: `Trig_Set_Levels_Actions` for types and counts, and `war3map.w3u` (`uhpm`, `udef`, `umvs`, `udty`, `ubba`/`ubdi`/`ubsi`) for stats. Bounty is base + dice × sides, so Wave 7 is 2d2 and the boss is 90 + 10d10.

- **Shape.** HP rises about ×430 over Waves 1–29: steep early (×3 from Wave 1 to 2), then roughly +10–15% a Wave late. Speed climbs from 200 to about 425. Air Waves carry 75% of the count and less HP than the ground Waves either side of them.
- **Boss.** Wave 30 sends one boss from every spawn region. Every %-HP and instant-kill tower effect checks `Level_Number != 30`, so none of them work on the boss (`Trig_Thunder_Rod`, `Trig_Void`, `Trig_Paralyzer`, `Trig_Mind_Blaster`, `Trig_Water_Sprayer`).
- **Bonus Waves.** After Wave 30, creeps that reach the exit are removed without cost (`Trig_Bonus_Load`). Victory fires when the Wave counter reaches 50 with lives left (`Trig_Victory`), so the Run is really won by surviving Wave 30.
- **Preview.** Each Wave is announced by name as it spawns; there is no preview. Wintermaul One Revamped added `-air` and `-boss` commands that list those Waves ([Hive](https://www.hiveworkshop.com/threads/wintermaul-one-revamped-v4b.212876/)). A blog says Wintermaul One Revamped has 40 levels with many air and boss levels ([blog](http://my-wowblog.blogspot.com/2012/12/warcraft-3-maps-wintermaul.html)) **[unverified, weak source]**.

## 5. Building, Blocks and Juggling

- **Footprint.** Towers are WC3 buildings, mostly 4 × 4 pathing cells (128 × 128 units, one 2 × 2 tower in our terms). A few large ones are 8 × 8 (`w3u upat`; the rest use the base towers' defaults **[assumed]**). Creeps have collision 0, so they never block each other (`w3u ucol`).
- **Zones.** Nothing enforces build areas in X14. Only a tip asks players to stay out of each other's areas (tip 11), and kill stealing was the big social problem. Wintermaul One added `-destroy`, which removes allied towers from your lane ([ENT](https://entgaming.net/forum/viewtopic.php?t=84095)).
- **Block, X14.** No trigger checks a placement. The tips warn that a full wall makes creeps take another way or attack the towers, and that creeps need at least one open square (tips 1 and 4). When a creep attacks a tower, `Trig_Prevent_Attack_Actions` waits 1 s and orders it straight to the exit, so it skips any Checkpoints it has left.
- **Block, Revamped (2012).** An anti-block cancels the construction and refunds it. It chains each new tower to every tower within one square and flags a Block when the chain touches both edges of your area. Creep attacks were then removed because the anti-block made them pointless ([video](https://www.youtube.com/watch?v=sM7nVXK8mw8), [Hive](https://www.hiveworkshop.com/threads/wintermaul-one-revamped-v4b.212876/)). Wintermaul One 12.4 added regions to unstick creeps, and Revamped added a `-move` command per lane ([W3Reforged](https://maps.w3reforged.com/maps/categories/maul/wintermaul-one)).
- **Juggling, X14.** Allowed by omission. You can sell mid-Wave for about 75% back, and the creeps re-path the moment a wall opens or closes. A juggle therefore costs about 25% of the wall tower plus its build time. Juggling itself is described on [Wikipedia](https://en.wikipedia.org/wiki/Tower_defense).
- **Juggling, Revamped.** Selling while creeps are in your area leaves a dummy tower in its place. The dummy counts for the Block check, so rebuilding to flip the exit is refused ([video](https://www.youtube.com/watch?v=Thea1a-lLQo)).

## 6. Races, towers and economy

**Picking a Race.** Each player gets an invulnerable "chooser" unit. Spending 1 lumber builds a Race building, which trains that Race's builder (`w3u eC00 ubui`, `wts 59`). The second lumber, promised at Wave 15 (but see Economy below), buys a second Race or one 750-gold Laser Cannon. Only the bottom three positions may build that cannon (tips 17–20; `InitTechTree` caps `hC63` at 0 for players 1–6). In X14's object data no builder lists the cannon any more.

**Towers.** Each Race has 5–6 regular towers, and most also list one 1,500-gold top unit. Every tower is a separate build, and no unit has an "upgrades to" entry (`w3u uupt` is empty everywhere). You grow by selling cheap towers and building dearer ones in their place, as the strategy texts advise (`wts 701`). A Race's opener costs 7–20 gold and its best regular tower 310–700. Nearly every tower hits both air and ground. I found no air-only towers and only three ground-only primary attacks (`w3u ua1g`).

| Race (map's name) | Role in X14 | Signature effect (`war3map.j` trigger) |
|---|---|---|
| Fire | Splash damage at the front of the route | A very fast late single-target tower |
| Ice | Slows on hit, splash; a strong maze builder | A tower that freezes one target for 3 s (`Trig_Water_Sprayer`) |
| Electricity | Fast, low damage, chain lightning | Removes 25% of current HP from every creep within 400 units (`Trig_Thunder_Rod`) |
| Stone | Short range, high damage, critical hits | Sets a creep's HP to 11 (`Trig_Paralyzer`) |
| Tech | Very long range (800–8,000), long cooldowns; best at the back | +500 damage to creeps above 500 HP (`Trig_Ion_Cannon_Center`) |
| Crystal | Chaos damage, expensive, strongest late | A slow + poison splash tower |
| Earth | Big splash; best at the top | — |
| Gravity | Slows and %-HP damage | −550 HP to every creep within 400 (`Trig_Black_Hole`); −30% of current HP (`Trig_Mind_Blaster`) |
| Demonic | Chaos damage, huge range and splash | — |
| Heaven | Average stats | Halves the speed of every creep within 400, permanently, until it drops below 200 (`Trig_Gate_Keeper`) |
| Space | Special effects | Kills every creep within 200 every 5 s (`Trig_Void`); halves speed within 300 |
| Poison (before X13) | Slows and damage over time; one tower halves HP | Still has triggers and a strategy text (`wts 699`), but is not in X14's chooser |

The roles are paraphrased from the in-map strategy texts (`wts 694`–`702`) and the attack fields. The radii are half of the trigger's square side. The map also assigned roles by position: splash at the top, long range at the bottom, Electricity's %-HP tower at the start of a maze. Wintermaul One Revolution lists 49 Races ([wintermaul.one](https://wintermaul.one/)). StefanJonsson96 says Wintermaul One Races have 4–6 towers each with upgrade chains **[unverified]**.

**Economy.**

- **Start.** 60 gold, which is X13's doubled amount (`wts 94`), so the original was probably 30 **[inferred]**. That buys 6 openers.
- **Bounty.** Paid to the killing player only (WC3 bounty from player 12, `Trig_Int_WinTD`). It is 1 gold a creep on Waves 1–4, 2 by Wave 5, 3 by Wave 14 and 4 by Wave 19 (§4). A leaderboard ranks players by kills (`Trig_Update_Leaderboard`).
- **End-of-Wave bonus.** `udg_Gold_Amount` starts at 10 and grows by 2 each time a Wave is queued, so clearing Wave *n* would pay 12 + 2*n*, with half of it again for Gray (`Trig_Next_Level_Actions`). The trigger that pays it (`Trig_Gold_and_Tips`) also hands out the Wave 15 lumber. But its condition requires the whole map to hold no units at all, which never happens while builders stand. As written, the bonus and the lumber never arrive **[my reading, not tested in game]**. The tips promise both, so earlier versions most likely paid them.
- **No interest, no passive income.** Gold can be pooled to another player through WC3's ally menu (tip 19).
- **Sell.** The refund is the tower's point value, usually 75% of the price (40 of the 70 priced units; the 10-gold openers give 7). A few outliers look like data errors: one gives 6%, one 109% (`w3u upoi`).

## 7. Lives and Difficulty

- **Lives.** 20 base. Player 1 picks within 30 s; otherwise Normal applies (`Trig_IntDifficulty_Actions`, `wts 518`): Very Easy +80 (100), Easy +20 (40), Normal 20, Hard −10 (10), Perfection −19 (1). Difficulty touches nothing else. Lives are shared by the team.
- **Leak cost.** 1 per creep on Waves 1–30. The Wave 30 boss leaking defeats everyone at once. Bonus Waves cost nothing. Revamped defaults to 50 lives and makes the boss leak cost 5. Its Difficulty is a percentage: Impossible went from 350% to 300% ([Hive](https://www.hiveworkshop.com/threads/wintermaul-one-revamped-v4b.212876/)).

## 8. Licence, and names we must not use

- **No licence anywhere.** The X14 mirror repo has none (`gh api repos/RodinSevar/towerdefence` → `license: null`), and nor does any listing above. Epic War's Wintermaul One 10.0 download is named "…Protect.w3x" ([Epic War](https://www.epicwar.com/maps/214877/)). Revamped's author says Wintermaul One was never protected and that he edited it without permission ([Hive](https://www.hiveworkshop.com/threads/wintermaul-one-revamped-v4b.212876/)). Being unprotected is not a licence. **We port rules only, never text, names, art, models or sounds.** Numbers are facts, but Maul uses its own numbers anyway.
- **The map's own names, to avoid:** Wintermaul, Duke Wintermaul, Forces of Northrend, the ship and "boarding", Element Chooser, and the Race buildings (Crystal Castle, Earth Gate, Stone Sanctuary, Power Plant, Tech Center, Forge of Fire, Ice Freezer, Gravity Generator, Demonic Empire, Heaven Portal, Space Station). Also every tower name, for example Thunder Rod, Gate Keeper, Black Hole, The Void, Laser Cannon, Ion Cannon Center, Paralyzer, Water Sprayer, Nova Creator, Battery, Sparkler, Meteor Watcher, Blast Furnace, Flame Staff, Snowball Launcher, Blizzard Master, Pebble Tower, Rock Blaster, Faerie Mage, Storm Caller, Chain Lightning Caster, Sniper Post, Nuclear Missile Silo, Cruise Missile Launcher, Crystal Dissolver, Pulsar, Insane Gravity, Gaia's Box, Archangel, Dragon's Lair. Every creep name too. Plain element words like fire, frost and poison are generic, but don't use the map's line-up of 11 as-is.

## 9. Corrections to earlier notes

| Earlier note | The source says |
|---|---|
| [wc3-td-maps.md](wc3-td-maps.md): blocking punished, creeps attack the sealing tower **[unverified]** | True in X14 (tips 1 and 4), and an attacking creep is then sent straight to the exit. Later versions refuse the build |
| [wc3-td-maps.md](wc3-td-maps.md): Wintermaul economy is "kill bounty" | Kill bounty plus an intended end-of-Wave bonus of 12 + 2*n*; no interest |
| [td-design-and-balance.md §7](td-design-and-balance.md): exact Wintermaul rules **[unverified]** | §2–§7 above. Positions were unequal by design: top areas see fresh creeps, bottom areas inherit leaks, and Gray got +50% bonus |

## 10. What Maul takes

**Keep (faithful rules):**

1. **Open-field mazing on the creep path.** The field is the lane. Ground creeps take the shortest path to their *next* Checkpoint, in a fixed order, and then to the exit. 2 × 2 towers on our grid; creeps never block each other.
2. **A route that funnels through several areas.** Spawns at the top, side Checkpoints, then a shared bottom-centre Checkpoint and the exit at the bottom.
3. **Whole Wave at once, no overlap.** The Break starts only when the last creep is dead or leaked (60 s before Wave 1, 30 s after). This is Element's Break, not the Original's.
4. **Air Waves** fly straight from Checkpoint to Checkpoint, carry about 75% of the count and less HP, and come at uneven gaps (X14: 5, 14, 23, 27). Nearly every tower can hit air; that is the classic answer, not air-only towers.
5. **A boss that ends the Run if it leaks.** %-HP and instant-kill effects don't work on it.
6. **Leak = −1 life, creep removed, no loop.** 20 lives on Normal.
7. **Races bought with lumber:** one at the start and a second at Wave 15. Each Race is a set of towers with one clear role: splash, slow, chain, crit, long range, %-HP, speed aura.
8. **Economy:** kill bounty plus a growing end-of-Wave bonus, *no interest*, about 75% sell refund at any time.
9. **Juggling allowed.** It costs the sell loss plus build time. **Blocks rejected** with the reason shown, as Revamped and every Tavern TD Game Mode do.

**Change (solo on phone and Mac):**

- **1 player instead of 9; 2 spawns instead of 15 regions.** One Map with left and right routes that merge at a bottom-centre Checkpoint, per [PLAN](../PLAN.md) Phase 4. Drop the position roles, kill stealing, gold pooling, the last-defender bonus and position-locked towers.
- **Our own numbers** from [td-design-and-balance.md §9](td-design-and-balance.md), but **without interest**, to stay faithful. Pay the bonus for real; X14 seems not to.
- **Difficulty scales creep HP** (CONTEXT), not lives. Keep 20 lives at every Difficulty. X14 changed only lives.
- **Waves: 40, as PLAN says.** That follows the Wintermaul One line most players remember, rather than X14's 30 + joke Waves. Put a boss at 10, 20, 30 and 40; only the last ends the Run, and the others cost 5 lives, as in Revamped. Telegraph the air Waves with a preview, which X14 never had.
- **Upgrades:** X14 has none; you sell and rebuild. PLAN's branching upgrades are our change. Keep the 75% mid-Wave sell anyway, because juggling depends on it.
- **Leftovers from 9-player play:** skip the bonus Waves after the last Wave, chat commands, kick triggers and the build-anywhere rule. Our build area is the whole field.

**Open questions:** whether X14 really pays no end-of-Wave bonus (test the map in WC3), and the exact original v1.1 numbers (needs the RoC `.w3m` from [Epic War](https://www.epicwar.com/maps/78651/)).
