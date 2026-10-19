# The Original: design

The Original is Tavern TD's own Game Mode: a Campaign of 12 Stages in 3 Regions, with Stars, Talents and Tower Levels. The rules session builds from this doc. Words follow [CONTEXT.md](../CONTEXT.md).

Every number here is a starting point. It comes from the baseline in [PLAN §4](PLAN.md#4-balance-method) and [td-design-and-balance.md §9](research/td-design-and-balance.md), and the balance bots tune it.

**Decided with you on 2026-10-18:**
- **Tone:** grim war fantasy (§2). You picked it over the warm frontier I first suggested.
- **Counters:** soft. Armor types cut a family to 50% at worst, and nothing is immune (§4).
- **Pace:** Waves overlap, and calling one early pays gold (§3).
- **Stars:** scarce. The Campaign's Stars fill four and a half of the six Talent trees (§8).

## 1. At a glance

| Topic | Design |
|---|---|
| Shape | 12 Stages in 3 Regions of 4. Each Stage is one Run of 12–20 Waves, about 8–14 min at 1× |
| Map | A fixed route, plus a straight air line for flying creeps. A 2 × 2 tower goes on any Open ground beside the road (§17) |
| Towers | 6 Tower Families. Each has Tiers 1, 2 and 3, then 2 Specialisations: 30 towers |
| Inside a Run | Gold buys towers and Tiers. Towers gain Tower Levels 1–10 from kills, with a Perk at 5 and at 10 |
| Across Runs | Stars (1–3 per Stage, and 1 for each Challenge won) buy Talents, one tree per family, refunded for free |
| Lives | 20. Stars: 3 for 18 or more left, 2 for 6 or more, 1 otherwise |
| Pace | Each Break is 30 s and starts when a Wave's last creep spawns, so Waves can overlap. Send now pays gold |
| Left out | Hero, interest, random towers, mazing |

## 2. World and tone

**Grim war fantasy, told straight.** The March is burning. A Rift has torn open beyond the northern pass. The dead rise ahead of it, plague follows them, and demons come through last. The towns are gone, and the old road is all that stands between the horde and the south. You are the March-warden. You can't hold the field, so you hold the road.

- **Tone:** serious and spare, in the spirit of Warcraft III's darker campaigns, with our own names. No jokes in the text.
- **Text stays tiny:** a two-line Region intro, one line per Stage on the select screen, one line from each boss. No cutscenes.
- **Stage select** is the war map spread on the table of the last tavern on the road, with a pin for each Stage. It is the one nod to the app's name.
- **Shapes, not sprites** (PLAN §1): each Region is a palette, each creep a silhouette, each family a shape.
- **The horde escalates by Region:** the risen dead first, then plague and the cults that spread it, then the demons themselves.

| Region | Stages | Land | Palette | Enemy | Boss |
|---|---|---|---|---|---|
| 1. Ashfield | 1–4 | Burning farms, a river, border forts | Scorched wheat, smoke grey, ember red | The risen dead | Gravelord, a dead warlord raised to lead them |
| 2. Blightfen | 5–8 | Plague marsh, drowned villages | Sick green, bruise violet, black water | Plague and its cults | Plague Mother, a swollen horror that births Crawlers |
| 3. Rift | 9–12 | The torn northern pass: obsidian, fire | Obsidian, hellfire orange, blood red | Demons | Riftlord, who holds the Rift open |

## 3. How a Stage plays

- **Before the Run.** You set Talents on the Stage-select screen. They are fixed for the Run.
- **Start.** The Run opens with the Stage's starting gold and no towers. Wave 1 waits until you press Send now.
- **Building.** A tower is 2 × 2 and goes on any Open ground off the road (§17). Tap the ground and a ring shows the unlocked families with their prices. Tap one for its Ghost and range, then tap again to build. Building is instant.
- **A built tower.** Tap it for Upgrade (the next Tier), the two Specialisations once it is Tier 3, targeting and Sell. On the Mac, hotkeys follow the ring's order.
- **Targeting.** Each attacking tower aims at First (default), Last, Strong or Close. Changing it is free at any time.
- **Waves.** Ground creeps walk the route; on Stages with two or three spawns, each group walks its own route. Flying creeps follow the air line.
- **Break.** The 30 s Break before the next Wave starts once the current Wave's last creep has spawned, so Waves can overlap. Send now ends it early and pays the early-call bonus (§10).
- **Leaks.** A leaked creep costs its lives (§5) and is gone. Unlike Element, it doesn't walk the route again.
- **End.** You win when the last Wave is cleared with lives left, and earn Stars by lives left. At 0 lives the Run is lost, and Retry restarts the Stage.
- **Saving.** As in every Game Mode: autosave every Wave and when the app goes to the background, Continue, and save codes.
- **Difficulty.** Creep HP × 0.75 / 1 / 1.3 / 1.6. Stars don't depend on Difficulty. Each Stage's Record keeps its best Stars, the hardest Difficulty won and the fastest win.

## 4. Damage types and armor types

Two axes, as in Kingdom Rush: armor cuts physical hits, and wards cut magic. Nothing is immune.

| Damage type | Families | Unarmored | Armored | Warded | Boss |
|---|---|---|---|---|---|
| Pierce | Arrow | 100% | 50% | 100% | 70% |
| Siege | Cannon | 100% | 75% | 100% | 85% |
| Magic | Frost, Arcane, Storm Totem | 100% | 100% | 50% | 70% |
| Poison | Poison | 100% | 100% | 100% | 100% |

- **Numeric armor** (the WC3 formula already in `damage.ts`) is 0 on every Original creep. Only debuffs move it. Negative armor raises all hit damage: −2 armor is about +12%, and −4 is about +22%.
- **Poison over time** skips the armor type, numeric armor and Shield.
- **Shield** blocks a flat amount from every hit: 10% of a Ghoul's HP at that Wave's Threat (§10). A Shieldbearer at Threat 20 blocks 12 of every hit.
- **Deadeye Perch** treats Armored as Unarmored.

## 5. Creeps

Ten creeps and three bosses. HP is a multiple of a Ghoul's HP at the Wave's Threat (§10). Speed is in world units per second (one cell is 64).

| Creep | Role | HP × | Speed | Armor type | Per Wave | Gap | Lives | XP | Special |
|---|---|---|---|---|---|---|---|---|---|
| Ghoul | Normal | 1.0 | 160 | Unarmored | 10 | 1.0 s | 1 | 2 | — |
| Hound | Fast | 0.7 | 260 | Unarmored | 10 | 0.8 s | 1 | 2 | — |
| Crawler | Swarm | 0.4 | 180 | Unarmored | 20 | 0.35 s | 1 | 1 | — |
| Bloodbat | Flying | 0.6 | 200 | Unarmored | 8 | 0.8 s | 1 | 2 | Flies the air line |
| Revenant | Armored | 3.0 | 120 | Armored | 4 | 1.6 s | 2 | 6 | — |
| Cultist | Magic-resistant | 1.5 | 150 | Warded | 6 | 1.2 s | 1 | 3 | — |
| Flesh Golem | Regenerating | 1.8 | 140 | Unarmored | 6 | 1.2 s | 1 | 4 | Regains 3% of max HP per second |
| Bloater | Splitting | 1.2 | 150 | Unarmored | 6 | 1.2 s | 1 | 3 | Bursts into 2 Crawlers when it dies. Crawlers that a creep drops pay no bounty |
| Shieldbearer | Shielded | 2.0 | 140 | Unarmored | 5 | 1.4 s | 2 | 5 | Shield (§4) |
| Gargoyle | Armored flyer | 1.2 | 170 | Armored | 6 | 1.0 s | 2 | 4 | Flies the air line |
| Gravelord | Boss, Stage 4 | 12 | 100 | Boss | 1 | — | 5 | 30 | At half HP, enrages: +50% speed for 4 s |
| Plague Mother | Boss, Stage 8 | 12 | 90 | Boss | 1 | — | 10 | 40 | Regains 1% per second; every 6 s drops 3 Crawlers behind her |
| Riftlord | Final boss, Stage 12 | 24 | 80 | Boss | 1 | — | 20 | 60 | At 75%, 50% and 25% HP: a 4 s Shield four times as strong, and he calls 4 Hounds |

- **Bosses** take slows at half strength and ignore stuns and freezes. Each arrives with a few escorts. The balance bots cut their HP from 20, 30 and 50 Ghouls (§15): at those numbers no defense the Campaign can afford killed them.
- **Air** gets less HP because it gets about a third of the exposure (research §9).

**What each creep counters.** No creep shuts a family out, but each one punishes a lazy build.

| Creep | Punishes | Answer |
|---|---|---|
| Ghoul | — | Anything |
| Hound | Slow shots (Cannon, Thunder Mortar) and towers placed late on the route | Frost, Arrow |
| Crawler | Single-target towers (Mage line, Deadeye, Arcane Lance, Widow's Fang) | Cannon, Ranger Lodge, Prism, Plague Cauldron, Blizzard |
| Bloodbat | Cannon and Poison, which can't hit air, and towers far from the air line | Arrow, Frost, Arcane, Flak Battery, Storm Totem |
| Revenant | Arrow (50%), and Cannon a little (75%) | Arcane, Poison, Deadeye, War Totem |
| Cultist | Frost, Arcane and Storm Totem (50%) | Arrow, Cannon, Poison |
| Flesh Golem | Poison and chip damage, which its regeneration out-heals | Burst: Arcane, Deadeye, Arcane Lance; the Antivenom Talent |
| Bloater | Big single hits: overkill is wasted and its Crawlers spread out | Splash: Cannon, Prism, Plague Cauldron |
| Shieldbearer | Many small hits (Arrow Tiers 1–2, Ranger Lodge, Flak, splash edges) | Big hits (Arcane, Deadeye, Thunder Mortar), and Poison, which isn't a hit |
| Gargoyle | Arrow against air (50%), and every ground-only tower | Arcane, Frost, Flak Battery, Storm Totem |
| Bosses | Splash and slows | Single-target: Arcane Lance, Deadeye, Widow's Fang |

## 6. Towers

Six families of five towers each. Prices climb about 1.5× per step, and each Tier buys 5–10% less DPS per gold than the one before (research §3).

| Family | Damage | Role | Hits air | Shape |
|---|---|---|---|---|
| Arrow | Pierce | Cheap, fast single-target | Yes | Triangle, wood brown |
| Cannon | Siege | Splash | No; Flak Battery yes | Circle, iron grey |
| Frost | Magic | Slow | Yes | Hexagon, ice blue |
| Arcane | Magic | Big single hits | Yes | Diamond, violet |
| Poison | Poison | Damage over time that skips defences | No; the Plague Wind Talent yes | Drop, acid green |
| Totem | — | Auras for nearby towers | Only Storm Totem attacks, and it hits air | Pillar, red ochre |

Tiers show as 1–3 pips, a Specialisation as a crest, and the Tower Level as a small number that turns gold at 5 and 10.

In the tables, **Total** is everything spent on the tower so far. **Range** is in world units, centre to centre. Slows share one key, so only the strongest applies.

### Arrow

| Tower | Step | Total | Damage | Cooldown | Range | DPS | Notes |
|---|---|---|---|---|---|---|---|
| Arrow Tower | T1 | 70 | 6 | 0.85 | 320 | 7.1 | 0.10 DPS per gold |
| Longbow Tower | T2, +110 | 180 | 14 | 0.85 | 352 | 16.5 | |
| Marksman Tower | T3, +165 | 345 | 26 | 0.85 | 384 | 30.6 | |
| Ranger Lodge | Spec, +250 | 595 | 15 | 0.6 | 384 | 25, or 75 on 3 | Fires 3 arrows at 3 creeps. Swarm and air |
| Deadeye Perch | Spec, +250 | 595 | 72 | 2.2 | 576 | ~43 | 20% crit ×2.5. Treats Armored as Unarmored. Targets Strong |

### Cannon

Ground only. Splash deals full damage within 48 and half within 112.

| Tower | Step | Total | Damage | Cooldown | Range | DPS per creep | Notes |
|---|---|---|---|---|---|---|---|
| Cannon Tower | T1 | 90 | 12 | 1.8 | 288 | 6.7 | |
| Bombard | T2, +140 | 230 | 28 | 1.8 | 304 | 15.6 | |
| Great Bombard | T3, +210 | 440 | 52 | 1.8 | 320 | 28.9 | |
| Thunder Mortar | Spec, +300 | 740 | 115 | 3.0 | 640 | 38 | Can't fire within 160. Splash 80 full, 176 half |
| Flak Battery | Spec, +300 | 740 | 38 | 0.9 | 384 | 42 | Hits ground and air. Splash 40 full, 88 half |

### Frost

| Tower | Step | Total | Damage | Cooldown | Range | DPS | Notes |
|---|---|---|---|---|---|---|---|
| Frost Tower | T1 | 80 | 4 | 1.2 | 288 | 3.3 | Slows 25% for 2 s |
| Ice Spire | T2, +120 | 200 | 9 | 1.2 | 304 | 7.5 | Slows 32% |
| Glacier Spire | T3, +180 | 380 | 16 | 1.2 | 320 | 13.3 | Slows 40% |
| Blizzard Spire | Spec, +270 | 650 | 14 to all in range | 1.0 | 256 | 14 per creep | An aura slows every creep in range 45% |
| Rime Lance | Spec, +270 | 650 | 55 | 1.4 | 352 | 39 | Slows 40%. 20% of hits freeze for 1 s |

### Arcane

| Tower | Step | Total | Damage | Cooldown | Range | DPS | Notes |
|---|---|---|---|---|---|---|---|
| Mage Tower | T1 | 100 | 17 | 1.7 | 320 | 10.0 | |
| Sorcerer Tower | T2, +150 | 250 | 38 | 1.7 | 336 | 22.4 | |
| Archmage Tower | T3, +225 | 475 | 70 | 1.7 | 352 | 41.2 | |
| Arcane Lance | Spec, +330 | 805 | 40 per s | beam | 352 | 40 → 120 | +25% for each second on the same creep, up to ×3. Resets on a new target |
| Prism Tower | Spec, +330 | 805 | 60 | 1.5 | 352 | 40, or 109 on 4 | The bolt jumps to 3 more creeps, −25% each jump |

### Poison

Ground only. Poison prefers creeps that aren't poisoned yet, so one tower keeps several poisoned. A new hit refreshes the poison; it doesn't stack, except on Widow's Fang.

| Tower | Step | Total | Hit | Poison | Cooldown | Range | DPS: 1 creep, crowd | Notes |
|---|---|---|---|---|---|---|---|---|
| Venom Dart | T1 | 80 | 2 | 2.5 per s for 3 s | 1.0 | 320 | 4.5, 9.5 | |
| Venom Spitter | T2, +120 | 200 | 4 | 6 per s | 1.0 | 336 | 10, 22 | |
| Venom Spire | T3, +180 | 380 | 7 | 11 per s | 1.0 | 352 | 18, 40 | |
| Plague Cauldron | Spec, +270 | 650 | — | 10 per s | 2.0 | 384 | 10 per creep | Lobs a cloud, radius 112, that lasts 3 s and poisons everything inside |
| Widow's Fang | Spec, +270 | 650 | 10 | 8 per s per stack | 0.8 | 352 | ~52 | Each hit adds a 4 s stack, up to 5. Sticks to one target |

### Totem

Totems don't attack, except Storm Totem. Their auras reach towers within 256, about two towers away. Two Totems' auras of the same kind don't stack.

| Tower | Step | Total | Aura | Notes |
|---|---|---|---|---|
| Drum Totem | T1 | 90 | +15% attack speed | Pays off from about 4 towers in reach |
| Spirit Totem | T2, +135 | 225 | +20% attack speed | |
| Ancestor Totem | T3, +200 | 425 | +25% attack speed, +10% range | |
| War Totem | Spec, +300 | 725 | +25% attack speed, +20% damage | Creeps within 256 get −4 armor (≈ +22% damage from hits) |
| Storm Totem | Spec, +300 | 725 | +25% attack speed, +10% range | Lightning: 60 Magic to the Strongest creep within 320 every 1.5 s. Hits air |

## 7. Tower Levels and Perks

- **XP.** A kill gives its XP (§5) to the tower that made it. Every other tower that hit or slowed the creep in the last 3 s gets an Assist: half that XP. A Totem gets half the XP of every kill made by a tower in its aura.
- **Levels.** A tower starts at Level 1. Each Level adds +3% damage, so Level 10 is +27%. A Totem's auras gain +1 point per Level instead.
- **Keeping it.** XP stays through Tier upgrades and Specialisation. Selling loses it, and so does the end of the Run.

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Total XP | 0 | 8 | 20 | 36 | 56 | 80 | 108 | 140 | 176 | 216 |

A busy front-line tower reaches Level 5 about halfway through a Stage, and Level 10 near the end of a long one.

**Perks.** Each family has the same two Perks on every Tier and Specialisation.

| Family | Level 5 | Level 10 |
|---|---|---|
| Arrow | **Keen Eye:** +15% range | **Heartseeker:** every 4th arrow crits ×2.5 |
| Cannon | **Wide Blast:** +25% splash radius | **Double Charge:** every 3rd shot fires a second shell at another creep |
| Frost | **Frost Nova:** every 10 s, slows every creep in range 60% for 1.5 s | **Deep Freeze:** 10% of hits freeze for 1 s |
| Arcane | **Surge:** every 5th attack deals double | **Arc:** every hit jumps to one more creep for 50% |
| Poison | **Spores:** each hit also poisons the nearest other creep within 128 | **Virulence:** +40% poison damage |
| Totem | **Wider Circle:** +20% aura radius | **War Drums:** every 15 s, towers in its aura get +50% attack speed for 4 s |

## 8. Stars and Talents

- **Stars.** A Stage pays 1–3 Stars by lives left. Replaying pays only the difference over your best. The Stages hold 36, and each Challenge's first win pays 1 more (§16): 48 in all.
- **Trees.** Each family has its own Talent tree. It opens when the family unlocks, and buying opens once you have Stars, after Stage 1.
- **Rows.** Each tree has 4 rows, bought in order. Rows 1–3 offer two Talents and you hold one of them; row 4 is a single capstone.
- **Cost.** Rows cost 1, 2, 2 and 3 Stars, so 8 Stars fill a tree and 48 fill all six. The Stages' 36 fill four and a half, so you choose a focus. The 12 Challenges pay one Star each (§16), so a player who wins them all fills every tree.
- **Reset.** Free at any time on the Stage-select screen. Talents are fixed during a Run.

| Family | Row 1 (1★) | Row 2 (2★) | Row 3 (2★) | Capstone (3★) |
|---|---|---|---|---|
| Arrow | **Fletching:** +10% damage · or **Long Draw:** +10% range | **Quick Nock:** +12% attack speed · or **Bodkin Points:** Armored takes 70% from Pierce, not 50% | **Woodcutters:** Arrow towers and upgrades cost 10% less · or **Eagle Feathers:** +25% damage to flying | **Hawkeye:** every Arrow tower crits 10% of the time for ×2.5 (Deadeye: +10%) |
| Cannon | **Black Powder:** +10% damage · or **Wide Shells:** +20% splash radius | **Shrapnel:** hits leave −2 armor for 3 s · or **Quick Reload:** +12% attack speed | **Salvage:** Cannon towers sell for 85% · or **Long Barrels:** +10% range | **Concussion:** 15% of shots stun everything in the full-damage splash for 0.5 s |
| Frost | **Deep Chill:** slows last 1 s longer · or **Frostbite:** +20% damage | **Brittle:** slowed creeps take +10% from Pierce and Siege · or **Cold Reach:** +10% range | **Hard Frost:** slows 5 points stronger · or **Ice Harvest:** Frost kills pay +1 gold | **Shatter:** a creep that dies slowed by Frost deals 15% of its max HP as Magic to creeps within 96 |
| Arcane | **Focus:** +10% damage · or **Far Sight:** +10% range | **Spellbreaker:** Warded takes 70% from Magic, not 50% · or **Mana Flow:** +12% attack speed | **Echo:** 15% of attacks fire a second bolt at another creep · or **Apprentices:** Arcane towers and upgrades cost 10% less | **Leyline:** +10% damage for each other Arcane tower within 192, up to +30% |
| Poison | **Potency:** +15% poison damage · or **Lingering:** poison lasts 1 s longer | **Contagion:** a creep that dies poisoned passes its poison to the nearest creep within 128 · or **Corrode:** poisoned creeps get −2 armor | **Antivenom:** poisoned creeps don't regenerate · or **Thick Venom:** poison slows 10% | **Plague Wind:** Poison towers can hit flying creeps |
| Totem | **Wide Circle:** +15% aura radius · or **Drumbeat:** +5 points of attack speed | **Spirit Link:** towers in a Totem's aura gain 25% more XP · or **Cheap Carving:** Totems cost 15% less | **Hex:** creeps within a Totem's reach take +8% damage · or **Rally:** the aura also gives +8% range | **Elder Spirits:** Totems are built at Tower Level 5, with its Perk |

## 9. Unlock order

One new tool per Stage until all six families are out, while each Stage also brings one new creep (§11).

| Finishing | Unlocks |
|---|---|
| — (the start) | Arrow and Cannon, Tiers 1–2 |
| Stage 1 | Frost; Talents open |
| Stage 2 | Tier 3 for every family |
| Stage 3 | Arcane |
| Stage 4 | Poison |
| Stage 5 | Specialisations |
| Stage 6 | Totem |
| Stages 7–12 | Nothing new: Region 3 is about Specialisations and Talents |

## 10. Economy and starting numbers

**Threat** sets a Wave's creep HP, bounty and bonus. A Wave's Threat is the Stage's first Threat plus the Wave number minus 1. Later Stages start at a higher Threat, so the §4 curves carry across the Campaign instead of restarting.

| Setting | The Original | Against PLAN §4 |
|---|---|---|
| Lives | 20 | As §9 |
| Starting gold | 250 at Stage 1, rising to 700 at Stage 12 (§11) | §9 has 200 for a mazing Wave 1 |
| Ghoul HP | `20 × 1.10^(T−1)`: 20 at Threat 1, 122 at 20, 422 at 33 | Same curve, with Threat for the Wave |
| Bounty | A pool of `10 × (1 + floor(T/4))` per Wave, split by each creep's share of the Wave's HP | Same |
| End-of-Wave bonus | `20 + 4T`, paid when the Wave is cleared: every creep dead or leaked | Same |
| Interest | None | Dropped; see below |
| Early call | `floor(0.4 × seconds left × (1 + T/10))`, with T of the Wave called. At most 13 gold at Threat 1 and 36 at Threat 20 | §9 has 0.5 × seconds with a 20 s Break; the Break here is 30 s |
| Sell | 70% of the total spent; 100% of whatever was spent since the current Break began | Same |
| Tower prices | Single-target Tier 1 at 0.10 DPS per gold; splash about half that per creep; each step about 1.5× the last | Same |
| Difficulty | Creep HP × 0.75 / 1 / 1.3 / 1.6 | Same |

**Why no interest.** The early call is the Original's greed lever, and interest would pull the other way, towards waiting and banking. Overlapping Waves also blur when a Wave "ends". The end-of-Wave bonus keeps §4's income slope. Build Spots used to make space the limit (research §3). Since free placement (§17) gold is the limit, which makes the early call matter more, so no interest still holds.

**Wave recipes.** The design started from a normal Wave of 10 Ghouls' worth of HP, a new creep's first Wave alone at 0.8× followed by a Wave that mixes it in, late Waves at 1.2–1.5×, a boss Wave of the boss plus a few escorts, and each Stage's last Wave its hardest. The bots kept the shape and changed the sizes (§15):
- **A Stage ramps.** Its opening Waves are light, 7–10 Ghouls' worth, so the starting gold carries them even on Insane. Its last third is 1.5–3× the old recipe. A Stage is decided at its end, not in its opening.
- **Groups keep their length.** A bigger group packs its creeps closer together instead of taking longer to arrive, so Waves of 30–70 creeps are normal by Region 2.
- **Armor and wards show up in force.** From a third of the way into Stages 5–12, Ghoul groups became Revenants or Cultists of the same HP, so armored or warded creeps carry about a third of a Stage's HP.
- **Still true:** each new creep's first Wave is alone and lighter than the mix after it, bosses close Stages 4, 8 and 12 with escorts, and every Stage's last Wave is its heaviest in HP at its Threat (tests/sim/original/stages.test.ts checks all of it).

**Sanity model.** This compares the gold needed in towers to clear a Wave with the gold earned by then. It assumes 0.08 effective DPS per gold, 20 s of firing per tower per Wave on a route (a maze gets 25 s), 1.25× overkill, early calls taken at 40%, an average Tower Level bonus of +9%, and Talents worth +0.7% per Star earned.

| Stage | Wave 1 | Middle | Last |
|---|---|---|---|
| 1 | 0.69 | 0.52 | 0.47 |
| 4 (Gravelord) | 0.66 | 0.47 | 0.61 |
| 8 (Plague Mother) | 0.66 | 0.48 | 0.72 |
| 12 (Riftlord) | 0.71 | 0.56 | 0.93 |

Below 0.5 is comfortable, and near 1 is tight. The final boss is meant to be tight; PLAN §4 aims for a ~60% bot win rate on Normal.

The bots overruled this model (§15): it assumed too much firing time on a route and too little growth in the defense through a Stage, so Stages played front-loaded, lost early on Hard and easy at the end.

## 11. The 12 Stages

Every Map is 32 × 18 cells (§12). The length assumes about 40 s per Wave at 1× without early calls. The Spots column, and the Spots in the Map ideas, were the plan until 2026-10-19. Free placement replaced them (§17), and each Stage's Scenery is listed there.

| # | Stage | Region | Map idea | Spots | Waves | Threat | Gold | New creep | New for you | Length |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | The Mill Road | Ashfield | One S-bend road past a burning mill; Spots on the inside of both bends | 8 | 12 | 1–12 | 250 | Ghoul, then Hound at Wave 5 | Arrow, Cannon | 8 min |
| 2 | Greyriver Crossing | Ashfield | The road crosses the river twice; two island Spots cover both bridges | 9 | 12 | 2–13 | 270 | Crawler | Frost, Talents | 8 min |
| 3 | Gallows Hill | Ashfield | The road loops round a hill. Hilltop Spots see both sides, and Bloodbats cut straight over | 10 | 14 | 3–16 | 300 | Bloodbat | Tier 3 | 9 min |
| 4 | Fort Harrow | Ashfield | Two hairpins down to the gate of the last border fort | 10 | 15 | 4–18 | 330 | Revenant; Gravelord on the last Wave | Arcane | 10 min |
| 5 | Drowned Causeway | Blightfen | A causeway zigzags through the marsh; a long route with Spots in pairs | 11 | 15 | 6–20 | 400 | Cultist | Poison | 10 min |
| 6 | Sunken Chapel | Blightfen | A spiral into a ruined chapel; the centre Spots reach three rings | 11 | 16 | 7–22 | 430 | Flesh Golem | Specialisations | 11 min |
| 7 | Plague Fords | Blightfen | Two spawns, and two routes that join halfway | 12 | 16 | 8–23 | 460 | Bloater | Totem; two routes | 11 min |
| 8 | The Blight Pit | Blightfen | A figure eight round the plague pit that passes the centre twice | 12 | 18 | 9–26 | 500 | Plague Mother on the last Wave | — (the Region's exam) | 12 min |
| 9 | The Scar | Rift | Switchbacks up a burnt slope; each row of Spots faces two legs | 12 | 18 | 11–28 | 580 | Shieldbearer | — | 12 min |
| 10 | Black Cliffs | Rift | The route hugs a cliff the long way round, while the air line crosses the gap | 13 | 18 | 12–29 | 620 | Gargoyle | — | 12 min |
| 11 | Three Gates | Rift | Three spawns that merge in two steps | 14 | 20 | 13–32 | 660 | — (everything mixed) | Three routes | 13 min |
| 12 | Riftmaw | Rift | A ring round the Rift itself, then up to the Riftlord; the longest route | 14 | 20 | 14–33 | 700 | Riftlord on the last Wave | — | 14 min |

- **Spots grow from 8 to 14** was the original plan: by a Stage's end, a good Run filled most Spots and specialised a few, which matched Goal Defense's "60–70% full" target (research §6). Since 2026-10-19 towers go on any Open ground and gold is the limit (§17). The old Spot lists stay in the tests, because Scenery must leave them open for older saves.
- **Each Region ends on a boss** that tests what that Region taught: the Gravelord tests focus fire, the Plague Mother tests splash plus burst, and the Riftlord tests everything.
- **Region 3 brings no new towers.** Its new creeps (Shieldbearer, Gargoyle) push you into Specialisations and Talents.

**As built** (2026-10-18; `pnpm balance maps` prints each Map). Spots, Waves, Threat and gold are as in the table.
- **Routes:** Stage 1 is 5,376 long; Stage 2, 5,504; Stage 3, 4,544; Stage 4, 5,120; Stage 5, 5,888; Stage 6, 6,016. Stage 7's two routes are 2,816 each, 1,536 of it before they join at the middle of the Map. Stage 8 is 5,120; Stage 9, 6,272; Stage 10, 5,760, with a 2,048 air line straight across the chasm. Stage 11's three routes are 4,224, 4,032 and 4,224: the north and west roads join first, the south road joins them next, and the last 2,944 is shared. Stage 12 is the longest at 7,744; its last leg crosses its own outer ring on the way north.
- **Air lines** run 2–3 points from each spawn to the exit, and passed near some of the old Spots.
- **The river, the hill, the chasm and the pit** were in the Stage lines and the Map shapes only, on terrain of road, Spot or ground. §17's Scenery draws them on the Map.

## 12. Maps

- **Size.** 32 × 18 cells of 64 units, or 2,048 × 1,152 world units. At 390 pt of landscape height a cell is about 21.7 pt, so a 2 × 2 tower is about 43 pt. That is a tap target without pinching, unlike Gem's and Element's Maps.
- **Route.** A polyline, two cells wide, walked through its centre, reusing `src/sim/path/route.ts` (built for Element). A creep leaks at the end.
- **Where towers go.** Changed on 2026-10-19, at your request: a 2 × 2 tower goes on any Open ground, the cells that are neither road nor Scenery, so towers still never Block (§17). Until then, towers stood only on Build Spots, a list of 2 × 2 places beside the route.
- **Air line.** A polyline of 2–4 points from the spawn to the exit, drawn faintly. Flying creeps follow it at their own speed.
- **Several spawns.** Stages 7 and 11 have 2 and 3 routes. Each Wave group names its route.

## 13. What the rules session builds

The engine already has splash, slows that don't stack, poison, armor debuffs, stuns, crits, multishot, auras (attack speed, damage, range; armor, slow and poison on creeps), damage tables and one fixed route. New work:

- **Map:** several routes per Map, Build Spots, and an air line that flying creeps follow. Free placement replaced the Build Spots on 2026-10-19 (§17).
- **Creeps:** Shield (flat block per hit), splitting on death, boss spawns and enrage, slows at half strength and stun immunity for bosses.
- **Towers:** Tier upgrades and the Specialisation choice; targeting modes; poison that prefers unpoisoned creeps, and stacking poison; the ramping beam; the cloud; the bouncing bolt; freeze; Armored treated as Unarmored.
- **Tower Levels:** XP with Assists and Totem shares, Level bonuses, the 12 Perks.
- **Progression:** Stars, Talent trees with rows and free reset, unlocks, Stage Records. Campaign progress is saved apart from Runs, so a save code holds a Run, not the Campaign.
- **Pacing:** Breaks that start at a Wave's last spawn, early-call gold, the end-of-Wave bonus on clear, and Threat.
- **Bots:** greedy-DPS, single-family and balanced bots per Stage, to check that no single family clears a Stage from Stage 5 on (research §3) and to tune HP, gold and prices.

**Later:** maybe a hero tower. The Challenges (Phase 3, step 4) are built: §16.

## 14. Filled in by the rules

The rules session (2026-10-18) built §13 as written. Where this doc left a gap, it took the choice below and marked it `assumed` in the code. The bots and the play-test can overturn any of them.

**Map and Waves**
- A Map lists its routes, and a route carries its own air line, so Stages 7 and 11 give each spawn its own. Stages declared only routes and Build Spots, and the terrain was painted from them. Since §17 they declare routes and Scenery.
- A Wave's groups follow one another, each starting one gap after the last spawn of the group before, unless the group sets its own start.
- Creeps that another creep drops (a Bloater's Crawlers, the Plague Mother's brood, the Riftlord's Hounds) appear just behind it on its route. They belong to its Wave, pay no bounty, and still give XP.
- Stage 1's Waves follow the §10 recipe: 10 Ghouls' worth at first, 11 Hounds alone at Wave 5, then 1.0–1.5× mixes, and 1.63× for Wave 12.

**Towers**
- Projectile speeds: Arrows 1,600, Cannons 900, Thunder Mortar 600, Flak 1,400, Frost 1,200, Arcane 1,000, Poison 1,000, Deadeye 2,400. Beams, the Blizzard nova and lightning land at once.
- Frost's slows last 2 s at every Tier.
- The Arcane Lance's beam stays on its creep while it lives and is in range. A Shield blocks it once a second, not on every tick.
- Prism and Arc jumps find the nearest unhit creep within 192.
- The Plague Cauldron's cloud poisons creeps while they're inside, and the poison lingers 1 s after they leave.
- Widow's Fang stacks count per creep: at most 5, whichever towers put them there. A new hit at 5 replaces the stack closest to running out.
- Tower Levels, Talents and War Totem raise poison damage as they raise hits.
- Deadeye Perch and Storm Totem start at Strong. An upgrade keeps the player's targeting. A tower still on its old default takes the new tower's default.
- A Totem's Level points go to its percentage auras, not War Totem's armor. Storm Totem's lightning also gains +3% damage per Level. Rally adds 8% range to every Totem's aura.
- Spellbreaker applies to all Magic, and Brittle to any slow. Frost Nova fires only with a creep in range, and War Drums only while creeps are on the Map.
- Echo's second bolt and Double Charge's second shell hit as hard as the first. Heartseeker's crit and a rolled crit don't stack.

**Creeps and economy**
- A Shield is 10% of a Ghoul's HP at the Wave's Threat in this Run, so Difficulty scales it too.
- Bounties split to the hundredth of a gold; whole gold is paid as it adds up.
- "Spent since the current Break began" counts from the latest Break's start until the next one begins. The time before Wave 1 counts as a Break, and refunds round down.
- Talent discounts round to whole gold.
- A Run takes Stages finished as a Run setting, which sets its unlocks: the Stage before it by default. Talents are checked for shape only (known ids, one per row, rows in order); the Stage-select screen checks Stars and open trees.

**Stages 2–12** (the Stages session, 2026-10-18)
- Build Spots, until §17: a Spot counted as beside the road within two cells of it, so Gallows Hill's hilltop Spots stood two rows from both legs. Every Spot saw at least 448 of road from a Tier 1 tower's 320 range.
- The boss lines and Region intros live with the UI (`src/ui/modes/original/text.ts`); the Stages carry only their select-screen line.
- Each new creep arrives alone a third to halfway into its Stage: Wave 4 or 5.
- Waves that name no route walk route 0. On the multi-route Stages, groups spread over every route, and a group that should start with another sets `at: 0`.

## 15. Balance (2026-10-18)

`pnpm balance` (`tools/balance/`) plays every Stage with scripted bots over many seeds and every Difficulty. Each bot uses the unlocks the Campaign has by then (Stages finished = Stage − 1) and the Talents a decent player would hold. It reports win rate, Wave reached, lives and Stars, then checks PLAN §4's targets. `pnpm test` runs a small sample on every push.

These bots and results are from Build Spots. §17 says how the bots choose places under free placement, and step 2 retunes against it.

**The bots.**
- **Balanced** is the competent player. It judges each purchase by the lives it would save against the creep groups of the next five Waves (later ones count for less): their armor types, Shields, flyers, spacing, regeneration and overkill. It counts slows and Totem auras, picks Specialisations the same way, and builds around Arrow, adding another family's tower when it is worth 10% more. With every Spot full it may replace a Tier 1 tower. Seeds give it small quirks (Spot order, ±15% noise in its judgement, calling Waves early or not), so each seed plays like a different competent player.
- **Greedy** buys raw damage per gold as if every creep were a Ghoul.
- **Single** is balanced with only one family.

**Assumed for the bots:** a decent player holds 2.5 Stars per Stage finished, rounded down (27 by Stage 12). It fills one Talent tree at a time: Arrow, then Arcane, Frost, Cannon, Poison and Totem, or its own family first for a single-family run. It wants 1.6 times a group's HP in damage before it feels safe. Bot choices live in `tools/balance/value.ts`.

**What the bots changed** (every other number is as §4–§11 give it):

| What | Was | Now | Why |
|---|---|---|---|
| Waves | 10 Ghouls' worth, rising to 1.5× | Light openings, endings 1.5–3× the old recipe, groups packed closer; more armored and warded creeps from Stage 5 (§10) | Stages were decided in their first Waves, and Hard and Insane lost early |
| Stage 11's Map | Three 2,400–2,600 routes with a short shared end | Joins on the west side and a 2,944 shared road | The defense couldn't cover three short roads |
| Boss HP, in Ghouls | Gravelord 20, Plague Mother 30, Riftlord 50 | 12, 12, 24 | No affordable defense killed them; the Riftlord's 20 lives meant a certain loss |
| Cannon damage | 9, 22, 40; Thunder Mortar 90, Flak 30 | 12, 28, 52; 115, 38 | A Cannon catches one creep a shot at normal spacing; it dealt about a third of an Arrow's damage per gold |
| Plague Cauldron | 16 poison a second | 10 | Its clouds dealt 2–5 times any other tower's damage per gold |
| Ranger Lodge | 18 an arrow | 15 | The most damage per gold in the game, on air too |
| Deadeye Perch | 85 a shot | 72 | The best single target per gold, armor ignored |

**Results**, 20 seeds a cell. Win rate of the balanced bot, then the best single family on Normal:

| Stage | Easy | Normal | Hard | Insane | Best single family, Normal |
|---|---|---|---|---|---|
| 1 The Mill Road | 100% | 75% | 0% | 0% | Cannon 100% (Arrow and Cannon only; no flyers yet) |
| 2 Greyriver Crossing | 100% | 80% | 0% | 0% | Cannon 100% |
| 3 Gallows Hill | 100% | 60% | 0% | 0% | none |
| 4 Fort Harrow | 100% | 55% | 0% | 0% | Arcane 80% |
| 5 Drowned Causeway | 100% | 55% | 0% | 0% | Poison 100% |
| 6 Sunken Chapel | 100% | 50% | 0% | 0% | Poison 75% |
| 7 Plague Fords | 100% | 70% | 5% | 0% | Arrow 75% |
| 8 The Blight Pit | 90% | 65% | 0% | 0% | Arrow 50% |
| 9 The Scar | 100% | 65% | 0% | 0% | Arrow 95% |
| 10 Black Cliffs | 100% | 60% | 0% | 0% | Arcane 100% |
| 11 Three Gates | 100% | 75% | 0% | 0% | Arrow 65% |
| 12 Riftmaw | 100% | 65% | 0% | 0% | Arrow 85% |

- **Met:** Easy 99% on average (90% at worst), Normal 65% (50–80% per Stage), Insane 0% everywhere. Insane now falls halfway through Stage 1 or later, not in its fourth Wave.
- **Not met: no single family clears a Stage from Stage 5 on.** Arrow alone wins 20–95% of Stages 5–12 on Normal, Poison alone 65–100% of Stages 5, 6, 9 and 10, and Arcane alone 65–100% of Stages 5 and 10. Cannon, Frost and Totem alone never clear one.
  - Why: counters are soft (nothing below 50%, §4), and each of the three families has its own answer to its weak point. Deadeye ignores armor; Plague Wind lets Poison hit air, and Poison already skips armor types, Shields and the boss table; Spellbreaker lifts Arcane to 70% against wards. A one-family player also fills that family's whole Talent tree. So mixing gains too little, and the balanced bot, built around Arrow, does about as well as Arrow alone.
  - Tried and dropped: a shorter Deadeye reach, Deadeye without its armor exemption, and more armored and warded creeps. Each moved one family down and another up; dropping the exemption also sank the balanced bot on Stages 11 and 12.
  - **Recommendation:** keep the soft counters you chose, accept one-family wins on Normal for now (on Hard and Insane nothing clears, mixed or not), and decide after the play-test whether one-family builds feel degenerate. Enforcing the rule means hard counters below 50% or taking away those in-family answers, which reverses the soft-counter decision.
- **Watch in play-testing:** the bots' win rate falls from ~60% on Normal to almost 0% on Hard. A human plays better than the bot, but Hard may be too steep a step.

## 16. Challenges (2026-10-19)

Each Stage has a **Challenge**: the same Stage played again under one named rule, for one extra Star. The rule withholds or squeezes something the Stage leans on or brings in, so it tests what the Stage teaches. The content is `CHALLENGES` in `src/content/original/challenges.ts`; the rules read it through `src/sim/modes/original/challenge.ts`.

**My calls, open to change:**
- **One Challenge per Stage**, 12 in all, each with a name and a rule of one or two modifiers that fits one line on the Stage panel.
- **One Star each, paid once,** on the first win. The Stages' 36 and the Challenges' 12 make 48, exactly all six Talent trees. Winning a Challenge again pays nothing and can only lower its fastest win.
- **It opens once its Stage is won,** on any Difficulty.
- **Always Normal.** There is no Difficulty choice; the rules refuse a Challenge Run on any other.
- **Your Talents apply, and so do the Campaign's unlocks as they stand,** as in any Run. A Challenge you come back to later in the Campaign is easier; the bots check the least you can hold when it opens (below).
- **A win is clearing the last Wave with any lives left.** The lives left don't change the Star.
- **It keeps its own Record:** whether it is won, and its fastest win (from Wave 1, like a Stage's). It never touches the Stage's Record (best Stars, hardest Difficulty, fastest win).
- **A Challenge Run is a Run like any other:** autosave, Continue, save codes and Retry carry it. The Run names its Challenge, and setup rebuilds everything else from the Challenge's id.
- **Rules only withhold or squeeze;** none gives anything. A family rule lists the families allowed: a "No Arrow towers" rule lists every other family, Totem included, so Totem joins once the Campaign has opened it, while an "only" rule stays as written.

**The modifiers** (`ChallengeModifiers`; a Challenge uses one or two):

| Modifier | Effect | Applied |
|---|---|---|
| `families` | Only these Tower Families can be built, of those the Campaign has opened. The build ring offers only them | The Run's unlocks |
| `burnt` | Burnt ground: these rectangles of Open ground turn to Scenery of kind burnt on the Run's Map, with a name for the chip and the Ghost's words. It replaced `spots` (the Build Spots kept) on 2026-10-19 (§17) | Setup |
| `maxTowers` | The Tower cap: at most this many towers stand at once. Building one more is refused, selling one frees room, and towers already standing stay | Each build |
| `lives` | Lives at the start, instead of 20 | Setup |
| `gold` | Starting gold, instead of the Stage's | Setup |
| `hp` | Creep HP times this, on top of Difficulty: every Wave, Shields and dropped creeps | Each Wave |
| `noEarlyCall` | Send now still ends a Break, but pays no gold | Each early call |
| `breakSeconds` | Each Break lasts this long, instead of 30 s | Each Break |
| `maxTier` | Towers stop at Tier 2 | The Run's unlocks |
| `noSpecialisations` | No tower takes a Specialisation | The Run's unlocks |

**The 12 Challenges.** Bot wins are the balanced bot on Normal, with the least a player holds when the Challenge opens: Stages finished = its Stage, and a decent player's Talents from the Stages' Stars alone (2.5 a Stage, rounded down), none from other Challenges. "Stage" is the Stage on Normal from §15, 20 seeds.

| # | Challenge | Rule | Why | Bot wins, seeds 1–5 | 20 seeds | Stage |
|---|---|---|---|---|---|---|
| 1 | The Burnt Mill | Fire took the lower bend: build above the middle road only, 4 towers at most. | Hold the road from one bend | to be retuned in step 2 (40% on Build Spots) | to be retuned in step 2 (40%) | 75% |
| 2 | Cold Water | Cannon and Frost towers only, and creeps have 30% more HP. | The swarm answered with splash and slows | 20% | 40% | 80% |
| 3 | Short Rope | Towers stop at Tier 2. | Gallows Hill brings Tier 3; this holds it back | 40% | 40% | 60% |
| 4 | The Gravelord's Host | Creeps have 15% more HP. | Armor and the boss, tougher | 40% | 30% | 55% |
| 5 | Wardbreakers | No Frost or Arcane towers, and you start with 15 lives. | Cultists cut Magic: answer them without it | 20% | 25% | 55% |
| 6 | The Old Rites | No Specialisations, and you start with 350 gold. | The chapel brings Specialisations; this holds them back | 40% | 35% | 50% |
| 7 | No Rest at the Fords | Breaks last 8 s. | Two columns, and no time between Waves | 40% | 35% | 70% |
| 8 | Short Supply | Start with 450 gold, and Send now pays no gold. | The Region's exam on a thin purse | 40% | 25% | 65% |
| 9 | Glass Slope | The middle row burned to glass: nothing stands on it, and 8 towers at most. | The middle strip, which faces two legs, is gone | to be retuned in step 2 (40% on Build Spots) | to be retuned in step 2 (25%) | 65% |
| 10 | Stone Wings | No Arrow towers, and creeps have 10% more HP. | Gargoyles shrug off Arrows: answer them otherwise | 40% | 30% | 60% |
| 11 | Three Hordes | Breaks last 18 s: the hordes don't wait for each other. | Three roads meet, with less time to build between Waves | 20% | 30% | 75% |
| 12 | The Last Stand | Start with 13 lives. | The Riftlord, with little to spare | 60% | 35% | 65% |

- **The Stage column and the other ten Challenges' numbers are from Build Spots** too. Step 2 retunes them all under free placement (§17).
- **Met:** every Challenge 20–60% over seeds 1–5 (`pnpm balance --challenges --seeds 5 --threads 2`, 120 Runs in about 20 s; `--first-seed 6` plays a second sample), and 25–40% over 20 seeds, 33% on average, against 50–80% for the Stages: each Challenge is won less often than its Stage.
- **The bot is noisy and not monotone.** Closing weak Build Spots can raise its win rate (it stops spending on them), Cold Water's two families beat its Arrow-centred build on Greyriver, and a few lives or 10% of HP can swing a Challenge from 50% to nearly 0%. So every number above was checked on 10–20 seeds before it was kept. Rules the bots threw out: Fort Harrow without Arrows (0%), the Blight Pit or Riftmaw on 10 lives (0–10%), Black Cliffs without Talents (0%), only Gallows Hill's 5 hill Spots (0%), and Three Gates with 15–16 s Breaks (0–10%) or 20 s (80% on seeds 1–5).
- **Why The Gravelord's Host is still a plain HP rule.** A Gravelord with 50% more HP, or double, was the themed rule to try. It changes nothing for the bot: over 10 seeds the bot never kills him, even at his usual HP, leaks him for 5 lives with 3–6 Revenants, and still wins 10 out of 10. A boss-only rule alone is therefore 100% for the bot, and paired with fewer lives ("he must not get through") it is 0–10%. So the bots can't tune it, and Fort Harrow keeps +15% creep HP until a player shows whether focus fire on him is within reach.
- **For the bot, a Challenge without early-call gold waits its Breaks out,** as a competent player would.
- **A human plays better than the bot,** so the Challenges will likely feel easier than these numbers. The play-test decides whether any rule needs a second modifier.

**How it shows** (the UI builds this):
- **War map:** the pin of a won Stage carries a small Challenge mark: hollow while its Challenge is open, gold once it is won.
- **Stage panel:** under the Difficulty buttons, a Challenge block with its name, its rule line, "1 Star · Normal" (or "Won · fastest 8:42") and Play Challenge. Before the Stage is won, the block shows the name and rule dimmed with "Win this Stage to open it".
- **In a Run:** "Challenge: name" with the rule as short lines (`challengeLines`); the Stars shown are the Challenge's Star rather than Stars by lives, and Send now shows no gold in Short Supply.
- **End card:** "Challenge won", its Star ("+1 to the Campaign" on the first win, "Already won" after), the Campaign's Stars out of 48, and the time with New best. A Stage's first win lists its Challenge under Opened.
- **Records:** a Challenge column in the Original's table, with the fastest Challenge win or a dash, and "n of 48 Stars · n of 12 Challenges".

**As built in the UI** (where it settled something the list above leaves open):
- **War map:** the mark is a small diamond at the top right of the pin: dark with a gold edge while the Challenge is open, solid gold once it is won. The pin's tooltip says which. The Campaign's foot counts "n of 48" from the rules' own total.
- **Stage panel:** Play Challenge is the gold button until the Challenge is won, then a plain one. It asks before replacing a saved Run, as the Difficulty buttons do.
- **A phone on its side** (screens 520 px tall or less): the Stage panel puts the four Difficulties in one row. Until the Stage is won, it keeps the Region's two-line intro, the Campaign's only story text, and the locked Challenge shrinks to its name and "Win this Stage to open it". Once the Stage is won, the intro gives its room to the Challenge's rule and Play Challenge (the map still names the Region). Either way the whole panel fits 659 × 393 without a scroll.
- **HUD:** the Challenge's name in gold after the diamond, beside Threat; the word "Challenge" is in its tooltip, because the phone's 212 px HUD has no room for it. Under it, the Star and the rule as chips. A family rule's chip names the shorter side: "No Arrow towers", "No Frost or Arcane towers", but "Cannon and Frost only". In Short Supply, Send now reads "no gold · Wave 9 in 0:24".
- **End card:** Victory, then "Challenge won: The Burnt Mill, with 11 lives left", one Star, "+1 to the Campaign" (or "Already won: no more Stars"), "n of 48 Stars" and the time with New best. A loss reads "The Challenge fell on Wave 7 of 12", and Retry plays the Challenge again.
- **Its name elsewhere:** Play again, Continue and an imported save code call it "Challenge: The Burnt Mill · The Mill Road".
- **Records:** the heading reads "n of 48 Stars earned · k of 12 Challenges won".
- **How to play** has a short "Challenges" paragraph.

## 17. Free placement (2026-10-19)

You asked on 2026-10-19 to place towers anywhere beside the creep line. Build Spots go: a 2 × 2 tower may stand on any **Open ground** off the road. The road stays fixed, so a tower still never Blocks. This replaces PLAN §3 Phase 3's "Build Spots only". Step 2 builds the rules, saves, bots and the retune; step 3 builds the UI.

**Where towers go**
- Every cell of a Stage's Map is road, Scenery or Open ground. The road is each route's two-cell width, painted as now. Scenery is a few named pieces per Stage (below). Every other cell is Open ground, the Map's edges included.
- A tower covers 2 × 2 cells of Open ground that no other tower holds. Any Open cell can be its top-left: there is no even-cell alignment, as in Element and Maul.
- There is no tower cap outside two Challenges (below). Gold is the limit.
- A tower far from the road is allowed, only wasted. Building stays instant, at any time, mid-Wave too.

**Scenery**
- A piece has a kind, a name, the words the Ghost shows, and a few rectangles of cells, each [col, row, width, height]. The kinds are water, building, cliff and pit; Challenges add burnt.
- `stageMap` paints the road first and Scenery after. A rectangle may cross the road, and the road stays road: a bridge, a ford.
- The terrain keeps its three characters: `,` road, `.` Open ground, `#` Scenery. The Map lists its pieces, so the board can draw each kind and the Ghost can name it. Gem, Element, Maul and Line Wars keep their terrain as it is.
- Creeps never cross Scenery, because they walk the road. Flyers fly over it.
- **Scenery never covers a cell of a Build Spot the Stage had.** So every older save's towers stand on Open ground. Greyriver's island Spots become islands in the river, and Black Cliffs' edge Spot a ledge over the chasm. A test holds the old Spot lists and checks it.
- One or two pieces a Stage, for the look and to shape where towers go. Every Stage keeps 278–422 Open cells, against 32–56 cells of Build Spots before.

| # | Stage | Scenery: kind, name, cells as [col, row, w, h] | What it shapes |
|---|---|---|---|
| 1 | The Mill Road | Building, the mill: [13, 4, 4, 4]. Water, the millpond: [17, 10, 4, 4] | The middle of each bend's inside, so towers crowd its corners and ends |
| 2 | Greyriver Crossing | Water, the Greyriver: cols 9–12 the whole height, less the two bridges and the two islands (cols 10–11, rows 3–4 and 13–14) | Splits the west bank from the east; each island holds one tower by its bridge |
| 3 | Gallows Hill | Building, the gallows: [12, 7, 3, 4] | Takes the hilltop's west shoulder; the crest that sees both legs stays open |
| 4 | Fort Harrow | Building, the fort: its wall either side of the gate, [0, 16, 15, 2] and [17, 16, 15, 2], and its keep, [22, 10, 10, 6] | The road runs in at the gate; the keep holds the south-east |
| 5 | Drowned Causeway | Water, the marsh: [7, 10, 4, 4], [13, 4, 4, 4], [19, 10, 4, 4] and [25, 4, 4, 4] | Drowns the inside of every turn, so towers stand mid-strip, as the pairs did |
| 6 | Sunken Chapel | Building, the chapel: [7, 8, 4, 2], at the road's end. Water, the black water: [26, 10, 6, 8] and [0, 16, 26, 2] | Nothing below the outer ring or beside the lower east leg |
| 7 | Plague Fords | Water, the river: [13, 0, 2, 18], forded by both roads | Splits the ground between the fords |
| 8 | The Blight Pit | Pit, the plague pit: [20, 10, 2, 4] and [22, 10, 4, 2], inside the south-east loop | The loop keeps its four old Spots and room for two towers more |
| 9 | The Scar | Cliff, the crags: [0, 0, 9, 5]. Cliff, the cliff edge: [29, 0, 3, 18] | Nothing west of the exit leg, and only a two-cell strip outside the east legs |
| 10 | Black Cliffs | Pit, the chasm: [15, 0, 4, 12], [13, 0, 2, 4] and [13, 6, 2, 6] | The air line crosses it, and it splits the loop's inside down to the chasm's foot |
| 11 | Three Gates | Building, the broken wall: [0, 0, 5, 6] and [0, 10, 5, 8] | Nothing beside the gates, so towers go to the joins |
| 12 | Riftmaw | Pit, the Rift: [11, 8, 3, 3], [14, 10, 2, 1] and [16, 8, 3, 3], inside the inner ring | The old Spots at the Rift's edge stand on its rim; only the inner ring's west end stays open |

The Ghost's words: "on the mill", "in the millpond", "in the river", "on the gallows", "on the fort", "in the marsh", "on the chapel", "in the black water", "in the plague pit", "on the crags", "on the cliff edge", "in the chasm", "on the broken wall", "in the Rift".

**The command**
- `original.build` takes the top-left cell and the tower: `{ type: 'original.build', col, row, spec }`, as Element's and Maul's builds do.
- The old `spot` form is gone, and a command carrying only `spot` is refused ("build needs col, row and a tower"). No save holds a command: autosaves and save codes are snapshots of the state. No replay outside the tests names a Spot, and the tests' replays move to cells.
- Refusals, checked in this order, in words the Ghost shows:
  - "off the Map": a 2 × 2 that runs past the edge.
  - "on the road".
  - the Scenery's own words, such as "in the river" or "on burnt ground".
  - "a tower stands there".
  - a Challenge's Tower cap: "4 towers stand: the most in this Challenge".
  - then as now: a family not unlocked, a family, Tier or Specialisation the Challenge leaves out, and gold ("needs 70 gold").
- The `original.built` event carries `col` and `row` instead of `spot`.

**Old saves and codes**
- A save is a snapshot of the whole state, and it carries its own Map. An older Original save's Map still lists its Build Spots, and its towers stand on them.
- On load, a save whose Map lists Build Spots takes its Run's current Map: its Stage's, or its Challenge's, from `stage` and `challenge` in its state. Every tower stays on the cells it stands on, with its XP, Tower Level, targeting and gold spent. The roads are unchanged, so creeps on them walk on.
- The load then checks that every tower's cells are Open ground on that Map and match the grid. A save that fails is refused: "This saved Run's towers don't fit the Stage's Map any more, so it can't be loaded." The Scenery rule above means no real save fails.
- A save made after the change keeps the Map it carries, as every save does today.
- `SAVE_VERSION` stays 2. It covers every Game Mode, and bumping it would refuse all their saves. Autosave with Continue, and save codes, load through the same check.
- An older save of The Burnt Mill or Glass Slope loads onto its Challenge's new Map. Its towers stand on the Spots it kept, which burnt ground never covers, and no more of them than the Tower cap.
- From then on such a Run plays the current Waves, as any loaded Run does. Step 2's retune may change Waves, never roads.
- Stored Campaigns, Stars, Talents, and Stage and Challenge Records are stored apart from Runs and load unchanged. The Challenges keep their ids.

**The two Challenges.** `spots` (the Build Spots kept) is retired. Two modifiers replace it in §16's table: `burnt` (Burnt ground, applied at setup) and `maxTowers` (the Tower cap, checked on each build). Burnt ground paints Open ground only: road and the Stage's own Scenery stay as they are.

| # | Challenge | New rule | Modifiers | HUD chips |
|---|---|---|---|---|
| 1 | The Burnt Mill | Fire took the lower bend: build above the middle road only, 4 towers at most. | `burnt`: every cell south of the middle road, [0, 10, 32, 8], and west of the second bend, [0, 4, 5, 6], "on burnt ground". `maxTowers`: 4 | Lower bend burnt · 4 towers at most |
| 9 | Glass Slope | The middle row burned to glass: nothing stands on it, and 8 towers at most. | `burnt`: the strip between the two middle legs, [7, 9, 20, 2], "on the glass". `maxTowers`: 8 | Middle row burnt · 8 towers at most |

- Each keeps its name, id and theme. The burnt ground carries the theme and keeps towers off the lower bend and the middle row. The cap does most of the squeezing.
- The caps start at the Spots each kept, 4 and 8. Free places make each tower worth more, so the caps may need to fall. These numbers, and the burnt areas, are first guesses: step 2 tunes them with the bot to 25–40% over 20 seeds.
- Burnt ground never covers a Spot the Challenge kept (The Burnt Mill's 0–3, Glass Slope's 0–3 and 8–11), so their older saves load.

**Bots.** Before Wave 1, each bot lays out its own places. It scores every open 2 × 2 by the road within 340 of its centre, summed over the routes, so the inside of a corner and a strip between two legs score highest. Its seed adds ±20% noise to each score. It takes the best place, then the best that overlaps none taken, and so on, until it holds 32 places or the next scores under 40% of the best. The 4 best places by air line seen join them, if they aren't there already, so a Stage with flyers has places by the air line. These places stand in for Spots from then on. Balanced, greedy and single value each family's Tier 1 tower on each free place, at that family's range, as they valued Spots. The rotation bot fills them in order. A Totem's value already counts the towers within its aura, so Totems land among the towers. With every place taken, or a Challenge's Tower cap reached, a Tier 1 tower may make way for another family's, as now. The planner knows towers by their top-left cell, not a Spot index. That is two to four times today's work per decision, which the balance runner can afford.

**Balance**
- Free placement makes the player stronger: the best corners, as many towers as gold buys, and Totems ringed by towers. Expect every Stage's win rate to rise.
- The targets stay: the balanced bot wins Easy ~95%, Normal ~60% (50–80% per Stage) and Insane under 10% over 20 seeds, and each Challenge 25–40%, below its Stage.
- Levers, in this order:
  1. Each Stage's Waves: the sizes and HP of its last third, keeping §10's shape (light openings, the last Wave the heaviest). This is the lever §15 used.
  2. Each Stage's starting gold.
  3. A Stage that still runs away: more Scenery on its best ground, never over an old Spot.
  4. Only then the numbers every Stage shares: the bounty pool, the end-of-Wave bonus and tower prices. They move every Stage and Challenge at once.
- **Watch:** with space no longer the limit, Tier 1 towers wall to wall may beat upgrading, since each Tier buys 5–10% less DPS per gold (§6). If the balanced bot stops upgrading, flatten that step in the Tier prices rather than cap towers.
- **Watch:** one-family wins (§15) and Hard (~0% on Build Spots) may both rise.
- **No interest still holds.** Space is no longer the limit; gold is. That makes the early call, the Original's greed lever, matter more, and interest would still pull the other way, towards waiting and banking. Overlapping Waves still blur when a Wave ends.

**The UI** (step 3 builds it)
- **The ground at fit zoom.** Open ground is the Region's ground colour, with a light rim where it meets road or Scenery (Element's `plotRim`). Scenery is drawn by kind in the Region's palette: water, building, cliff, pit and burnt. The Build Spot pads (`spotRim`) go. A cell is about 21.7 pt on a phone in landscape, so a tower is about 43 pt and placing needs no pinch.
- **Where the ring opens.** A tap on Open ground opens the build ring round a 2 × 2 there. Of the four 2 × 2s that cover the tapped cell, it takes the open one nearest the tap, as Element's Ghost snaps. If none is open, it takes the one centred nearest the tap and shows the reason. The ring sits round it as it sat round a Spot.
- **Building.** Tap a family for its Ghost and range on that 2 × 2, then tap the family again, or the Ghost, to build. The ring closes after a build.
- **Another tap while the ring is up.** On Open ground, the ring and its Ghost move there and keep the family picked. On a tower, it selects the tower and the ring closes. On the road or Scenery, the ring closes and the hint says why ("Not on the road", "Nothing stands in the river").
- **No tap slop.** A tap on the Ghost's own four cells builds, and a tap a cell away moves it.
- **The Ghost** snaps to the grid, shows its range, and turns red with the reason on road, Scenery, another tower, the Map's edge, the Tower cap or gold.
- **Mac.** A click opens, moves and closes the ring as a tap does, and Q W E R T Y pick the ring's families in order. With no family picked, hovering over Open ground outlines the 2 × 2 a click would take. Once a family is picked, the Ghost follows the pointer over the board, snapped and red where it can't go, and a click on Open ground, or the same key again, builds where the Ghost stands. Off the board, or over the ring, the Ghost goes back to the ring's 2 × 2. Esc and right-click close the ring.
- **Words.** The hints become "Tap the ground beside the road to build" and "Pick a tower family for this place". How to play's "Build Spots" paragraph becomes "Building", and its controls lines say the ground instead of a Build Spot. At a Tower cap the ring's buttons dim with the cap's reason.

**My calls, open to change:**
- Scenery is `#` plus a named list on the Map, not new terrain characters, so no other Game Mode's terrain changes.
- One or two pieces of Scenery a Stage, none over an old Spot, chosen as in the table.
- No even-cell alignment, and no tower cap outside the two Challenges.
- An older save takes its Stage's current Map; a newer save keeps the Map it carries. `SAVE_VERSION` stays 2.
- The `spot` form of `original.build` is dropped, not kept beside `col` and `row`.
- The two Challenges keep their Spot counts as Tower caps to start, with burnt ground for the theme.
- On a phone the Ghost stays on the ring's 2 × 2 until another tap moves it; on the Mac it follows the pointer once a family is picked.
- The ring closes after each build, as before, rather than staying up for a row of one tower.
- No interest.
- The old Spot lists leave the Stage files for the tests, where they guard older saves.
