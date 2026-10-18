# Line Wars rules reference

Researched 2026-10-18 for the Line Wars Game Mode. Vocabulary follows [CONTEXT.md](../../CONTEXT.md), with two warnings. First, a Line Tower Wars "lane" is a field you maze in, like Maul's, not Element's walled **Lane**. Second, neither main map runs a fixed sequence of **Waves**: creeps arrive whenever someone buys them. CONTEXT has no word yet for a creep you buy to walk an opponent's field, so this doc calls it a **Send**, and calls each payout of income an **income tick**. In Line Tower Wars, "summoning" is a Send, "life" is a life, and "stealing a life" is a **Leak** that also gives the sender a life. In Wintermaul Wars the "ship" is the exit, "Waypoints" are Checkpoints, the "Shrine" is the Send shop, and lives belong to the team. In Castle Fight, "buildings" spawn units on their own and the "castle" holds the hit points.

**Sources and caveats.** Three map sources back this doc, and I read each one directly:

- **Line Tower Wars: Reforged 2.7c** (2020-02-22). Its `war3map.j` and `war3map.wts` are test files in [zach-cloud/JAST `src/test/resources/`](https://github.com/zach-cloud/JAST/tree/1de6179/src/test/resources), as `war3map2` and `war3map.wts`, at commit `1de6179`. The script is obfuscated, so citations give the function's short name, for example `2.7c j: Hd`.
- **The Dota 2 port of Line Tower Wars** by VicFrank ([VicFrank/Line-Tower-Wars](https://github.com/VicFrank/Line-Tower-Wars/tree/a69a7aa), commit `a69a7aa`, 2020–2026). Its 36 Sends match Reforged 2.7c's one for one, with nearly the same incomes. It is my only source for **Send prices**, because the WC3 prices sit in unit data I don't have. Citations look like `port: constants.lua`.
- **Castle Fight X** ([BrianKamrany/CastleFight](https://github.com/BrianKamrany/CastleFight/tree/a4b92ca), commit `a4b92ca`, 2025), C# source.

Later versions come from changelogs and listings:

- [W3Reforged: LTW Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged) holds the changelog for 4.0a–8.8b (2021–2024). It is 470 k characters long; I read it in slices, it returned errors twice, and some entries may be missed.
- [The LTW Reforged changelog doc](https://docs.google.com/document/d/e/2PACX-1vR-scT5NyHBOQVRmCCiIR12dd4xgw4uZOXTAAccjD8pDjZP8axa1bkh08te7acbC2XFeRmRajkqh8MM/pub) covers 10.0a–12.4a (2025–2026), and the [Hive thread](https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/) covers 12.4a.
- Wintermaul Wars has no script online. Its rows come from Hive and Epic War listings, the [WmW League guide](http://wmwl.weebly.com/wmw-guide.html) and a competitor's [history article](https://maultactics.gg/articles/wintermaul-wars-history). wc3c.net is gone (DNS fails), wc3maps and ModDB return 403, and Steam rate-limited some fetches.

**Legion TD is left out on purpose:** Line Wars won't use it. I did not download any `.w3x` or `.w3m` file. **[unverified]** marks memory, one weak source, a search snippet I could not open, or my reading of code I did not run. **[my arithmetic]** marks numbers I worked out.

---

## 1. Versions

| Map | Who, when | What it is | Source |
|---|---|---|---|
| Line Tower Wars 45 | Loss05, Nob, Trymio, t3tr1s; listed as 2003, uploaded 2011 | The classic; 3–11 players, five tech lines, income about every 20 s | [Epic War](https://www.epicwar.com/maps/159757/), [gaming-tools](https://gaming-tools.com/warcraft-3/line-tower-wars/) |
| Teamline Tower Wars 1.5 | — | Teams of two per field; income about every 15 s | [blog](https://postmasterinterest.blogspot.com/2013/06/warcraft-3-reminiscence-teamline-tower.html) |
| Line Tower Wars 18.5.01 | Athene, xcarrez, Yukon Alchera; 2014 | 2–11 players, two Send shops, reworked tech | [Hive](https://www.hiveworkshop.com/threads/line-tower-wars-v18-5-01.250346/) |
| **LTW: Reforged 2.7c** | lolreported (with Pokebunny); 2020-02-22 | A rewrite with new code. Up to 18 players then, 15 from 4.0a, 12 from 11.0a | `2.7c j: gy`, `wts 1115`, [changelog](https://docs.google.com/document/d/e/2PACX-1vR-scT5NyHBOQVRmCCiIR12dd4xgw4uZOXTAAccjD8pDjZP8axa1bkh08te7acbC2XFeRmRajkqh8MM/pub) |
| LTW: Reforged 12.4a | same; 2026-08-04 | Seasonal ladder, 100+ towers, computer players since 8.7f (2024) | [Hive](https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/) |
| LTW, Dota 2 port | VicFrank; 2020–2026 | 8 lanes; the same Send list as Reforged 2.7c | `port: wave_controller.lua`, `TODO.txt` |
| Line Tower Wars (Steam) | Mithryl Labs; 2026-07-30, free | 2–12 players, bots at three levels, 105 towers in 15 lines | [Steam](https://store.steampowered.com/app/4954340/) |
| Wintermaul Wars TE 1.0, PE 1.4b | Darky712; ptit_prout; 2005 | Early 6-player versions, protected | [Hive TE](https://www.hiveworkshop.com/threads/wintermaul-wars-te-1-0.77198/), [Hive PE](https://www.hiveworkshop.com/threads/wintermaul-wars-pe-v1-4b.77199/) |
| Wintermaul Wars Crystal 1.1 | Canonfoder; 2007 | Options voted at the start, including Life Steal, No Air and set lives | [Epic War](https://www.epicwar.com/maps/27266/) |
| Winter Maul Wars X12 | aphotica / LaZy[WMWL]; 2008 | 11 new Races; modes with set lives | [Hive](https://www.hiveworkshop.com/threads/winter-maul-wars-x12.108651/) |
| WMW The Next Generation 2.0 | wSk_Avatar; 2009–10, from WMW Reborn 9.6b | 2–6 players in two teams | [Hive](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/) |
| Wintermaul Wars x14.2 | Aphotica; 2013 | The competitive standard; 1v1, 2v2, 3v3 | [Epic War](https://www.epicwar.com/maps/223952/), [Maul Tactics](https://maultactics.gg/articles/wintermaul-wars-history) |
| WMW Evolution 1.03 | GenoHacker; 2016, from TNG 2.0 | Stats evened out, a No Air mode, a 200-tower cap | [Hive](https://www.hiveworkshop.com/threads/wmw-evolution-v1-03.277090/) |
| Wintermaul Wars X15 | Aphotica, Bighead; 2023 | Modes voted by players or by the host; a wc3stats ladder | [Epic War](https://www.epicwar.com/maps/330930/) |
| Wintermaul Reforged 3.7 | Euan, refined by AiR / DarkGandalf; 2024 | A WmW for current WC3; 1v1 to 3v3 | [Epic War](https://www.epicwar.com/maps/334152/) |
| Castle Fight X | BrianKamrany, from Castle Fight Corrupted | Two teams; buildings spawn units | [repo](https://github.com/BrianKamrany/CastleFight) |

## 2. Line Tower Wars

### 2.1 At a glance (LTW: Reforged 2.7c unless noted)

| Rule | Value | Source |
|---|---|---|
| Players | A ring. You send to the next living player to your right, and the player to your left sends to you | `wts 1105`, `2.7c j: Jy` |
| Waves | **None.** Every creep is a Send bought by a player | `2.7c j`, `port: wave_controller.lua` |
| Start | 25 lives, 30 gold, 20 income, 4 Research Points | `wts 1107`, `2.7c j: gy` |
| Income tick | Every 10 s, each living player gets their income in gold. A timer on screen counts down to it | `2.7c j: PM` (`Fw=10`), `wts 1107` |
| Send | Pay gold; your income rises by the Send's income at once, for good. The creep appears at the top of your target's field | `2.7c j: Hd` |
| Leak | The defender loses 1 life and the sender gains 1. The creep then runs on (§2.3) | `2.7c j: oL` |
| Bounty | A Send killed in your field pays you its bounty, so a bad Send funds its target | `port: events.lua`, [Steam](https://store.steampowered.com/app/4954340/) |
| Live Send cap | 100 of your Sends alive at once. A Send over the cap is refused and refunded | `2.7c j: Hd` (`bw=100`) |
| Block | Refused: the tower is removed and its full price refunded | `2.7c j` (message 10), `port: builder.lua` |
| Sell | 75% of the price | `2.7c j` (`gw=.75`), `port: sell.lua` |
| Sudden Death | From 24:45, every income tick takes 3 lives from every player, down to 1 | `2.7c j: PM` (`Wo=1485`, `Ao=3`) |
| Win | The last player with lives | `wts 1105`, `port: events.lua` |
| Length | 10–30 min, says one player | [Hive comment](https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/) **[unverified, single source]** |

### 2.2 Fields and the ring

- **One field per player.** 2.7c has 18 fields in two rows of nine. Each field is 1,024 × 3,968 units, which is 8 WC3 towers wide and 31 long. A spawn strip sits above each field and a leak strip below it, and fields stand 1,024 units apart (`2.7c j`, the rect table). The Dota port's notes give the same 8 × 31 (`port: TODO.txt`). The Block check runs on a 64-unit grid, half a tower (`2.7c j`, the Block check).
- **Movement.** A Send appears at a random point in its target's spawn strip and is ordered due south. Ordinary Sends path around towers; tower attackers attack-move, so they hit towers on the way (`2.7c j: Hd`).
- **Targets.** Each player has one target: the next living player after them in slot order. When someone dies, every target is worked out again (`2.7c j: Jy`, `oL`).
- **Leavers.** In 2.7c a player who leaves keeps their lives until the next Leak in their field. The sender of that Leak then takes all of them (`2.7c j: oL`).
- **Catch-up gold (8.0a, raised in 11.4a).** When you get a new attacker with more income than your old one, you get a one-time gold bonus. It was equal to the income gap, later 1.5× the gap ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged), [changelog](https://docs.google.com/document/d/e/2PACX-1vR-scT5NyHBOQVRmCCiIR12dd4xgw4uZOXTAAccjD8pDjZP8axa1bkh08te7acbC2XFeRmRajkqh8MM/pub)).

### 2.3 What a Leak does

- **The life moves.** A Leak costs the defender 1 life and gives the sender 1 (`2.7c j: oL`, `port: OnCreepReachedGoal`, [GIGA](https://www.giga.de/tipp/die-beliebtesten-tower-defense-maps-im-ueberblick-warcraft-3-reforged/)). In 2.7c every creep steals 1, bosses included. From 4.1d the three boss Sends steal 2 ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged)).
- **The creep is not removed.** In 2.7c it teleports to the top of the field the defender sends to, and runs again. It never enters its sender's field, so it circles the other players until someone kills it. **In 1v1 that means it re-enters the same field and steals again on every pass** (`2.7c j: oL`, `Jy`; my reading, not run in game). 6.8b stopped re-ordering such creeps in 1v1 to make the loop smoother, and 6.8c undid that because creeps got stuck. The Dota port is gentler: the creep moves on lane by lane, and dies when the next lane would be its sender's. It laps the ring at most once, and in 1v1 it steals one life and dies (`port: OnCreepReachedGoal`).
- **Elimination.** At 0 lives you are out and your towers are destroyed (`port: OnHeroKilled`). 2.7c has a kill-shot gold bonus, set to 0 (`2.7c j: oL`, `jp=0`). From 5.7b, creeps with negative income move on to the next field when a player dies.

### 2.4 Sends

Prices, unlock times, restock times and stock limits are the Dota port's (`port: tables/custom_shop.lua`). Incomes are 2.7c's (`2.7c j`, the `tw` table, and the `wts` tooltips); the port's differ by at most 10%. Ratio = income ÷ price, and payback = price ÷ income × 10 s **[my arithmetic]**.

| Send (map's name, avoid) | Price | Income | Ratio | Payback | Unlock | Trait |
|---|---|---|---|---|---|---|
| Sheep | 5 | 1 | 20% | 50 s | 25 s | Fast restock |
| Frost Wolf | 10 | 2 | 20% | 50 s | 40 s | Fast restock |
| Skeleton Warrior | 20 | 3 | 15% | 67 s | 55 s | Less damage from long range |
| Acolyte | 35 | 5 | 14% | 70 s | 70 s | Heals nearby creeps on death |
| Corrupted Treant | 50 | 6 | 12% | 83 s | 85 s | 10% evasion |
| Swordsman | 70 | 8 | 11% | 88 s | 100 s | +1 armor aura |
| Fel Orc Grunt | 100 | 12 | 12% | 83 s | 115 s | Regeneration |
| Vile Temptress | 150 | 16 | 11% | 94 s | 130 s | Speed aura |
| Shade | 200 | 20 | 10% | 100 s | 145 s | **Flying** |
| Mud Golem | 350 | 32 | 9% | 109 s | 160 s | Spell immune |
| Demolition Machine | 750 | 25 | 3% | 300 s | 200 s | **Attacks towers** |
| Rot Golem | 1,000 | 75 | 7.5% | 133 s | 250 s | **Boss**: one big creep |
| *Tier 2:* Knight → Infernal | 1,000 → 100,000 | 100 → 5,000 | 10% → 5% | 100 → 200 s | 300–700 s | Adds dash, invisible, carrier, flying |
| *Tier 3:* 9 Sends | 62,500 → 200,000 | 3,250 → 8,750 | 5% → 4.4% | 190 → 230 s | 830–1,100 s | Stronger auras and traits |
| *Tier 3 finishers:* 4 Sends | 35,000 → 2,250,000 | **−2,000 → −100,000** | negative | — | 800–1,500 s | Tower attackers, a flying invisible creep, a boss |

- **The ratio falls with price,** from 20% to about 5%. Payback stretches from 50 s to about 4 min. Tower attackers earn a third of a normal Send's ratio, and the finishers *cost* income. They exist to end games. Teamline worked the same way: dearer Sends returned less income per gold ([blog](https://postmasterinterest.blogspot.com/2013/06/warcraft-3-reminiscence-teamline-tower.html)). From 5.0a, flying and invisible Sends no longer pay a lower ratio than ground ones; tower attackers still do ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged)).
- **Prices grow about ×2,000 per tier band,** and incomes reach the millions late (§2.7). The numbers compound **[my arithmetic]**. With every tick reinvested at a 10% ratio, income doubles every 7 ticks (73 s); at 5%, every 14 ticks (2.4 min). From 20 income, 150 ticks (25 min) at 5% gives 30,000 per tick. Unlock times and stock are what slow it down.
- **Bounty** is 20% of the price for the two cheapest Sends. It falls to 5–7.5% for the rest of Tier 1, 4–7% in Tier 2 and 2–6% in Tier 3, and tower attackers carry the least (`port: npc/creeps/units.kv`) **[my arithmetic]**. From 4.0a, bounty follows the price, its ratio falls by tier, and bosses get 2×. 6.4a cut every bounty by 5% ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged)).
- **HP** runs 2, 6, 13, 26, 42, 57, 75, 96 for the first eight Sends: about 0.4–0.8 HP per gold of price in Tier 1, before armor, regeneration and traits (`port: units.kv`) **[my arithmetic]**. Speed is 200–280 for ground Sends and 150 for the first flyer.
- **Unlock and stock.** Each Send starts at 0 in stock. After its unlock time it gains 1 every 3–10 s, up to 32. Flyers and some others hold 16, bosses 8 (`port: shop/custom_shop.lua`). Reforged has lengthened the unlock times several times, for example 40 → 45 s for the second Send and 55 → 65 s for the third. From 12.0a it unlocks one Send every 30 s, and the dearest at about 27 min ([changelog](https://docs.google.com/document/d/e/2PACX-1vR-scT5NyHBOQVRmCCiIR12dd4xgw4uZOXTAAccjD8pDjZP8axa1bkh08te7acbC2XFeRmRajkqh8MM/pub)). The live cap is 100 in 2.7c and 40 in the port (`port: constants.lua`).

### 2.5 Towers, tech and mazing

- **Towers.** The cheapest tower is the maze block. Two lines start at 10 and 30 gold and climb by ×3–×10 a step: 120 or 150, 1,000, 5,000–10,000, then 25,000–30,000 (changelog 4.2a and 5.0a; `port: TODO.txt`). Every tower has fortified armor and upgrades in place. Melee lines hit ground only and are meant for corners ([gaming-tools](https://gaming-tools.com/warcraft-3/line-tower-wars/)).
- **Tech.** You start with 4 Research Points, and each technology costs 1. A tech has three tiers, and each tier needs the one before (`wts 1113`, `port: shop/custom_shop.lua`). 2.7c has eight techs: Arcane, Earth, Fire, Ice, Light, Lightning, Unholy and Water (`wts` editor suffixes, `port: tables/research.lua`). It sells extra points for 100,000 gold (`wts 1107`). The port charges 50,000, plus 50,000 more for each one after, up to 24 (`port: constants.lua`). From 4.2a, technologies cost gold that rises by 50,000 a purchase, and Ultimate discs cost 1,500,000 (8.2a). Later versions have ten techs; the set changes, with Light in 8.8b and Primal in 12.4a.
- **Block.** Refused with a full refund (2.7c, port). LTW 45 instead sent an "anticheat" unit to destroy the towers, and Teamline had patrols that killed blocking towers ([gaming-tools](https://gaming-tools.com/warcraft-3/line-tower-wars/), [blog](https://postmasterinterest.blogspot.com/2013/06/warcraft-3-reminiscence-teamline-tower.html)). Reforged's 8.7 line added a 3 s cooldown "reroute" button that makes creeps re-path; from 8.8b, trapped creeps walk through towers for a moment ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged)).
- **Selling mid-game and juggling.** You can sell at any time for 75%, and since there are no Waves, there is never a safe build phase. Selling takes a short time: from 8.0a the bar reads "Selling" instead of "Training". From 8.8a, in Custom games, selling 5 or more towers in a short window warns your attacker. That points to sell-and-rebuild tricks, but no source names juggling ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged)) **[inferred]**. The reroute button also suggests creeps don't always re-path on their own **[inferred]**.
- **Counters to a long cheap maze:** flyers ignore it, and tower attackers stop to break towers. The in-map help names attackers as the answer to mass cheap towers (`wts 1111`). From 5.0a, a tower destroyed by one of the attackers leaves rubble that blocks building there for 6 s. The 2026 Steam game adds Sends that drain the defender's gold ([Steam](https://store.steampowered.com/app/4954340/)).

### 2.6 Lives

| Players | Lives each (4.0a) | Source |
|---|---|---|
| 1–2 | 50 | [W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged) |
| 3–4 | 40 | same |
| 5–6 | 35 | same |
| 7–10 | 30 | same |
| 11–15 | 25 | same |

2.7c gave everyone 25 (`2.7c j: gy`), and so does the port (`port: npc_heroes_custom.txt`). The W3Champions 1v1 setup (5.8a) gives 100. The Damage Royale mode (5.5a–6.6a) forced 3. 11.0a and 12.3a raised the table again; three players in Ranked went from 50 to 60.

### 2.7 Sudden Death and the anti-snowball changes

| Version | Change | Source |
|---|---|---|
| 2.7c (2020) | From 24:45, every income tick takes 3 lives from everyone, down to 1 | `2.7c j: PM` |
| 4.2a | A player with fewer lives than the drain drops to 1, not 0 | [W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged) |
| 6.0a | The first negative-income finishers. Basic towers sell for 75% and tech towers for 60% | same |
| 7.0a (2022) | At Sudden Death, income freezes and each tick takes exactly 1 life. Before this, the drain varied with the number of players alive (2.7c used a flat 3). Creeps also take 0.33% less damage per tick, stacking. 7.1a lets income keep growing in Casual games | same |
| 8.0a | Catch-up gold (§2.2); start gold 30 → 40 | same |
| 8.1a / 8.4a / 8.7a | 1v1 takes 2 lives a tick. Creep damage starts at 85–100%, set by the top income. Sudden Death moves to 25:30 | same |
| 10.0a (2025) | **Income cap of 4,000,000.** Sudden Death at 26:00, without the freeze; creep damage falls a flat 1% a minute | [changelog](https://docs.google.com/document/d/e/2PACX-1vR-scT5NyHBOQVRmCCiIR12dd4xgw4uZOXTAAccjD8pDjZP8axa1bkh08te7acbC2XFeRmRajkqh8MM/pub) |
| 10.2a–11.3a | Trade 5, later 4, lives to raise your income cap | same |
| 12.0a (2026) | The cap and the trade are removed. Sudden Death at 25:00, with damage falling 1.6% a minute (1% from 12.2a). Everyone below 1,000,000 income is raised to it. Finishers pay income at 2% of price | same |
| 12.4a | Income gained above 4,000,000 is cut by 75%: a soft cap | same |

Reforged is still tuning both problems six years on. Matches run long, and incomes in the millions snowball **[inferred from the changes]**.

### 2.8 Other modes and the Steam game

- **Damage Royale** (5.5a, removed in 6.6a) turned Reforged into a Wave game. Sends were switched off, Waves came 15 s after each round, everyone had 3 lives, and passive income was 1.25× normal ([W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged)).
- **The 2026 Steam game** is a free standalone for Mac and Windows. It offers free-for-all for 2–12 players, offline against bots at three difficulty levels, or online. The same deterministic simulation runs both, and a match that desyncs is voided. Each player picks one of 5 heroes, who walks the field and places towers by hand. You wall the field and upgrade plain walls into towers. The last player who still has lives wins. It publishes no numbers ([Steam](https://store.steampowered.com/app/4954340/)).

## 3. Wintermaul Wars

| Rule | Value | Source |
|---|---|---|
| Teams | 1v1, 2v2, 3v3 (x14.2). Up to 6 players in two teams of three, top against bottom (TNG) | [Epic War](https://www.epicwar.com/maps/223952/), [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/) |
| Field | A shared maze. Creeps walk Waypoint to Waypoint, each marked by lightning, to the ship. They seem to cross the centre on the way: X12 times both sides' creeps to meet there, and Evolution makes creeps invulnerable and at top speed in it **[inferred]** | [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/), [X12](https://www.hiveworkshop.com/threads/winter-maul-wars-x12.108651/), [Evolution](https://www.hiveworkshop.com/threads/wmw-evolution-v1-03.277090/) |
| Races | Up to 2 builders each (TNG); picking at random gives 25 extra gold (Evolution) | same |
| Sends | Ground Sends come from the Shrine and flyers from a separate Air Nest. Every Send raises income for good | [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/), [Maul Tactics](https://maultactics.gg/articles/wintermaul-wars-history) |
| Income by type | Wintermaul Reforged 3.7: flyers give **no** income, siege Sends give less. 3.6: weaker Sends give more income and more bounty | [Epic War](https://www.epicwar.com/maps/334152/); 3.6 **[unverified, search snippet; wc3maps returns 403]** |
| Income tick | 25 s (TNG). Tournament Edition's Greed mode cuts it to 12 s. A 2016 reviewer of a TNG-based version called the gap too long | [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/), [Evolution review](https://www.hiveworkshop.com/threads/wmw-evolution-v1-03.277090/); TE **[unverified, snippet; wc3c.net is gone]** |
| Shrine upgrade | Unlocks stronger Sends. Players upgrade at about 700 income in 1v1, 1,000–2,000 in 2v2. TNG's author upgrades at 2,000+; TE does it on its own at 2,000 | [guide](http://wmwl.weebly.com/wmw-guide.html), [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/); TE **[unverified]** |
| Unlocks | Sends unlock on a timer; X12 moved one late Send from 80 s to 50 s | [X12](https://www.hiveworkshop.com/threads/winter-maul-wars-x12.108651/) |
| Lives | 25 per team (TNG). X12 Tournament: 1, 10, 20, 25, 30, 40, 50 or 100; Easy 100; Practice 1,000. Crystal puts lives to a vote | [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/), [X12](https://www.hiveworkshop.com/threads/winter-maul-wars-x12.108651/), [Crystal](https://www.epicwar.com/maps/27266/) |
| Leak | A creep that passes every Waypoint and reaches the ship costs its team 1 life. The sender gains nothing, except perhaps in Crystal's voted "Life Steal" option | [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/); Crystal **[unverified, the option is only named]** |
| Win | The other team reaches 0 lives | [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/) |
| Block | Refused, or the map opens an override route. TNG 2.0 fixed a maze that trapped creeps in an endless loop | [Maul Tactics](https://maultactics.gg/articles/wintermaul-wars-history), [TNG](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/) |
| Modes | Hard: less gold, 10 starting income. Death: lots of gold. No Air: Crystal, Evolution. X15: modes picked by player vote or by the host | [X12](https://www.hiveworkshop.com/threads/winter-maul-wars-x12.108651/), [Evolution](https://www.hiveworkshop.com/threads/wmw-evolution-v1-03.277090/), [X15](https://www.epicwar.com/maps/330930/) |
| Tower cap | Evolution: towers cost food, capped at 200 | [Evolution](https://www.hiveworkshop.com/threads/wmw-evolution-v1-03.277090/) |

- **Roles.** In 2v2 each pair keeps a ground side and an anti-air side. You send ground before air, and you space air Sends out rather than stacking them. Partners pool gold early ([guide](http://wmwl.weebly.com/wmw-guide.html)).
- **Complaints.** Flyers were strong early, and players asked for a no-air mode. TNG's author declined; Crystal (2007) and Evolution (2016) have one ([TNG comments](https://www.hiveworkshop.com/threads/wmw-the-next-generation-2-0.119036/), [Crystal](https://www.epicwar.com/maps/27266/), [Evolution](https://www.hiveworkshop.com/threads/wmw-evolution-v1-03.277090/)). A 2016 review found Sends badly balanced, flyers too strong for their price, and the income gap too long. The 2024 rule that flyers give no income answers the same problem.
- **Length.** A 1v1 rarely outlasts the first big dragon Sends, while 3v3 games run much longer ([guide](http://wmwl.weebly.com/wmw-guide.html)). No minutes are given.
- **Missing:** starting gold, Send prices, the income gained per Send, and whether neutral Waves exist. No source mentions any. No Wintermaul Wars version I found has computer players.

## 4. Castle Fight (brief)

Castle Fight X starts each side with 275 gold and 125 lumber, and pays 5 income every 10 s. Each finished building adds its price ÷ 50 to income: **2% of the price per tick** (`Modes.cs`, `Structures.cs`). Income then passes through a **progressive tax** (`Round.cs: CalculateProgressiveTax`). The first 15 gets a 10% bonus, the band from 15 to 30 pays 5%, and the rate climbs to 95% above 675. A raw 100 nets 77, 675 nets 167, and 2,000 nets 233 **[my arithmetic]**. An optional high-tax mode is steeper. The first four players to finish a building get 20, 15, 10 and 5 gold.

To break stalemates, every round gets a map-wide upgrade at 15 minutes, a round ends as a draw at 35 minutes (default: 2 rounds), and players can vote for a draw (`Round.cs`, `Modes.cs: ApplyDefaultModes`). Extra slots can be "team controlled", which is shared control, not an AI.

## 5. AI opponents

| Game | How difficulty works | What is known about the logic | Source |
|---|---|---|---|
| LTW: Reforged (8.7f, 2024 →) | Easy, Normal or Insane get **+0%, +20% or +50% gold from income**. Any bot turns Ranked off | See below | [W3Reforged](https://maps.w3reforged.com/featured-maps/line-tower-wars-reforged), [Hive](https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/), [changelog](https://docs.google.com/document/d/e/2PACX-1vR-scT5NyHBOQVRmCCiIR12dd4xgw4uZOXTAAccjD8pDjZP8axa1bkh08te7acbC2XFeRmRajkqh8MM/pub) |
| Line Tower Wars (Steam 2026) | Three levels | Not published | [Steam](https://store.steampowered.com/app/4954340/) |
| Wintermaul Wars, Castle Fight X | — | No computer players found | listings above |

**What Reforged's bots do**, from the changelog:

- **8.7f (2024-03):** a computer goes into any lobby slot. It plays like a person but builds no Technology Discs. Difficulty is set in the lobby and only changes its income bonus.
- **8.7g:** fixes for buying technologies and for selling several basic towers at once. Behaviour "improved with updated skills and priorities", which suggests a rule list with priorities **[inferred]**. A new Doppelgänger option gives every player a computer clone of themselves with access to everything.
- **11.0a (2025):** each player gets a hidden computer player that controls their creeps, all but tower attackers. That is engine plumbing, not an opponent. Bots were updated, and a bug that stopped them buying one late Send was fixed.
- **12.2a (2026):** bots' sending was retimed to the new unlock schedule. Their Sends seem to follow the unlock clock **[inferred]**.
- **12.4a:** the map supports any number of bots, and they chat.

The 12.4a file is protected (its name ends in "P"), and the 2.7c script predates bots, so the AI's decision logic isn't public. No source documents an exploit of Reforged's bots.

What the sources do show **[inferred]**:

- The one documented difficulty lever is an income bonus.
- Bots play the same rules as people, so the 1v1 Leak loop (§2.3) and Sudden Death apply to them too.
- The difficulty is announced in the lobby, so the bonus is not hidden.

## 6. Typical numbers across them

| | LTW: Reforged 2.7c | LTW Dota port | WmW TNG / x14 | Castle Fight X |
|---|---|---|---|---|
| Start gold | 30 (40 from 8.0a) | 65 | ? | 275 |
| Start income | 20 | 20 | ? (10 in Hard) | 5 |
| Income tick | 10 s | 10 s | 25 s (12 s in Greed **[unverified]**) | 10 s |
| Send income ÷ price | 20% → 5%; finishers negative | same | ?; flyers 0 in Wintermaul Reforged | 2% of building price |
| Payback | 50 s → ~4 min | same | ? | 50 ticks, before tax |
| Lives | 25 (20–50 by players; 100 in the 1v1 ladder) | 25 | 25 per team (1–100 by setting) | castle HP |
| Leak | −1 defender, +1 sender, creep runs on | same, one lap | −1 team | — |
| Base Waves | none (Damage Royale only) | none | none found | none |
| Length | 10–30 min; Sudden Death at ~25 | open | ? | 35-min rounds |

**Complaints and the fixes maps used:**

| Problem | Fix | Where |
|---|---|---|
| Income snowballs | Falling income ratio for dearer Sends | LTW, Teamline |
| | Hard and soft income caps; trading lives for cap room | LTW: Reforged 10.0a–12.4a |
| | Progressive income tax | Castle Fight X |
| | Negative-income finishers as gold sinks | LTW: Reforged 6.0a |
| | Gold capped at 1,000,000; the extra converts to lumber at 100,000 a piece | Teamline ([blog](https://postmasterinterest.blogspot.com/2013/06/warcraft-3-reminiscence-teamline-tower.html)) |
| Falling behind is final | Catch-up gold when a richer attacker takes over | LTW: Reforged 8.0a |
| | A Send that grows with the income gap | LTW: Reforged 7.0a |
| | Raise everyone to a minimum income at Sudden Death | LTW: Reforged 12.0a |
| Matches never end | Sudden Death: lives drain each tick and creeps grow tougher | LTW: Reforged |
| | Round time limit and draws | Castle Fight X |
| | Set lives per game | WmW |
| Flyers dominate | No-air modes; flyers pay no income | WmW Crystal, Evolution, Wintermaul Reforged |
| Long cheap mazes | Flyers and tower attackers | LTW, WmW |
| Blocking | Refuse and refund; destroy the blocking towers; a reroute button | LTW versions, Teamline |
| Income gap feels slow | A 12 s tick in Greed mode | WmW TE |

## 7. Licence, and names we must not use

- **Licences.**
  - The 2.7c files are third-party test data inside JAST, which is Apache-2.0. That licence covers JAST's own code, not the map. The map has no licence. Its author says the original's authorship is unclear after two decades of edits, and that Reforged is new code ([Hive](https://www.hiveworkshop.com/threads/line-tower-wars-reforged.354130/)). The 12.4a file is protected.
  - VicFrank's port has no licence (`gh api` → `license: null`).
  - Castle Fight X shows MIT on GitHub, but its `README_LICENSE.txt` says CC BY-NC-SA 4.0.
  - Wintermaul Wars publishes no source, and several versions ship "Protected".
  - **We port rules only, never text, names, art, models or sounds.** Prices and ratios are facts, but Line Wars should use its own numbers.
- **Line Tower Wars names, to avoid:**
  - **Map and system words:** Line Tower Wars, LTW, Reforged, Teamline, "summon", Research Center, Research Point, Technology Disc, Ultimate disc, Book of Summoning, Doppelgänger, Damage Royale, Catch-Up Gold, Smart Placement.
  - **Every Send:** Sheep, Flying Sheep, Frost Wolf, Skeleton Warrior, Acolyte, Forest Spider, Corrupted Treant, Swordsman, Fel Orc Grunt, Vile Temptress, Shade, Mud Golem, Void Sapling, Demolition Machine, Rot Golem, Knight, Vengeful Spirit, Forest Troll Berserker, Wraith, Voidwalker, Faceless One, Dragonspawn, Magnataur, Banshee, Siege Engine, Death Revenant, Infernal, Ravaging Ghoul, Satyr Shadowdancer, Crypt Fiend, Fel Orc Warlock, Spellbreaker, Necromancer, Hydra, Gryphon Rider, Abomination, Mountain Giant, Frost Wyrm, Phoenix, Naga Siren, Ogre Magi, Chaos Warden, Behemoth, War Beast, Kodo Beast, Goblin Shredder, Treasure Goblin. Most are Blizzard's own WC3 unit names, one more reason to avoid them.
  - **Send traits:** Fast Producing, Sturdy Armor, Unholy Sacrifice, Fel Blood, Carrier, Blessing of Azshara, Necrotic Transfusion.
  - **Towers:** Archer, Gunner, Watch Tower, Guard Tower, Ward Tower, Cannon Tower, Bombard Tower, Artillery Tower, Cutter, Grinder, Carver, Executioner, Crusher, Wrecker, Mauler, Mangler, Elemental Core. Also every tech tower, for example Meteor Attractor, Living Flame, Frozen Watcher, Icicle, Lightning Beacon, Voltage, Lightshroom, Sunray Tower, Septic Tank, Decayed Guardian, Water Elemental, Tidal Guardian, Earth Protector, Poisonous Roots, Archmage, Arcane Pylon, Voidling, Riftweaver, and all "Ultimate" towers.
  - **The Steam game's own words:** "warband", "tether" and "champion".
- **Wintermaul Wars names, to avoid:** Wintermaul Wars, WmW, Shrine, Dark Portal, Air Nest, the ship. Its Race names: Economy, Abyssal Pit, Wrath, Gluttony, Envy, Lust, Pride, Sloth, Greed, War, Famine. Its Send names: Frosty Reptile, Ice Shard Golem, Mature Dragon, Elderly Dragon, Ice Troll, Hover, Goblin Machine, Water Runner, Grunt, Raider.
- **Castle Fight names, to avoid:** Castle Fight, Treasure Box, Orb of Lightning, Rakanishu.
- Generic words like income, lives, tier, flying and boss are fine.

## 8. Corrections to earlier notes

| Earlier note | The sources say |
|---|---|
| [wc3-td-maps.md](wc3-td-maps.md) LTW: a leak costs the defender a life and gives one to the sender | True, but the creep isn't removed. In Reforged 2.7c it runs on to the next field and keeps circling; in 1v1 it re-enters the same field. The Dota port lets it lap the ring once |
| wc3-td-maps.md LTW: "Sends raise income" | Most do. The ratio falls from 20% to 5% by price, tower attackers earn about a third of that, and the last four Sends *cost* income |
| wc3-td-maps.md LTW: income snowballing **[unverified]** | Confirmed by the fixes: income caps (2025–26), catch-up gold (2023) and Sudden Death |
| wc3-td-maps.md LTW: very long matches (GIGA) | Reforged has had Sudden Death since at least 2.7c (24:45). One player puts matches at 10–30 min |
| wc3-td-maps.md LTW: 10 technologies, incl. Primal | 2.7c has eight. Later versions have ten, and the set changes: Light in 8.8b, Primal in 12.4a |
| wc3-td-maps.md comparison table: WmW "Neutral waves + sends" | No source describes neutral Waves; every source describes Sends only **[open]** |
| wc3-td-maps.md WmW: "Air sends bypass the maze" | True, and flyers were the main balance complaint. Later versions added no-air modes, and Wintermaul Reforged 3.7 pays no income for them |
| wc3-td-maps.md Castle Fight: income from buildings | 5 base plus 2% of each building's price every 10 s, with a progressive tax |
| wc3-td-maps.md feature row 7: self-send works "without an AI opponent" | Phase 5 now asks for an AI opponent, so the row is a fallback, not the plan. Reforged's Damage Royale (Waves, no Sends) shows the solo form the map's own authors tried |
| wc3-td-maps.md feature row 12: auto-spawners, Cost 5, defer | Still holds. Castle Fight's building income and tax can be borrowed without its auto-battling |

## 9. What Line Wars could take

These are candidates, not decisions.

**Keep (faithful Line Tower Wars rules):**

1. **One long field per side, mazed like Maul.** Reforged's field is 8 towers wide and 31 long, with a spawn strip at the top and an exit strip at the bottom. Blocks are refused with a full refund. Flyers ignore the maze, and tower attackers punish long cheap mazes.
2. **No Waves: creeps come only from Sends.** A 10 s income tick with a visible countdown. Start with about 30 gold and 20 income.
3. **A Send shop in tiers.** Each Send raises income at once and for good, at a ratio that falls with price (20% → 5%). Each also has an unlock time, a stock that refills, and a cap on live Sends. These are the brakes on compounding (§2.4).
4. **Bounty to the defender** for each Send killed: 20% of the price for the cheapest, falling to a few percent for the dearest.
5. **A Leak moves a life** from defender to sender. Lives: 25 to 50 in small games, 100 on the 1v1 ladder.
6. **Sudden Death at about 25 minutes.** Lives drain each tick, and creeps grow tougher.

**Change (1v1 against an AI on phone and Mac):**

- **Two players, not a ring.** Keep "target = the next living player" in the game logic, so versus play over WebRTC can grow later. The Steam game's deterministic sim, which voids a match on desync, matches [ADR-0002](../adr/0002-deterministic-simulation-core.md).
- **What a Leak does in 1v1:** pick between the 2.7c loop, where a Leak keeps stealing every pass, and the port's single steal. The loop is harsher and snowballs faster.
- **Smaller numbers.** Reforged reaches millions of gold. Cut to two tiers or compress the price curve. Add a soft cap or a Castle Fight-style tax rather than a hard cap.
- **Difficulty.** CONTEXT says Difficulty scales creep strength. Reforged scales the AI's *income* instead (+0/+20/+50%). Choosing that would mean changing CONTEXT. An open bonus shown at New Run follows Reforged, where the lobby announces it.
- **Flyers.** Wintermaul Wars' history says flyers need a brake. Candidates: they pay little or no income (Wintermaul Reforged), or they unlock late.
- **A Wave option.** Reforged's own Damage Royale (Waves, no Sends) is a candidate for a practice mode, or for a slow first minute before Sends unlock.
- **New CONTEXT terms** to settle: Send, income tick, and the word for a player's field (not Lane). Line Wars also breaks CONTEXT's "a Run is a fixed sequence of Waves".

**Leave out:**

- Ring games, Ranked, leaver rules, chat commands, Doppelgängers, and a live cap as high as 100.
- Research Points and million-gold discs; a small tech choice could replace them.
- Wintermaul Wars' shared team lives and split ground and air roles, which need partners.
- Castle Fight's auto-spawning buildings.

**Open questions:**

- The WC3 gold price of each Send in Reforged: I have only the Dota port's.
- How Reforged's bots choose builds and Sends: the script is protected.
- Every Wintermaul Wars number: starting gold, Send prices, income per Send, and what the Shrine upgrade costs. No script or rules page is online; the `.w3m` files on Epic War would answer it.
- Whether juggling works in LTW, and whether creeps re-path on their own when a wall opens.
- What the Steam game's three bot levels change.
