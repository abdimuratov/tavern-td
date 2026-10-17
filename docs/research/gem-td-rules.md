# Gem TD+ rules reference

Researched 2026-10-17 for the Gem Game Mode. Vocabulary follows [CONTEXT.md](../../CONTEXT.md). The machine-readable twin of this file is `gem-data.json` (same numbers, with an `assumed` flag on filled-in values).

**Sources and caveats.** Everything here comes from the Gem TD+ source, [nvs/gem](https://github.com/nvs/gem) at commit `e073a589ea6b4ca26170d97feae8c5d6f7f0fb4a` (2025-06-08, map version 1.6.14). The repository has **no licence file**, so we port rules and numbers only (facts), never its text, names or art. Numbers come from three layers, and a later layer wins:

1. The base map `share/maps/Gem TD Plus.w3x`. Cited as `war3map.w3u: <id> <field>` (units), `war3map.w3a: <id>` (abilities), `war3map.w3q: <id>` (upgrades) and `war3map.wpm` (pathing).
2. The Lua patches in `share/objects/**/*.lua`, which the build applies on top. I read them and applied them by hand; I did not run them.
3. The JASS game logic in `src/**/*.j`. `src/gem-3.1.j` is the legacy map script.

A field that the map leaves unset falls back to the Warcraft III game tables. I read those from Hive Workshop's copies of the current-patch files (`UnitData.slk`, `UnitBalance.slk`, `UnitWeapons.slk`, `AbilityData.slk`, `humanunitfunc.txt`, `miscgame.txt`). Engine behaviour that no file states is marked **assumed** with the reason. Gem TD+ calls a Wave a "level", so "level 10" below means Wave 10.

---

## 1. At a glance

| Rule | Gem TD+ value | Source |
|---|---|---|
| Waves | 50, each 10 creeps; Wave 50 adds the Damage Test boss | `src/gem/spawn.j` |
| Draft | 5 gems per build phase, keep 1, the rest become Rocks | `src/settings/setup.j`, `src/gem/selection.j` |
| Lives | **None.** Leaks on Waves 1–9 are free; any leak from Wave 10 on ends the Run | `src/gem-3.1.j` (`Trig_Leak_and_lose_P1_Actions`) |
| Start | 10 gold after a 10 s countdown | `src/settings/setup.j` |
| Income | Kill bounty, plus 5 + 2 × Wave when a Wave ends | `src/gem-3.1.j` (`Trig_New_Level_P1_Actions`) |
| Gold sinks | Gem Quality (8 levels, 1,000 gold total), special upgrades, Extra Chance | `war3map.w3q: R000`, `src/gem/extra-chance.j` |
| Difficulty | One setting only (the old "Extreme") | `CHANGELOG.md` 1.5.0 |
| Wave start | Choosing what to keep starts the Wave at once; there is no timer | `src/gem/selection.j` |

## 2. Map

### Footprint and grid

- A gem, Rock or special covers **128 × 128** units, which is 4 × 4 WC3 pathing cells of 32 (`UnitData.slk: hgtw/hctw pathTex = 4x4SimpleSolid`). Every gem and special inherits this footprint. Topaz and Fire Star set it explicitly (`war3map.w3u: e000 … e006 upat`).
- Placement snaps the centre to a **64-unit grid** (**assumed**: WC3 build-grid squares are 64 units; nvs/gem does not say). So gems can sit half a gem apart.
- The grid below uses **64-unit cells**, so a gem fills 2 × 2 cells.
- Two gems that touch only at a corner block the gap between them (**assumed**: WC3 ground pathing does not cut corners).
- Creeps spawn with 0 collision and Ghost, so they never block each other (`src/gem/spawn.j`, `war3map.w3u: <creep> ucol = 0`).

### Player 1's field

Player 1 may build only inside rect `GA1` = x −6208…−256, y 4544…9024. The builder is teleported back if it leaves (`src/gem-3.1.j`: `gg_rct_GA1`, `Trig_Miner_Leaves_area_Actions`). The grid box is x −6208…−128, y 4416…8960: **95 columns × 71 rows**. Row 0 is the north edge (y 8896–8960), and x grows to the right. I built it from `war3map.wpm`. A cell is unwalkable if any of its four pathing cells has the no-walk flag, and unbuildable if any has the no-build flag.

| Char | Meaning |
|---|---|
| `.` | Buildable (4,955 cells) |
| `,` | Walkable, not buildable: lanes, painted marks, or outside `GA1` |
| `#` | Unwalkable |
| `S` | Spawn |
| `1`–`7` | Checkpoints, in order |
| `E` | Exit |

A marker sits in the cell whose bottom-left corner is the exact point. The real trigger is a 64 × 64 square centred on that corner.

```
#################################################################################,,,,,,,,####,,
#################################################################################........####,,
#################################################################################........####,,
#################################################################################........####,,
#################################################################################........####,,
#################################################################################........####,,
...........................................................................######........####,,
...........................................................................######........####,,
...........................................................................######........####,,
,,,,,,,,,,,,,,,,,,,,,,,,,,..........................................,,.....######........####,,
,,,,,,,,,,,,,,,,,,,,,,,,,,..........................................,,.....######........####,,
,,,,,,,,,,,,,,,,,,,,,,,,,S,,,,,,,,,,,1,,..........,,,5,,..........,,,4.....######........####,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,..........,,,,,,..........,,,,.....######........####,,
,,,,,,,,,,,,,,,,,,,,,,,,,,..........,,..............,,..............,,.....######........####,,
,,,,,,,,,,,,,,,,,,,,,,,,,,..........,,..............,,..............,,.....######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................######........####,,
....,,..........,,.........................................................##################,,
....,,..........,,.........................................................##################,,
....,,..........,,.........................................................##################,,
,,,,,,,,,,,,,,,,,,.........................................................##################,,
,,,,,,,,,,,,,,,,,,.........................................................##################,,
....,,.....................................................................##################,,
....,,.........................................................................##############,,
....,,.........................................................................##############,,
....,,.........................................................................##############,,
....,,.........................................................................##############,,
....,,.........................................................................################
....,,..............................,,..............................,,.........################
....,,..............................,,..............................,,.............############
....,,..............................,2,,..........................,,,3,,...........############
....,,..............................,,,,..........................,,,,,,...........############
,,,,,,..............................,,.............................................############
,,,,,,..............................,,.............................................############
..,,...............................................................................############
..,,...................................................................................########
..,,...................................................................................########
..,,...................................................................................########
..,,...................................................................................########
..,,...................................................................................########
..,,...................................................................................########
..,,.......................................................................................####
..,,,,,,,,.................................................................................####
..,,,,,,,,...................................................................................,,
,,........,,........................................,,..................................,,,,,,,
,,........,,........................................,,..................................,,,,,,,
,,......,,..........................................,6,,................................,,,,,7,
,,......,,..........................................,,,,................................,,,,,,,
,,....,,............................................,,..................................,,,,,,,
,,....,,............................................,,..................................,,,,,,,
,,..,,....................................................................................,,,,,
,,..,,....................................................................................,,,,,
..,,........................................................................................,,,
..,,........................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
............................................................................................,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,E,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
```

| Point | WC3 x, y | Grid col, row | Source |
|---|---|---|---|
| Spawn | −4608, 8192 | 25, 11 | `gg_rct_Spawn_1` in `src/gem-3.1.j` |
| Checkpoint 1 | −3840, 8192 | 37, 11 | `gg_rct_1move1` |
| Checkpoint 2 | −3840, 6656 | 37, 35 | `gg_rct_1move2` |
| Checkpoint 3 | −1792, 6656 | 69, 35 | `gg_rct_1move3` |
| Checkpoint 4 | −1792, 8192 | 69, 11 | `gg_rct_1move4` |
| Checkpoint 5 | −2816, 8192 | 53, 11 | `gg_rct_1move5` |
| Checkpoint 6 | −2816, 5632 | 53, 51 | `gg_rct_1move6` |
| Checkpoint 7 | −256, 5632 | 93, 51 | `gg_rct_1move7` |
| Exit | rect −352…−160 × 4416…4544 | 93, 69 | `gg_rct_Finish_1` |

What the grid shows:

- **Spawn lane.** The top band (rows 9–14) is walkable but unbuildable from the west edge to just past checkpoint 1.
- **Painted marks.** The `,` strokes in the west third, and the small patches around checkpoints 2–7, are unbuildable but walkable. Creeps walk over them, and you cannot build on them.
- **Exit lane.** The bottom two rows (y 4416–4543) are a walkable, unbuildable lane. It lies just outside `GA1`.
- **North-east pocket.** Columns 81–88, rows 0–21, are a buildable pocket walled off from the field. Creeps never enter it, but towers there can shoot into the field.
- **Out of bounds.** Columns 93–94 (x −256…−128) are outside `GA1`, so they are never buildable. In rows 0–31 they are a separate centre lane that does not join the field inside the box. Lower down they hold checkpoint 7 and the exit.

Movement:

- **Ground.** Ground creeps walk to each checkpoint in turn by WC3 pathfinding (`src/gem-3.1/movement.j`).
- **Air.** Air creeps are re-ordered toward the next checkpoint every 1.0 s, at most 548.1 units per order, so they fly straight lines S → 1 → … → 7 → E (`src/gem/movement.j`).
- **Leaks.** Reaching the exit counts as a leak only after checkpoint 7 (unit user data 7). A creep that crosses the exit lane earlier is ignored (`Trig_Leak_and_lose_P1_Actions`).

**Outside the box (assumed boundary).** In WC3 the field is not walled off. Walkable land continues west of x = −6208 and south of y = 4416, into other players' areas that are empty in single player, so a WC3 creep can detour outside the box. The grid treats everything outside the box as wall. The Mine, your research building, stands at (−256, 4160), just below the exit (`src/gem-3.1.j`: `CreateBuildingsForPlayer0`).

## 3. Draft and placement

1. **Start of each build phase.** You get 5 placement tokens (lumber). The builder, a flying "Miner", places a "Random Gem" placeholder anywhere buildable in your field. Each takes 1 s to build and is free (`src/gem/placement.j`; `war3map.w3u: h006 ubld = 1, ugol = 0`).
2. **Rolling.** When a placeholder finishes, it becomes a random gem. The type is uniform over the 8 types, and the quality follows your chance level (§8). Each of the 5 rolls is independent (`src/gem/chance.j`). You choose the spot first and see the gem after.
3. **Choosing.** After the fifth gem, every Draft gem gets action buttons: **Keep**, **Downgrade**, **Combine ×2/×3/×4**, **Combine Special** (one-hit recipe) and **Keep Slate / Combine Slate** (`src/gem/selection/*.j`).
4. **Starting the Wave.** Any action finalises the Draft. Every other gem of the five becomes a **Rock** (`h00G`, the same 128 × 128 solid footprint) where it stood, and the Wave starts immediately (`Gem_Selection__Finalize` → `Trig_Finish_Build_Race_P1_Actions` → `Gem_Spawn__Start`). There is no build timer.
5. **No placement during a Wave.** A Wave ends when 10 creeps (11 on Wave 50) have died or leaked. The next build phase then begins at once, so creeps are never on the field while you place (`Trig_Race_Mode_Kills_Actions`).
6. **Your towers during the build phase.** Your existing towers are handed to a neutral player and made invulnerable, and they come back when you choose. So tower swaps, special upgrades and field recipes all happen during a Wave (`Trig_New_Level_P1_Actions`).
7. **Cancelling.** Cancelling a placeholder under construction refunds its token (`Gem_Placement___Cancel`).

**Rocks.**

- Any Rock can be removed **for free**, at any time, including mid-Wave. The ability has a 2 s cooldown (`war3map.w3a: A008`; `Trig_Remove_rocks_Actions`).
- Rocks are never sold or refunded.

## 4. Merging

Only identical gems (same type and quality) **in the current Draft** can merge. Older gems on the field never merge (`src/gem/selection/combine.j`).

| Button | Needs | Result |
|---|---|---|
| Combine ×2 | 2 or more of a kind | +1 quality |
| Combine ×3 | exactly 3 of a kind | +2 qualities |
| Combine ×4 | 4 or more of a kind | +2 qualities (same as ×3) |
| Downgrade | any non-Chipped gem | −1 quality |

- **Where the result goes.** The merged gem replaces the gem you clicked, in place, and the other four Draft gems become Rocks.
- **Above Great.** A result above Great becomes the **Stone of Bryvx**, for example three or four identical Perfects. Great never rolls in a Draft (§8), so it only comes from merging.

## 5. Gems

### Per-type rules

| Type | Attack type | Targets | Ability (WC3 base) | Notes |
|---|---|---|---|---|
| Amethyst | pierce | air only | – | Long range. Great: −3 armor aura on all enemies within 1000 (`A03Q`, Devotion Aura `AHad`) |
| Aquamarine | magic | both | – | 0.5 s cooldown, short range. Great: +10% attack-speed aura for your towers within 1500 (`S000`, `SCae`) |
| Diamond | normal | ground only | Critical Strike (`ACct`): 25% for ×2 (Great ×5) | |
| Emerald | siege | both | Poison (`Aspo`): DPS by quality, 20% slow, 6 s, can kill | `share/objects/emerald-poison-kill.lua` |
| Opal | magic | both | Attack-speed aura (`S008`, `SCae`), level = quality | The same buff name never stacks; the highest level wins |
| Ruby | hero | both | Artillery splash: 100% within 200, 50% within 220, 10% within 240; splash hits ground only | `share/objects/ruby-splash.lua`; `UnitWeapons.slk hctw Hfact1/Qfact1`. Great Ruby is a missile with Barrage instead |
| Sapphire | spells | both | Frost Attack (`Afra`): 20% move and 25% attack slow, 5 s (3 s on heroes) | 20% comes from `FrostMoveSpeedDecrease = 0.2` in `share/constants/gameplay/gem.lua`; 25% is the WC3 default |
| Topaz | chaos | both | Barrage (`Aroc`): every 1 s, damage to up to N enemies within R | Base switched to `hgtw` (`share/objects/change-topaz-base.lua`) |

- **Damage.** Damage is base plus the sum of N dice of 1…sides. Every basic gem rolls 1 die (`UnitWeapons.slk hgtw/hctw dice1 = 1`), so min = base + 1 and max = base + sides. Two specials roll more (§6).
- **Projectile speed.** This is `ua1z`. Flawless Amethyst leaves it unset, so it uses the guard-tower default of 1800 (`humanunitfunc.txt [hgtw] Missilespeed`).
- **Barrage (assumed semantics).** It fires on its own cooldown at up to N enemies, independent of the main attack. It uses the tower's attack type and the target's armor, the way Fire Star's code treats Barrage hits as attack damage.

### Stats (from `war3map.w3u: <id> ua1b/ua1s/ua1c/ua1r/ua1z`, after the Lua patches)

| Amethyst | Dmg | Cooldown | Range | Projectile |
|---|---|---|---|---|
| Chipped (h004) | 10–15 | 0.8 | 1000 | 1200 |
| Flawed (h007) | 20–27 | 1.0 | 1200 | 1400 |
| Normal (h00H) | 30–45 | 1.0 | 1300 | 1500 |
| Flawless (h00N) | 60–80 | 1.0 | 1350 | 1800 |
| Perfect (h00V) | 140–170 | 1.0 | 1600 | 1900 |
| Great (h02X) | 350–400 | 1.0 | 1650 | 1900 |

| Aquamarine | Dmg | Cooldown | Range | Projectile |
|---|---|---|---|---|
| Chipped (h03T) | 6–8 | 0.5 | 350 | 1000 |
| Flawed (h03S) | 12–15 | 0.5 | 365 | 1000 |
| Normal (h03R) | 24–30 | 0.5 | 380 | 1000 |
| Flawless (h03U) | 48–55 | 0.5 | 400 | 1000 |
| Perfect (h03V) | 100–120 | 0.5 | 550 | 1000 |
| Great (h03W) | 280 | 0.5 | 600 | 1000 |

| Diamond | Dmg | Cooldown | Range | Projectile | Crit |
|---|---|---|---|---|---|
| Chipped (h000) | 8–12 | 0.8 | 500 | 950 | 25% ×2 |
| Flawed (h008) | 16–18 | 1.0 | 550 | 900 | 25% ×2 |
| Normal (h00I) | 30–37 | 1.0 | 600 | 850 | 25% ×2 |
| Flawless (h00O) | 58–65 | 1.0 | 650 | 900 | 25% ×2 |
| Perfect (h00Y) | 140–150 | 1.0 | 750 | 1200 | 25% ×2 |
| Great (h031) | 300–350 | 1.0 | 850 | 1900 | 25% ×5 |

| Emerald | Dmg | Cooldown | Range | Projectile | Poison DPS |
|---|---|---|---|---|---|
| Chipped (h002) | 4–7 | 0.8 | 500 | 700 | 2 |
| Flawed (h009) | 10–13 | 1.0 | 550 | 750 | 4 |
| Normal (h00J) | 15–25 | 1.0 | 600 | 700 | 8 |
| Flawless (h00S) | 30–37 | 1.0 | 700 | 700 | 16 |
| Perfect (h00U) | 80–95 | 1.0 | 900 | 700 | 40 |
| Great (h032) | 275 | 1.0 | 900 | 1500 | 100 |

| Opal | Dmg | Cooldown | Range | Projectile | Aura: attack speed, radius |
|---|---|---|---|---|---|
| Chipped (h003) | 5 | 0.8 | 600 | 600 | +10%, 600 |
| Flawed (h00A) | 10 | 1.0 | 700 | 1200 | +15%, 700 |
| Normal (h00K) | 20 | 1.0 | 800 | 1000 | +20%, 800 |
| Flawless (h00P) | 40 | 1.0 | 900 | 900 | +25%, 900 |
| Perfect (h00X) | 85 | 1.0 | 1000 | 1350 | +35%, 1000 |
| Great (h030) | 180 | 1.0 | 1500 | 1200 | +50%, 1500 |

| Ruby | Dmg | Cooldown | Range | Projectile | Extra |
|---|---|---|---|---|---|
| Chipped (h005) | 8–9 | 1.0 | 800 | 1400 | splash 200/220/240 |
| Flawed (h00C) | 13–16 | 1.0 | 800 | 1400 | splash 200/220/240 |
| Normal (h00M) | 20–25 | 1.0 | 800 | 1500 | splash 200/220/240 |
| Flawless (h00R) | 38–45 | 1.0 | 800 | 1600 | splash 200/220/240 |
| Perfect (h00T) | 80–100 | 1.0 | 900 | 1700 | splash 200/220/240 |
| Great (h02Y) | 140 | 0.5 | 900 | 1700 | no splash; Barrage 140 to 1 enemy within 900 every 0.5 s (`A06Y`) |

| Sapphire | Dmg | Cooldown | Range | Projectile |
|---|---|---|---|---|
| Chipped (h001) | 5–8 | 0.8 | 550 | 1250 |
| Flawed (h00B) | 10–14 | 1.0 | 750 | 1300 |
| Normal (h00L) | 16–22 | 1.0 | 800 | 1300 |
| Flawless (h00Q) | 30–40 | 1.0 | 850 | 1200 |
| Perfect (h00W) | 60–80 | 1.0 | 1400 | 1300 |
| Great (h02Z) | 200–250 | 1.0 | 2000 | 1900 |

| Topaz | Dmg | Cooldown | Range | Projectile | Barrage: damage × targets, radius |
|---|---|---|---|---|---|
| Chipped (e000) | 4 | 0.8 | 500 | 900 | 4 × 1, 500 |
| Flawed (e001) | 8 | 1.0 | 500 | 900 | 8 × 2, 500 |
| Normal (e002) | 14 | 1.0 | 500 | 900 | 14 × 3, 500 |
| Flawless (e003) | 25 | 1.0 | 500 | 900 | 25 × 4, 500 |
| Perfect (e004) | 75 | 1.0 | 600 | 900 | 75 × 7, 600 |
| Great (e005) | 250 | 1.0 | 700 | 900 | 250 × 7, 700 |

Sources: Topaz range comes from `share/objects/change-topaz-base.lua`; Barrage values come from `war3map.w3a: A00X, A00Y, A00Z, A010, A011, A01F`.

## 6. Recipes and specials

### How recipes work

- **One-hit (from the Draft).** If the Draft holds every part of a recipe, all five gems get **Combine Special**. The gem you click becomes the special in place, and the other four become Rocks. Only one recipe can fire per Draft, and each gem belongs to at most one recipe (`src/gem/selection/special.j`, `src/gem/recipe.j`).
- **Field (from older gems).** Kept gems are remembered by type. When a newly kept gem completes a recipe with parts already on your field, that new gem gets Combine Special. It becomes the special in place, the other parts become Rocks, and the kills of all parts are summed (`src/gem/combination.j`). The button can be pressed later, during any Wave.
- **Upgrades.** Each tier is a WC3 building upgrade on the special itself. It costs the next tier's gold price (`ugol`) and takes 1 s (`ubld = 1`).

| Special | Recipe |
|---|---|
| Malachite | Chipped Aquamarine + Chipped Emerald + Chipped Opal |
| Silver | Chipped Diamond + Chipped Sapphire + Chipped Topaz |
| Star Ruby | Flawed Ruby + Chipped Amethyst + Chipped Ruby |
| Jade | Normal Emerald + Normal Opal + Flawed Sapphire |
| Red Crystal | Flawless Emerald + Normal Ruby + Flawed Amethyst |
| Dark Emerald | Perfect Emerald + Flawless Sapphire + Flawed Topaz |
| Gold | Perfect Amethyst + Flawless Amethyst + Flawed Diamond |
| Uranium 238 | Perfect Topaz + Normal Sapphire + Flawed Opal |
| Pink Diamond | Perfect Diamond + Normal Diamond + Normal Topaz |
| Paraiba Tourmaline | Perfect Aquamarine + Flawless Opal + Flawed Aquamarine + Flawed Emerald |
| Black Opal | Perfect Opal + Flawless Diamond + Normal Aquamarine |
| Blood Stone | Perfect Ruby + Flawless Aquamarine + Normal Amethyst |
| Yellow Sapphire | Perfect Sapphire + Flawless Ruby + Flawless Topaz |

Source: `src/gem/special/initialize.j`.

### Tiers

Stats come from `war3map.w3u: <id>` plus the patch in `share/objects/specials/<name>/`. "Burn" means the shared immolation system (§13): spell damage to every enemy in the radius, ticking as listed.

| Tier (id) | Upgrade cost | Dmg | Cooldown | Range | Attack, targets | Abilities |
|---|---|---|---|---|---|---|
| Malachite (h03X) | recipe | 6 | 0.45 | 800 | siege, both | Barrage 6 to every enemy within 750, every 0.5 s (`A03D`) |
| Vivid Malachite (h03Y) | 25 | 11 | 0.45 | 800 | siege, both | Barrage 11, all within 800, 0.5 s (`A03E`) |
| Mighty Malachite (h03Z) | 180 | 45 | 0.45 | 800 | siege, both | Barrage 45, all within 800, 0.55 s (`A03F`) |
| Silver (h01A) | recipe | 26–27 | 1.0 | 550 | spells artillery, both | Splash 350 (full damage only); Frost slow (`A00L`) |
| Sterling Silver (h02O) | 25 | 51 | 1.0 | 650 | spells artillery, both | Splash 350; Frost slow |
| Silver Knight (h033) | 190 | 188 | 1.0 | 750 | spells artillery, both | Splash 350; Frost slow |
| Star Ruby (h016) | recipe | no attack | – | – | – | Burn 30/s within 265 (7.5 every 0.25 s) (`src/gem/special/star-ruby.j`) |
| Blood Star (h02M) | 30 | no attack | – | – | – | Burn 40/s within 500 (10 every 0.25 s) |
| Fire Star (e006) | 190 | 0 | 2.0 | 600 | hero, both | Hits deal 0 and **mark** the target. Barrage marks every enemy within 600 every 0.5 s. Each mark burns the target and enemies within 192 for 60/s for 6 s, refreshed by later hits (`src/gem/special/star-ruby/03-fire-star.j`) |
| Jade (h018) | recipe | 30–35 | 0.5 | 800 | magic, both | Poison 15/s, 20% slow, 4 s (`share/objects/jade.lua`) |
| China Jade (h02L) | 45 | 50 | 0.5 | 800 | magic, both | Poison 30/s, 20% slow, 4 s |
| Lucky China Jade (h035) | 250 | 55 | 0.35 | 850 | magic, both | Poison 60/s; 5% crit ×4 (`A02X`); per hit, a 1% chance of ⌊Wave/2⌋ gold and a 1% chance of a 2 s stun (`src/gem/special/jade.j`) |
| Red Crystal (h029) | recipe | 50–75 | 0.8 | 1300 | pierce, air only | −4 armor aura on air enemies within 1300 (`A00V`) |
| Red Facet (h02J) | 100 | 75–100 | 0.8 | 1400 | pierce, air only | −5 armor, 1400 (`A012`) |
| Rose Quartz Crystal (h02Q) | 150 | 100–125 | 0.8 | 1500 | pierce, air only | −6 armor, 1500 (`A018`); Burn 50/s within 1500 that hits ground too (10 every 0.2 s) |
| Dark Emerald (h01N) | recipe | 90–150 | 0.8 | 550 | siege bounce, both | Bounces within 256 with no damage loss. Targets = 1 + the number of Dark/Enchanted Emeralds you own. 12.5% chance to stun 1.5 s; a target stunned this way takes +20% damage from all sources (`src/gem/special/dark-emerald.j`) |
| Enchanted Emerald (h02V) | 185 | 168–268 | 0.7 | 700 | siege bounce, both | Same as Dark Emerald (`share/objects/dark-emerald-chain.lua`) |
| Gold (h01B) | recipe | 160–190 | 1.0 | 800 | pierce, both | 25% crit ×2 (`A00N`); each hit applies −4 armor for 5 s (`A00M`, Orb of Corruption) |
| Egyptian Gold (h02W) | 205 | 160–200 | 0.75 | 800 | pierce, both | 30% crit ×2; −8 armor for 5 s |
| Uranium 238 (h019) | recipe | no attack | – | – | – | −50% move speed aura on enemies within 500 (`A00W`); Burn 200/s within 500 (20 every 0.1 s) (`src/gem/special/uranium.j`) |
| Uranium 235 (h02N) | 190 | 20 | 0.2 | 900 | chaos, both | Barrage 19 to every enemy within 900 every 0.2 s (`A016`); slow aura and Burn as U238 |
| Pink Diamond (h017) | recipe | 150–175 | 0.75 | 800 | normal, ground only | 10% crit ×9 (`share/objects/pink-diamond.lua`) |
| Great Pink Diamond (h02P) | 175 | 175–225 | 0.65 | 850 | normal, ground only | 10% crit ×15 |
| Paraiba Tourmaline (h040) | recipe | 10–400 | 0.75 | 850 | magic, both | −4 armor aura on ground enemies within 600 (`A03H`). Per hit, a 20% chance (costs 5 of its 10 mana; mana regen 2.25/s) of a Frost Nova: 125 to the target + 125 within 200, plus a 20% slow for 5 s (`Trig_Tourmaline_Actions`, `A03J`) |
| Paraiba Tourmaline Facet (h041) | 275 | 30–420 | 0.75 | 875 | magic, both | −6 armor within 650; Nova 150 + 200; mana regen 2.75/s (`A03N`) |
| Black Opal (h015) | recipe | 25 | 1.0 | 800 | magic, both | +30% damage aura for your towers within 1000 (`A00G`, Command Aura) |
| Mystic Black Opal (h02K) | 275 | 50 | 1.0 | 1000 | magic, both | +40% within 1200 (`A013`) |
| Blood Stone (h01O) | recipe | 115 | 0.8 | 700 | hero, both | Per hit, a 24% chance (+12% per extra Blood Stone or Ancient Blood Stone you own; 5 mana) of Blood Lightning: 180 + 30 × (kill level − 1) to up to 9 targets (`src/gem/special/blood-stone.j`, `GBSB`) |
| Ancient Blood Stone (h02U) | 225 | 160–240 | 0.8 | 700 | hero, both | 10% crit, ×3 + 0.25 per kill level (`A019`); Ancient Blood Lightning 350 + 50 × (kill level − 1), up to 9 targets (`A07A`) |
| Yellow Sapphire (h014) | recipe | 100 | 0.8 | 800 | spells artillery, both | Splash 500 (full damage only); Frost slow (`A00F`) |
| Star Yellow Sapphire (h02R) | 180 | 220 | 0.8 | 850 | spells artillery, both | Splash 500; Frost slow (`A01B`) |
| **Stone of Bryvx** (h04A) | merge only | 500 | 0.8 | 850 | siege, both | +30% damage aura within 1500 (`A068`, `share/objects/stone-of-bryvx.lua`) |

"Kill level" = min(kills / 10 + 1, 11) (`src/gem/special/blood-stone.j`, `src/gem-3.1/find-ability-levels.j`).

Most specials roll 1 damage die. Enchanted Emerald rolls 166 + 2d51, and Paraiba Tourmaline rolls 5 + 5d79 (Facet 25 + 5d79), so their damage clusters around the middle of the range (`war3map.w3u: h02V, h040, h041 ua1d`).

## 7. Slates

A slate is a support tower made from the Draft. Three things set slates apart (`share/objects/standardize-slate-range.lua`, `war3map.w3u: n000 … n00F upat = ""`):

- **No pathing.** Creeps walk over a slate, so it never shapes the maze.
- **Melee range.** Most slates hit only what passes within **128**.
- **No Rock.** The cell where a slate stands is left walkable.

Other rules:

- **Making one.** The Draft must hold a Normal gem of the slate's type plus at least one listed Flawed gem. That Normal gem can then be kept as the slate in place (**Keep Slate**). If the Draft also completes the partner base slate, **Combine Slate** makes the combination slate directly (`src/gem/selection/slate.j`).
- **From the field.** Keeping a base slate while its partner is already on your field gives the new slate Combine Special (`src/gem/slate/initialize.j`, `src/gem/combination.j`).
- **Stacking.** A slate cannot stand within 220 of the same slate, its combination or its parts. If it would, it is pushed 400 in a random direction (`src/gem/slate/stacking.j`).
- **Moving.** Each slate can teleport once, anywhere in your field (`Trig_Slate_move_Actions`).
- **Swapping.** Slates are typed "ancient", so they cannot be swapped (`share/objects/make-slates-repairable.lua`).

"Kills" below means the slate's own kill count.

| Slate (id) | Recipe | Attack | Effect |
|---|---|---|---|
| Hold (n002) | Normal Topaz + Flawed Amethyst or Flawed Sapphire | 1, every 0.05 s, range 128, ground | Grabs the target: 1.5 s stun and 160 + 20 × kills chaos damage. Towers within 600 of the target are ordered to attack it. The slate is disarmed for 3.5 s after (`src/gem/slate/hold.j`) |
| Air (n000) | Normal Amethyst + Flawed Emerald, Opal or Ruby | 40 pierce, 0.5 s, range 850, air only | – (`share/objects/air-slate.lua`) |
| **Ancient** (n003) | Hold + Air | 1, 0.05 s, 128, both | Stun of random length 3–7 s; 640 + 20 × kills damage. Armor −(3 + 3 × Ancient Slates owned) on ground or −(2 + count) on air for the stun. Taunt 600, then disarmed 5 s (`src/gem/slate/ancient.j`) |
| Opal Vein (n004) | Normal Opal + Flawed Ruby or Flawed Topaz | 80 magic, 0.5 s, 128, ground | +10% attack-speed aura within 700 (`S006`, buff "Boost") |
| Slow (n001) | Normal Sapphire + Flawed Aquamarine, Diamond or Emerald | 100 normal, 0.5 s, 128, ground | Sets the target's speed to 85% of its default, permanently. It does not stack (`Trig_Slow_Slate_Actions`) |
| **Wraith** (n005) | Opal Vein + Slow | 200 hero, 0.3 s, 128, ground | Incinerate (`A02V`, `ANic`): +35 damage per stacked hit (35, 70, 105 …) for 5 s. A creep that dies burning explodes for 500 within 250 and 250 within 750. +10% attack-speed aura within 1000 (`S007`, also "Boost") (`share/objects/nerf-wraith.lua`) |
| Poison (n008) | Normal Emerald + Flawed Aquamarine, Opal or Topaz | 1, 0.05 s, 128, both | Shadow Strike on attack (5 mana; mana 5, regen 4/s). Damage 20 + 2 × (kill level − 1) up front and per tick; lasts 20.1 + 2 × (kill level − 1) s; 25% slow (`src/gem/slate/poison.j`, `share/objects/slate/poison.lua`, `A05N`). The tick is every 2 s per the tooltip (**assumed**) |
| Spell (n009) | Normal Aquamarine + Flawed Amethyst or Flawed Diamond | 30–40 magic, 0.5 s, 128, both | 25% per hit to cast one of three spells: Fan of Knives (80 within 500, 420 cap), Forked Lightning (85 × up to 9) or Carrion Swarm (125, 400 cap) (`Trig_Spell_Slate_Actions`) |
| **Elder** (n00A) | Spell + Poison | 100 spells, 0.33 s, 128, both | 35% per attack, with 5 mana (mana 30, regen 4/s), to cast one of four spells. Level = kills / 10 + 1. Fan of Knives 150 + 15/level within 500 + 25/level. Thunder Clap 150 + 15/level within 350 + 25/level, with a 50% slow for 5 s. Armor −7 for 25 s. Forked Lightning 200 + 20/level × 9 (`Trig_Elder_Slate_Actions`, `share/objects/slate/elder.lua`) |
| Damage (n00C) | Normal Diamond + Flawed Opal or Flawed Sapphire | 1, 0.05 s, 128, ground | Each attack strikes for 256 + 10 × kills normal damage, then disarms itself 1 s. +10% damage aura within 250 (`src/gem/slate/damage.j`, `A072`) |
| Range (n00E) | Normal Ruby + Flawed Amethyst, Ruby or Topaz | 15 hero missile, 0.5 s, 600, both | Barrage 15 to every enemy within 600, every 0.5 s (`A073`) |
| **Viper** (n00F) | Damage + Range | 30 hero missile, 0.5 s, 750, both | Barrage 30, all within 750, 0.5 s (`A074`); Burn 50/s within 400 (`src/gem/slate/viper.j`); damage aura +10% +3%/kill level within 400 (`share/objects/slate/viper.lua`) |

Bold = combination slate. Recipes come from `src/gem/slate/initialize.j`.

## 8. Chance levels and Extra Chance

**Gem Quality** (`R000`, researched at the Mine in 1 s) has 8 levels. Level *n* costs 20 + 30 × (*n* − 1) gold, 1,000 in total (`war3map.w3q: R000 glvl = 8, gglb = 20, gglm = 30`). The quality weights are per type, and the type is uniform (`src/gem/chance.j`):

| Level | Cost to reach | Chipped | Flawed | Normal | Flawless | Perfect | Great |
|---|---|---|---|---|---|---|---|
| 0 | – | 100% | 0 | 0 | 0 | 0 | 0 |
| 1 | 20 | 70% | 30% | 0 | 0 | 0 | 0 |
| 2 | 50 | 60% | 30% | 10% | 0 | 0 | 0 |
| 3 | 80 | 50% | 30% | 20% | 0 | 0 | 0 |
| 4 | 110 | 40% | 30% | 20% | 10% | 0 | 0 |
| 5 | 140 | 30% | 30% | 30% | 10% | 0 | 0 |
| 6 | 170 | 20% | 30% | 30% | 20% | 0 | 0 |
| 7 | 200 | 10% | 30% | 30% | 30% | 0 | 0 |
| 8 | 230 | 0 | 30% | 30% | 30% | 10% | 0 |

**Extra Chance** is a Gem TD+ addition, unlocked once Gem Quality is at level 8 (`src/gem/mine.j`, `src/gem/extra-chance.j`).

**Setting and cost.**

- Before your first placement of a round, pick a target: a gem type (shown as "Perfect X", **175 gold**) or a base slate (**125 gold**).
- The fee is refunded if you cancel or switch before placing.
- The target cannot change once a gem is down.

**Type target.** Each of the 5 placements rolls *r* in [0, 1]:

1. If *r* ≤ 2^(bonus − 10), you get the target type at Chipped (when *r* < 0.096) or at Perfect.
2. Otherwise, if *r* ≤ *w*, you get the target type at a quality drawn from Chipped 9.6%, Flawed 23.8%, Normal 23.8%, Flawless 23.8%, Perfect 19%. Here *w* = (25 + 11 × bonus) / 80, or 1 at bonus ≥ 5.
3. Otherwise you get a normal random gem.

**Slate target.**

- *w* = (18.75 + 12.25 × bonus) / 80. It becomes 1 at bonus ≥ 5, or when any roll is at or below the bias 2.5^(bonus − 10).
- Successful rolls alternate. The first gives a Normal piece: the target slate's Normal with probability 0.67 (0.75 for slates with three Flawed options), otherwise its partner's Normal. The next gives one of that slate's Flawed pieces.
- The five results are then shuffled.

**Bonus.**

- The bonus starts at 0 and is capped at 10.
- Targeting the same class as last round (Perfects or Slates) gives +1. Switching class keeps the bonus.
- Skipping a round gives −1.
- Hitting the target gives −4 if the bonus was above 3; otherwise the target and bonus are cleared.
- A miss carries the target and bonus over.

The old 3.1 "Increase Extra Chance" research (`R001`) is unused; `share/objects/mine.lua` turns it into a flag.

## 9. Swap

- **Cost.** A swap costs **10 builder mana**, not gold. The builder has 10 mana maximum, starts full, has no natural regeneration, and gains 1 mana per Wave cleared, so you get one swap at the start and one more every 10 Waves (`src/gem/swap.j`: `Gem_Swap___COST = 10`, `Gem_Swap__Clear_Round`; `share/objects/builder.lua`).
- **How.** Mark one structure, then pick a second within 10 s, or the swap resets and the mana is refunded.
- **What can swap.** Any two of your non-ancient structures: towers, specials, Rocks, and the gems of the current Draft. Slates are excluded.
- **When.** Draft gems and Rocks can swap during the build phase; towers only during a Wave (§3.6).

## 10. Waves

Every Wave has 10 creeps of one type. They spawn 1.61 s apart, starting at once, at the spawn point (`src/gem/spawn.j`: `Spawn__Create (..., 1, 10, ..., 0.00, 1.61)`). No creep has any ability, regeneration or evasion, and none summons (`war3map.w3u: <creep> uabi = "", uhpr = 0`). Air Waves are 4, 8, …, 48 (`Trig_Type_Air_Actions`).

How the numbers are built:

- **Armor.** `share/objects/difficulty-armor-changes.lua` sets every creep's armor.
- **HP.** That file also multiplies the map HP by 1.2 on air Waves and Waves 40–49 (marked \*), and sets Wave 50 to 85,000.
- **Bounty.** Bounty is `ubba + 1d1`.
- **Speed.** Speed is `umvs`. The minimum, below which slows cannot push a creep, is the larger of the creep's `umis` and the global 220 (`share/constants/gameplay/gem.lua`: `MinUnitSpeed = 220`, `MaxUnitSpeed = 522`).
- **Armor colour names.** Red = small, Blazed = medium, White = large, Green = fortified, Yellow = normal, Blue = hero, Bryvx = divine, Pink = unarmored (`share/constants/gameplay/gem.lua`).

| Wave | WC3 name (id) | HP | Armor | Armor type | Speed (min) | Air | Bounty |
|---|---|---|---|---|---|---|---|
| 1 | Mine Rat (h00D) | 10 | 12 | Yellow | 265 (220) |  | 1 |
| 2 | Mine Gekko (h00Z) | 30 | 12 | Blazed | 265 (220) |  | 1 |
| 3 | Mine Less (h010) | 55 | 12 | White | 265 (220) |  | 1 |
| 4 | Bat (h011) | 84\* | 12 | Pink | 230 (220) | yes | 2 |
| 5 | Rockmen (h012) | 90 | 12 | Green | 275 (220) |  | 2 |
| 6 | Bigger Rockmen (h013) | 120 | 12 | Green | 275 (220) |  | 2 |
| 7 | Greeny (h01C) | 178 | 12 | Pink | 285 (220) |  | 2 |
| 8 | Flying Gem Thief (h01D) | 288\* | 12 | Pink | 230 (220) | yes | 3 |
| 9 | Hoodsmen (h01E) | 300 | 12 | White | 285 (220) |  | 3 |
| 10 | Merc (h01F) | 470 | 15 | Blue | 285 (220) |  | 3 |
| 11 | Giant Slug (h01G) | 490 | 15 | Green | 285 (220) |  | 3 |
| 12 | Green Dragon (h01H) | 540\* | 13 | Pink | 250 (220) | yes | 4 |
| 13 | Long spider (h01I) | 570 | 15 | Yellow | 295 (220) |  | 4 |
| 14 | Ogre (h01J) | 650 | 15 | Blazed | 295 (220) |  | 4 |
| 15 | Demon (h01K) | 1,000 | 15 | Red | 295 (220) |  | 4 |
| 16 | Bird (h01L) | 870\* | 13 | Pink | 250 (220) | yes | 5 |
| 17 | Extreme Raider (h02I) | 1,450 | 15 | Red | 325 (265) |  | 5 |
| 18 | Extreme Razormane (h037) | 1,850 | 15 | Pink | 325 (290) |  | 5 |
| 19 | Extreme Water (h038) | 2,350 | 15 | Blue | 350 (310) |  | 5 |
| 20 | Tamed Bird (h01R) | 1,620\* | 13 | Pink | 280 (220) | yes | 6 |
| 21 | Extreme Swamp Lord (h039) | 3,150 | 19 | White | 400 (315) |  | 6 |
| 22 | Extreme Mine Cart (h03A) | 3,500 | 19 | Green | 420 (320) |  | 6 |
| 23 | Extreme Dead Miner (h03B) | 4,300 | 19 | Red | 440 (325) |  | 6 |
| 24 | Ghost Bird (h01X) | 3,000\* | 13 | Pink | 280 (220) | yes | 7 |
| 25 | Extreme Mine Disease (h03C) | 5,250 | 19 | Red | 435 (330) |  | 7 |
| 26 | Extreme Sb (h03D) | 6,300 | 19 | Green | 440 (335) |  | 7 |
| 27 | Extreme Kitty (h03E) | 7,900 | 19 | Blue | 445 (340) |  | 7 |
| 28 | Owl (h021) | 4,980\* | 14 | Pink | 275 (220) | yes | 8 |
| 29 | Extreme Turtle (h03F) | 9,000 | 19 | White | 450 (345) |  | 8 |
| 30 | Extreme Ogre Lord (h03G) | 11,000 | 23 | Green | 455 (350) |  | 8 |
| 31 | Extreme Red Panda (h03H) | 12,750 | 23 | Blazed | 460 (355) |  | 8 |
| 32 | Black Dragon (h025) | 7,440\* | 14 | Pink | 320 (220) | yes | 9 |
| 33 | Extreme Warlock Orc (h03I) | 14,500 | 23 | Red | 465 (360) |  | 9 |
| 34 | Extreme Succubus (h03J) | 16,500 | 23 | Yellow | 470 (365) |  | 9 |
| 35 | Extreme Melee Ranger (h03K) | 19,000 | 23 | Blue | 475 (380) |  | 9 |
| 36 | Red Dragon (h02B) | 10,200\* | 14 | Pink | 320 (220) | yes | 10 |
| 37 | Extreme Tauren (h03L) | 21,000 | 23 | Yellow | 480 (390) |  | 10 |
| 38 | Extreme Tauren Chief (h03M) | 23,000 | 23 | Red | 485 (395) |  | 10 |
| 39 | Extreme Prisoner (h03N) | 25,000 | 23 | White | 490 (390) |  | 10 |
| 40 | Spirit Bird (h02F) | 12,600\* | 14 | Pink | 330 (220) | yes | 11 |
| 41 | Extreme Kon (h03O) | 34,800\* | 30 | Green | 522 (410) |  | 11 |
| 42 | Extreme Bryvx (h03P) | 40,200\* | 34 | Bryvx | 522 (410) |  | 16 |
| 43 | Extreme Mingo (h04K) | 45,000\* | 35 | Pink | 522 (420) |  | 16 |
| 44 | Wisp (h04I) | 15,600\* | 14 | Pink | 370 (220) | yes | 16 |
| 45 | Extreme Tiger Bear (h04L) | 48,000\* | 35 | Blue | 522 (420) |  | 18 |
| 46 | Extreme Jax (h04M) | 52,800\* | 35 | Blazed | 522 (430) |  | 18 |
| 47 | Extreme Pickled Lobster (h04N) | 56,400\* | 35 | White | 522 (440) |  | 18 |
| 48 | Phoenix (h04J) | 18,000\* | 15 | Pink | 380 (220) | yes | 20 |
| 49 | Extreme Roller (h04O) | 60,000\* | 35 | Red | 522 (445) |  | 20 |
| 50 | Extreme BRYVX (h04P) | 85,000\* | 35 | Bryvx | 522 (445) |  | 20 |
| 50 boss | Damage Test (H04B) | 500,000 | 40 | Bryvx | 522 (320) |  | 1,000 |

**The Damage Test** is the old "level 51". In Gem TD+ it spawns *with* Wave 50, 16.1 s after the first minion (10 × 1.61) (`src/gem/spawn.j`, `CHANGELOG.md` 1.6.0).

- **What it is.** A level-50 hero with 500,000 HP, armor 40 and divine armor, using one of 8 cosmetic skins (51% / 34% / 15% across three skin groups) (`share/objects/boss.lua`, `Gem_Spawn___Boss`).
- **Armor.** The hero agility bonus nets to 0 at level 50, so armor stays 40 (**assumed** WC3 hero armor formula: AgiDefenseBase −2 + 50 agility × 0.04).
- **Winning.** Killing all 11 units of Wave 50 wins the Run.

**Leaks.** No Wave costs lives.

- **Waves 1–9.** A leak only loses that creep's bounty.
- **Wave 10 on.** Any leak loses the Run.
- **Leaks still count.** Leaked creeps count toward the 10 that end the Wave.

Sources: `Trig_Leak_and_lose_P1_Actions`; tooltip `gmi1` in `share/objects/builder.lua`.

## 11. Economy

| Item | Value | Source |
|---|---|---|
| Starting gold | 10 | `src/settings/setup.j` |
| Kill bounty | per Wave table; boss 1,000 | `war3map.w3u: <creep> ubba/ubdi/ubsi`, `share/objects/boss.lua` |
| End of Wave | 5 + 2 × Wave (Wave 1 pays 7) | `Trig_New_Level_P1_Actions` |
| Interest, lumber income, mines | none. "Mine" is only the research building | – |
| Other income | Lucky China Jade, 1% per hit: ⌊Wave/2⌋ gold | `src/gem/special/jade.j` |
| Gem Quality | 20, 50, 80, 110, 140, 170, 200, 230 | `war3map.w3q: R000` |
| Extra Chance | 175 per round (type target) or 125 (slate target) | `src/gem/extra-chance.j` |
| Special upgrades | 25–275, see §6 | `war3map.w3u: <tier> ugol` |
| Swap | 10 builder mana | `src/gem/swap.j` |
| Rock removal, placement | free | `war3map.w3a: A008`, `war3map.w3u: h006` |

## 12. Difficulty

- **One setting only.** Gem TD+ removed its settings in 1.5.0, and the default "Extreme" is the only difficulty (`CHANGELOG.md` 1.5.0, `docs/settings.md`).
- **The armor file.** Despite its name, `share/objects/difficulty-armor-changes.lua` is not a switch. It permanently bakes Extreme armor into every creep and adds the HP multipliers in §10.
- **Scaling.** Nothing else scales: `udg_DiffFactor` is declared but never used (`src/gem-3.1/globals.j`).
- **For Tavern TD.** Normal should be these numbers. Easy, Hard and Insane are ours to define.

## 13. Damage model

**Attack × armor table** (`share/constants/gameplay/gem.lua`, replacing the WC3 defaults):

| Attack type (gem) | Red (small) | Blazed (medium) | White (large) | Green (fort) | Yellow (normal) | Blue (hero) | Bryvx (divine) | Pink (none) |
|---|---|---|---|---|---|---|---|---|
| Chaos (Topaz) | 0.50 | 1.00 | 0.60 | 0.70 | 1.60 | 1.00 | 0.75 | 1.20 |
| Hero (Ruby) | 1.80 | 0.80 | 1.00 | 0.50 | 1.00 | 1.00 | 0.75 | 0.80 |
| Magic (Aquamarine, Opal) | 1.00 | 1.90 | 0.80 | 0.70 | 1.00 | 0.40 | 0.75 | 1.00 |
| Normal (Diamond) | 1.20 | 1.00 | 1.60 | 1.00 | 0.60 | 1.00 | 0.75 | 0.20 |
| Pierce (Amethyst) | 0.80 | 0.80 | 0.80 | 0.80 | 0.80 | 0.80 | 0.75 | 1.75 |
| Siege (Emerald) | 0.70 | 0.70 | 0.70 | 1.70 | 0.70 | 0.70 | 0.75 | 1.50 |
| Spells (Sapphire) | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.75 | 0.75 | 1.00 |

- **Armor value.** WC3 default: each point of armor is worth 0.06 (`miscgame.txt: DefenseArmor = 0.06`, unchanged by `gem.lua`). For positive armor A, damage × (1 − 0.06A / (1 + 0.06A)). For negative armor, damage × (2 − 0.94^−A) (**assumed**: WC3 engine formula). Armor is always an integer here, so 0.94^n is just repeated multiplication, which ADR-0002's maths rule allows.
- **Spell damage.** The burns (§6) deal `ATTACK_TYPE_NORMAL` (the Spells row) with `DAMAGE_TYPE_UNIVERSAL` (`src/gem/immolation.j`). Poison and the spells in §6–7 are WC3 spell damage too. All of these ignore the armor value (**assumed**: WC3 applies armor only to normal/enhanced damage types).
- **Burns.** Each burn ticks on its own period. It gains +10% per 10 kills of its source, up to +100%, and several sources stack (`src/gem/immolation.j`, `CHANGELOG.md` 1.6.0).
- **Code-driven damage.** Hold Slate deals chaos damage; Ancient and Damage Slate deal normal (Diamond-row) damage. All three use `DAMAGE_TYPE_NORMAL`, so armor applies.
- **Other WC3 changes.**
  - Frost slow is 20% instead of 50%.
  - Speed is capped at 220–522 instead of 150–400.
  - Hero armor per agility is 0.04 instead of 0.3.
  - Stuns cannot overlap, and a creep gets 0.1 s of stun immunity after one (`src/unit/stun.j`, `CHANGELOG.md` 1.6.0).
  - Same-named buffs from different sources apply once, and the highest level wins (`src/gem/information/random-information.j`).
- **Kill awards.** Every tower counts its kills. Every 10 kills give +10% base attack damage (a self-only Trueshot-style aura, `ACat`), up to +120% at 120 kills (`Trig_Gem_Awards_Actions`; `war3map.w3a: A01L … A01Q`).

## 14. Score and Records

`src/gem/rank.j` keeps no numeric score. It ranks players by three things, in order:

1. The Wave reached (internally 51 means "finished").
2. The damage dealt on that Wave: the maximum HP minus the current HP of its creeps, with leaked creeps counted at the damage they had taken.
3. Who cleared each earlier Wave first, compared from the newest Wave backward.

The community leaderboards use this as Damage Test damage. For our Records, use:

- **Best Wave** = the Wave reached.
- **Score** = the damage dealt on the last Wave reached. For a Run that reaches Wave 50, that is mostly damage on the Damage Test.
- **Fastest win** = the time from the first spawn until the Damage Test dies.

## 15. Other Gem TD+ features

| Feature | Core? | What it does |
|---|---|---|
| Mine | core | Research building: Gem Quality, and Extra Chance from Gem Quality 8. Gives no income (`src/gem/mine.j`) |
| Stone of Bryvx | core (rare) | Tower from three or four identical Perfects, see §6 (`src/gem/selection/combine.j`) |
| Immolation | core | The shared burn code behind Star Ruby, Blood Star, Fire Star, Uranium, Rose Quartz and Viper (`src/gem/immolation.j`) |
| Kill awards | core | Per-tower damage bonus and kill levels, see §13 |
| Extra Chance | optional | Gold sink that biases the Draft, see §8; turned off with `-extra` before the first gem |
| `-maze` (no-maze mode) | optional | Before the first gem: paints up to 68 tiles of the straight checkpoint lanes unbuildable and gives all creeps straight-line movement. It has its own leaderboard (`src/commands/maze.j`) |
| Critters | cosmetic | Critters named after leaderboard players near the centre (`src/gem/critters.j`) |
| Block handling | replace | WC3 lets you block; a creep that starts attacking is teleported to its next checkpoint with a warning (`Trig_Creeps_attacking_Actions`). Tavern TD rejects Blocks instead |
| Range Check, `-air`, `-zoom`, `-bars`, `-debug`, board | UI | Range circles, a list of air Waves, camera, status bars, recovery, scoreboard |

## 16. Open questions and assumptions

- **Snap of 64** (§2). This is WC3 engine behaviour that nvs/gem does not state. If WC3 actually snaps to 32, gems can sit a quarter-gem apart, and the grid would need 32-unit cells.
- **Outside the field** (§2). WC3 single-player creeps can leave the box to the west and south. Treating that land as wall changes which placements count as a Block.
- **WC3 ability semantics.** These are engine-defined and not in any file:
  - how Barrage picks its targets;
  - whether artillery hits a primary air target when its splash excludes air;
  - the Shadow Strike tick interval;
  - the meaning of the Aspo stacking value (9).
- **Base defaults.** These come from current-patch game tables. Gem TD+ targets the latest patch, so they should match.

## 17. Corrections to [wc3-td-maps.md](wc3-td-maps.md)

| That file says | The source says |
|---|---|
| Merging: 2 or 4 identical, +1 and +2, pair from the current draw **[unverified]** | Confirmed, plus ×3 → +2. ×4 also gives only +2. Draft only |
| Slates: combining 2–3 flawed gems creates slates | One **Normal** gem plus one listed **Flawed** gem in the same Draft. The Normal becomes the slate. Pairs of base slates combine |
| "A paid swap" | It costs builder mana (10; +1 per Wave), not gold |
| 50 levels, then a level-51 damage test | In Gem TD+ the Damage Test spawns with Wave 50 |
| Summon waves every 7th level | No creep has any ability; there are no summons. Air is exactly every 4th Wave |
| Rocks prevent juggling | Rocks can be removed for free at any time, even mid-Wave. Placement is impossible mid-Wave, so you can open the maze mid-Wave but never close it |
| Level 0 all Chipped; level 8 = 30/30/30/10 | Confirmed. Costs 20 + 30 × (level − 1) |
| Implied lives | Gem TD+ removed lives (1.6.0): leaks are free before Wave 10 and fatal from Wave 10 on |
