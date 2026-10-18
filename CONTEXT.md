# Tower Defense Collection

A single-player collection of tower defense games, most recreating a classic Warcraft 3 custom TD, playable on Mac, iPhone and Android.

## Language

### Structure

**Game Mode**:
A self-contained ruleset, picked from the main menu, that defines how towers are acquired, how creeps path, and how the economy and waves work. A Game Mode either recreates one Classic or is an Original.
_Avoid_: variant, game type, map

**Classic**:
The original Warcraft 3 custom map that a Game Mode recreates, e.g. Gem TD or Element TD. A Game Mode that recreates a Classic follows the Classic's own rules, including its randomness and its lack of progression.
_Avoid_: map, original, inspiration

**Original**:
A Game Mode designed for this collection rather than recreating a Classic.
_Avoid_: custom mode, new TD

**Map**:
The board a Game Mode is played on: the grid, spawns, exits, checkpoints and unbuildable terrain.
_Avoid_: level, board, arena

**Run**:
One playthrough of a Game Mode on a Map, from the first Wave to victory or defeat.
_Avoid_: match, game, session

**Difficulty**:
The Easy, Normal, Hard or Insane setting chosen when starting a Run, which scales creep strength. In a Game Mode that recreates a Classic, Normal plays with the Classic's own numbers.
_Avoid_: level, challenge

**Record**:
The best result kept on the device for a Game Mode and Difficulty: best Wave reached, score, and fastest win. Element keeps Full and Express Records apart, because their scores don't compare. The Original keeps one per Stage instead: its best Stars, the hardest Difficulty won and the fastest win.
_Avoid_: high score, achievement, stats

**Save code**:
A Run in progress as copyable text, made by Export save code in the in-Run menu and loaded by Import save code in the main menu.
_Avoid_: save string, password, export

### Play

**Wave**:
One group of creeps sent along the path in a single go; a Run is a fixed sequence of Waves.
_Avoid_: level, round (Classics often say "level 51" when they mean a Wave)

**Checkpoint**:
A region of the Map that ground and air creeps must pass through in order on their way from the spawn to the exit. It may stand in several places at once, and a creep makes for the nearest.
_Avoid_: waypoint (in player-facing text), node, flag

**Gate**:
In Maul, where a Wave's creeps come onto the Map. The Crossing has two, and each Wave sends its creeps from both.
_Avoid_: spawn (fine in code), portal, entrance

**Aura**:
A tower's effect on everything of one kind within a radius, such as faster attacks for nearby towers or less armor for nearby creeps.
_Avoid_: field, zone, buff area

**Ghost**:
The see-through preview of a structure before it is built: green where it can go, red with the reason where it can't, with the route it would make drawn alongside.
_Avoid_: preview tower, cursor, shadow

**Block**:
A placement that would leave creeps no path from spawn to exit. Every Game Mode rejects it.
_Avoid_: wall-off, seal

**Juggling**:
Selling and placing towers mid-Wave so creeps keep turning back and walking the maze again. Maul allows it, as Wintermaul did.
_Avoid_: maze abuse, re-routing

**Race**:
In Maul, the builder chosen at the start of a Run, which fixes the set of towers you can build. A second Race can join once Wave 15 is cleared.
_Avoid_: builder, faction, class

**Wall**:
In Maul, a Race's cheap 2 × 2 block with a weak attack, built to shape the maze. It upgrades into either line's Tier 1 tower of any Race in the Run.
_Avoid_: rock (Gem's word), blocker, barricade

**Leak**:
A creep reaching the exit. What it costs depends on the Game Mode: in Gem a leak from Wave 10 on ends the Run, and in Element it costs lives and the creep walks the route again.
_Avoid_: escape, breach, pass

**Break**:
The countdown before the next Wave starts on its own. In Element and Maul it starts once a Wave is cleared; in the Original it starts once the Wave's last creep has spawned, so Waves can overlap. "Send now" ends it early.
_Avoid_: build phase (Gem's build phase has no timer), intermission, timer

**Trait**:
A rule that changes how one Wave's creeps behave, such as fast, heal, undead or mechanical.
_Avoid_: ability, modifier, perk

### Element (Element TD rules)

**Element**:
One of Element's six damage and creep types: Water, Fire, Nature, Earth, Light and Dark. Each deals 200% to the next in that cycle and 50% to the one before, and the player raises each from level 0 to 3 during a Run.
_Avoid_: school, colour, affinity

**Lane**:
Element's walled route that creeps walk from the spawn to the exit. Towers stand on plots beside it, never on it, so they can't change it.
_Avoid_: path (in code, the route is the polyline creeps follow), road, track

**Composite**:
Damage or a creep with no Element. Composite damage deals 100% to everything, and Elements deal 90% to composite creeps.
_Avoid_: neutral, physical, normal

**Lumber**:
Element's second resource. You get one at the start and more every few Waves, and you spend it to summon an Elemental or buy a Pure Essence.
_Avoid_: wood, element point, token

**Elemental**:
The creep that one Lumber summons; killing it raises that Element by one level.
_Avoid_: guardian, summon, element boss

**Pure Essence**:
A rare resource that, together with gold, buys a Pure tower or the Periodic tower.
_Avoid_: essence point, pure lumber

**Express**:
Element's short Run: 30 Waves with more starting gold and Lumber, instead of the Full 55.
_Avoid_: quick mode, short (the Classic's own "Short" is a different start)

**All Pick** / **All Random**:
How a Run raises its Elements, chosen at New Run. In All Pick you choose what each Lumber summons; in All Random each Lumber goes to a random Element in an order drawn at the start, and selling refunds everything.
_Avoid_: pick mode, random mode, draft (Gem's word)

### Gem (Gem TD rules)

**Draft**:
The five random gems placed on the field at the start of each Gem build phase; the player keeps one as a tower.
_Avoid_: roll, hand, pick

**Rock**:
A drafted gem that was not kept; it stays on the field as a permanent wall that shapes the maze.
_Avoid_: stone, wall, blocker

**Recipe**:
A fixed combination of specific gems that fuses into a special tower, such as Silver or Star Ruby.
_Avoid_: combo, craft, fusion

**Slate**:
A support structure made from one Normal gem plus one specific Flawed gem in the same Draft. Creeps walk over it, and it leaves no Rock behind.
_Avoid_: rune, tablet, totem

**Special**:
The tower a Recipe makes, such as Malachite; gold buys it up its line's Tiers, such as Vivid then Mighty Malachite.
_Avoid_: combo tower, legendary, unique

**Gem Quality**:
Gem's research, from 0 to 8, that sets the odds of each gem quality (Chipped to Perfect) in the Draft.
_Avoid_: chance level, luck, gem level

**Extra Chance**:
A gold fee, open at Gem Quality 8, that biases one round's Draft toward a chosen gem type or Slate.
_Avoid_: reroll, bias, target buy

**Kill Step**:
A Gem tower's kill count in tens, from 1 to 11; several Specials and Slates hit harder at higher Kill Steps.
_Avoid_: kill level, rank, veterancy

**Damage Test**:
The armored boss that arrives with Gem's Wave 50; how much damage it takes is the Run's score.
_Avoid_: level 51, final boss, dummy

### Progression (Original only)

**Campaign**:
The ordered sequence of Stages that makes up the Original, and the progress through it kept on the device: Stage Records, Stars and Talents. It is stored apart from Runs, so a Save code holds a Run and never the Campaign.
_Avoid_: story, world, adventure

**Region**:
One of the Campaign's three groups of four Stages (Ashfield, Blightfen, Rift), each with its own palette, enemies and boss.
_Avoid_: world, chapter, act, zone

**Stage**:
One hand-made Map with its own Waves in the Campaign; finishing a Stage unlocks the next.
_Avoid_: level, mission, map

**Star**:
A reward of 1–3 for finishing a Stage, spent on permanent upgrades that carry across Runs.
_Avoid_: point, medal, crown

**Tower Level**:
How experienced a single tower is within the current Run, from 1 to 10; towers gain XP from kills and lose it when the Run ends. "Level" means only this.
_Avoid_: rank, veterancy, tier

**Build Spot**:
A fixed place on a Stage's Map where one tower can stand; the Original has no free placement.
_Avoid_: plot, pad, slot, tile

**Build ring**:
The ring of unlocked Tower Families, each with its price, that opens around an empty Build Spot when it is tapped. Tapping a family shows its Ghost; tapping it again builds.
_Avoid_: radial menu, build menu (Element's word), wheel

**War map**:
The Original's Stage-select screen: the map spread on the last tavern's table, with the road north through the Regions and a pin per Stage.
_Avoid_: level select, world map, overworld

**Tower Family**:
One of the Original's six tower lines (Arrow, Cannon, Frost, Arcane, Poison, Totem). Arrow and Cannon are open from the start; each of the others unlocks by finishing a Stage.
_Avoid_: tower type, class, line

**Tier**:
An upgrade step bought with gold during a Run. In the Original a tower climbs Tiers 1–3 and then picks one of two Specialisations; in Maul a Wall becomes a Tier 1 tower, which climbs to Tier 2 and then forks into one of two Tier 3 towers.
_Avoid_: upgrade level, rank

**Specialisation**:
One of two final forms a Tier 3 tower can become, after which it can't be upgraded further.
_Avoid_: branch, evolution, tier 4

**Talent**:
A permanent bonus for one Tower Family, bought with Stars and refundable for free at any time.
_Avoid_: upgrade, perk, research, skill

**Perk**:
An extra ability a tower gains on reaching Tower Level 5 and again at 10.
_Avoid_: talent, bonus, trait

**Assist**:
Half of a kill's XP, given to every other tower that hit or slowed the creep in the 3 s before it died.
_Avoid_: shared XP, kill credit

### Original (our Campaign)

**Threat**:
The number that sets a Wave's creep HP, bounty and bonus in the Original: the Stage's first Threat plus the Wave's number minus one. It keeps rising across the Campaign, so later Stages start harder.
_Avoid_: level (Tower Level owns that word), wave number, tier

**Early call**:
Ending a Break with "Send now" in the Original, which pays bonus gold for the seconds skipped. Element's "Send now" pays nothing.
_Avoid_: rush, skip, send early

**Route**:
The fixed road ground creeps walk from a spawn to the exit on an Original Map. A Map has one per spawn, and each Wave group names the route it takes.
_Avoid_: lane (Element's word), path, track

**Air line**:
The fixed line that flying creeps follow from spawn to exit on an Original Map, ignoring the route. Each route has its own.
_Avoid_: flight path, air route, air lane

**Targeting**:
Which creep in range an Original tower attacks: First (nearest its exit, the default), Last, Strong (most HP) or Close. The player changes it freely; Poison towers also prefer creeps that aren't poisoned yet.
_Avoid_: target mode (in player text), priority, aggro

**Bounty pool**:
The gold a Wave's creeps carry between them in the Original and Maul, set by its Threat (in Maul, its number) and split by each creep's share of the Wave's HP. Creeps that another creep drops (a Bloater's Crawlers, a boss's brood) carry none.
_Avoid_: kill gold, reward, loot

**End-of-Wave bonus**:
The gold the Original and Maul pay once every creep of a Wave is dead or leaked, set by its Threat (in Maul, its number). Maul adds interest on unspent gold, capped at the bonus.
_Avoid_: clear bonus, wave reward, income

**Damage type**:
What kind of hit a tower deals in the Original: Pierce, Siege, Magic or Poison. A creep's armor type cuts some damage types and lets others through.
_Avoid_: element (Element's own word), attack type in player text (`attackType` is fine in code)

**Armor type**:
A creep's defence class in the Original: Unarmored, Armored (cuts Pierce and Siege), Warded (cuts Magic) or Boss (cuts all but Poison). Numeric armor is separate, and only debuffs move it.
_Avoid_: defence, resistance, armour

**Shield**:
A creep defence in the Original that blocks a flat amount from every hit. Poison over time ignores it.
_Avoid_: block, barrier, absorb
