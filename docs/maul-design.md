# Maul: design

Maul is the Game Mode that recreates Wintermaul: pick a Race, then maze an open field with its towers while Waves walk through it. It keeps Wintermaul's rules ([maul-rules.md](research/maul-rules.md)) and uses our own names, numbers, text and shapes. Words follow [CONTEXT.md](../CONTEXT.md).

Every number starts from the baseline in [PLAN §4](PLAN.md#4-balance-method) and [td-design-and-balance.md §9](research/td-design-and-balance.md). The headless bot tunes them (§12), and anything the sources leave open is marked *assumed*.

**Taste calls, made on 2026-10-18 and open to change after the play-test:**
- **One field for both gates.** Two gates feed their own approaches, then meet at the Ford and share the lower field (§3). Two separate lanes, as Wintermaul's nine players had, made a solo player build two mazes, and the bot lost both by Wave 2.
- **Waves never overlap**, as in Wintermaul. The Break starts once a Wave is cleared, so juggling one Wave forever only costs you time.
- **Interest stays**, although Wintermaul had none. PLAN §4 and the Phase 4 brief ask for it, and it is a solo Run's only greed lever, since Send now pays nothing.
- **Upgrades, not sell-and-rebuild.** Wintermaul had none; PLAN asks for branching upgrades. Each Race's Wall can become either line's Tier 1, and each line forks at Tier 3.
- **A second Race joins after Wave 15**, as Wintermaul's second lumber did.
- **Nothing hits only air.** Wintermaul had no air-only towers; only two of our lines can't hit air.

## 1. At a glance

| Topic | Design |
|---|---|
| Shape | One Run of 40 Waves on one Map, about 35–45 min at 1× |
| Map | The Crossing: two gates in the top corners, a Ford, two Posts and an exit (§3). Towers go anywhere on open ground and are the maze |
| Races | 4, each with a Wall and two lines of towers: 9 towers a Race, 36 in all (§5) |
| Towers | 2 × 2. Wall → line Tier 1 → Tier 2 → one of two Tier 3 forks |
| Mazing | Juggling allowed; Blocks refused (§4) |
| Waves | 40. Air Waves 5, 14, 23, 27, 34 and 38. A boss from each gate on Waves 10, 20, 30 and 40 (§7) |
| Lives | 20. A leak costs 1, 2 for a Brute or Golem, 5 for a boss; the Wave 40 boss leaking ends the Run |
| Economy | 300 gold to start, a bounty pool per Wave, an end-of-Wave bonus, 4% interest capped at the bonus, 75% sells (§8) |
| Pace | 60 s before Wave 1, 30 s Breaks after each clear; Send now ends a Break and pays nothing |
| Difficulty | Creep HP × 0.75 / 1 / 1.3 / 1.6; lives stay 20 |
| Left out | Wintermaul's 9 players and their position roles, kill stealing, gold pooling, the joke Waves after the last, creeps that attack a Block, %-HP and instant-kill towers |

## 2. What is Wintermaul's, and what is ours

**Wintermaul's rules (kept):**
1. The field is the lane. Ground creeps take the shortest open path to their next Checkpoint, in a fixed order, then to the exit, and they never block each other.
2. Several gates whose streams funnel through Checkpoints to one exit at the bottom.
3. A whole Wave at a time. The next one comes a while after the last is dead or leaked.
4. Air Waves fly straight from Checkpoint to Checkpoint over every maze, at uneven gaps, with fewer creeps and less HP.
5. A last boss whose leak ends the Run; the earlier bosses cost 5 lives, as in Wintermaul One Revamped.
6. A leaked creep costs a life and is removed. It never loops.
7. Races: you pick one at the start, a second later, and each is one clear role.
8. Kill bounty plus an end-of-Wave bonus, and about 75% back on a sale at any time.
9. Juggling is allowed: sell and build mid-Wave, and creeps re-path at once.

**Ours:**
- 1 player and 2 gates instead of 9 players and 15 spawn regions.
- Blocks are refused with the reason shown, as Wintermaul One Revamped and every Tavern TD Game Mode do.
- 40 Waves (Wintermaul One Revolution's count) instead of X14's 30, with a boss every 10th.
- Branching upgrades, interest, and a wave preview that warns of air Waves.
- Difficulty scales creep HP (CONTEXT), where X14 changed only lives.
- Our numbers, names, text and shapes throughout. None of Wintermaul's Race, tower or creep names are used ([maul-rules.md §8](research/maul-rules.md#8-licence-and-names-we-must-not-use)).

## 3. The Map: the Crossing

48 × 32 cells of 64 units, landscape. `.` is open ground, `,` walkable but never buildable, `#` rock.

```
##,,,,,,################################,,,,,,##   gates: the pens in the top corners
#....................######....................#
#....................######....................#   west approach | ridge | east approach
#....................######....................#
#....................######....................#
#....................######....................#
#....................######....................#
#....................######....................#
#....................######....................#
#....................######....................#
#....................######....................#
#.....................,,,,.....................#   1  the Ford, below the ridge
#.....................,,,,.....................#
#..............................................#
#..............................................#   the lower field, 46 × 16
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#..............................................#
#,,..........................................,,#   2  West Post (left)   3  East Post (right)
#,,..........................................,,#
######################,,,,######################
######################,,,,######################   the exit neck, bottom centre
```

- **Gates.** West and east, each in a pen in its top corner. Each Wave sends its creeps from both, the east half a second behind (*assumed*), so the streams don't march in step.
- **Approaches.** Each gate's approach is 20 cells wide, Wintermaul's 10 towers, with a ridge between them. Only that gate's creeps cross it.
- **Checkpoints in order:** the Ford (1), where the streams meet; the West Post (2); the East Post (3); then the exit. Every creep crosses the lower field three times: down to the West Post, along the south edge to the East Post, and back to the exit in the middle. That is Wintermaul's centre → corner → bottom-centre funnel, for one player.
- **Air.** Flyers go straight from their gate to the Ford, then Post to Post to the exit. The board draws both air lines.
- **The engine** (done in this phase): a mazing Map may list several spawns, each Wave group names the one it leaves from, and the Block check keeps every spawn connected. A Checkpoint may also stand in several places, and a creep makes for the nearest; the Crossing doesn't use that yet.

## 4. Building, Blocks and Juggling

- **Anywhere on open ground**, any time, mid-Wave included. A tower covers 2 × 2 cells and snaps to the 64-unit grid, so towers can sit half a tower apart, as WC3 buildings did.
- **Refused:** off the Map; on `,` or `#`; over another tower; on a ground creep; and any **Block**, meaning a build that would leave a gate, a Checkpoint or a live creep without a path. The Ghost turns red and says why. Flyers don't count.
- **Juggling is allowed.** A build or a sale re-paths every creep at once. When it turns creeps around (their next step now points away from where they were heading), the sim reports a juggle with how many turned. The HUD flashes it and keeps a count for the Run.
- **Sells:** 75% of everything the tower cost, rounded down. Gold spent during the current Break comes back in full until the next Wave starts, so a mis-tap is free to undo. So a juggle mid-Wave always costs something: 3 of a Wall's 10 gold, about Wintermaul's quarter.
- **Upgrades** happen in place and never change the maze.

## 5. Races and towers

Each Race has a **Wall**, a cheap 10-gold block with a weak attack, like Wintermaul's openers, and two lines. A Wall upgrades into either line's Tier 1. Once a second Race joins, it can become that Race's Tier 1 towers too. Tier 1 upgrades to Tier 2, and Tier 2 forks into one of two Tier 3 towers. Building a line's Tier 1 from nothing costs the Wall plus the step.

Prices follow §9 of the balance notes: Tier 1 at about 0.10 DPS a gold, each Tier about 5% less, splash about half that per target, and slows or range paid for out of damage.

| Race | Line A | Line B | Weak spot |
|---|---|---|---|
| **Ironclad**: physical and siege | Ballista: Pierce bolts at ground and air → Skypiercer (very long range) or Repeater (3 targets) | Mortar: Siege splash, ground only → Thunder Mortar (stuns) or Bombard (huge range, the boss and Golem answer) | Air must fall to line A; Pierce is poor on Golems |
| **Rimeborn**: frost and slow | Frost Spire: Frost bolts that slow → Glacier Spike (heavy, crits) or Hailcaller (4 targets) | Chill Totem: slows everything near it → Blizzard Totem (deepest chill, splash) or Shatter Totem (−5 armor) | Wraiths ignore slows; low damage early |
| **Mirefolk**: poison over time | Dart Tower: Pierce darts with venom → Asp Spire (bosses) or Spitter (4 targets) | Spore Pod: spores poison every ground creep where they burst → Blight Pod (−4 armor) or Rot Bloom (a rotting aura) | One tower's venom sits on one creep at a time, so swarms need spores or a Spitter; spores can't hit air |
| **Runecasters**: arcane and splash | Spark Rune: Magic bolts → Chain Rune (jumps 4 times) or Void Rune (Chaos) | Glyph: Magic splash at ground and air → Nova Circle (widest) or Ley Shrine (+25% damage, +15% attack speed to towers near it) | Magic is poor on Golems until Void Rune |

All slows share one key, so only the strongest counts on a creep. Each Dart tower's venom ticks on its own: venom from many towers stacks, but one tower's never stacks with itself. Spores and rot each tick once on a creep beside it. Poison skips the damage table and armor.

Every tower, as built. DPS is against armor it takes full damage from, before splash, extra targets or poison.

### Ironclad

| Tower | Tier | Price | Total | Hits | Damage | Every | DPS | Range | Targets | Also |
|---|---|---|---|---|---|---|---|---|---|---|
| Bulwark | Wall | 10 | 10 | pierce | 1–2 | 2 s | 0.8 | 320 | both |  |
| Ballista | 1 | 40 | 50 | pierce | 6–8 | 1.4 s | 5.0 | 420 | both |  |
| Heavy Ballista | 2 | 85 | 135 | pierce | 17–21 | 1.5 s | 12.7 | 450 | both |  |
| Skypiercer | 3 | 200 | 335 | pierce | 48–54 | 1.5 s | 34.0 | 720 | both |  |
| Repeater | 3 | 200 | 335 | pierce | 18–22 | 1.2 s | 16.7 | 450 | both | 3 targets |
| Mortar | 1 | 50 | 60 | siege | 7–9 | 2.5 s | 3.2 | 480 | ground | splash 80/150 |
| Siege Mortar | 2 | 100 | 160 | siege | 20–24 | 2.5 s | 8.8 | 520 | ground | splash 90/170 |
| Thunder Mortar | 3 | 220 | 380 | siege | 48–56 | 2.5 s | 20.8 | 520 | ground | splash 100/190; 25% stun 0.8 s |
| Bombard | 3 | 220 | 380 | siege | 70–80 | 3 s | 25.0 | 800 | ground | splash 70/120 |

### Rimeborn

| Tower | Tier | Price | Total | Hits | Damage | Every | DPS | Range | Targets | Also |
|---|---|---|---|---|---|---|---|---|---|---|
| Rime Wall | Wall | 10 | 10 | frost | 1–2 | 2 s | 0.8 | 320 | both |  |
| Frost Spire | 1 | 40 | 50 | frost | 6–8 | 1.5 s | 4.7 | 400 | both | slow 25% 2 s |
| Frost Lance | 2 | 90 | 140 | frost | 15–19 | 1.5 s | 11.3 | 430 | both | slow 35% 2 s |
| Glacier Spike | 3 | 210 | 350 | frost | 60–70 | 1.8 s | 36.1 | 480 | both | slow 45% 2.5 s; 20% ×2 |
| Hailcaller | 3 | 210 | 350 | frost | 16–20 | 1.4 s | 12.9 | 450 | both | 4 targets; slow 35% 2 s |
| Chill Totem | 1 | 50 | 60 | magic | 4–6 | 1.5 s | 3.3 | 300 | both | aura slow 20% r220 |
| Rime Totem | 2 | 100 | 160 | magic | 9–11 | 1.5 s | 6.7 | 320 | both | aura slow 30% r260 |
| Blizzard Totem | 3 | 220 | 380 | magic | 22–26 | 2 s | 12.0 | 340 | both | splash 90/160; aura slow 40% r300 |
| Shatter Totem | 3 | 220 | 380 | magic | 30–36 | 1.5 s | 22.0 | 340 | both | aura slow 30% r300; aura armor 5 r300 |

### Mirefolk

| Tower | Tier | Price | Total | Hits | Damage | Every | DPS | Range | Targets | Also |
|---|---|---|---|---|---|---|---|---|---|---|
| Bramble | Wall | 10 | 10 | pierce | 1–2 | 2 s | 0.8 | 320 | both |  |
| Dart Tower | 1 | 40 | 50 | pierce | 3–4 | 1.2 s | 2.9 | 400 | both | venom 3/s 4 s |
| Viper Tower | 2 | 90 | 140 | pierce | 8–10 | 1.2 s | 7.5 | 420 | both | venom 7/s 4 s |
| Asp Spire | 3 | 200 | 340 | pierce | 18–22 | 1.2 s | 16.7 | 450 | both | venom 18/s 5 s |
| Spitter | 3 | 200 | 340 | pierce | 6–8 | 1.2 s | 5.8 | 430 | both | 4 targets; venom 10/s 4 s |
| Spore Pod | 1 | 50 | 60 | chaos | 2–2 | 2 s | 1.0 | 420 | ground | spores 2.5/s 4 s r110 |
| Plague Pod | 2 | 100 | 160 | chaos | 4–4 | 2 s | 2.0 | 440 | ground | spores 6.5/s 5 s r130 |
| Blight Pod | 3 | 220 | 380 | chaos | 8–8 | 2 s | 4.0 | 460 | ground | spores 15/s 5 s r150, −4 armor |
| Rot Bloom | 3 | 220 | 380 | — | — | — | — | — | — | aura poison 16 r260 |

### Runecasters

| Tower | Tier | Price | Total | Hits | Damage | Every | DPS | Range | Targets | Also |
|---|---|---|---|---|---|---|---|---|---|---|
| Runestone | Wall | 10 | 10 | magic | 1–2 | 2 s | 0.8 | 320 | both |  |
| Spark Rune | 1 | 40 | 50 | magic | 9–11 | 2 s | 5.0 | 440 | both |  |
| Storm Rune | 2 | 90 | 140 | magic | 25–29 | 2 s | 13.5 | 460 | both |  |
| Chain Rune | 3 | 200 | 340 | magic | 50–56 | 2 s | 26.5 | 460 | both | chains ×4, −15% a jump |
| Void Rune | 3 | 200 | 340 | chaos | 64–72 | 2 s | 34.0 | 500 | both |  |
| Glyph | 1 | 50 | 60 | magic | 10–12 | 3 s | 3.7 | 400 | both | splash 90/160 |
| Sigil | 2 | 100 | 160 | magic | 26–30 | 3 s | 9.3 | 420 | both | splash 100/180 |
| Nova Circle | 3 | 220 | 380 | magic | 60–68 | 3 s | 21.3 | 440 | both | splash 120/220 |
| Ley Shrine | 3 | 220 | 380 | magic | 20–24 | 3 s | 7.3 | 400 | both | splash 90/160; aura damage 25% r300; aura attackSpeed 15% r300 |

## 6. Damage and armor

Each attack type has one armor it hits hardest, as WC3's table does, but the swings stay between 50% and 150%. Chaos and poison treat every armor alike. Numeric armor works as in WC3: A armor takes 0.06A / (1 + 0.06A) off a hit.

| Attack \ Armor | Light | Medium | Heavy | Fortified | Hero |
|---|---|---|---|---|---|
| Pierce | **150%** | 100% | 75% | 50% | 100% |
| Siege | 50% | 100% | 100% | **150%** | 100% |
| Frost | 100% | **150%** | 75% | 75% | 100% |
| Magic | 100% | 100% | **150%** | 50% | 100% |
| Chaos | 100% | 100% | 100% | 100% | 100% |
| Poison (over time) | skips the table and armor | | | | |

## 7. Creeps and Waves

A creep's HP is a multiple of a Raider's on that Wave, 8 × 1.12^(w−1), before Difficulty. Twenty Raiders, ten from each gate, are about §9's normal Wave early on. The curve climbs faster than §9's 1.10 because a growing maze multiplies every tower's time on target (§12). Creeps leave their gate a fraction of a second apart, because Wintermaul spawned a whole Wave at once.

| Creep | Kind | Armor | Speed | HP (Raiders) | Per gate | Lives | Notes |
|---|---|---|---|---|---|---|---|
| Raider | normal | Medium 0 | 230 | 1 | 10 | 1 | |
| Snowling | swarm | Light 0 | 250 | 0.4 | 20 | 1 | |
| Frost Wolf | fast | Light 0 | 360 | 0.7 | 10 | 1 | |
| Brute | tank | Heavy 2 | 200 | 2.5 | 5 | 2 | |
| Ice Golem | tank | Fortified 4 | 170 | 3 | 4 | 2 | |
| Troll | regen | Medium 1 | 220 | 1.4 | 8 | 1 | heals 2% of max HP a second |
| Wraith | unslowable | Medium 0 | 240 | 1.1 | 9 | 1 | slows don't touch it |
| Harpy | air | Light 0 | 260 | 0.6 | 8 | 1 | flies; 8 a gate is Wintermaul's 75% of a Wave |
| Tusked Warlord | boss (10) | Hero 3 | 170 | 10 | 1 | 5 | + 5 Raiders a gate behind it |
| War Mammoth | boss (20) | Hero 5 | 150 | 11 | 1 | 5 | + 3 Brutes a gate |
| Glacier Colossus | boss (30) | Hero 7 | 140 | 12 | 1 | 5 | + 2 Golems a gate |
| The Winter King | boss (40) | Hero 8 | 140 | 14 | 1 | the Run | + 4 Trolls a gate |

Bosses can't be slowed below half speed. A stun still holds them.

**The 40 Waves.** Each kind first comes alone, and air Waves come at Wintermaul's uneven gaps (its 5, 14, 23 and 27, then 34 and 38).

| Waves | |
|---|---|
| 1–10 | Raider, Raider, Snowling, Frost Wolf, **Harpy**, Raider, Brute, Snowling, Ice Golem, **Warlord** |
| 11–20 | Frost Wolf, Troll, Raider, **Harpy**, Brute, Wraith, Ice Golem, Snowling, Troll, **Mammoth** |
| 21–30 | Frost Wolf, Wraith, **Harpy**, Ice Golem, Raider, Brute, **Harpy**, Troll, Snowling, **Colossus** |
| 31–40 | Wraith, Frost Wolf, Brute, **Harpy**, Ice Golem, Troll, Snowling, **Harpy**, Wraith, **Winter King** |

**Telegraphing.** The wave preview shows the next three Waves with armor, HP and a one-line hint. An air Wave is tagged *Air*, the HUD warns during the Break before one, and the board brightens the air lines. Bosses are tagged *Boss*, and the last *Last boss*.

## 8. Economy and pace

| | Number |
|---|---|
| Start | 300 gold, 20 lives |
| Bounty pool | 20 × (1 + ⌊w/4⌋) per Wave, split by each creep's share of the Wave's HP, so every Difficulty earns the same. It pays whole gold as the shares add up. That is about a gold a creep early and four late, as Wintermaul paid. Twice §9's pool, because Walls are gold that adds almost no damage |
| End-of-Wave bonus | 20 + 4w, once the Wave is cleared |
| Interest | 4% of unspent gold, paid with the bonus and capped at it |
| Sells | 75%; gold spent during the current Break comes back in full |
| Breaks | 60 s before Wave 1, then 30 s after each clear. Send now ends a Break and pays nothing |
| Second Race | Once Wave 15 is cleared, one more Race can join for free |

## 9. Difficulty

Creep HP × 0.75 (Easy), 1 (Normal), 1.3 (Hard) or 1.6 (Insane), the core's default table. Lives, gold and the bounty pool don't change.

## 10. Score and Records

- **Score:** each kill scores its Wave's number, and a boss ten times that. Winning adds 100 per life left.
- **Records:** one board per Difficulty, kept on the device: best Wave reached, best score and fastest win (from Wave 1 to the last clear). Races share a board, because every Race faces the same Waves.

## 11. The screen

- **New Run** asks for the Race (four cards, each with its one-line role) and the Difficulty.
- **HUD:** gold, lives, Wave n/40, the Break countdown with Send now, interest due at the next clear, and the juggle count.
- **Build menu:** the Wall and each Race's two Tier 1 towers, each with its price. The Ghost is 2 × 2 and snaps to the half-tower grid. It shows its range and the live path preview from both gates, and turns red with the reason on a Block.
- **Tower panel:** the role, attack type, DPS and range; the upgrades (both forks at Tier 2); and Sell, with "full refund" while that holds.
- **Feedback:** "Juggle: n creeps turned" when a build or sale turns creeps around, the air warning, "a second Race can join" after Wave 15, and the boss tags.
- **Mac hotkeys:** Q W E build the Wall, line A and line B, and R T the second Race's lines. On a selected tower, Q W E R pick its upgrades in the panel's order and S sells. Space sends now.
- **How to play**, autosave every Wave and when the app is hidden, Continue, save codes and Records work as in every Game Mode.

## 12. Assumed, and tuned

- *Assumed:* the east gate's creeps trail the west's by 0.5 s. A boss's escort starts 2 s behind it. A tower snaps to the 64-unit grid. The juggle test counts a creep as turned when its next step points away from its last one.
- *Assumed:* the second Race comes free once Wave 15 is cleared, not at its start.
- *Assumed:* a Wall's weak attack is 1–2 every 2 s at 320 range, about 0.075 DPS a gold, hitting ground and air.
- *Tuned (2026-10-18), from §9, with the headless bot* (`tests/sim/maul/bot.ts`). It builds a three-Wall serpentine in the lower field, opens with four Tier 1 towers where the routes pass most, gives 35% of its gold to Walls and the rest to the upgrade with the most damage per gold where the creeps pass, alternates lines A and B, and sends each Wave once it has nothing to buy. It never juggles.
  - The bounty pool doubled to 20 × (1 + ⌊w/4⌋). With §9's pool the bot lost every Run by Wave 10, because a maze costs gold that adds no damage.
  - Start gold 200 → 300, and the Raider curve 12 × 1.10^(w−1) → 8 × 1.12^(w−1). A gentler start with a steeper climb was the one change that moved Insane and Normal toward PLAN §4's targets together.
  - Boss HP 16–24 → 10, 11, 12 and 14 Raiders.
  - Venom ticks per tower (it shared one key and couldn't stack, so Mirefolk lost every last boss), and Frost Spire and Chill Totem hit about 20% harder (Rimeborn died on Wave 4 on Hard).
  - Result on seed 1, which hardly varies by seed: Easy 4/4 won with all 20 lives; Normal 2/4 won (Rimeborn and Runecasters), the other two reach Wave 40 and lose to the Winter King; Hard 1/4; Insane 0/4, dying on Waves 7–12. PLAN §4 asks for ~95%, ~60% and under 10%.
  - Watch in play-testing: Runecasters is the strongest Race and Ironclad the weakest; the last boss decides most Normal Runs; a juggling player should find Normal easy.
