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
| Map | A fixed route, plus a straight air line for flying creeps. Towers stand only on Build Spots |
| Towers | 6 Tower Families. Each has Tiers 1, 2 and 3, then 2 Specialisations: 30 towers |
| Inside a Run | Gold buys towers and Tiers. Towers gain Tower Levels 1–10 from kills, with a Perk at 5 and at 10 |
| Across Runs | Stars (1–3 per Stage) buy Talents, one tree per family, refunded for free |
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
- **Start.** The Run opens with the Stage's starting gold and every Build Spot empty. Wave 1 waits until you press Send now.
- **Building.** Tap an empty Build Spot and a ring shows the unlocked families with their prices. Tap one for its Ghost and range, then tap again to build. Building is instant.
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
| Gravelord | Boss, Stage 4 | 20 | 100 | Boss | 1 | — | 5 | 30 | At half HP, enrages: +50% speed for 4 s |
| Plague Mother | Boss, Stage 8 | 30 | 90 | Boss | 1 | — | 10 | 40 | Regains 1% per second; every 6 s drops 3 Crawlers behind her |
| Riftlord | Final boss, Stage 12 | 50 | 80 | Boss | 1 | — | 20 | 60 | At 75%, 50% and 25% HP: a 4 s Shield four times as strong, and he calls 4 Hounds |

- **Bosses** take slows at half strength and ignore stuns and freezes. Each arrives with a few escorts.
- **Air** gets less HP because it gets about a third of the exposure (research §9).

**What each creep counters.** No creep shuts a family out, but each one punishes a lazy build.

| Creep | Punishes | Answer |
|---|---|---|
| Ghoul | — | Anything |
| Hound | Slow shots (Cannon, Thunder Mortar) and towers placed late on the route | Frost, Arrow |
| Crawler | Single-target towers (Mage line, Deadeye, Arcane Lance, Widow's Fang) | Cannon, Ranger Lodge, Prism, Plague Cauldron, Blizzard |
| Bloodbat | Cannon and Poison, which can't hit air, and Spots far from the air line | Arrow, Frost, Arcane, Flak Battery, Storm Totem |
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
| Ranger Lodge | Spec, +250 | 595 | 18 | 0.6 | 384 | 30, or 90 on 3 | Fires 3 arrows at 3 creeps. Swarm and air |
| Deadeye Perch | Spec, +250 | 595 | 85 | 2.2 | 576 | ~50 | 20% crit ×2.5. Treats Armored as Unarmored. Targets Strong |

### Cannon

Ground only. Splash deals full damage within 48 and half within 112.

| Tower | Step | Total | Damage | Cooldown | Range | DPS per creep | Notes |
|---|---|---|---|---|---|---|---|
| Cannon Tower | T1 | 90 | 9 | 1.8 | 288 | 5.0 | |
| Bombard | T2, +140 | 230 | 22 | 1.8 | 304 | 12.2 | |
| Great Bombard | T3, +210 | 440 | 40 | 1.8 | 320 | 22.2 | |
| Thunder Mortar | Spec, +300 | 740 | 90 | 3.0 | 640 | 30 | Can't fire within 160. Splash 80 full, 176 half |
| Flak Battery | Spec, +300 | 740 | 30 | 0.9 | 384 | 33 | Hits ground and air. Splash 40 full, 88 half |

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
| Plague Cauldron | Spec, +270 | 650 | — | 16 per s | 2.0 | 384 | 16 per creep | Lobs a cloud, radius 112, that lasts 3 s and poisons everything inside |
| Widow's Fang | Spec, +270 | 650 | 10 | 8 per s per stack | 0.8 | 352 | ~52 | Each hit adds a 4 s stack, up to 5. Sticks to one target |

### Totem

Totems don't attack, except Storm Totem. Their auras reach towers within 256, about two Build Spots. Two Totems' auras of the same kind don't stack.

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

- **Stars.** A Stage pays 1–3 Stars by lives left. Replaying pays only the difference over your best. The Campaign holds 36.
- **Trees.** Each family has its own Talent tree. It opens when the family unlocks, and buying opens once you have Stars, after Stage 1.
- **Rows.** Each tree has 4 rows, bought in order. Rows 1–3 offer two Talents and you hold one of them; row 4 is a single capstone.
- **Cost.** Rows cost 1, 2, 2 and 3 Stars, so 8 Stars fill a tree and 48 fill all six. The Campaign's 36 fill four and a half, so you choose a focus. Challenge Stages (Phase 3, step 4) will top this up.
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

**Why no interest.** Build Spots make space the limit, not gold (research §3). The early call is the Original's greed lever, and interest would pull the other way, towards waiting and banking. Overlapping Waves also blur when a Wave "ends". The end-of-Wave bonus keeps §4's income slope.

**Wave recipes.** A normal Wave holds 10 Ghouls' worth of HP. A new creep's first Wave is alone at 0.8× and is followed by a Wave that mixes it with known creeps. Late mixed Waves run 1.2–1.5×. A boss Wave is the boss plus a few escorts. Each Stage's last Wave is its hardest.

**Sanity model.** This compares the gold needed in towers to clear a Wave with the gold earned by then. It assumes 0.08 effective DPS per gold, 20 s of firing per tower per Wave on a route (a maze gets 25 s), 1.25× overkill, early calls taken at 40%, an average Tower Level bonus of +9%, and Talents worth +0.7% per Star earned.

| Stage | Wave 1 | Middle | Last |
|---|---|---|---|
| 1 | 0.69 | 0.52 | 0.47 |
| 4 (Gravelord) | 0.66 | 0.47 | 0.61 |
| 8 (Plague Mother) | 0.66 | 0.48 | 0.72 |
| 12 (Riftlord) | 0.71 | 0.56 | 0.93 |

Below 0.5 is comfortable, and near 1 is tight. The final boss is meant to be tight; PLAN §4 aims for a ~60% bot win rate on Normal.

## 11. The 12 Stages

Every Map is 32 × 18 cells (§12). The length assumes about 40 s per Wave at 1× without early calls.

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

- **Spots grow from 8 to 14.** By a Stage's end, a good Run has filled most Spots and specialised a few, which matches Goal Defense's "60–70% full" target (research §6).
- **Each Region ends on a boss** that tests what that Region taught: the Gravelord tests focus fire, the Plague Mother tests splash plus burst, and the Riftlord tests everything.
- **Region 3 brings no new towers.** Its new creeps (Shieldbearer, Gargoyle) push you into Specialisations and Talents.

## 12. Maps

- **Size.** 32 × 18 cells of 64 units, or 2,048 × 1,152 world units. At 390 pt of landscape height a cell is about 21.7 pt, so a 2 × 2 Build Spot is about 43 pt. That is a tap target without pinching, unlike Gem's and Element's Maps.
- **Route.** A polyline, two cells wide, walked through its centre, reusing `src/sim/path/route.ts` (built for Element). A creep leaks at the end.
- **Build Spots.** A list of 2 × 2 cells beside the route, never on it, so towers never Block.
- **Air line.** A polyline of 2–4 points from the spawn to the exit, drawn faintly. Flying creeps follow it at their own speed.
- **Several spawns.** Stages 7 and 11 have 2 and 3 routes. Each Wave group names its route.

## 13. What the rules session builds

The engine already has splash, slows that don't stack, poison, armor debuffs, stuns, crits, multishot, auras (attack speed, damage, range; armor, slow and poison on creeps), damage tables and one fixed route. New work:

- **Map:** several routes per Map, Build Spots, and an air line that flying creeps follow.
- **Creeps:** Shield (flat block per hit), splitting on death, boss spawns and enrage, slows at half strength and stun immunity for bosses.
- **Towers:** Tier upgrades and the Specialisation choice; targeting modes; poison that prefers unpoisoned creeps, and stacking poison; the ramping beam; the cloud; the bouncing bolt; freeze; Armored treated as Unarmored.
- **Tower Levels:** XP with Assists and Totem shares, Level bonuses, the 12 Perks.
- **Progression:** Stars, Talent trees with rows and free reset, unlocks, Stage Records. Campaign progress is saved apart from Runs, so a save code holds a Run, not the Campaign.
- **Pacing:** Breaks that start at a Wave's last spawn, early-call gold, the end-of-Wave bonus on clear, and Threat.
- **Bots:** greedy-DPS, single-family and balanced bots per Stage, to check that no single family clears a Stage from Stage 5 on (research §3) and to tune HP, gold and prices.

**Later:** challenge versions of Stages that pay extra Stars (Phase 3, step 4), and maybe a hero tower.
