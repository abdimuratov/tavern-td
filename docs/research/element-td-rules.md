# Element TD rules reference

Researched 2026-10-17 for the Element Game Mode. Vocabulary follows [CONTEXT.md](../../CONTEXT.md). The machine-readable twin of this file is `element-data.json` (same numbers, with an `assumed` flag on filled-in values).

**Sources and caveats.** Everything here comes from the open-source Dota 2 port of the Classic, [MNoya/Element-TD](https://github.com/MNoya/Element-TD) at commit `5ae9fad3ff0812d9c9a582351852434593c3dbdd` (2026-10-12, port version 1.18). The repo is still maintained: most commits since 2024 are by ynohtna92, on top of the 2015–2017 original by Quintinity, A_Dizzle, MNoya (code), Karawasa and WindStrike (design) and Azarak (map).

- **Licence.** The repository has **no licence file**, the README states no licence, and GitHub reports `license: null`. With no grant, all rights are reserved by default. As with Gem, we port rules and numbers only (facts), never its text, tooltips, unit names as player-facing names, models, sounds or art. Unit names below (for example `hydro_tower`) are kept only as ids so every number can be traced. The game shows its own names.
- **Paths.** Paths are relative to `game/dota_addons/element_td/` unless they start with `content/`. `npc/…` means `scripts/npc/…`, and Lua files are under `scripts/vscripts/`.

Numbers come from four layers:

1. **KV data.** `scripts/kv/gamesettings.kv` and `waves.kv`, plus `npc/npc_units_custom.txt`, `npc_abilities_custom.txt` and `npc_items_custom.txt`. These are the merged files the game loads. The split copies in `npc/units/…`, `npc/abilities/…` and `npc/items/…` match them except where noted.
2. **Lua logic** in `scripts/vscripts/`.
3. **The map.** The compiled gridnav `maps/element_td.vpk → maps/element_td.gnv` gives 256 × 160 cells of 64 units. The map source `content/dota_addons/element_td/maps/element_td.vmap` (binary DMX) gives the entity positions, and `content/…/materials/overviews/element_td.tga` is the top-down overview.
4. **Engine behaviour** that no file states, marked **assumed** with the reason.

How I read it: I parsed the KV, VPK, DMX and TGA files with my own scripts. Nothing from the repo was run or built. Some of it is WC3-era design carried into Dota 2 and some is Dota-only; §13 and §14 say which, where public pages settle it.

**Two words to keep apart.** The port calls its 55-Wave length "Classic" (`#length_classic`). In our vocabulary Classic means the WC3 map, so this file calls that length **Full** and the 30-Wave one **Express**. The port's difficulties are Normal, Hard, VeryHard and Insane; §8 maps them onto ours.

---

## At a glance

| Rule | Element TD (Dota 2 port) value | Source |
|---|---|---|
| Lane | One fixed, walled lane per player, 2 cells wide, with 12 corners. Creeps cannot leave it, and towers never block it | `maps/element_td.gnv`, `wavedata.lua` `CreateMoveTimerForCreep` |
| Map | 56 × 40 cells of 64 (rotated to landscape), with 592 buildable cells on raised plots | §1 |
| Waves | Full: 55 Waves, then an endless boss Wave. Express: 30 Waves. 30 creeps per Wave, one every 0.5 s | `kv/waves.kv`, `wavedata.lua`, `wave.lua` |
| Creep HP | Full: 75 × 1.168^(w−1). Express: 200 × 1.295^(w−1). Rounded, then × Difficulty | `kv/gamesettings.kv` `GameLength`, `wavedata.lua` `loadWaveData` |
| Start | 250 gold, 1 lumber, 50 lives. Express: 600 gold, 2 lumber | `gamesettings.kv` `GameLength`, `MapSettings` |
| Bounty | ⌊1.093^(w+5)⌋ per creep on Normal, the same for every creep in the Wave | `gamesettings.lua` `GetBountyForWave` |
| Interest | ⌊2% of gold⌋ every 15 s from the first spawn, uncapped. A leak pauses it until that Wave is cleared | `mechanics/interest.lua` |
| End-of-Wave gold | **None** | no code grants it |
| Lumber | 1 at the start of the break after Waves 5, 10 … 50 (Express: every 3rd Wave, up to 27) | `wavedata.lua` `WaveGrantsLumber` |
| Elements | 6 elements, each up to level 3. One lumber summons an Elemental, and killing it raises that element by 1 | `mechanics/summoner.lua`, `playerdata.lua` |
| Damage cycle | Water > Fire > Nature > Earth > Light > Dark > Water: 200% forward, 50% backward, 90% into composite | `constants.lua` `DamageModifiers` |
| Towers | 144 units: Arrow, Cannon, 12 elemental Arrows and Cannons, 6 single elements × 4 levels, 15 duals × 3, 20 triples × 3, Periodic | `npc/npc_units_custom.txt` |
| Pure Essence | Free after Waves 50 and 55. You can also buy at most 2, for 1 lumber each. Spent on Pure towers (10,000 gold) and the Periodic tower (13,000 gold) | `wavedata.lua` `WaveGrantsEssence`, `mechanics/resources.lua` |
| Leak | −1 life (bulky −2; boss Waves −3 per creep; an Elemental −3). The creep **teleports back to the spawn and keeps walking** | `wavedata.lua` `CreateMoveTimerForCreep`, `ReduceLivesForPlayer` |
| Winning | Full: clear Wave 55, then survive boss Waves for score. Express: be alive after Wave 30 | `ElementTD.lua` `CheckGameEnd` |

## 1. Map and route

### What the port does

- **Eight copies of one lane.** `maps/element_td` has eight player sectors in a 4 × 2 grid. Each is 4,096 × 5,120 units (`constants.lua` `generateSectorBounds`). All eight have the same gridnav: sectors 3–7 differ from sector 1 in a single cell (my comparison of `element_td.gnv`). The overview (`content/…/materials/overviews/element_td.tga`, 512² px at 32 units per px) shows the same lane eight times.
- **Two portals at the top of each sector.** Creeps spawn at `start_location_N`, in the left portal, and leak at `end_location_N`, in the right portal, 768 units further east (`content/…/maps/element_td.vmap`; sector 1 is (−6912, 4268) → (−6144, 4268)).
- **How creeps move.** Every 0.1 s each creep is ordered to move to the end location, and Dota pathfinding walks it there (`wavedata.lua` `CreateMoveTimerForCreep`). A creep within **100** of the end location has leaked.
- **The lane is a sunken trench.** It sits at z = 256 and is walled off from the plots, which sit at z ≈ 384. In the gridnav it is a single corridor, 2 cells wide, with no branches. Pathfinding therefore always takes the full winding route, and towers never change it. Towers use `BlockPathingSize 0` and stand on plots that do not touch the lane (`npc/units/towers/**`).
- **Building.** You can only build on the raised plots: `kv/building_settings.kv` sets `HEIGHT_RESTRICTION 380`, and `builder.lua` requires the spot to be inside your own sector.
  - **Footprint.** A tower uses `ConstructionSize 2`, which is **2 × 2 cells (128 × 128)**.
  - **Snap.** An even size snaps to the nearest multiple of 64 (`libraries/buildinghelper.lua` `SnapToGrid64`), so towers sit on any 64-unit cell corner.
  - **Build time.** Building takes 1 s (`BuildTime`). Pure towers take 3 s and the Periodic tower 6 s, and a tower cannot attack while it is under construction.
  - **Timing.** You can build, upgrade and sell at any time, including mid-Wave.

### The Map (proposed)

Sector 1's lane box is 40 × 56 cells in Dota orientation (portrait). The Map below is that box **rotated 90° counter-clockwise** so it is landscape. Rotation keeps every distance and the turn direction, so the route is unchanged. The portals end up on the left edge. The grid is **56 columns × 40 rows** (3,584 × 2,560 units). Row 0 is the top, and x grows to the right. I built it from `maps/element_td.gnv`.

| Char | Meaning |
|---|---|
| `.` | Buildable plot (592 cells) |
| `#` | Blocked: cliff, wall or out of bounds |
| `,` | Lane: walkable, not buildable (460 cells) |
| `S` | Spawn |
| `E` | Exit |
| `1`–`9`, `A`, `B`, `C` | Corners 1–12 of the route, in order |

A marker sits in the cell whose top-left corner is nearest the exact point, which is given in the table below.

```
#####....###############################################
#####....###,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
#####....###,B,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,A
#####....###,,########################################,,
#####....###,,########################################,,
#####....###,,########################################,,
#####....###,,###..................................###,,
#####....###,,###..................................###,,
#####....###,,###..................................###,,
#####....###,,###..................................###,,
#####....###,,###....##########################....###,,
#####....###,,###....##########################....###,,
#####....###,,###....##########################....###,,
#####....###,,###....###,,,,,,,,,,,,,,,,,,,,###....###,,
#####....###,,###....###,6,,,,,,,,,,,,,,,,,7###....###,,
#####....###,,###....###,,################,,###....###,,
############,,###....###,,################,,###....###,,
############,,###....###,,################,,###....###,,
############,,###....###,,###..........###,,###....###,,
,,,,,,,,,,,,,,###....###,,###..........###,,###....###,,
,,E,,,,,,,,,,C###....###,,###..........###,,###....###,,
#################....###,,###..........###,,###....###,,
#################....###,,#########....###,,###....###,,
#################....###,,#########....###,,###....###,,
#####................###,,#########....###,,###....###,,
#####................###,,,,,,,,###....###,,###....###,,
#####................###,5,,,,,4###....###,,###....###,,
#####................#########,,###....###,,###....###,,
#################....#########,,###....###,,###....###,,
#################....#########,,###....###,,###....###,,
#################..........###,,###....###,,###....###,,
,,,,,,,,,,,,,,###..........###,,###....###,,###....###,,
,,S,,,,,,,,,,1###..........###,,###....###,,###....###,,
############,,###..........###,,###....###,,###....###,,
############,,################,,###....###,,##########,,
############,,################,,###....###,,##########,,
#####....###,,################,,###....###,,##########,,
#####....###,,,,,,,,,,,,,,,,,,,,###....###,,,,,,,,,,,,,,
#####....###,2,,,,,,,,,,,,,,,,,3###....###,8,,,,,,,,,,,9
#####....##########################....#################
```

The route is the centre line of the 2-cell lane. Map units have their origin at the top-left with y growing down. Dota units are the port's world coordinates for sector 1.

| Point | Map x, y | Dota x, y |
|---|---|---|
| Spawn S | 148, 2048 | −6912, 4268 (`start_location_1`) |
| 1 | 832, 2048 | −6912, 3584 |
| 2 | 832, 2432 | −7296, 3584 |
| 3 | 1984, 2432 | −7296, 2432 |
| 4 | 1984, 1664 | −6528, 2432 |
| 5 | 1600, 1664 | −6528, 2816 |
| 6 | 1600, 896 | −5760, 2816 |
| 7 | 2752, 896 | −5760, 1664 |
| 8 | 2752, 2432 | −7296, 1664 |
| 9 | 3520, 2432 | −7296, 896 |
| A (10) | 3520, 128 | −4992, 896 |
| B (11) | 832, 128 | −4992, 3584 |
| C (12) | 832, 1280 | −6144, 3584 |
| Exit E | 148, 1280 | −6144, 4268 (`end_location_1`) |

- **Length.** One lap is **14,424 units**. That is 48.1 s at the base speed of 300, or 19.2 s at the haste speed of 750.
- **Shape.** The route goes in from the spawn and winds inward through corners 1–7. It turns back out at 7–9, runs the long outer edge from 9 through A to B, and returns along the top to the exit beside the spawn. Most plots sit between two passes of the lane, which gives the "two-pass" spots WC3 guides talk about.
- **Leaks.** A creep that reaches the exit loses you lives, then is teleported to the spawn and walks the whole lap again (`wavedata.lua` lines 513–552).
- **Plots.** The plots are 4 cells wide (two towers side by side) except the big inner plots. Outside the lane box nothing is buildable.

**Fit on a phone.** At 390 pt of landscape height, 40 rows give about 9.75 pt per cell and about 19.5 pt per tower. The whole Map fits on screen, but placing towers needs the planned pinch-zoom to about 2×. No shrinking is needed, and shrinking would break 1:1 distances.

**Faithful to WC3?** **Assumed**: I could not confirm it cell for cell. The web check of WC3 pages had not reported back when this file was written. What we know:

- The Dota map was rebuilt for the port by its own mapper. Its eight sectors share one layout: a two-portal entry and exit side by side, and one winding walled lane.
- WC3 guides talk about "2-pass" build spots ([wc3-td-maps.md](wc3-td-maps.md)). This lane has them.
- **Recommendation.** Use this Map as the faithful route, and revisit only if a WC3 screenshot shows a different lane.

## 2. Elements and the damage cycle

**Multipliers** (`constants.lua` `DamageModifiers`, applied in `mechanics/damage.lua` `ApplyElementalDamageModifier`). Rows are the attacking element and columns the creep's element. A blank cell is 100%.

| Attack \ creep | Water | Fire | Nature | Earth | Light | Dark | Composite |
|---|---|---|---|---|---|---|---|
| Water | | **200%** | | | | 50% | 90% |
| Fire | 50% | | **200%** | | | | 90% |
| Nature | | 50% | | **200%** | | | 90% |
| Earth | | | 50% | | **200%** | | 90% |
| Light | | | | 50% | | **200%** | 90% |
| Dark | **200%** | | | | 50% | | 90% |
| Composite | | | | | | | |

- **The cycle.** Water beats Fire, Fire beats Nature, Nature beats Earth, Earth beats Light, Light beats Dark, and Dark beats Water. Each element deals 50% to the element that beats it. **Composite** damage is 100% against everything. Every elemental attack deals 90% to a composite creep.
- **One element per tower.** Each tower has a single `DamageType` that decides its multiplier (`damage.lua` `GetDamageType`). Duals and triples are **not** composite: each uses one of its elements, listed in §3. Only the basic Arrow, the basic Cannon and the Periodic tower deal composite damage. The Periodic tower overrides it per target (§3). Some abilities pass an `element_override` (§3).
- **Creep elements** come from the creep's `CreepAbility1` (`<element>_armor`). Full-length Waves by element (`kv/waves.kv` + `npc/units/creeps/*.txt`):

| Element | Waves |
|---|---|
| Earth | 1, 6, 15, 25, 34, 38, 46, 54 |
| Water | 2, 8, 19, 26, 31, 36, 42, 50 |
| Fire | 3, 9, 16, 21, 29, 41, 47, 52 |
| Nature | 4, 12, 18, 23, 28, 35, 45 |
| Light | 5, 10, 14, 22, 32, 39, 43, 48 |
| Dark | 7, 11, 20, 24, 30, 37, 44, 53 |
| Composite | 13, 17, 27, 33, 40, 49, 51, 55, and the boss (56) |

Elementals take damage as their own element (`npc/units/elementals/*.txt` `Ability1 <element>_armor`).

## 3. Towers

There are 144 tower units: 2 basic, 12 elemental Arrows and Cannons, 6 single elements × 4 levels, 15 duals × 3 levels, 20 triples × 3 levels, and the Periodic tower. Stats are from `npc/npc_units_custom.txt` (`Cost`, `TotalCost`, `EssenceCost`, `Damage`, `AttackRate`, `AttackRange`, `ProjectileSpeed`, `DamageType`, `AOE_Full`/`AOE_Half`, `Requirements`, `Upgrades`, `BuildTime`). Abilities are from the Lua classes in `towers/**` and their `AbilityValues` in `npc_abilities_custom.txt`; the split files match it exactly. **Cooldown** is `AttackRate`, the seconds between attacks. Every tower hits every creep, because Element TD has no air creeps.

### 3.1 Buying, upgrading and selling

**What you can build from scratch** (the builder's build items and abilities):

| Build | Cost | Needs |
|---|---|---|
| Arrow | 100 | nothing |
| Cannon | 100 | nothing |
| A single-element tower | 175 | that element at level 1 |
| Periodic | 13,000 + 1 Pure Essence | all six elements at level 1 |

**Everything else is an upgrade of a standing tower.** The upgrade tree is the unit's `Upgrades` list, and the upgrade costs the target unit's `Cost`:

| From | To | Step cost | Needs |
|---|---|---|---|
| Arrow or Cannon | the elemental Arrow or Cannon of an element you have | 125 | that element at 1 |
| Single, level 1 | level 2 ("focused") → level 3 ("refined") → Pure | 575 → 2,250 → 10,000 + 1 essence | the element at 2 → 3 → 3 |
| Single, level 1 | any dual that contains its element | 425 | both elements at 1 |
| Dual, level 1 | dual level 2 → level 3 | 1,150 → 2,500 (Blacksmith, Trickery, Well: 4,250) | both elements at 2 → 3 |
| Dual, level 1 | any triple that contains both its elements | 900 | all three elements at 1 |
| Triple, level 1 | level 2 → level 3 | 3,500 → 5,000 | all three at 2 → 3 |

Sources: `mechanics/upgrades.lua` and `npc/items/upgrades/**`.

- **Branching happens at level 1.** A level-2 or level-3 tower can only climb its own line. To change branch you sell it and rebuild.
- **Total costs:**
  - single 175 / 750 / 3,000 / 13,000;
  - dual 600 / 1,750 / 4,250, or 6,000 for the support duals;
  - triple 1,500 / 5,000 / 10,000;
  - elemental Arrow or Cannon 225.
- **Which triples each dual leads to** follows from the elements. For example, Blacksmith leads to Flamethrower, Gold, Haste or Quake.

**How an upgrade works** (`mechanics/upgrades.lua`):

- **Rebuild.** The tower is replaced by the new unit, which rebuilds over its `BuildTime`: 1 s for single levels and Arrow/Cannon, 2 s for duals, 3 s for triples and Pure, 6 s for the Periodic tower. It cannot attack while it rebuilds.
- **Cancelling** refunds 100% and reverts to the old tower.
- **What carries over.** The kill count carries over only if the script class stays the same, and it has no effect on stats anyway (`towers/modifier_kill_count.lua`). Blacksmith and Well buffs carry over with their full duration. Per-attack streaks (Light, Fire, Quark, Haste, Tidal and Magic) restart.
- **Timing.** You can build, upgrade and sell at any time, mid-Wave included, once the tower is fully built.

**Selling** (`mechanics/sell.lua`, `builder.lua` lines 191–201). The refund is a share of `TotalCost`, rounded half-up:

- **90%** for every tower except the lines below.
- **98%** for anything in the Arrow or Cannon lines. Elemental Arrows and Cannons round up instead.
- **100% for every tower in the random element modes.** The port uses this to make up for random picks.
- Pure Essence is refunded too. A Trickery clone sells for 0.

There is **no time-limited full refund**. The only other 100% case is cancelling a build that is still in progress. td-design-and-balance.md's "100% basic, 75% elemental" is a WC3 or older figure; see §14.

**Targeting** (`towers/TowersManager.lua`, `modifier_attack_targeting.lua`):

- **Default.** Towers target the **closest** creep and re-pick a target after every attack, unless the class says otherwise below.
- **Player choice.** Port 1.18 lets you cycle a tower through closest, farthest, lowest HP, highest HP, oldest spawn and newest spawn. Upgrading resets it to the class default.
- **Range.** A creep counts as in range at `AttackRange` + 50 (the tower's hull).

### 3.2 Splash, the default damage rule

A splash tower deals its damage in two halves:

- one half to every creep within `AOE_Half`;
- another half to every creep within `AOE_Full`.

So creeps within the full radius take 100%, and creeps in the outer ring take 50%. Each half is a separate damage call with its own rounding, and a creep killed by the first half is skipped by the second (`towers/BasicTowerAOE.lua`, shared by every splash tower). "Splash 100/200" means full 100, half 200. Projectile speeds are in units per second. A tower with no projectile speed is instant or melee-type.

### 3.3 Basic and elemental Arrow and Cannon

| Tower | Cost (total) | Damage | Cooldown | Range | Projectile | Deals |
|---|---|---|---|---|---|---|
| Arrow | 100 | 70 | 0.66 | 900 | 2,500 | composite |
| Elemental Arrow (×6) | 125 (225) | 210 | 0.66 | 900 | 2,500 | its element |
| Cannon | 100 | 90 | 1.5 | 700 | 2,000 | composite, splash 100/200 |
| Elemental Cannon (×6) | 125 (225) | 270 | 1.5 | 700 | 2,000 | its element, splash 100/200 |

- **Cannons are artillery** (`AttackGround 1`, `mechanics/ground_attacks.lua`). The shell is aimed at where the target stood when the cannon fired and lands after distance ÷ 2,000 s, so moving creeps can walk out of it. You can also order a cannon to fire at a point within 550.
- **Support class.** Arrows and Cannons are `TowerType Support`, so they can never receive Blacksmith, Well or Trickery effects.

### 3.4 Single-element towers (levels 1, 2, 3 and Pure)

| Element | Step cost | Damage | Cooldown | Range | Splash | Projectile |
|---|---|---|---|---|---|---|
| Dark | 175 / 575 / 2,250 / 10,000 | 360 / 2,500 / 17,600 / 200,000 | 1.5 | 1,150 | – | 2,500 |
| Earth | 175 / 575 / 2,250 / 10,000 | 55 / 385 / 2,700 / 27,000 | 1 | 900 | 150/300; Pure 200/400 | 2,000 |
| Fire | 175 / 575 / 2,250 / 10,000 | 30 / 210 / 1,500 / 15,000 | 0.31 | 700; Pure 900 | 200/400 | 2,000; Pure 2,500 |
| Light | 175 / 575 / 2,250 / 10,000 | 120 / 840 / 5,900 / 59,000 | 0.66 | 1,500; Pure 1,750 | – | 2,700 |
| Nature | 175 / 575 / 2,250 / 10,000 | 80 / 560 / 3,900 / 39,000 | 0.31 | 700; Pure 900 | – | 3,000 |
| Water | 175 / 575 / 2,250 / 10,000 | 90 / 630 / 4,400 / 44,000 | 0.66 | 900 | 100/200 | 2,500 |

| Element | Ability (values for levels 1 / 2 / 3 / Pure) | Default target |
|---|---|---|
| Dark | **Overkill.** When a hit kills, the excess damage flies (at speed 1,250) to a random other creep within 500 of the dead one and lands as **pure** damage: no element multiplier, no amp. It never chains | closest |
| Earth | **Aftershock.** 1 s after each hit, the same split splash repeats at the impact point for **50%** of that hit's damage | closest |
| Fire | **Blaze.** With *n* consecutive earlier hits on the same creep, the half radius is 400 + 30*n* and the full radius 200 + 15*n*, uncapped. *n* resets when the target changes | **highest HP, keeps its target** |
| Light | **Intensity.** With *n* consecutive earlier hits on the same creep, damage = base + *n* × **5 / 35 / 250 / 2,500**, uncapped. Resets on a new target | closest |
| Nature | **Force of Nature.** Damage × (1 + 0.15*k*), floored, where *k* is the number of other creeps within 125 of the target | closest |
| Water | **Bounce.** After its splash, one bounce flies (speed 833) to a random other creep within 250 and deals **25%** of the attack as the same 100/200 splash there | closest |

### 3.5 Duals (levels 1 / 2 / 3)

| Tower | Elements | Deals | Step cost (L1 / L2 / L3) | Damage | Cooldown (s) | Range | Splash full/half | Projectile | Build (s) |
|---|---|---|---|---|---|---|---|---|---|
| Blacksmith | Fire + Earth | Fire | 425 / 1,150 / 4,250 | 700 / 3,500 / 17,500 | 1 | 900 | – | 2,000 | 2 |
| Disease | Dark + Nature | Dark | 425 / 1,150 / 2,500 | 140 / 700 / 3,500 | 0.31 | 700 | – | 3,000 | 2 |
| Electricity | Fire + Light | Fire | 425 / 1,150 / 2,500 | 0 | 1.5 | 900 | – | 1,000 | 2 |
| Flame | Fire + Nature | Fire | 425 / 1,150 / 2,500 | 300 / 1,500 / 7,500 | 0.66 | 700 | – | 2,000 | 2 |
| Gunpowder | Earth + Dark | Earth | 425 / 1,150 / 2,500 | 50 / 250 / 1,250 | 0.66 | 1,500 | – | 2,000 | 2 |
| Hydro | Water + Earth | Earth | 425 / 1,150 / 2,500 | 700 / 3,500 / 17,500 | 0.66 | 700 | – | 2,000 | 2 |
| Ice | Water + Light | Light | 425 / 1,150 / 2,500 | 800 / 4,000 / 20,000 | 1.5 | 900 | 100/200 | 2,500 | 2 |
| Life | Light + Nature | Nature | 425 / 1,150 / 2,500 | 420 / 2,100 / 10,500 | 0.66 | 1,150 | – | 2,500 | 2 |
| Magic | Dark + Fire | Dark | 425 / 1,150 / 2,500 | 300 / 1,500 / 7,500 | 0.31 | 1,500 | 50/50 | 3,000 | 2 |
| Moss | Nature + Earth | Nature | 425 / 1,150 / 2,500 | 400 / 2,000 / 10,000 | 0.66 | 700 | 100/200 | 2,000 | 2 |
| Poison | Dark + Water | Dark | 425 / 1,150 / 2,500 | 200 / 1,000 / 5,000 | 1 | 900 | 150/300 | 2,000 | 2 |
| Quark | Earth + Light | Light | 425 / 1,150 / 2,500 | 300 / 1,500 / 7,500 | 0.66 | 900 | 100/200 | 2,000 | 2 |
| Trickery | Light + Dark | Light | 425 / 1,150 / 4,250 | 700 / 3,500 / 17,500 | 1 | 900 | – | 2,000 | 2 |
| Vapor | Fire + Water | Water | 425 / 1,150 / 2,500 | 0 | 1.5 | 550 | – | 800 / 800 / – | 2 |
| Well | Nature + Water | Water | 425 / 1,150 / 4,250 | 700 / 3,500 / 17,500 | 1 | 900 | – | 2,000 | 2 |

| Dual | Ability: exact rule (values for levels 1 / 2 / 3) | Default target |
|---|---|---|
| Blacksmith | **Support: Fire Up.** Every 15 s it buffs one tower within 900 for 60 s with **+15 / 30 / 100%** base damage. The same factor applies to that tower's ability damage. Its own attack is single-target. See §3.7 | closest |
| Disease | **Single target scaled by missing HP.** With r = max HP ÷ current HP before the hit, damage = A × r × (1 + r/10). That is 1.1 A at full HP, 2.4 A at half HP and 20 A at 10% | **lowest HP** |
| Electricity | **Chain lightning** fired at launch; its normal attack does 0. It hits the target for **240 / 1,200 / 6,000**, then bounces up to 7 times, one bounce every 0.2 s, to the closest creep that isn't the one just hit. The search radius starts at 300 and shrinks ×0.75 each bounce. Bounce *k* deals base × 1.2^k | closest |
| Flame | **Sunburn.** Each hit burns every creep within 200 of the target for **60 / 300 / 1,500** at once, then hits the target. It also adds an unlimited-stacking 5 s burn to the target that deals the same amount to everything within 200 of it every 1 s. When a burning creep dies, its burn stacks that have more than 1 s left keep burning on the spot for their remaining ticks | closest |
| Gunpowder | **Artillery Shrapnade**, aimed at the ground like the Cannon. On landing it makes five blasts of **50 / 250 / 1,250**, each hitting every creep within 200 at full damage: one at the impact point and four at ±100 on each axis. A creep at the centre takes 5× | closest |
| Hydro | **Explodes on kill.** When its own hit kills its current target, every creep within 300 takes **700 / 3,500 / 17,500**. Fire Up does not boost this, and the explosion never chains | **lowest HP** |
| Ice | **Ministun.** It stuns the main target for **0.15 / 0.25 / 0.4 s**. Any Ice tower's stun locks that creep out of further Ice stuns for 1.2 s | closest |
| Life | **Afterlife.** Each kill adds **3 / 4 / 12** points, or ×2 for a bulky kill, to a counter shared by all your Life towers. Every 24 points give **+1 life**, up to 70 lives. While you have 50 lives or fewer, every Life tower gets +50% base damage | **lowest HP** |
| Magic | **Range decay.** Each attack adds a stack, up to 32, and a 2 s break clears them. Range = 1,500 − 25 × stacks, so 700 at the cap. The engine may apply only −25 in total; see §13 | closest |
| Moss | **Spore.** Damage to each creep in the splash is A × (1 + its current HP ÷ max HP), measured before the hit. Full-HP creeps take 2× | **highest HP, keeps its target** |
| Poison | **Contamination.** Every creep within 150 of the target gets a new 10 s poison, stacking without limit, that ticks every 0.5 s for **40 / 200 / 1,000** (80 / 400 / 2,000 per second) | **highest HP** |
| Quark | **Quantum beam.** Hitting the same target as last time adds a stack, up to 11. A new target halves the stacks, rounded down. Base damage = base × 1.15^stacks, so about 4.65× at the cap | **highest HP, keeps its target** |
| Trickery | **Support: Conjure.** Every 15 s it copies one non-support tower within 900 for **10 / 20 / 75 s**, placing the copy on the nearest free buildable spot within 2,000. A tower can be copied at most once per 60 s. Level 1 and 2 copy only a tower that currently has a target. See §3.7 | closest |
| Vapor | **Pulse.** It has no attack. Whenever its 1.5 s cooldown is ready and a creep is within 600 of the tower, every such creep takes **60 / 300 / 1,500** plus *n* × **30 / 150 / 750**, where *n* is the number of creeps hit | – |
| Well | **Support: Spring Forward.** Every 15 s it buffs one tower within 900 for 60 s with **+15 / 30 / 100** attack speed, which is ×1.15 / 1.3 / 2 attacks per second. See §3.7 | closest |

### 3.6 Triples (levels 1 / 2 / 3)

| Tower | Elements | Deals | Step cost (L1 / L2 / L3) | Damage | Cooldown (s) | Range | Splash full/half | Projectile | Build (s) |
|---|---|---|---|---|---|---|---|---|---|
| Enchantment | Earth + Light + Nature | Nature | 900 / 3,500 / 5,000 | 550 / 2,750 / 8,250 | 0.31 | 900 | 100/200 | 3,000 | 3 |
| Ephemeral | Earth + Nature + Water | Nature | 900 / 3,500 / 5,000 | 2,000 / 10,000 / 30,000 | 0.31 | 900 | – | 3,000 | 3 |
| Erosion | Dark + Fire + Water | Fire | 900 / 3,500 / 5,000 | 0 | 1 | 900 | 400/400 | 2,000 | 3 |
| Flamethrower | Dark + Earth + Fire | Fire | 900 / 3,500 / 5,000 | 400 / 2,000 / 8,000 | 0.66 | 700 | 150/300 | 2,000 / 2,500 / 2,500 | 3 |
| Flooding | Water + Nature + Dark | Water | 900 / 3,500 / 5,000 | 0 | 1 | 900 | – | 2,000 | 3 |
| Gold | Fire + Earth + Light | Earth | 900 / 3,500 / 5,000 | 6,000 / 30,000 / 100,000 | 1.5 | 1,150 | – | 2,000 | 3 |
| Hail | Dark + Light + Water | Light | 900 / 3,500 / 5,000 | 900 / 4,500 / 13,500 | 0.66 | 1,500 / 1,500 / 1,750 | – | 3,000 | 3 |
| Haste | Earth + Fire + Water | Fire | 900 / 3,500 / 5,000 | 1,600 / 8,000 / 24,000 | 0.66 | 900 | – | 1,000 / 2,000 / 4,000 | 3 |
| Impulse | Nature + Fire + Water | Nature | 900 / 3,500 / 5,000 | 0 | 1 | 1,500 / 1,500 / 1,750 | – | 3,000 | 3 |
| Jinx | Dark + Fire + Nature | Dark | 900 / 3,500 / 5,000 | 3,500 / 17,500 / 52,500 | 1 | 900 | – | 2,000 | 3 |
| Laser | Dark + Earth + Light | Light | 900 / 3,500 / 5,000 | 6,000 / 30,000 / 90,000 | 1 | 900 | – | 2,000 | 3 |
| Muck | Dark + Earth + Water | Earth | 900 / 3,500 / 5,000 | 1,000 / 5,000 / 15,000 | 1 | 900 | 150/300 | 2,000 | 3 |
| Nova | Fire + Nature + Light | Light | 900 / 3,500 / 5,000 | 0 | 1.5 | 900 | – | – | 3 |
| Obliteration | Dark + Light + Nature | Dark | 900 / 3,500 / 5,000 | 1,800 / 9,000 / 30,000 | 1.5 | 1,150 | – | – | 3 |
| Polar | Water + Light + Earth | Water | 900 / 3,500 / 5,000 | 1,800 / 9,000 / 27,000 | 1 | 900 | 100/200 | 2,000 | 3 |
| Quake | Fire + Earth + Nature | Earth | 900 / 3,500 / 5,000 | 1,800 / 9,000 / 27,000 | 0.66 | 550 | – | 2,000 | 3 |
| Roots | Dark + Earth + Nature | Nature | 900 / 3,500 / 5,000 | 0 | 1 | 900 | – | 2,000 | 3 |
| Runic | Dark + Fire + Light | Dark | 900 / 3,500 / 5,000 | 1,500 / 7,500 / 22,500 | 1 | 1,150 | 100/200 | 2,000 | 3 |
| Tidal | Water + Nature + Light | Water | 900 / 3,500 / 5,000 | 600 / 3,000 / 9,000 | 0.66 | 900 | 200/400 / 200/400 / 300/600 | 3,000 | 3 |
| Windstorm | Fire + Light + Water | Water | 900 / 3,500 / 5,000 | 0 | 5 | 1,150 | – | 900 | 3 |

| Triple | Ability: exact rule (values for levels 1 / 2 / 3) | Default target |
|---|---|---|
| Enchantment | **Faerie Fire** (autocast every 0.5 s within 900) marks the highest-HP creep that isn't yet marked, for 10 s. Damage to a marked creep is amplified by **+18 / 42 / 140%** if 3 or fewer creeps are within 150 of it (itself included), or **+10 / 23 / 80%** otherwise. One mark per creep. Its attack is a splash | closest |
| Ephemeral | **Phasing.** While it fires continuously it loses 10% base damage per second, down to −60 / −40 / −20%. When it reaches the cap it stops refreshing, so about 2 s later it snaps back to full damage, and the cycle repeats. A 2 s pause also resets it. The engine may apply only −10% in total; see §13 | closest |
| Erosion | **Acid.** Its attack does 0. On launch it also fires at every other creep within 400 of the target. Every creep hit gets **+15 / 36 / 120%** damage taken for 7.5 s (one per creep, refreshed) and a new acid DoT, stacking without limit, of **100 / 500 / 1,500**: once at once, then every 1 s for 7.5 s | closest |
| Flamethrower | **Napalm.** Each splash hit adds **180 / 900 / 2,700** to a napalm total on every creep within 300 and resets a 5 s fuse. When the fuse runs out or the creep dies, every creep within 350 takes the accumulated total. The total is never reset afterwards | closest |
| Flooding | **Flood.** Its attack does 0. The impact point floods: every creep within 400 of it takes **220 / 1,100 / 3,600** at once and every second for 4 more seconds (5 hits). Floods stack | closest |
| Gold | **Arbitrage.** A creep it kills pays bounty + ⌊bounty × 0.35 + 0.5⌋. A toggle switches it between lowest HP (default) and closest-and-keep | **lowest HP** |
| Hail | **Crits and storm.** Every hit has a **15 / 20 / 25%** chance to deal 5×. Every **14 / 13 / 12** attacks it also fires a projectile at every other creep within 1,800 of the tower | closest |
| Haste | **Wrath.** Each attack lowers its attack time by 0.03 s, up to 16 stacks (0.66 → 0.18). It resets 4 s after the last attack | closest |
| Impulse | **Impetus.** Its attack does 0. Damage = distance from the tower to the target at impact ÷ 1,000 × **3,300 / 16,500 / 50,000** | **farthest** (toggle: farthest and keep) |
| Jinx | **Maledict.** Every unmarked creep within 300 of the target is marked for 7.5 s, and its HP is recorded. Every 2.5 s (3 ticks) it takes **6 / 15 / 45%** of all the HP it has lost since being marked, as dark damage | closest |
| Laser | **Instant.** It deals damage at launch, reduced by 10% for each other creep within 100 of the target, down to −50% | closest |
| Muck | **Sludge.** Its splash also gives every creep within 300 the *sludge* slow at the tower's level (12 / 28 / 52%) for 5 s | closest |
| Nova | **Explode.** It has no projectile. Each attack hits every creep within 950 of the tower for **300 / 1,500 / 6,000** and gives the *explode* slow (12 / 28 / 52%) for 3 s | closest |
| Obliteration | **Obliterate.** Its own projectile flies at speed 900. Every creep within 200 + (200 ÷ 1,150) × distance of the impact takes full damage. The radius grows to 400 at 1,150 range | **farthest** |
| Polar | **Frostbite** (autocast every 0.5 s within 900) takes **12 / 27 / 60%** of current HP from the highest-HP unmarked creep. This is HP removal, not damage, so no element, amp or kill applies. If the creep is still alive 10 s later, the HP is given back | closest |
| Quake | **Pulverize.** Every 5th attack, every creep within 550 of the tower takes **1,800 / 9,000 / 27,000** + **1 / 2.5 / 4%** of its current HP | closest |
| Roots | **Gaia's wrath.** Each attack fires a line toward the target: 6 circles of radius 150, spaced 185 apart, from 277.5 to 1,202.5 from the tower. Every creep in it gets the *gaia* slow (12 / 28 / 52%) for 5 s and a new DoT, stacking without limit, of **100 / 500 / 2,500**: once at once, then every 1 s for 5 s | closest |
| Runic | **Magic attack** (autocast, 9 s cooldown) for 3 s: each attack also fires at every other creep within 150 of the target for 50% of the attack as a 100/200 splash | closest |
| Tidal | **Splash decay.** With *s* hits in the last stretch (up to 30, cleared by a 2 s pause), the radii shrink by 10*s* (half) and 5*s* (full), and damage grows by **+45 / 225 / 675** × *s*. The engine may apply the bonus only once; see §13 | closest |
| Windstorm | **Tornado.** It has no attack. Every 5 s, or faster with Spring Forward, it spawns a tornado on the closest creep within 1,200. The tornado chases that creep at speed 200 for 5 s. Every 1 s it deals **600 / 3,000 / 9,000** to every creep within 450, and every 0.5 s it gives them the *tornado* slow (12 / 28 / 52%) for 1 s | closest |

### 3.7 Support towers and buff targets

The three support duals are Blacksmith, Well and Trickery (`towers/duals/*.lua`, `TowersManager.lua` `GetBuffTargetInRadius` and `GetCloneTargetInRadius`).

- **Timing.** Each support tower checks once per second. It acts when its 15 s cooldown is ready, its autocast is on (the default) and it is fully built.
- **Who it picks.** It chooses a tower within 900 that:
  - is not a support tower and not a Trickery copy;
  - has the **lowest `BuffPriority`**;
  - for Blacksmith and Well, does not already hold an equal or stronger buff of that kind.
- **Who gets picked first.** `BuffPriority` is lowest, and so picked first, for:
  - Pure, Periodic and level-3 triples: 1;
  - level-2 triples: 2 or 4;
  - level-3 duals: 3;
  - level-3 singles: 5;
  - level-1 triples: 5–8;
  - level-2 duals: 7;
  - level-2 singles: 9;
  - level-1 duals: 10;
  - level-1 singles: 11.
  The per-unit values are in `element-data.json`.
- **Ties** go to the last candidate in engine order. We break them by build order (**assumed**).
- **Stacking.**
  - A tower holds at most one Fire Up and one Spring Forward, and the two coexist.
  - A newer cast replaces an older one.
  - Each support tower keeps at most 4 towers buffed (60 s ÷ 15 s).
  - A 1 s lock stops two support towers of the same kind from buffing the same target together.
- **Fire Up math.** It raises base attack damage by +x%, adding to Life's +50% and Ephemeral's −10% steps. It also multiplies ability damage that goes through `ApplyAbilityDamageFromModifiers`.
- **Trickery copies.**
  - A copy keeps the original's buffs, runs its own logic and sells for 0.
  - It cannot be upgraded, buffed or copied.
  - Selling or upgrading a tower that was copied in the last 60 s removes one of its copies.
  - Selling the Trickery removes all of its copies.
- **Selling a level-1 Blacksmith or Well** strips the buff with the most time left from a tower within 1,000. The check compares the class name exactly, so levels 2 and 3 don't do this.

### 3.8 Periodic tower

- **Cost.** 13,000 gold + 1 Pure Essence. It needs all six elements at level 1 and takes 6 s to build.
- **Attack.** Range 1,150, cooldown 1 s. Its own attack does nothing (`towers/basic/PeriodicTower.lua`). Instead, each attack fires up to **6 projectiles of 40,000 damage**, one per element. The 40,000 is hard-coded, and Fire Up applies.
- **Element order.** It cycles light, dark, water, fire, nature, earth. The starting element moves on by one each attack.
- **Targets.** Projectile 1 goes to the target. The rest go to the other creeps within range, and then around again, until 6 have been fired.
  - Exact count by creeps in range: 1 creep gets 5 projectiles, 2–4 get 6, 5 get 5, and 6 or more get 6.
- **On impact, by element:**
  - light, dark and nature hit a single target;
  - water hits every creep within 100;
  - fire and earth deal a 100/200 split splash.
- **Fix.** If every creep in range is dead, the original loops forever. Our port should simply stop.

## 4. Elements, lumber and Pure Essence

### Lumber

| | Full length | Express |
|---|---|---|
| Starting lumber | 1 | 2 |
| +1 lumber | at the start of the break after Waves 5, 10, 15 … 50 | after Waves 3, 6, 9 … 27 |
| Total | 11 | 11 |
| Free Pure Essence | +1 after Wave 50 and +1 after Wave 55 | +1 after Wave 24 and +1 after Wave 27 |

Sources: `kv/gamesettings.kv` `GameLength.*.Lumber`, `wavedata.lua` `WaveGrantsLumber` and `WaveGrantsEssence`, called from `StartBreakTime`. In Full length, the break before Waves 6, 11 … 51 is a fixed **30 s** so you can fight the Elemental (`StartBreakTime`, lines 137–140).

Lumber buys exactly two things. Nothing else costs lumber in the port:

- **Summon an Elemental** (1 lumber). This is `npc_abilities_custom.txt` `summon_<element>_elemental`, `LumberCost 1`, and it is how you raise an element by one level.
- **Buy a Pure Essence** (1 lumber). This is `npc_items_custom.txt` `item_buy_pure_essence`. Its 2 charges mean you can buy **at most two**. It unlocks once you have an element at level 3 or all six elements at level 1 (`playerdata.lua` `CanPlayerBuyPureEssence`). It is not offered in the random element modes.

The WC3-era interest upgrades and the "12th element" lumber purchase are gone: the latter's code is commented out in `mechanics/resources.lua` and `playerdata.lua`.

### Element levels

- **Range.** Each of the six elements has a level from 0 to **3** (`playerdata.lua` `elements`; the summon button turns off at 3, see `UpdateSummonerSpells`).
- **What a level unlocks.**
  - **Level 1** in an element unlocks its single tower, its elemental Arrow and Cannon, and every dual or triple whose elements are all at level 1 or more.
  - **Levels 2 and 3** unlock the second and third level of each of those towers.
  - **What decides the tower type.** How many *different* elements you hold decides whether you can build singles, duals or triples. Element *levels* decide tower levels. See the `Requirements` blocks in `npc/units/towers/**` and `mechanics/upgrades.lua` `MeetsItemElementRequirements`.
- **Free first pick.** Full length in All Pick gives one free element (`gamesettings.kv` `FreeElements 1`, set in `voting.lua`). The first summon of any element still below level 2 grants the level at once, with no Elemental to kill (`summoner.lua` line 19). Since you start with 1 lumber, your first element is effectively free.
- **Express** never spawns Elementals: every summon grants the level at once. Level 2 needs 6 completed Waves and level 3 needs 15 (`playerdata.lua` `UpdateSummonerSpells`).

### Elementals

`mechanics/summoner.lua` `SummonElemental`; `constants.lua` `ElementalBaseHealth`; `npc/units/elementals/<element>_elemental{1,2,3}.txt`.

- **Spawning.** Summoning spends the lumber and spawns the Elemental of the next level for that element at the creep spawn. It walks the lane like a creep. **Only one Elemental can be alive at a time**: the summon buttons are disabled while one is active.
- **HP** = `[600, 3000, 15000][level] × 1.5^⌊nextWave / 5⌋ × Difficulty HP multiplier`. The level is the one being bought. `nextWave` is the Wave the player is waiting for or fighting.

| Level bought | At the start (×1) | Before Wave 6 (×1.5) | Before Wave 26 (×7.59) | Before Wave 51 (×57.67) |
|---|---|---|---|---|
| 1 | 600 | 900 | 4,556 | 34,599 |
| 2 | 3,000 | 4,500 | 22,781 | 172,995 |
| 3 | 15,000 | 22,500 | 113,906 | 864,975 |

  Normal shown, floored as `SetCreepMaxHealth` does.
- **Speed and armour.** It moves at 300 and is slowed like a creep (`modifier_slow_adjustment`). It takes damage as its own element, has no trait and **gives no gold** (`BountyGoldMin/Max 0`).
- **Leaking.** If it reaches the exit you lose **3 lives**, and it teleports to the spawn and keeps walking until it dies (`summoner.lua` lines 104–131).
- **Reward.** Killing it raises that element by 1 (`ElementTD.lua` `OnEntityKilled` → `ModifyElementValue`). Nothing else is granted: the gold bonus for buying essence was removed in port 1.5 (`resources.lua` `GivePureEssenceGoldBonus`, unused).
- **Challenge mode only.** An Elemental also gets one random trait from regen, fast, mechanical or time lapse (`mechanics/abilities_mode.lua`).

### Pure Essence

| How you get it | Count |
|---|---|
| Free after Wave 50 and after Wave 55 (Express: 24 and 27) | 2 |
| Bought for 1 lumber at the summoner, once you have an element at level 3 or all six at level 1 | up to 2 |
| In a random element mode, a random pick can come up "pure" (see §9) | — |

What it buys (`npc/units/towers/basic/**`, `EssenceCost 1`):

- **A Pure tower.** It is the fourth level of a single-element tower, upgraded from that element's level-3 tower for **10,000 gold + 1 essence** (13,000 gold in total). It is unlocked by element level 3, the requirement of the level-3 tower. `pure_light_tower` also lists `light 3`.
- **The Periodic tower.** It costs **13,000 gold + 1 essence** and needs all six elements at level 1 or more (`npc_items_custom.txt` `item_build_periodic_tower_disabled` `Requirements`).
- **Refunds.** Selling either tower refunds the essence (`mechanics/sell.lua` lines 63–68).

## 5. Waves

### Rules for every Wave

`kv/waves.kv`, `wavedata.lua`, `wave.lua`.

- **Size.** Each Wave is **30 creeps** of one type (`CREEPS_PER_WAVE = 30`). One spawns every **0.5 s**, starting 0.5 s after the Wave begins, so a Wave takes 15 s to spawn.
- **Bulky Waves** spawn 15 creeps 1.0 s apart. Each bulky creep counts as 2 of the 30, has 2× HP and pays 2× bounty (`wave.lua` lines 141–148, `creeps/bulky.lua`).
- **Speed.** Every creep has base speed **300** (`MovementSpeed`, enforced by `towers/modifier_slow_adjustment.lua`). There is no armour: all creeps have `ArmorPhysical 0`, and physical damage is filtered out (`ElementTD.lua` `DamageFilter`).
- **HP.**
  - Full length: `HP(1) = 75` and `HP(w) = HP(w−1) × 1.168`.
  - Express: `HP(1) = 200` and `HP(w) = HP(w−1) × 1.295`.
  - The value is kept as a float and rounded half-up at the end (`util.lua` `round`).
  - At spawn it is multiplied by the Difficulty HP multiplier and floored (`creep_health.lua` `SetCreepMaxHealth`).
- **When a Wave ends.** It ends when all its creeps are dead. Leaked creeps keep walking, so a Wave never ends by leaking. The next Wave's break starts only then, and Waves never overlap outside Rush mode.
- **Breaks.** A break is the time between one Wave being cleared and the next spawning.
  - The pregame break before Wave 1 is 30 s (Express 45 s).
  - The break before Waves 6, 11 … 51 is 30 s (Full length only).
  - The break before the first boss Wave is 60 s.
  - Every other break comes from the Difficulty table in §8.
  - Later boss Waves start the moment the previous one is cleared.
- **Calling early.** `ElementTD:OnNextWave` lets you start the next Wave once the current one is cleared, or skip the pregame break. But the port runs every game as "Competitive", and there the button is shown only before Wave 1 (`wavedata.lua` line 153). Calling early pays **no bonus**: no gold, and no per-Wave score, because the per-Wave speed bonus was removed (`scoring.lua`).

### Full length: Waves 1–55 (Normal Difficulty)

HP and bounty are per creep. "Break" is the break **before** the Wave. "L" means a lumber arrives at the start of that break, and "P" means a free Pure Essence does. Each trait is in §6. For other Difficulties, multiply HP by 1.3, 1.6 or 2 and floor it. Bounty for every Difficulty is in `element-data.json`.

| Wave | Element | Trait | HP | Count | Interval (s) | Bounty | Break (s) | Grant |
|---|---|---|---|---|---|---|---|---|
| 1 | Earth | – | 75 | 30 | 0.5 | 1 | 30 |  |
| 2 | Water | – | 88 | 30 | 0.5 | 1 | 7 |  |
| 3 | Fire | – | 102 | 30 | 0.5 | 2 | 7 |  |
| 4 | Nature | undead | 120 | 30 | 0.5 | 2 | 7 |  |
| 5 | Light | – | 140 | 30 | 0.5 | 2 | 7 |  |
| 6 | Earth | time_lapse | 163 | 30 | 0.5 | 2 | 30 | L |
| 7 | Dark | – | 190 | 30 | 0.5 | 2 | 7 |  |
| 8 | Water | regen | 222 | 30 | 0.5 | 3 | 7 |  |
| 9 | Fire | heal | 260 | 30 | 0.5 | 3 | 7 |  |
| 10 | Light | vengeance | 303 | 30 | 0.5 | 3 | 7 |  |
| 11 | Dark | undead | 354 | 30 | 0.5 | 4 | 30 | L |
| 12 | Nature | time_lapse | 414 | 30 | 0.5 | 4 | 8 |  |
| 13 | Composite | fast | 483 | 30 | 0.5 | 4 | 8 |  |
| 14 | Light | heal | 565 | 30 | 0.5 | 5 | 8 |  |
| 15 | Earth | mechanical | 660 | 30 | 0.5 | 5 | 8 |  |
| 16 | Fire | undead | 770 | 30 | 0.5 | 6 | 30 | L |
| 17 | Composite | vengeance | 900 | 30 | 0.5 | 7 | 8 |  |
| 18 | Nature | regen | 1,051 | 30 | 0.5 | 7 | 8 |  |
| 19 | Water | mechanical | 1,228 | 30 | 0.5 | 8 | 8 |  |
| 20 | Dark | fast | 1,434 | 30 | 0.5 | 9 | 8 |  |
| 21 | Fire | time_lapse | 1,675 | 30 | 0.5 | 10 | 30 | L |
| 22 | Light | regen | 1,956 | 30 | 0.5 | 11 | 8 |  |
| 23 | Nature | heal | 2,285 | 30 | 0.5 | 12 | 8 |  |
| 24 | Dark | vengeance | 2,668 | 30 | 0.5 | 13 | 8 |  |
| 25 | Earth | undead | 3,117 | 30 | 0.5 | 14 | 8 |  |
| 26 | Water | fast | 3,640 | 30 | 0.5 | 15 | 30 | L |
| 27 | Composite | mechanical | 4,252 | 30 | 0.5 | 17 | 8 |  |
| 28 | Nature | bulky | 9,932 | 15 | 1.0 | 36 | 8 |  |
| 29 | Fire | vengeance | 5,800 | 30 | 0.5 | 20 | 8 |  |
| 30 | Dark | heal | 6,775 | 30 | 0.5 | 22 | 8 |  |
| 31 | Water | time_lapse | 7,913 | 30 | 0.5 | 24 | 30 | L |
| 32 | Light | mechanical | 9,242 | 30 | 0.5 | 26 | 9 |  |
| 33 | Composite | regen | 10,795 | 30 | 0.5 | 29 | 9 |  |
| 34 | Earth | vengeance | 12,609 | 30 | 0.5 | 32 | 9 |  |
| 35 | Nature | fast | 14,727 | 30 | 0.5 | 35 | 9 |  |
| 36 | Water | undead | 17,201 | 30 | 0.5 | 38 | 30 | L |
| 37 | Dark | regen | 20,091 | 30 | 0.5 | 41 | 9 |  |
| 38 | Earth | heal | 23,466 | 30 | 0.5 | 45 | 9 |  |
| 39 | Light | fast | 27,409 | 30 | 0.5 | 50 | 9 |  |
| 40 | Composite | time_lapse | 32,013 | 30 | 0.5 | 54 | 9 |  |
| 41 | Fire | mechanical | 37,392 | 30 | 0.5 | 59 | 30 | L |
| 42 | Water | bulky | 87,346 | 15 | 1.0 | 130 | 9 |  |
| 43 | Light | undead | 51,011 | 30 | 0.5 | 71 | 9 |  |
| 44 | Dark | time_lapse | 59,580 | 30 | 0.5 | 78 | 9 |  |
| 45 | Nature | mechanical | 69,590 | 30 | 0.5 | 85 | 9 |  |
| 46 | Earth | regen | 81,281 | 30 | 0.5 | 93 | 30 | L |
| 47 | Fire | fast | 94,936 | 30 | 0.5 | 101 | 10 |  |
| 48 | Light | time_lapse | 110,886 | 30 | 0.5 | 111 | 10 |  |
| 49 | Composite | bulky | 259,028 | 15 | 1.0 | 242 | 10 |  |
| 50 | Water | heal | 151,273 | 30 | 0.5 | 133 | 10 |  |
| 51 | Composite | undead | 176,687 | 30 | 0.5 | 145 | 30 | LP |
| 52 | Fire | regen | 206,370 | 30 | 0.5 | 158 | 10 |  |
| 53 | Dark | mechanical | 241,040 | 30 | 0.5 | 173 | 10 |  |
| 54 | Earth | fast | 281,535 | 30 | 0.5 | 189 | 10 |  |
| 55 | Composite | heal | 328,833 | 30 | 0.5 | 207 | 10 |  |

The `Bounty` column is ⌊1.093^(w+5)⌋, or ⌊1.095 / 1.097 / 1.099^(w+5)⌋ on Hard, VeryHard and Insane (`gamesettings.lua` `GetBountyForWave`). Bulky rows show 2× the per-creep HP and bounty.

### The endless boss Waves (Full length only)

`waves.kv` lists a 56th entry, the boss. After Wave 55 is cleared and the 60 s break has passed, boss Waves repeat until you run out of lives.

- **HP.** Boss Wave *n* (n = 1, 2, 3 …) has **384,076 × Difficulty × 1.3ⁿ** HP per creep. The base is wave 56 on the HP curve, and the formula is `creep_health.lua` `GetBossMaxHealth`. Boss Wave 1 on Normal is 499,298 per creep, and boss Wave 2 is 649,088.
- **Traits.** The creep is composite, has 0 bounty (`gamesettings.lua` line 32, `creeps/boss.lua`) and moves at speed 300. Each boss gets **one trait in a fixed cycle**: bulky, heal, vengeance, undead, regen, mechanical, time lapse, then bulky again (`boss.lua` `GetAbilityList`, `wave.lua` lines 98–134). Bulky bosses take 2 of the 30 slots, so a boss Wave has 26 creeps, 4 of them bulky.
- **Boss regen** ticks every 0.1 s instead of 0.5 s, at the same 2.5%/s (`boss.lua`).
- **Leaks.** Each leak costs **3 lives**, or 6 for a bulky boss (`wavedata.lua` lines 526–535).
- **Score.** Kills here only add score, and a boss killed in undead form does not count (§10). This is the endless boss, "Icefrog" in the port.

### Express: Waves 1–30 (Normal Difficulty)

Express has its own creep list (`waves.kv` `CreepExpress`). It uses only the fast, heal, regen, undead and vengeance traits. Bounty is ⌊1.159^(w+10)⌋ on Normal, or 1.162 / 1.165 / 1.168 on the harder Difficulties. Breaks come from `WaveTimersExpress`. There is no 30 s lumber break.

| Wave | Element | Trait | HP | Bounty | Break (s) | Grant |
|---|---|---|---|---|---|---|
| 1 | Composite | – | 200 | 5 | 45 |  |
| 2 | Composite | vengeance | 259 | 5 | 7 |  |
| 3 | Light | undead | 335 | 6 | 7 |  |
| 4 | Water | regen | 434 | 7 | 7 | L |
| 5 | Fire | heal | 562 | 9 | 7 |  |
| 6 | Nature | undead | 728 | 10 | 8 |  |
| 7 | Light | heal | 943 | 12 | 8 | L |
| 8 | Earth | fast | 1,222 | 14 | 8 |  |
| 9 | Dark | regen | 1,582 | 16 | 8 |  |
| 10 | Water | fast | 2,049 | 19 | 8 | L |
| 11 | Fire | undead | 2,653 | 22 | 8 |  |
| 12 | Earth | regen | 3,436 | 25 | 8 |  |
| 13 | Nature | heal | 4,449 | 29 | 8 | L |
| 14 | Composite | fast | 5,762 | 34 | 8 |  |
| 15 | Earth | undead | 7,461 | 40 | 8 |  |
| 16 | Dark | heal | 9,662 | 46 | 9 | L |
| 17 | Light | fast | 12,513 | 53 | 9 |  |
| 18 | Composite | regen | 16,204 | 62 | 9 |  |
| 19 | Water | undead | 20,984 | 72 | 9 | L |
| 20 | Nature | regen | 27,174 | 83 | 9 |  |
| 21 | Earth | heal | 35,190 | 96 | 9 |  |
| 22 | Fire | fast | 45,572 | 112 | 9 | L |
| 23 | Dark | undead | 59,015 | 130 | 9 |  |
| 24 | Nature | fast | 76,425 | 150 | 9 |  |
| 25 | Light | regen | 98,970 | 174 | 9 | LP |
| 26 | Composite | undead | 128,166 | 202 | 10 |  |
| 27 | Water | heal | 165,975 | 235 | 10 |  |
| 28 | Fire | regen | 214,938 | 272 | 10 | LP |
| 29 | Dark | fast | 278,345 | 315 | 10 |  |
| 30 | Composite | heal | 360,457 | 365 | 10 |  |

**How Express relates to the 55 Waves.** It is a separate 30-Wave list with a steeper HP curve. The game is won after Wave 30 and there is no boss. It is not a subset of the Full list. It reuses the same creeps in a different order, with different elements and traits for some of them.

**Chaos order** (`wavedata.lua` `loadWaveData`):

1. Waves 1, 2, 3, 5 and 7 swap their creep for a **bulky** creep of a chosen element: earth, water, fire, composite and dark (`CreepChaos`). Wave 28 keeps its bulky otter.
2. Waves 1–54 are then **shuffled**. The last two (55 and the boss) stay in place. In Express, only Wave 30 stays in place.
3. HP stays tied to the Wave *number*, so a late creep type can arrive with early HP.

## 6. Creep traits

Each creep has at most one trait, its `CreepAbility2`. Its Lua class is set by `ScriptClass` (`npc/units/creeps/*.txt`, `scripts/vscripts/creeps/*.lua`). The values are from `npc_abilities_custom.txt` `creep_ability_*` `AbilityValues`.

| Trait (port UI name) | Exact mechanic | Full-length Waves | Express Waves |
|---|---|---|---|
| **Fast** ("Haste") | 3 s after spawning, the creep bursts to **750 speed** for 1 s. While bursting it ignores every slow (`modifier_slow_adjustment`: the haste returns 750 before slows are counted). How often it repeats is ambiguous; see below | 13, 20, 26, 35, 39, 47, 54 | 8, 10, 14, 17, 22, 24, 29 |
| **Heal** | When it dies, it heals every living creep within **300** of itself by **18% of that creep's max HP**, capped at max (`creeps/heal.lua`) | 9, 14, 23, 30, 38, 50, 55 | 5, 7, 13, 16, 21, 27, 30 |
| **Mechanical** ("Shield") | A random **1–6 s** (whole seconds) after spawning, and every **8 s** after that, it purges its debuffs (slows and stuns included) and turns attack-immune and magic-immune for **2 s**. Towers cannot target it, and area damage skips it (`GetCreepsInArea` leaves out magic-immune units). See `creeps/mechanical.lua`. The KV `interval 7` is unused | 15, 19, 27, 32, 41, 45, 53 | – |
| **Undead** ("Reanimate") | **The first death pays 0 gold** and does not count as a tower kill. **3 s** later it comes back where it died with **50%** of its max HP and walks on. The second death pays the Wave's bounty. While dead it is invisible, invulnerable and still for those 3 s (`creeps/undead.lua`) | 4, 11, 16, 25, 36, 43, 51 | 3, 6, 11, 15, 19, 23, 26 |
| **Regen** | While below max HP, it heals **1.25% of max HP every 0.5 s** (2.5%/s). It stops for good once it has healed **100%** of its max HP in total. The check runs before each tick, so it can slightly overshoot (`creeps/regen.lua`) | 8, 18, 22, 33, 37, 46, 52 | 4, 9, 12, 18, 20, 25, 28 |
| **Bulky** ("Bulk Up") | **2× HP and 2× bounty.** It counts as 2 of the Wave's 30, so 15 spawn, **1 s** apart, and a leak costs **2 lives** (`creeps/bulky.lua`, `wave.lua`, `wavedata.lua` lines 532–535) | 28, 42, 49 | – |
| **Vengeance** ("Avenger") | When it dies, every tower within **250** of the *tower that killed it* gains a stack of **−10% damage dealt**. Each stack lasts **10 s** and expires on its own, and stacks are unlimited. Stacks add up with the other damage amps (§11), so 10 stacks means 0 damage (`creeps/vengeance.lua`, `modifier_vengeance_debuff.lua`) | 10, 17, 24, 29, 34 | 2 |
| **Time lapse** ("Temporal") | It is armed **5 s** after spawning. When a hit would leave it at **≤25%** of max HP, that hit deals nothing. Instead the creep jumps back to where it was, with the HP it had, **5 s** earlier: the oldest of its 0.1 s samples that is at least 5 s old. This happens **once per creep** (`creeps/temporal.lua`, `mechanics/damage.lua` lines 43–50) | 6, 12, 21, 31, 40, 44, 48 | – |
| **Boss** | Marks the endless boss. Each boss also gets one of the traits above in a fixed cycle (§5) | 56+ | – |
| None | – | 1, 2, 3, 5, 7 | 1 |

**Defined but unused.** No Wave uses **image** or **swarm**, and neither is in the Challenge pool (`abilities_mode.lua`). Their code is described here in case we ever want them:

- **Image.** When the creep is hit, at most once every 10 s, it spawns a copy with its current HP. The copy pays no bounty and vanishes at the exit or after 10 s. The creep then puts an 80% slow for 3 s on either itself or the copy, chosen at random (`creeps/image.lua`).
- **Swarm.** At 50% HP it splits into two creeps with half the max HP each, both refilled to full, and the bounty is split between them (`creeps/swarm.lua`).

PLAN.md lists image and swarm among Element's traits. They come from the WC3 Classic and are not in this port's Waves.

**Fast: what the code does vs. what it means.** The cycle runs from the passive `creep_haste_delay`, which lasts `interval` = 3 s. When it ends it applies the haste for `duration` = 1 s and re-applies itself.

- **Before 2017** the re-applied delay kept its KV duration of 3 s, giving **1 s of haste every 3 s**. That matches the tooltip value `interval_tooltip 2`: a 2 s gap.
- **Since commit `c9b5e2d2`** (2017-02-05) the delay is re-applied with `{duration = 1}` (`creeps/fast.lua` line 22). If the engine honours that override, the haste re-triggers the moment it ends, and a fast creep stays at 750 from second 3 onward.
- **Recommendation.** Use **1 s at 750 every 3 s, first burst at 3 s** (**assumed**). It matches the data and the tooltip. The current code depends on an undocumented engine detail and contradicts both.

## 7. Economy

| Item | Value | Source |
|---|---|---|
| Starting gold | 250 (Express 600) | `gamesettings.kv` `GameLength.*.Gold` |
| Starting lumber | 1 (Express 2) | `GameLength.*.Lumber` |
| Lives | 50 | `MapSettings.element_td.Lives` |
| Pregame break | 30 s (Express 45 s) | `GameLength.*.PregameTime` |
| Kill bounty | ⌊B^(w+5)⌋ per creep, with B = 1.093 / 1.095 / 1.097 / 1.099 by Difficulty. Express: ⌊B^(w+10)⌋ with B = 1.159 / 1.162 / 1.165 / 1.168. Rush ("Endless") mode: × 1.25, rounded | `gamesettings.lua` `GetBountyForWave` |
| Bounty exceptions | Bulky ×2. Undead first death 0. Boss 0. Elementals 0 | `wave.lua`, `undead.lua`, `boss.lua`, elemental KV |
| Bounty totals | Full length on Normal pays 71,850 gold from kills over 55 Waves; Express pays 78,600 | my sum over §5 |
| End of Wave | **No gold** | nothing calls `ModifyGold` for it |
| Interest | Every **15 s**, ⌊**2%** × current gold⌋, **uncapped** | `mechanics/interest.lua` |
| Gold Tower | Extra gold on kills (§3) | `towers/triples/GoldTower.lua`, `damage.lua` lines 59–74 |
| Sell | See §3 | `mechanics/sell.lua` |
| Fractions | Gold gains keep their fraction in a remainder that pays out at 1.0 | `mechanics/resources.lua` `ModifyGold` |

**Interest in detail** (`mechanics/interest.lua`):

- **Start.** The 15 s timer starts at the first spawn of Wave 1 and then runs continuously. It does **not** pause between Waves, so breaks earn interest too.
- **A leak pauses it.** When a creep of Wave *w* leaks, the timer stops, keeping its remaining time. It resumes when Wave *w* is fully cleared (`PlayerLeakedWave`, `PlayerCompletedWave`, `ResumeInterestForPlayer`). Leaks have no effect in Rush mode or after the last Wave has spawned.
- **Stop.** Interest stops for good once you have completed Wave 55, so it pays nothing during boss Waves. In Express it stops after Wave 29 is completed, because `END_OFFSET = 1` is counted against `WAVE_COUNT`.
- **No cap, no upgrades.** The WC3-era lumber upgrades to the rate do not exist in the port.

**Leaks** (`wavedata.lua` `CreateMoveTimerForCreep`, `ReduceLivesForPlayer`):

| Leaker | Lives |
|---|---|
| Normal creep | 1 |
| Bulky creep | 2 |
| Any creep during boss Waves | 3 (bulky 6) |
| Elemental | 3 |

- **The leaker comes back.** It is teleported to the spawn and walks the lap again, so it can leak more than once. For 10 s it is flagged `recently_leaked`, which only some targeting modes read.
- **Other effects.** A leak also pauses interest and spoils that Wave's clean bonus (§10).
- **Game over.** The Run ends at 0 lives.

## 8. Difficulty

`kv/gamesettings.kv` `Difficulty`, `gamesettings.lua`, `scoring.lua` `GetDifficultyBonus`.

| Port Difficulty | HP × | Bounty base (Full / Express) | Breaks, Waves 1–10 / 11–30 / 31–45 / 46–55 (s) | Express breaks, Waves 1–5 / 6–15 / 16–25 / 26–30 (s) | Score bonus |
|---|---|---|---|---|---|
| Normal | 1.0 | 1.093 / 1.159 | 7 / 8 / 9 / 10 | 7 / 8 / 9 / 10 | +0 |
| Hard | 1.3 | 1.095 / 1.162 | 5 / 6 / 7 / 8 | 5 / 6 / 7 / 8 | +100% |
| VeryHard | 1.6 | 1.097 / 1.165 | 3 / 4 / 5 / 6 | 3 / 4 / 5 / 6 | +200% |
| Insane | 2.0 | 1.099 / 1.168 | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 | +350% |

- **Fixed breaks.** The 30 s lumber breaks, the 60 s first-boss break and the pregame break are the same on every Difficulty.
- **Elementals** use the same HP multiplier.
- **Unused keys.** Nothing else scales. `NetworthBonus*` and `VoteWeight` are unused or only used in multiplayer voting.

**Mapping onto Tavern TD** (PLAN.md: Normal uses the Classic's own numbers, and Element uses its Classic's own Hard and Insane values):

| Tavern TD | Use | Note |
|---|---|---|
| Easy | HP × **0.75** with Normal's bounty base, breaks and score bonus +0 | **assumed**: the port has nothing below Normal, so this is PLAN.md's generic Easy |
| Normal | Port Normal | |
| Hard | Port Hard | |
| Insane | Port Insane | |
| — | Port VeryHard is dropped | |

Keep a Record per Difficulty. The +100% and +350% score bonuses only matter if we compare scores across Difficulties.

## 9. Game modes

The port's vote screen (`voting.lua`, `gamesettings.kv`) offers five independent settings. In single player, your vote is the result.

| Setting | Options | What it does in single player |
|---|---|---|
| **Elements** | **All Pick** | You choose each summon. You get 1 free element (Full length only) and can buy Pure Essence. Typing `-random` before Wave 5 is completed, with no element yet, switches you to random (`gamesettings.lua` `EnableRandomForPlayer`) |
| | **All Random** | Each lumber is spent for you on a random draw (`mechanics/random.lua` `getRandomElementOrder`): the starting lumber at once, then one draw at each lumber. A drawn element summons its Elemental. **The Elemental still has to be killed**, because only All Pick gets the free element. A drawn "pure" gives a Pure Essence. You cannot buy essence |
| | **Same Random** | As All Random, but every player gets the same order. In single player it is identical to All Random |
| **Length** | **Full** (55 + boss), **Express** (30), **Short** | Short starts at Wave 16 with 2,000 gold, 4 lumber, 4 free elements and a 10,000 base score (`GameLength.Short`) |
| **Order** | Normal or **Chaos** | Chaos shuffles the creep order (§5) |
| **Horde** | Normal or **Endless ("Rush")** | Rush starts the next Wave's break as soon as the current Wave *finishes spawning*, so Waves overlap. Bounty is +25%. Leaks no longer pause interest, and there are no boss Waves (`wave.lua` lines 160–177) |
| **Abilities** | Normal or **Challenge** | Challenge gives every Wave except the last two **two random traits** from bulky, heal, vengeance, undead, regen, fast, mechanical and time lapse, instead of its own. Elementals get one of regen, fast, mechanical or time lapse (`abilities_mode.lua`) |

The game mode itself is always "Competitive" (`voting.lua` line 302). That decides the shared Wave timer in multiplayer and hides the next-Wave button after Wave 1.

**Random draw rules** (`random.lua` `getRandomElement`):

- **The draw.** It picks uniformly from the six elements plus "pure" and re-draws until the pick is allowed.
- **Full-length limits.** Level 2 of an element cannot be drawn before Wave 10. Level 3 cannot be drawn before Wave 30, and a new element cannot be drawn from Wave 45 on. Level 3 is the cap.
- **Pure.** The first "pure" needs an element at level 3. A second one also passes once all six elements are at level 1. A quirk lets a third through after Wave 30.
- **Express limits.** Level 2 comes from Wave 3 and level 3 from Wave 12.
- **Order.** The whole order is drawn once at the start: the starting lumber plus draws for the breaks after Waves 5 … 50.

**What to build** (PLAN.md: All Pick and All Random; 55 Waves or 30-Wave Express):

- **All Pick and All Random**, each in **Full** and **Express**. Same Random adds nothing in single player.
- **Chaos and Challenge** are cheap to add later: they only reorder Waves or swap traits.
- **Rush** needs overlapping Waves. Park it.
- **Short** is a skip-ahead start. Park it.

## 10. Score

`scoring.lua`. The score is a running total.

| Event | Points |
|---|---|
| Wave *w* cleared | ⌈(w + 10) × 30 × (1 + 0.3 if no leaks that Wave) × (1 + D)⌉. Express uses w + 20. D = 0 / 1 / 2 / 3.5 for Normal / Hard / VeryHard / Insane |
| All 55 cleared (Express: all 30) | total = ⌈(total + net worth) × (1 + speed)⌉, where speed = (2400 / t − 1) × 1.55 and *t* is the seconds from the first spawn to the clear. Express uses speed = 1200 / t − 1. Net worth = gold plus the sell value of every finished tower (`playerdata.lua` `GetPlayerNetworth`) |
| Boss Wave *n* cleared | ⌈30 × 400 × (1 + 0.2 (n − 1)) × (1 + D)⌉ |
| Killed during boss Waves | plus the boss kills of the unfinished boss Wave × 400 × (1 + 0.2 (n − 1)) × (1 + D). A bulky boss counts as 2 kills, and an undead boss counts only on its second death |
| Lost before Wave 55 | the score stands |

- **The clock.** 2400 s is a 40-minute Full-length clear, which gives a speed bonus of 0. Faster is positive and slower negative, down to −155%. Express's break-even is 20 minutes.
- **Records** (CONTEXT: best Wave, score, fastest win):
  - **Best Wave** = the last Wave completed, with boss Waves counted as 55 + n.
  - **Score** = the port's total above.
  - **Fastest win** = *t* at the Wave-55 clear (Express: Wave 30).

## 11. Damage model

`mechanics/damage.lua` `DamageEntity`, `ApplyDamageAmplification`, `ApplyAbilityDamageFromModifiers`.

1. **Armour.** None. All creeps have 0 armour and towers deal non-physical damage, so armour types do not exist.
2. **Element.** The base damage is multiplied by the element table in §2: the tower's `DamageType` against the creep's element, unless the call passes an `element_override`.
3. **Amplification.** The result is multiplied by (1 + Σamp / 100) and rounded half-up. The amps add up:
   - Erosion's acid: +X%;
   - Enchantment's faerie fire: base or max, where max applies when 3 or fewer creeps are within its find radius;
   - Vengeance stacks on the attacking tower: −10% each.
4. **Rounding.** Then ⌈x⌉. Any damage at or above the creep's current HP kills it and pays the bounty. The **overkill** (damage − HP) is returned to the caller, and the Dark tower uses it.
5. **Pure damage** (`pure = true`) skips steps 2 and 3. It is used for the Dark tower's overkill bounce and some abilities (§3).
6. **Invulnerability.** A creep with `modifier_invulnerable` takes nothing. That is the undead creep while it is dead.
7. **Time lapse** runs before the HP change (§6).
8. **Ability damage** that goes through `ApplyAbilityDamageFromModifiers` gets the Blacksmith's Fire Up bonus, rounded half-up.

**Other things that change damage**:

- **Base-damage percent buffs** add together: Fire Up +15/30/100%, Life +50% at 50 lives or fewer, Ephemeral −10% per stack. Tidal adds a flat bonus per stack (**assumed**: Dota's usual additive stacking).
- **Streak and stack bonuses** come from Light, Fire's radius, Quark, Haste and Magic's range (§3).
- **Crits.** Only Hail crits: 15/20/25% for ×5, a plain uniform roll.
- **Splash falloff** is two steps, 100% and 50% (§3.2). Gunpowder, Flooding, Obliteration, Nova and Quake hit at full damage within their radius.
- **Stun.** The only stun is Ice's 0.15–0.4 s, with a 1.2 s lockout per creep.
- **Polar's Frostbite** removes HP directly. It skips the whole pipeline and gives the HP back after 10 s.
- **Order of hits.** In the port, the order in which an area hits creeps comes from the engine. Our port should sort targets by spawn id (**assumed**). The order matters for overkill and kill credit.

**Slows** (`towers/modifier_slow_adjustment.lua`):

- **Base speed** is fixed at 300.
- **Four slow families** exist: tornado (Windstorm), explode (Nova), Gaia's wrath (Roots) and sludge (Muck). Each has levels 1/2/3 worth **12% / 28% / 52%**.
- **Stacking.** Only the strongest level of each family counts. Different families multiply: speed = round(300 × Π(1 − s)).
- **Floor.** The code intends a floor of 50 (`min_ms`, **assumed** to be the effective minimum). The cap is 750.
- **Haste wins.** A hasted fast creep moves at 750 whatever its slows.
- **Purge.** Mechanical purges debuffs, slows and stuns included.

## 12. Determinism notes

Our game logic may use only `+ − × ÷` and `sqrt`, with a seeded RNG ([ADR-0002](../adr/0002-deterministic-simulation-core.md)).

| Mechanic | What the port uses | Deterministic equivalent |
|---|---|---|
| Wave HP, bounty, boss HP, Elemental HP | `math.pow` and repeated × | Ship the precomputed integer tables in `element-data.json`. Elemental and boss growth is 1.5ⁿ and 1.3ⁿ by repeated multiplication |
| Chaos order | `shuffle`, seeded with `Time()` | Fisher–Yates with the Run's seeded RNG |
| Random element order | `math.random`, seeded with the system clock (`gamesettings.lua` `SetElementOrder`) | Seeded RNG at Run start; store the drawn order in the save |
| Challenge traits | `math.random` | Seeded RNG at Run start |
| Mechanical first shield | `math.random(1, 6)` s | Seeded RNG: whole seconds 1–6, then every 8 s, in ticks |
| Image target | `math.random(0, 1)` | Seeded RNG, though the trait is unused anyway |
| Time lapse | game-time samples every 0.1 s, rounded through `string.format` | Ring buffer of 150 tick samples (5 s at 30 Hz) of position along the lane and HP; jump to the sample 150 ticks old |
| Creep movement | Dota pathfinding toward the exit | Polyline route (§1) and distance travelled; a leak resets the distance to 0 |
| Timers (interest, breaks, spawns, buffs) | engine timers in seconds | Integer tick counters at 30 Hz. All the port's periods are multiples of 1/30 s except 0.31 and 0.66 cooldowns, which become 9.3 and 19.8 ticks: keep cooldowns as fixed-point ticks (×10) or accumulate fractional time |
| Distances (range, AoE, leak radius 100) | `Length2D` | Compare squared distances, so no `sqrt` is needed |
| Dark overkill, Water bounce target | `math.random` over creeps in range | Seeded RNG over candidates sorted by spawn id |
| Hail crit | `RollPercentage` (uniform) | Seeded integer 1–100 ≤ chance |
| Trickery: which copy is removed | `RandomInt` | Remove the oldest copy, or use seeded RNG |
| Support towers' first check | `math.random(0.1, 1)` (Lua truncates it to 0 or 1 s) | Fixed 1 s (**assumed**) |
| Gunpowder's four side blasts | `RotatePosition` + `QAngle`, which is trigonometry | Constant offsets (0, ±100) and (±100, 0) |
| Quark damage | `math.pow(1.15, n)` | Table for n = 0…11, or repeated × |
| Electricity bounce damage | 1.2^k, k ≤ 7 | Repeated × |
| Windstorm tornado chase | engine pathing toward a moving creep | Move 200 × dt toward the target each tick (`sqrt` to normalise); stop when the target dies (**assumed**) |
| Roots line | unit vector toward the target | Direction = (dx, dy) / `sqrt`(dx² + dy²); allowed |
| Impulse, Obliteration | distance tower → target | `sqrt` is allowed |
| Area and buff search order | `FIND_ANY_ORDER` | Sort by spawn id (creeps) and build order (towers) |
| Same-frame timers | Lua `pairs()` order | Insertion order |
| Cosmetic: Electricity's 50% start point, rune ring, Elemental trophies | `RollPercentage`, `RotatePosition` | Renderer only; never in `src/sim` |

## 13. Open questions and assumptions

**Decisions for us (my recommendation first):**

1. **Fast creeps.** Use a 1 s haste every 3 s (§6). The current code may make them permanently hasted after 3 s; that hangs on an undocumented engine detail.
2. **Route.** Creeps follow the lane's centre line (§1). Dota pathfinding hugs the inside of corners, so a real lap is somewhat shorter, by up to roughly a lane width per corner. Keeping the centre line is the faithful-in-spirit choice and keeps every plot's exposure the same.
3. **Easy.** HP × 0.75 with Normal's breaks and bounty (§8).
4. **Early call.** The port only lets you skip the pregame. I recommend a "send now" button in every break, paying no bonus, as a convenience. It does not change any number.

**Engine behaviour I had to assume:**

5. **Stacked datadriven values.** Magic's range, Ephemeral's phasing and Tidal's bonus are fixed values on one modifier whose stack count is set by Lua. The engine may apply them only once. I used the per-stack behaviour the tooltips describe.
6. **Damage-over-time ticks.** The last tick lands exactly at the end of the duration. The Jinx KV says 3 ticks for 7.5 s ÷ 2.5 s.
7. **Area tests** use centre distance ≤ radius. Dota may add the target's hull radius.
8. **Engine order.** Area-damage order and buff-target ties follow engine order in the port. We sort by spawn id and build order instead.
9. **Minimum slowed speed** is 50.
10. **Attack speed bonus** uses Dota's usual (100 + bonus) / 100 per `AttackRate`. **Hail's per-level values** are assumed to apply, although its KV `MaxLevel` is 1.

**Questions the sources do not settle:**

11. **The WC3 route.** It is not confirmed cell for cell; see §1. The Dota map was rebuilt by Azarak and looks deliberately faithful, but I found no WC3 terrain data.
12. **Pre-Dota numbers.** Fast, undead, mech and heal had different numbers in the WC3 era (§14). We follow the port.
13. **Code oddities we fix, not copy.**
    - The Periodic tower hangs when every creep in range is dead.
    - Some creep counts skip holes in a table (Vapor, Enchantment, Runic). We count properly.
    - Flamethrower's napalm total never resets. **Kept as is** because it is the shipped behaviour.

**WC3 vs the port.** What we know comes from [wc3-td-maps.md](wc3-td-maps.md) and [td-design-and-balance.md](td-design-and-balance.md); this pass did not re-check it on the web.

- **Interest upgrades.** WC3 let you spend lumber to raise the interest rate, at most twice ([Hive, ETD Final](https://www.hiveworkshop.com/threads/element-td-final.35698/)). The port has no such purchase.
- **Trait numbers.** WC3-era guides give different numbers for fast, undead, mech and heal ([eletd basics](https://forums.eletd.com/topic/945-basics-of-element-td)).
- **PLAN's numbers.** The economy PLAN.md states (2% every 15 s, 50 lives, 250 gold) matches the port exactly.
- **Recommendation.** Follow the port everywhere. It is the only complete, citable source.

## 14. Corrections to [wc3-td-maps.md](wc3-td-maps.md)

| That file says | The source says |
|---|---|
| Path: fixed in WC3/Dota 2 **[partly unverified]** | **Confirmed for the Dota 2 port.** Each player has one walled lane, 2 cells wide, with 12 corners. Creeps walk it with pathfinding, and towers stand on separate raised plots, so they can never block or change it (§1) |
| Element levels 1–3 gate single, dual and triple towers | **No.** The number of *different* elements you hold gates single, dual and triple. The *level* (1–3) of those elements gates each tower's level 1–3. A dual needs both elements at level 1 and a triple all three |
| One lumber every 5 Waves until Wave 55 | You start with 1. One more arrives at the start of the break after each of Waves 5, 10 … 50, for 11 in total. Express: start with 2, then one every 3 Waves up to Wave 27 |
| Lumber can instead buy a Pure Essence | Confirmed, at most twice, and only with an element at level 3 or all six at level 1. Two more essences are free after Waves 50 and 55 |
| Pure Essence upgrades a level-3 single tower or buys the Periodic tower | Confirmed: 10,000 gold + 1 essence, or 13,000 gold + 1 essence |
| Undead revives at 33% HP | The port revives at **50%** after **3 s**, and the first death pays nothing |
| Mechanical: periodic invulnerability | 2 s every 8 s, first at a random 1–6 s, and it purges debuffs |
| The Dota 2 port adds image, regen, swarm, bulky and vengeance | Regen, bulky and vengeance are used. **Image and swarm are coded but used by no Wave.** The port also adds **time lapse ("Temporal")** |
| Interest of 2% every 15 seconds | Confirmed: ⌊2%⌋, no cap. A leak pauses it until that Wave is cleared, and it stops after Wave 55 |
| 50 lives; 250 gold and 1 lumber | Confirmed. A leaked creep costs 1 life (bulky 2, boss Waves 3, Elemental 3) and then **walks the lane again** |
| HP × 1, 1.3, 1.6 or 2 and shorter breaks | Confirmed. Bounty also grows slightly with Difficulty (base 1.093 → 1.099) and score gets +0 / 100 / 200 / 350% |
| Modes: All Pick, Same Random, All Random, Chaos, Express | Also **Rush** (overlapping Waves, +25% bounty), **Short** (start at Wave 16) and **Challenge** (two random traits per Wave). Same Random equals All Random in single player |
| 55 + endless boss | Confirmed. Boss Waves grow ×1.3 in HP each time, pay no gold and cost 3 lives per leak. They only add score |

[td-design-and-balance.md](td-design-and-balance.md) also needs updating, for the port:

- **Undead and mech.** "Undead revive at 33% HP after 5 s" and "Mech 3 s invulnerability every 12 s" are not the port's numbers. They are 50% after 3 s, and 2 s every 8 s.
- **Heal.** "Healing creeps restore 20% within 250" is 18% within 300 in the port.
- **Fast.** "+25% speed or a 1 s burst of +100%" is a 1 s burst at 750, i.e. +150%.
- **Sell refund.** "100% basic, 75% elemental" is 98% for the Arrow and Cannon lines and 90% for everything else, or 100% in random modes.
