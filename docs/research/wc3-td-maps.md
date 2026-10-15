# Warcraft 3 custom tower defense maps: signature mechanics

Research for a new single-player TD (desktop + mobile). Compiled 2026-10-15.

**Sources and caveats.** The two strongest sources are map source code: the Gem TD+ repo ([nvs/gem](https://github.com/nvs/gem)) and the open-source Element TD Dota 2 port ([MNoya/Element-TD](https://github.com/MNoya/Element-TD)). Most other maps only have short metadata listings on Epic War, wc3maps or W3Reforged. **[unverified]** marks claims from memory or lore that no source confirmed. Every map has dozens of forks, so each number applies to the version cited.

---

## 1. Quick comparison

| Map | Path model | How you get towers | Economy hook | Waves |
|---|---|---|---|---|
| Element TD | Fixed path in WC3/Dota 2 [partly unverified]; maze between waypoints in SC2 and the ETD2 DLC | Buy basic towers; **element picks** (1 lumber every 5 waves) unlock single, dual and triple towers | 2% interest every 15 s | 55 + endless boss |
| Wintermaul | Open-field maze, co-op, several spawns | Buy from a chosen race | Kill bounty | 30 (X10) / 40 (Wintermaul One) |
| Wintermaul Wars | Maze, PvP teams | Buy from a race | **Sending raises income** | Neutral waves + sends |
| Gem TD | Open-field maze with **checkpoints** | **Place 5 random gems, keep 1**; others become rocks; merge duplicates; recipes | Gold buys gem-quality "chance" upgrades | 50 + damage test |
| Legion TD (Mega) | Lanes, PvP teams, king in the middle | Builder race; towers turn into **fighters** each wave | Lumber from wisps: summons raise income, king upgrades | ~30, bosses at 10/20/30 |
| Line Tower Wars | Each player mazes a lane; PvP ring | Buy and upgrade; tech research | **Sends raise income**; leaks steal lives | Endless until last player |
| Green TD | Shared co-op route [path type unverified] | Buy upgrade lines (89 towers in v32.2) | Kill bounty | 36–60 by version |
| Burbenog TD | Co-op, defend the center | **Governor** picks your elements (15) | Bounty; buy a hero | 40 |
| Islands TD | Own base per player | Unknown | Unknown | Unknown |
| YouTD | Fixed lanes (maze planned) | **Random rolls by element research**, 4 rarities, items | Gold, income, interest, food cap | 120+ / endless |
| Castle Fight | Two-lane auto-battler | Buildings spawn units on their own | Income from buildings | Rounds |
| Cube Defense | Creeps head for the center; maze, no blocking | Buy | Can buy lives | 40 (Gold v9.3) |
| Pyramid TD / Random TD | Little documented | Random features (Random TD) | Unknown | Unknown |

---

## 2. Map-by-map

### Element TD (Karawasa / Element Studios; WC3 2005–06)
The best-known "build identity" TD. You start with arrow and cannon towers. Each lumber you earn summons an elemental, and killing it unlocks that element. Element levels 1–3 gate single, dual and triple towers. In the Dota 2 port, one lumber arrives every 5 waves until wave 55 ([wavedata.lua](https://github.com/MNoya/Element-TD/blob/master/game/dota_addons/element_td/scripts/vscripts/wavedata.lua)). Lumber can instead buy a **Pure Essence**, which upgrades a level-3 single tower or buys the all-six-element Periodic tower ([tooltips](https://github.com/MNoya/Element-TD/blob/master/game/dota_addons/element_td/resource/addon_english.txt)).
- **Damage cycle:** each element deals 200% to one element and 50% to another (Water > Fire > Nature > Earth > Light > Dark > Water). Waves carry elements and traits: fast, healing, mechanical (periodic invulnerability), undead (revives at 33% HP) ([basics guide](https://forums.eletd.com/topic/945-basics-of-element-td)). The Dota 2 port adds image, regen, swarm, bulky and vengeance ([repo](https://github.com/MNoya/Element-TD)).
- **Economy:** interest of 2% every 15 seconds ([interest.lua](https://github.com/MNoya/Element-TD/blob/master/game/dota_addons/element_td/scripts/vscripts/mechanics/interest.lua)); the SC2 version uses the same rate ([SC2 guide](https://forums.eletd.com/topic/2547-build-lists/)). 50 lives; classic mode starts with 250 gold and 1 lumber. Difficulty multiplies HP by 1, 1.3, 1.6 or 2 and shortens the break between waves ([gamesettings.kv](https://github.com/MNoya/Element-TD/blob/master/game/dota_addons/element_td/scripts/kv/gamesettings.kv)).
- **Modes:** All Pick, Same Random or All Random elements; Chaos (shuffled creep order); Express (30 waves).
- **Path:** The WC3 guide talks about "2-pass" zones where creeps pass the same towers twice, which suggests a fixed route **[partly unverified]**. The SC2 version has players block between waypoints to build mazes ([mazing guide](https://forums.eletd.com/topic/2973-mazing-guide/)). ETD2 sells mazing as a paid DLC ([Steam](https://store.steampowered.com/app/2177070)).
- **Loved:** build variety, nostalgia, the campaign; ETD2 has 90% positive Steam reviews ([Steam](https://store.steampowered.com/app/1018830/)). **Frustrated:** small player base, "lack of strategic depth," few maps, lag with many creeps ([VaporLens](https://vaporlens.app/app/1018830/element_td_2_tower_defense)). On the iOS port, players found one element point per 5 waves too slow, and the endless mode stops paying ([App Store](https://apps.apple.com/us/app/element-td/id1130157487)).
- **Release date conflict:** sources give June 2006 ([eletd.com](https://eletd.com/)), February 2006 ([Wikipedia](https://en.wikipedia.org/wiki/Tower_defense)) and 2005 (MobyGames).

### Wintermaul (Duke-Wintermaul) and Wintermaul Wars
**Wintermaul** is the archetypal co-op maze ("maul"). Players pick a race, build in their own zone along the route, and "keep the Forces of Northrend from escaping." Version X10 had 72 towers, 30 levels and 9 spawn locations ([wc3maps](https://wc3maps.com/map/96/Wintermaul_TD_X10_Final)). Wintermaul One lists 49 races, 40 waves, and modes including all-random, all-pick and infinite waves ([wintermaul.one](https://wintermaul.one/)). Whole blocking was punished: creeps attack the tower that seals the path **[unverified]**. Players loved mazing as a personal signature and the race variety. They were frustrated by kill-stealing between neighbours (Wintermaul One Revolution redesigned its map to "minimize kill stealing" ([W3Reforged](https://maps.w3reforged.com/maps/categories/tower-defense-td/wintermaul-one-revolution))) and by staleness. One Hive guide notes you "rarely see a maul anymore because everyone has played it" ([Hive](https://www.hiveworkshop.com/threads/how-to-make-a-good-td-from-scratch.207795/)).

**Wintermaul Wars** is the PvP version (1v1, 2v2 or 3v3; x14.2 by Aphotica is the canonical revision ([Epic War](https://www.epicwar.com/maps/223952/))). Gold sends creeps to the enemy's maze and permanently raises your income. Shrine upgrades are timed against income (one guide says Shrine 2 at about 700 income in 1v1 ([WmW guide](http://wmwl.weebly.com/wmw-guide.html))). Air sends bypass the maze. Life totals are selectable: 1–100 in tournament mode ([Hive X12](https://www.hiveworkshop.com/threads/winter-maul-wars-x12.108651/)). The core tension, as one history piece puts it, is income versus defense ([Maul Tactics](https://maultactics.gg/articles/wintermaul-wars-history); it is written by a competing game's developer, so it is biased).

### Gem TD (Bryvx / Bryan K, ~2006; Gem TD+ by NVS)
This map has the most transferable *acquisition* mechanic. Each round you place **5 gems of random type and quality** into an open field, **keep one**, and the rest **turn into rocks** that become part of the maze ([BK's Gem TD listing](https://wc3maps.com/map/200939/BKs_Gem_TD_v7.0_Plus); [GemTD remake](https://cecrit.itch.io/gemtd)).
- **Content:** 8 gem types (Amethyst, Aquamarine, Diamond, Emerald, Opal, Ruby, Sapphire, Topaz) and 6 qualities (Chipped to Great) ([type.j / quality.j](https://github.com/nvs/gem)).
- **Merging:** two or four identical gems can merge into a higher quality. I believe that is +1 and +2 steps, and that the pair must come from the current draw, but both are **[unverified]**. **Recipes** of up to 4 parts make specials such as Silver, Malachite, Star Ruby, Jade, Bloodstone, Uranium and Black Opal. Each special has 2–3 upgrade tiers, e.g., Silver, then Sterling Silver, then Silver Knight ([repo tree](https://github.com/nvs/gem)).
- **Slates:** In Gem TD+, combining 2–3 flawed gems creates support "slates" ([slate.j](https://github.com/nvs/gem/blob/master/src/gem/slate.j)).
- **Economy:** Gold buys 8 "chance" levels that shift the quality odds. At level 0 every gem is Chipped; at level 8 the odds are 30% Flawed, 30% Normal, 30% Flawless and 10% Perfect ([chance.j](https://github.com/nvs/gem/blob/master/src/gem/chance.j)). A paid "swap" exchanges two towers' positions.
- **Path and waves:** Creeps walk through **checkpoints** ([movement.j](https://github.com/nvs/gem/blob/master/src/gem/movement.j)). There are 50 official levels, then a level-51 damage test ([rank.j](https://github.com/nvs/gem/blob/master/src/gem/rank.j)). Air waves come roughly every 4th level, and summon waves every 7th level ([listing](https://wc3maps.com/map/200939/BKs_Gem_TD_v7.0_Plus)).
- **Loved:** puzzle-like mazing with the random gems, and remaking the board every round. **Frustrated:** luck dependence and air bosses that ignore your maze. Dota 2 players complained that air bosses were "pretty unbalanced" and that progress "depended on luck" ([Steam discussion](https://steamcommunity.com/workshop/filedetails/discussion/474619917/541907867756621735)). The Gem TD+ changelog also notes WC3 pathing being "just bad in complex mazes" ([CHANGELOG](https://github.com/nvs/gem/blob/master/CHANGELOG.md)). Epic War ratings on v7.9 are 76 good vs 99 bad ([Epic War](https://www.epicwar.com/maps/317361/)).

### Legion TD (Lisk, late 2000s) and Legion TD Mega (HuanAk)
A **lane auto-battler hybrid**. During the build phase you place units. Each wave they come to life as **fighters**, fight the creeps, and reset afterward. Leaks run to your team's king. Gold buys fighters; wisps harvest lumber; lumber buys **summons** that attack the enemy team and raise your income, or upgrades the king ([Wikipedia](https://en.wikipedia.org/wiki/Legion_TD); [Hive Mega 3.5](https://www.hiveworkshop.com/threads/legion-td-mega-3-5-b4-3-41-unprotect.194224/)).
- **Mega:** more than 12 races and about 31 levels, with bosses at 10, 20 and 30. You can pick, draft or random your race. Modifiers include locking pure income until level 10, and gold from enemy leaks ([gaming-tools](https://gaming-tools.com/warcraft-3/legion-td/)).
- **Loved:** "towers become units" was called "really unique and kinda fun." **Frustrated:** lag, crashes, imbalance (Hive comments).
- **Legion TD 2** (AutoAttack Games, 2017/2021) gives you a random roll of 6 fighters per match. Workers produce mythium, which pays for mercenaries and income. There are 21 waves, with bosses every 5th wave and flying waves at 4 and 17 ([wiki](https://legiontd2.wiki.gg/wiki/Wave)). Steam reviews are 87% positive overall but "Mixed" recently; it runs on Windows and macOS and has a PvE campaign ([Steam](https://store.steampowered.com/app/469600/)).

### Line Tower Wars
A ring of players: you send creeps to the player on one side and defend against the player on the other. A leak costs the defender a life and gives one to the sender. Last player alive wins ([GIGA](https://www.giga.de/tipp/die-beliebtesten-tower-defense-maps-im-ueberblick-warcraft-3-reforged/); [Hive LTW Reforged](https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/)). Sends raise income. LTW Reforged has 100+ towers and 10 technologies that combine into "Ultimate" towers, plus an anti-block system, AI players and seasonal ladders. Players praised it as "simple and quick to grasp." Complaints: very long matches (GIGA), and income snowballing **[unverified, a general tower-wars complaint]**. A 2026 standalone ([Steam](https://store.steampowered.com/app/4954340/)) adds siege sends and flyers that ignore mazes. In it, a bad send pays bounty to its target.

### Green TD (Sencility; later "PROS Remastered")
A co-op map built on deep **upgrade lines**: v32.2 has 89 towers, e.g., Siege 23, Poison 19, Air 13 and Multishot 11 ([Epic War](https://www.epicwar.com/maps/159097/)). Remastered has 36 waves with air, immune, boss and hero levels, plus 6 "summoner" builders ([wc3maps](https://wc3maps.com/map/430834/Green_TD_Remastered_2026)). GIGA cites 60 waves and early upgrading as key. Whether you can maze is **unverified**.

### Burbenog TD (Shvegait, Mad Mauler)
Four players each choose one of **15 governors**, and the governor defines which elements (and so which of the 120 towers) you can build. There are 40 levels; stop monsters reaching the **center**. You can **buy a hero** to catch leaks ([wc3maps](https://wc3maps.com/map/8825)). Its listing says "Teamwork is essential!" ([W3Reforged](https://maps.w3reforged.com/maps/categories/tower-defense-td/Burbenog%20TD%20-%20Legends)), and forum players call it hard. v4.6 brought back "Hybrid" and Hero ([Epic War](https://www.epicwar.com/maps/323380/), 41 good vs 71 bad ratings).

### Islands TD (4L3x_Insomniac, 2007)
"EACH PERSON DEFENDS THEIR OWN BASE," with 1–10 players in Survivor style ([Epic War](https://www.epicwar.com/maps/148148/)). I could not find any mechanics. **Low confidence**; this may not be the "Island TD" you had in mind.

### YouTD (geX, 2009–) and YouTD 2
The towers are **community-designed** and you **roll random towers each round**. Skill points in one of 7 elements raise both that element's odds and the odds of rare and unique towers. There are 4 rarities, creep-dropped **items**, a food cap, and interest paid at end of level. Wave types include Air, Normal, Mass, Boss and Challenge (every 8 levels, no life loss), with about 20 creep abilities. The path is fixed; testers asked for a maze mode ([Hive](https://www.hiveworkshop.com/threads/youtd-its-your-tower-defense.137336/)). Critics said there was too much text, the "Roll Towers" button was unclear, and buildable ground was hard to see. **YouTD 2** (Godot) has 200+ towers, 300+ items, 21 builders and an endless mode, on Windows, macOS, Linux and HTML5 ([itch](https://praytic.itch.io/youtd2)).

### Castle Fight (geX), brief
A two-team **auto-battler**. You build structures that periodically spawn units, and those units march to the enemy castle on their own. The decisions are about counters (WC3 armor and attack types). There are 10 original races ([Hive CF Forever](https://www.hiveworkshop.com/threads/castle-fight-forever.337055/)), and matches are played over multiple rounds. It is useful as a reference for "set it up, then watch."

### Cube Defense (CordialSpam, later Mattstir and Coolio-DB)
Keep monsters from reaching the center of a square arena. "Maze and don't forget not to block," and you can buy lives ([W3Reforged](https://maps.w3reforged.com/maps/categories/tower-defense-td/cube-defense)). Cube Defense Gold has 40 levels, 33 towers, 3 heroes, and solo competitive or 2v2/4v4 modes ([Epic War](https://www.epicwar.com/maps/203868/)).

### Pyramid TD and Random TD
Neither has rules documented online. Pyramid TD T.E. is by m[n]m.THIRT13N, 2004, for 2–8 players ([W3Reforged](https://maps.w3reforged.com/maps/categories/tower-defense-td/Pyramid%20TD)). Random TD 1.2 (BCT-FiGhT3R, 2006) is described only as a "TD with many random functions" ([Epic War](https://www.epicwar.com/maps/2237/)). The documented *random-build* reference is **Pumpkin TD**: random towers of random tiers (1–9) that merge upward, plus a 15-minute damage-test leaderboard ([W3Reforged](https://maps.w3reforged.com/featured-maps/pumpkin-td)). WC3's Split TD inspired the SC2 Random TD and Entropy TD, whose makers later built AMazing TD ([Steam](https://store.steampowered.com/app/1140030/AMazing_TD)).

### Other notable maps and successors
- **Other maps:** Green Circle TD is a team map that rewards placing defenses at the back of the lane. In Mafa TD Queen, waves arrive at ever-shorter intervals ([GIGA](https://www.giga.de/tipp/die-beliebtesten-tower-defense-maps-im-ueberblick-warcraft-3-reforged/)).
- **Element TD successors:** Element TD 2 (Steam, Windows) has 59 towers, 55 waves plus an endless boss, a 28-mission campaign and a Mazing DLC. Element TD for iOS (2016, $0.99) is the mobile precedent ([App Store](https://apps.apple.com/us/app/element-td/id1130157487)).
- **Dota 2 custom games:** Element TD (open source), GemTD and Legion TD. Superjump describes Gem TD and Legion TD as among the most popular arcade TDs ([Superjump](https://www.superjumpmagazine.com/how-dota-2-is-keeping-old-school-custom-games-alive/), seen in search results only).
- **Gem TD remakes:** web/Android ([cecrit](https://cecrit.itch.io/gemtd)) and Unity ([colers](https://colers.itch.io/gem-td-remade)).
- **AMazing TD:** a mazing TD with randomized tiles, checkpoints and daily leaderboards.

---

## 3. Synthesis: portable mechanics for a single-player phone + Mac TD

Scores: Fun 1–5 (higher is better); Cost 1–5 (higher is more expensive to build and balance); Net = Fun − Cost. The list is sorted by Net, and within a tie, by how much the mechanic anchors the core loop.

| # | Mechanic (origin) | Fun | Cost | Net | Touch notes |
|---|---|---|---|---|---|
| 1 | **Draft 5, keep 1, rest become walls** (Gem TD) | 5 | 2 | 3 | Excellent: tap 5 cells, tap the keeper. Turn-like build phase with no time pressure. |
| 2 | **Merge duplicates + recipe combos** (Gem TD, Pumpkin TD) | 5 | 2 | 3 | Highlight towers with a recipe ready; one tap combines. Data-driven recipe table. |
| 3 | **Quality-odds upgrades** (Gem TD chance levels) | 4 | 1 | 3 | One upgrade button with an odds bar. A clean gold sink for #1. |
| 4 | **Grid mazing with checkpoints + anti-block** (Wintermaul, Gem TD, ETD SC2) | 5 | 3 | 2 | Grid snap, ghost preview and a live path line; reject cells that would block (red ghost). Needs pinch-zoom and cells of at least ~44 pt. Recompute a flow field per checkpoint segment on each placement. |
| 5 | **Element picks every N waves** that gate tier-2/3 towers (ETD: 1 lumber every 5 waves) | 5 | 3 | 2 | A modal "choose 1 of 3" card is ideal on phones. Content cost grows with combinations: 6 elements give 15 pairs and 20 triples. |
| 6 | **Wave traits + preview** (ETD fast/heal/mech/undead; Gem TD air waves; YouTD challenge waves) | 4 | 2 | 2 | Show the next 2–3 waves as icons. A cheap way to multiply content. |
| 7 | **Self-send for income** (WmW, LTW and Legion summons, recast as a solo risk: "summon an extra wave for +income") | 4 | 2 | 2 | One button. Gives solo play the PvP greed decision without an AI opponent. |
| 8 | **Damage-test / endless leaderboard** (Gem TD level 51, Pumpkin TD, ETD endless boss) | 4 | 2 | 2 | Suits short phone sessions and replay. Use local or daily seeds. |
| 9 | **Elemental damage cycle** (ETD 200% / 50%) | 3 | 1 | 2 | Color-coded; pairs with #5 and #6. |
| 10 | **Interest / banking** (ETD 2% per 15 s; YouTD end-of-level) | 3 | 1 | 2 | Pay at the end of each wave for clarity and show the forecast. Cap it so "bank forever" isn't optimal. |
| 11 | **Support towers / auras** (ETD well and blacksmith; Gem TD slates) | 3 | 2 | 1 | Show the aura radius on tap. Makes placement inside the maze matter. |
| 12 | **Fighters that come alive each wave** (Legion TD) / auto-spawn buildings (Castle Fight) | 4 | 5 | −1 | Touch-friendly because you only watch, but it needs unit AI and combat balance, and it conflicts with mazing. Defer. |

**Lower priority:** creep-dropped items and inventories (YouTD) are fun but clumsy on a phone. Builder, race and governor rosters (Wintermaul's 49 races, Burbenog's 15 governors) are mostly content cost; ship 3–4 at most. A controllable hero (Burbenog, Cube Defense) means drag-to-move micro, which works poorly on touch.

### Combinations that reinforce each other
- **Core loop (#1 + #2 + #4):** Gem TD already solves "how do I maze if my towers are random?" The discarded draws become your walls, so every round is both a maze puzzle and a gacha choice. Checkpoints keep mazes long without full-field blocking. This is the strongest single idea in the set.
- **Build identity (#5 + #9 + #3):** use ETD-style element picks to *weight* the Gem TD draws, like YouTD's element research. Picking Fire raises Fire's share of the 5 draws and unlocks Fire recipes. That gives a run-defining choice every 5 waves, which suits a modal on touch.
- **Pressure and greed (#6 + #10 + #7):** a wave preview, end-of-wave interest and an optional income "send" form a clear risk ladder. Air and immune waves stop pure-maze builds from being solved. Gem TD's air waves did this, but players hated air *bosses*, so telegraph them and keep them below boss HP.
- **Avoid juggling exploits:** WC3 players opened and closed walls mid-wave so creeps reversed back and forth through the maze ("juggling", [Wikipedia](https://en.wikipedia.org/wiki/Tower_defense)). Gem TD's permanent rocks prevent this, as would a "no build or sell during combat" rule.

### Pitfalls the classics teach
- Luck must be mitigable. Gem TD's swap and chance upgrades, and ETD's choice of pick vs random, exist for this. Players complained when bosses or air waves decided runs.
- New players drown in text (YouTD). Keep tooltips to one line and icons first.
- Path performance with many creeps hurt both WC3 and ETD2. Budget for flow fields and pooled entities on mobile.
- Session length: classic games are 50–60 waves. For phones, use about 30-wave runs with 2×/3× speed, plus an endless or damage-test tail.
