# Tower Defense Design and Balance: Research Notes

Researched October 2026. **[unverified]** marks claims I could not confirm from a primary source. bloonswiki.com, kingdomrushtd.fandom.com and liquipedia.net blocked fetching, so claims taken only from their search snippets are marked *(snippet)*.

The best source of real formulas is **YouTD 2** ([github.com/Praytic/youtd2](https://github.com/Praytic/youtd2)), an open-source port of the Warcraft III map *YouTD*. Its code comments say the constants come from the original JASS, and I read the code directly.

---

## 1. Creep HP scaling and how income keeps pace

**Curve families.** Each family behaves differently from wave to wave:

- **Linear** (`HP = a + b·w`) gets easier over time unless income is flat.
- **Polynomial** (`HP = a·w^k`) has a per-wave ratio of `(w/(w−1))^k`. That ratio is steep early and flattens later.
- **Exponential** (`HP = a·g^(w−1)`) keeps a constant ratio `g`. Common values are 1.08–1.15.

Total income piles up over the game: linear per-wave income gives quadratic total gold. So an exponential HP curve eventually overtakes any linear economy. That makes a natural "wall" for endless modes. In a fixed-length mode, you have to place that wall on purpose.

| Game | HP curve | How income is paired with it |
|---|---|---|
| **YouTD (WC3)** | A degree-6 polynomial in wave level × `(0.9 − 0.002·w)`. On Medium: w1 = 45, w10 = 647, w20 = 1,858, w40 = 8,202, w100 = 215k. Implied per-wave growth: ×2.09 at w2, ×1.15 at w10, ×1.07 at w40, ×1.04 at w100. Size multipliers: Mass 0.3, Normal 1.0, Air 1.0, Champion 1.75, Boss 6, Challenge-boss 12 ([wave.gd](https://github.com/Praytic/youtd2/blob/main/src/creeps/wave.gd), [creep_size.gd](https://github.com/Praytic/youtd2/blob/main/src/enums/creep_size.gd)) | End-of-wave "upkeep" of `20 + 2w`, plus interest of `min(5% of gold, 1000)`. Bounty is `goldMult × (floor(w/8)+1)`, where Normal = 2 and Mass = 1 ([player.gd](https://github.com/Praytic/youtd2/blob/main/src/player/player.gd), [creep.gd](https://github.com/Praytic/youtd2/blob/main/src/creeps/creep.gd)). From w1 to w40, HP rises ×182 while income per wave rises only ×4.5. Tower tiers, items and tower XP make up the gap. |
| **Element TD Survivor (WC3)** | HP formula not found **[unverified]** | Bounty = `Base^(Level−1)`, with Base from 1.0925 (Very Easy) to 1.1 (Very Hard). Interest is 2% of unspent gold every 15 s. The game has 60 waves ([Hive, ETD 4.3b](https://www.hiveworkshop.com/threads/element-td-survivor-4-3b.125024/)). Exponential bounty suggests an exponential HP curve. |
| **Bloons TD 6** | Round 1 is 20 RBE (20 red bloons) ([bloonswiki](https://www.bloonswiki.com/List_of_rounds_in_BTD6) *(snippet)*). From round 81, MOAB-class HP gains +2% per round through r100, then +5% (r101–124), +15% (r125+) and +35% (r152+). Speed gains +2% per round, with jumps to 1.6× at r101 and 3× at r151 ([Freeplay](https://www.bloonswiki.com/Freeplay), [Late Game](https://bloons.fandom.com/wiki/Late_Game_and_Freeplay_(BTD6)) *(snippets)*). Whether the +% compounds or adds is **[unverified]**. | Pays $1 per layer popped, so income tracks RBE automatically. End-of-round cash is $100 + round number ([Cash](https://www.bloonswiki.com/Cash) *(snippet)*). Late game is then deliberately cut off from income: cash per pop falls to 50% at r51, 20% at r61, 10% at r86, 5% at r101 and 2% at r121. |
| **Goal Defense (mobile)** | The basic creep has 75 HP, sized so one 20-DPS turret kills it within the 3–3.5 tiles of path it covers. On a 40-tile route, creep HP must be at least 10 per tile of path. | The basic turret costs 60. Early creeps pay 5–6 coins each. A full line of about 30 turrets costs about 1,800 over 20 waves ([Sidorina, Game Developer](https://www.gamedeveloper.com/design/balance-in-td-games)). |
| **Kingdom Rush** | The difficulty setting changes enemy HP ([KR wiki](https://kingdomrushtd.fandom.com/wiki/Kingdom_Rush) *(snippet)*). Exact values **[unverified]**. | Bounty per enemy plus a small early-call bonus (see §2). |

**Takeaway.** Two approaches recur. One ties income directly to HP (Bloons: cash per layer; ETD: exponential bounty) and then taxes income late. The other lets HP outgrow gold and closes the gap through rising tower efficiency or XP (YouTD). In a 40-wave game with linear income, `g ≈ 1.09–1.10` is about the most a fixed DPS-per-gold can absorb. My own model in §9 shows `g = 1.12` overwhelms linear income by about wave 25.

## 2. Economy

| Lever | Real-game values |
|---|---|
| **Starting gold** | YouTD 70 ([player.gd](https://github.com/Praytic/youtd2/blob/main/src/player/player.gd)). BTD6 $650 ([Cash](https://www.bloonswiki.com/Cash) *(snippet)*). ETD Survivor Easy mode: 500 gold + 6 lumber ([wc3maps](https://wc3maps.com/map/69421) *(snippet)*). |
| **Per-kill bounty** | YouTD `2 × (floor(w/8)+1)` for a normal creep. ETD `1.097^(L−1)` on Normal. BTD $1 per layer. Goal Defense 5–6 coins early. Legion TD 2 splits the wave-10 boss bounty into 125 gold for damage dealt and 25 for the kill, so leaking it at 1 HP still pays 124 ([LTD2 wiki](https://legiontd2.wiki.gg/wiki/Granddaddy) *(snippet)*). |
| **End-of-wave bonus** | YouTD `20 + 2w`. BTD `100 + round`. |
| **Interest** | ETD (original WC3): 2.0% of unspent gold every 15 s, raised by spending lumber ([Hive, ETD Final](https://www.hiveworkshop.com/threads/element-td-final.35698/)). The rate could be raised at most twice, later once in random mode ([eletd forum](https://forums.eletd.com/topic/271-element-td-how-things-work/), [ETD 4.3b](https://www.hiveworkshop.com/threads/element-td-survivor-4-3b.125024/)). YouTD: 5% per wave, capped at +1,000. Wintermaul interest **[unverified]**. Expert ETD players spent their first three lumber on interest and repeatedly built and sold towers to farm it ([eletd forum](https://forums.eletd.com/topic/2547-build-lists/) *(snippet)*). Interest rewards greed, so it needs a cap or a sell penalty. |
| **Lives and leaks** | Kingdom Rush: 20 lives. Enemies cost 1–6 lives. 3★ needs 18–20 lives left, 2★ needs 6–17, 1★ needs 1–5. Heroic and Iron modes give 1 life ([KR wiki: Lives](https://kingdomrushtd.fandom.com/wiki/Lives) *(snippet)*). BTD6: Easy 200, Medium 150, Hard 100, Impoppable 1 ([bloonswiki: Lives](https://www.bloonswiki.com/Lives) *(snippet)*). Ralle's WC3 guide: 25 lives ([Hive](https://www.hiveworkshop.com/forums/f278/ralles-tower-defence-guide-34870/)). YouTD charges `2.5% × sizeMult × (1 − damageFraction^5)` of portal HP per leak. A full-HP normal creep costs 5%, a boss 50%, and the final boss 100%. A nearly-dead leaker costs almost nothing ([creep.gd](https://github.com/Praytic/youtd2/blob/main/src/creeps/creep.gd)). In ETD, leaked creeps respawn at the start of the path ([ETD 4.3b](https://www.hiveworkshop.com/threads/element-td-survivor-4-3b.125024/)). |
| **Sell refund** | BTD6 70%; other Bloons games 80% ([Better Sell Deals](https://www.bloonswiki.com/Better_Sell_Deals) *(snippet)*). Kingdom Rush 1–3: 60%. KR4 and Vengeance: 70% ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2890854062)). KR mobile gives a full refund if you sell before the first wave *(snippet)*. ETD: 100% for basic towers, 75% for elemental towers. Ralle's guide suggests 75%. |
| **Upgrade cost curve** | KR1 Archer costs 70 → +110 → +160 → +230 (×1.57, ×1.45, ×1.44). Mage costs 100 → 160 → 240 → 300. Artillery costs 125 → 220 → 320 → 400 ([KR1 tower guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2812921847)). Each step costs about 1.4–1.6× the previous one. |
| **Early-wave call** | Kingdom Rush gives bonus gold and cuts spell cooldowns. Players describe the gold as small, around 20g ([Steam](https://steamcommunity.com/app/816340/discussions/0/1734342161871096889)). Upgrades in KR Vengeance and KR5 raise it by 80% *(snippet)*. The exact formula is **[unverified]**. Desktop TD and GemCraft award score for sending waves early ([killtenrats](https://www.killtenrats.com/2009/06/11/flash-variations-on-a-theme-tower-defense/) *(snippet)*). |

## 3. Tower roles and DPS-per-gold

**Concrete data: Kingdom Rush 1** (costs and DPS from the [KR1 tower guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2812921847); efficiency ratios are my own arithmetic):

| Tower | L1 cum. cost / DPS / DPS per g | L2 | L3 | L4 | Marginal DPS/g of each upgrade |
|---|---|---|---|---|---|
| Archer (physical, single) | 70 / 6.25 / **0.089** | 180 / 15 / 0.083 | 340 / 26 / 0.076 | 570 / 40 / 0.070 | 0.080 → 0.069 → 0.061 |
| Mage (magic, single) | 100 / 8.7 / **0.087** | 260 / 22 / 0.085 | 500 / 38 / 0.076 | 800 / 54 / 0.068 | 0.083 → 0.067 → 0.053 |
| Artillery (explosive splash) | 125 / 3.8 / **0.031** | 345 / 10 / 0.029 | 665 / 15 / 0.023 | 1065 / 21 / 0.020 | 0.028 → 0.016 → 0.016 |

What the KR data shows:

1. Base single-target efficiency is about **0.09 DPS per gold**.
2. Splash is priced at about **⅓ of single-target DPS per gold**, which implies designers count on roughly 3 targets per hit.
3. Each upgrade buys about 10–25% less DPS per gold than the tier before. In KR this is fine because build slots are fixed, so upgrades are the only way to add DPS to a slot. The scarce resource is space, not gold.
4. Level-4 branches add abilities priced separately (1,000–1,650 gold to max). Raw DPS per gold keeps falling, and utility is what you pay for.

**Normalizing.** Use Ian Schreiber's cost-curve method ([Game Balance Concepts L3](https://gamebalanceconcepts.wordpress.com/2010/07/21/level-3-transitive-mechanics-and-cost-curves/)):

- Convert every benefit (DPS, range, slow, splash targets) and every drawback into one currency, gold, so towers sit on the same curve.
- Price narrow or conditional benefits at a discount, not as a cost.
- When unsure, err toward underpowered. "An underpowered item is merely unused, but an overpowered one can dominate."

Alex Loughran's Excel TD workflow is a concrete version of this ([blog](https://alexloughran.wordpress.com/2014/09/13/tower-defense-proof-part-1-excel/)):

- DPS = damage × rate of fire.
- Time in range = area of influence ÷ creep speed. Shots per pass = `QUOTIENT(time, cooldown)`.
- A "Dmg vs Cost" column per tower.
- Creeps are grouped in threes at 100%, 75% and 50% damage to approximate shielding.
- This sheet caught a rocket turret doing about 4× the gun's damage at less than 2× the cost.

**Role checklist and how to price each** (the numbers are my proposals, anchored on KR):

| Role | Pricing rule |
|---|---|
| Single-target | Baseline, 1.0 |
| Splash/AoE | About 0.35–0.5× headline DPS per gold |
| Slow | Value = the extra time-in-range it gives every other tower. Do not let slows stack; the strongest slow applies (my proposal). |
| DoT/poison | Ignores armor in KR6 ([wikily](https://wikily.gg/kingdom-rush-6-genesis/damage-and-armor)), so price it below raw DPS |
| Chain | Headline DPS × decaying jump factor |
| Support/aura | Worth it only once it covers about 4+ towers |
| Anti-air | Can be 1.5× efficiency because it is useless against ground |

**Preventing a dominant tower:**

- Goal Defense's rule: no level should be winnable with only one or two turret types ([Sidorina](https://www.gamedeveloper.com/design/balance-in-td-games)).
- Ironhide recommends one tower from each class, because physical armor is countered by magic towers and magic resistance by ranged or artillery towers ([Ironhide support](https://support.ironhidegames.com/support/solutions/articles/4000223666-armor-types-breakdown-kingdom-rush-battles-guide)).

## 4. Damage type vs armor type

**Warcraft III: The Frozen Throne** (Blizzard's chart, mirrored at [classic.hiveworkshop.com](https://classic.hiveworkshop.com/war3/basics/armorandweapontypes.shtml)):

| Attack \ Armor | Light | Medium | Heavy | Fortified | Hero | Unarmored |
|---|---|---|---|---|---|---|
| Normal | 100% | 150% | 100% | 70% | 100% | 100% |
| Pierce | 200% | 75% | 100% | 35% | 50% | 150% |
| Siege | 100% | 50% | 100% | 150% | 50% | 150% |
| Magic | 125% | 75% | 200% | 35% | 50% | 100% |
| Chaos | 100% | 100% | 100% | 100% | 100% | 100% |
| Spells | 100% | 100% | 100% | 100% | 70% | 100% |
| Hero | 100% | 100% | 100% | 50% | 100% | 100% |

Notes on the table:

- [warcraft.wiki.gg](https://warcraft.wiki.gg/wiki/Warcraft_III_armor_and_attack_types) lists Pierce vs Heavy as **90%**, probably from a later patch **[unverified which]**.
- Divine armor takes 5% from every attack type except Chaos.
- Reign of Chaos used a different, rotated table.

**Armor formula** (same Blizzard page):

- Positive armor: `reduction = 0.06·A / (1 + 0.06·A)`. One armor gives about 5.7% reduction.
- Negative armor: `damage ×(2 − 0.94^(−A))`. −10 armor gives +46.1% damage.
- In effective HP, each armor point adds 6% of base HP, so effective HP = `HP·(1 + 0.06·A)` ([Liquipedia](https://liquipedia.net/warcraft/Armor) *(snippet)*).
- The 0.06 is the World Editor gameplay constant "Combat – Armor Damage Reduction Multiplier" ([Hive](https://hiveworkshop.com/threads/how-to-manipulate-armor-system-further.329086) *(snippet)*).

**How TDs used it:**

- **Element TD** uses a 6-element cycle. Each element deals 200% to one element, 50% to another and 100% to the rest. For example, Light does 200% to Darkness and 50% to Earth ([eletd forum](https://forums.eletd.com/topic/945-basics-of-element-td)).
- **YouTD** uses a balanced cycle (a Latin square). Each of Physical, Decay, Energy and Elemental deals 1.8 / 1.2 / 0.9 / 0.6 across the four regular armors, so every attack averages the same. Essence deals 1.0 to everything. Arcane deals 1.5 to the regular armors. The late armor "Sif" (from wave 32) takes 0.4 from everything except Essence ([attack_type.gd](https://github.com/Praytic/youtd2/blob/main/src/enums/attack_type.gd)).
- **Kingdom Rush 6** drops the matrix for percentage protection. Damage taken = `dmg × (1 − protection)`. Physical damage checks armor and magic damage checks magic resistance. Explosive and electric damage check half of armor. True and poison damage ignore both ([wikily](https://wikily.gg/kingdom-rush-6-genesis/damage-and-armor)).

For a single-player game, KR's two-axis model is easier to read than a 6×7 matrix. A balanced cycle like YouTD's is the safest choice if you want more than two damage types.

## 5. Wave archetypes and pacing

| Archetype | Real examples | Forces the player to use |
|---|---|---|
| Normal | Baseline | — |
| Fast | ETD: +25% speed (300→375), or a 1 s burst of +100% ([eletd](https://forums.eletd.com/topic/945-basics-of-element-td), [4.3b](https://www.hiveworkshop.com/threads/element-td-survivor-4-3b.125024/)) | Slows, longer maze |
| Swarm/mass | YouTD Mass: 0.3× HP, many creeps. LTD2 w3/w16: 18 creeps ([LTD2 Wave](https://legiontd2.wiki.gg/wiki/Wave)) | Splash |
| Tank/armored | YouTD Champion 1.75×. LTD2 w13 Drill Golem, 6 creeps | Armor-piercing or magic damage |
| Air (ignores maze) | DTD flying creeps "fly over the towers" ([Wikipedia](https://en.wikipedia.org/wiki/Desktop_Tower_Defense)). YouTD Air: 15% of waves, 1.0× HP, separate air path. LTD2 w4 and w17 | Anti-air coverage near the exit |
| Magic- or slow-immune | LTD2 magic-resistant w7/w14. DTD immune waves | Mixed damage types |
| Regenerating/healing | ETD healing creeps restore 20% of max HP in a 250 radius when they die | Burst damage, focus fire |
| Splitting/spawning | DTD spawner creeps. Bloons layers | Splash, damage spread along the path |
| Revive / invulnerable | ETD Undead revive at 33% HP after 5 s. ETD Mech gets 3 s of invulnerability every 12 s | Redundant DPS |
| Invisible | Bloons "camo" needs detection **[unverified, not fetched]** | Detection tower or aura |
| Boss | YouTD: a challenge boss (12× HP) every 8 waves and a challenge mass every 16. LTD2: bosses on waves 5/10/15/20/21. Gem TD port: 50 waves with 5 boss waves ([Windows Central](https://forums.windowscentral.com/threads/game-gem-td.198289/post-1718860), low trust). ETD: an elemental guardian every 5 levels | Concentrated single-target DPS |

**Length.** Real wave counts:

| Game | Waves |
|---|---|
| ETD | 60 |
| Gem TD | 50 |
| BTD6 | 40 / 60 / 80 / 100 by difficulty |
| Legion TD 2 | 21 |
| Goal Defense levels | 10–20 (20 waves takes 10–15 min at 1×) |

YouTD defines each difficulty by the wave where an average player gets overwhelmed: Beginner 50, Easy 40, Medium 30, Hard 20, Extreme 10 ([devlog](https://praytic.itch.io/youtd2/devlog/571081/august-2023-update-new-player-guide-creep-balance-game-difficulty-economy-tower-menu)).

## 6. Difficulty curve and tuning methodology

- **Targets.** I found no published target win rate for any TD **[unverified]**. The closest proxies are star or medal thresholds. In KR, 3★ means losing at most 10% of lives (2 of 20). Goal Defense's targets:
  - each level ends with the field 60–70% full, when the player runs out of resources;
  - the player needs a new purchase every 1–2 waves;
  - "sometimes doing nothing is correct."
- **Spreadsheet first** (Loughran and Schreiber, §3). Sidorina's wave-size check `(8 + N)·L ≥ 8N` comes from route length and spawn spacing.
- **Simulation.** Two tools fit TD economies:
  - Machinations diagrams model resource flow and can run before a prototype exists ([Dormans, AIIDE](https://ojs.aaai.org/index.php/AIIDE/article/view/12477)).
  - Micro-Machinations embeds those diagrams in game code; its paper uses a tower defense game to show live retuning ([van Rozen & Dormans 2014](https://research.hva.nl/en/publications/adapting-game-mechanics-with-micro-machinations/)).

  Academic work evolves waves or levels automatically: Avery, Togelius et al. ([IEEE CEC 2011, doi:10.1109/CEC.2011.5949738](https://doi.org/10.1109/CEC.2011.5949738)) and a 2025 genetic-algorithm wave-adaptation thesis ([ULisboa](https://repositorio.ulisboa.pt/entities/publication/4732bb5c-f8e8-4133-8ae4-49669bcf2b26/full)). In practice, write a headless sim with scripted bot builds (all-single-target, all-splash, a balanced build, a greedy-interest build). Fail the balance check if any single-type build beats the target wave.
- **Playtesting and onboarding.** George Fan's GDC 2012 talk on Plants vs. Zombies ([summary](https://notes.hamatti.org/Sources/Talks/How-I-got-my-mom-to-play-through-Plants-vs.-Zombies), [GDC](https://gdconf.com/news/gdc_2012_reveals_plants_vs_zom)) argues for:
  - adding mechanics slowly, roughly one new thing every 5 levels;
  - holding the money system back until level 10;
  - teaching through play rather than text.

  The TD version of this is to introduce each wave archetype once, alone, before it appears in mixes.
- **Avoiding dominant strategies.** Use counter-waves (air, immune, armored) and a balanced type cycle. Do not let slows stack. Cap interest. Make build space the scarce resource (KR's fixed slots, or the maze's own footprint).

## 7. Level and map design

- **Fixed path vs mazing.** Fixed paths with build slots (Kingdom Rush, Flash Element TD) give the designer exact control over exposure time. In mazing games (Desktop TD), "towers... determine the path" and creeps take the shortest route ([Wikipedia: TD](https://en.wikipedia.org/wiki/Tower_defense), [DTD](https://en.wikipedia.org/wiki/Desktop_Tower_Defense)). In Ralle's example, a maze forces 13 squares of travel where a straight line allows 6 ([Hive](https://www.hiveworkshop.com/forums/f278/ralles-tower-defence-guide-34870/)). With mazing, path length becomes something the player builds, so balance on **damage-seconds per gold**, not DPS per gold.
- **Never fully block.** DTD "does not allow the player to make an exit completely inaccessible." Run a BFS or A* path check before committing any placement. Air units ignore the maze, so they are the built-in counter to a strong maze.
- **Juggling.** Juggling means alternately blocking two exits so creeps double back until they die ([Wikipedia](https://en.wikipedia.org/wiki/Tower_defense)). Anti-juggle options from a Hive thread ([Hive](https://www.hiveworkshop.com/threads/tower-defence-exploit-juggling.193018)):
  - no blocking builds or sells during a wave;
  - a limit on sells per wave, or a sell penalty;
  - a maximum time per maze, after which creeps skip it;
  - invisible "tester" units that reveal juggling;
  - a path-cost check that cancels any placement raising path cost by more than a threshold mid-wave;
  - towers under construction that do not block.
- **Path length and build zone.** Goal Defense's numbers:
  - a hex grid of about 14×7 (~91 tiles), with no scrolling;
  - a starting route of about 20 tiles;
  - creep speed 0.8 tiles/s;
  - a 43-tile route takes 55 s to walk.
- **Fairness and multiple spawns.** Ralle contrasts the fair Burbenog TD with Wintermaul, where players got unequal spots. Multiple spawns or entrances keep players from predicting moves; Sidorina warns that open maps with a single entrance let them. Exact Wintermaul rules **[unverified]**.

## 8. Mobile UX

- **Touch targets.** Apple: 44×44 pt minimum ([Deque summary](https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size)). Google: 48×48 dp, about 9 mm, with 8 dp spacing ([Android accessibility](https://support.google.com/accessibility/android/answer/7101858)). On a small grid, use tap → ghost preview showing range and path → confirm, and offer an undo-style full refund during the same build phase (KR mobile refunds in full before wave 1).
- **Speed controls.** Bloons TD 4 fast-forward was 2.5× ([bloonswiki: Fast Forward](https://www.bloonswiki.com/Fast_Forward) *(snippet)*). BTD6 is reportedly 3× **[unverified; Steam user comment]**. Kingdom Rush has no speed toggle and relies on early wave calls; players have asked for 2× since 2014 ([Steam](https://steamcommunity.com/app/246420/discussions/0/522730700387363452)). One player there notes that speeding up a TD changes outcomes. To avoid that, run a fixed-timestep simulation and do N steps per frame ([Fiedler, "Fix Your Timestep!"](https://gafferongames.com/post/fix_your_timestep/)), so 1×, 2× and 3× give identical results.
- **Session length.** The GameAnalytics median mobile session was 4.45 min in Q1 2024 ([GIL](https://gameindustrylibrary.com/documents/q1-mobile-games-benchmarks-2024/read)). In 2025, top-tier games averaged 8–9 min and the median tier 5–6 min ([summary](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)). A 40-wave run is several sessions long, so autosave at every wave boundary.
- **Pause and resume.** Apple: "Games should use this method to pause the game." Use `sceneWillResignActive(_:)` for scene-based apps ([Apple docs](https://developer.apple.com/documentation/uikit/uiapplicationdelegate/applicationwillresignactive(_:))). Resume into a paused state, never straight into live play.

---

## 9. Recommended starting numbers (40-wave, single-player, mazing)

These are my proposals, derived from the sources above. Tune them in a sim.

| Parameter | Value | Rationale |
|---|---|---|
| Starting gold | **200** (4 basic towers) | Wave 1 needs about 125 gold of towers at ideal efficiency |
| Lives | **20** | Normal, fast, swarm and air creeps cost 1. Tank costs 2. Boss costs 5. Final boss costs 20. Stars: 3★ for 18+, 2★ for 6–17 (KR). Optional: scale the leak cost by remaining HP (YouTD). |
| Normal creep HP | **`HP(w) = round(20 × 1.10^(w−1))`** → w10: 47, w20: 122, w30: 317, w40: 823 | g = 1.10 is the upper limit that linear income can support over 40 waves. Difficulty multiplier on HP: Easy 0.8, Hard 1.25. |
| Wave types (HP mult × count) | Normal 1.0×10 · Swarm 0.4×20 · Fast 0.7×10 at 1.6× speed · Tank 3.0×4 (high armor) · Air 0.6×8 (bypasses maze) · Boss 15×1 + 5 escorts | Total wave HP stays at 0.8–1.5× a normal wave. Air gets less HP because it gets about ⅓ of the exposure time. |
| Schedule | Boss at 10/20/30/40, mini-boss at 5/15/25/35. Air every 7th wave starting at 7. Introduce fast at 4, swarm at 3, tank at 8, slow-immune at 16, regen at 18, splitting at 22, invisible at 26, each first appearing alone | Paced like Legion TD 2 and PvZ |
| Bounty | Per-wave pool **`10 × (1 + floor(w/4))`**, split across the wave's creeps in proportion to their HP | 10 gold at w1, 60 at w20, 110 at w40 |
| End-of-wave bonus | **`20 + 4w`** | YouTD uses `20 + 2w` with 5% interest. This proposal raises the slope and lowers interest. |
| Interest | **4% of unspent gold at wave end, capped at that wave's end-of-wave bonus** | Creates a spend-vs-bank choice. The cap stops runaway banking. |
| Early call | `+0.5 × secondsRemaining × (1 + w/10)` gold, with a 20 s build timer | About 15–30% of a wave's income, kept small as in KR |
| Sell refund | **70%**, or 100% for a tower placed during the current build phase | BTD6 and KR4 use 70%. The full refund doubles as undo for mis-taps. |
| Anti-juggle | Mid-wave placements are rejected if they lengthen the shortest path for any live creep. Path edits are free between waves. | Hive path-cost idea |
| DPS per gold | Basic single-target **0.10 DPS/gold**. Splash 0.035–0.05 per target. Anti-air 0.15 against air only. Each upgrade tier gives about 5–10% less cumulative DPS per gold than the last; upgrades cost about 1.5× the previous step. | KR baseline is 0.09, with splash at about ⅓ |

**Sanity model.** Assumptions: about 0.08 effective DPS per gold after armor and targeting waste, 25 s effective firing time per tower per wave in a decent maze, and 1.25× overkill margin. The ratio is required investment ÷ cumulative gold:

| Wave | 1 | 10 | 20 | 30 | 40 |
|---|---|---|---|---|---|
| Ratio | 0.62 | 0.40 | 0.40 | 0.52 | 0.82 |

Real players probably reach 50–70% of ideal efficiency **[my assumption]**, so expect wave 40 to feel tight on Normal. Re-measure effective firing time and DPS per gold from the prototype first, then re-fit `g`:

- If waves 10–25 feel slack, raise `g` to 1.11 for those waves.
- If the run hits a wall before wave 35, lower `g` to 1.09.
