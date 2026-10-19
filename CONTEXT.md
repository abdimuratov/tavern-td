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
One playthrough of a Game Mode on a Map, from its start to victory or defeat.
_Avoid_: match, game, session

**Difficulty**:
The Easy, Normal, Hard or Insane setting chosen when starting a Run, which scales creep strength. In a Game Mode that recreates a Classic, Normal plays with the Classic's own numbers. In Line Wars it sets the Rival instead: its income and how well its AI plays; creeps are the same on every Difficulty. Versus has none: it always plays Normal, so neither Side's income is scaled. Nor does a Challenge: it always plays Normal, and its rule is what makes it harder.
_Avoid_: level, challenge (a Challenge is a Stage under its own rule, not a Difficulty)

**Record**:
The best result kept on the device for a Game Mode and Difficulty: best Wave reached, score, and fastest win. Element keeps Full and Express Records apart, because their scores don't compare. The Original keeps one per Stage instead: its best Stars, the hardest Difficulty won and the fastest win; and apart from it, one per Challenge once it is won, with its fastest win. Line Wars keeps Runs, wins, fastest win, best score and best steal: the most lives taken in a Run. Versus keeps its own Line Wars board, which each device fills from its own Side.
_Avoid_: high score, achievement, stats

**Save code**:
A Run in progress as copyable text, made by Export save code in the in-Run menu and loaded by Import save code in the main menu. A Versus Run has none, and no autosave.
_Avoid_: save string, password, export

### Play

**Wave**:
One group of creeps sent along the path in a single go. In most Game Modes a Run is a fixed sequence of Waves; Line Wars has none, and every creep in it is a Send.
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
Selling and placing towers mid-Wave so creeps keep turning back and walking the maze again. Maul and Line Wars allow it, as Wintermaul did.
_Avoid_: maze abuse, re-routing

**Race**:
In Maul and Line Wars, the builder chosen at the start of a Run, which fixes the set of towers you can build. In Maul a second Race can join once Wave 15 is cleared; in Line Wars each Side has one Race for the whole Run.
_Avoid_: builder, faction, class

**Wall**:
In Maul and Line Wars, a Race's cheap 2 × 2 block with a weak attack, built to shape the maze. It upgrades into either line's Tier 1 tower of any Race its Side holds.
_Avoid_: rock (Gem's word), blocker, barricade

**Leak**:
A creep reaching the exit. What it costs depends on the Game Mode: in Gem a leak from Wave 10 on ends the Run, and in Element it costs lives and the creep walks the route again. In Line Wars it moves lives from the defending Side to the sender (twice as many in Sudden Death), and the creep is removed.
_Avoid_: escape, breach, pass

**Break**:
The countdown before the next Wave starts on its own. In Element and Maul it starts once a Wave is cleared; in the Original it starts once the Wave's last creep has spawned, so Waves can overlap. "Send now" ends it early. Line Wars has none.
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
The ordered sequence of Stages that makes up the Original, and the progress through it kept on the device: Stage and Challenge Records, Stars and Talents. It is stored apart from Runs, so a Save code holds a Run and never the Campaign.
_Avoid_: story, world, adventure

**Region**:
One of the Campaign's three groups of four Stages (Ashfield, Blightfen, Rift), each with its own palette, enemies and boss.
_Avoid_: world, chapter, act, zone

**Stage**:
One hand-made Map with its own Waves in the Campaign; finishing a Stage unlocks the next and opens its Challenge.
_Avoid_: level, mission, map

**Star**:
A reward of 1–3 for finishing a Stage, or 1 for the first win of a Challenge, spent on Talents that carry across Runs. The Stages pay 36 and the Challenges 12.
_Avoid_: point, medal, crown

**Challenge**:
A Stage played again under one named rule of one or two modifiers (Burnt ground, a Tower cap, some Tower Families only, fewer lives, tougher creeps and so on), which opens once the Stage is won. It always plays Normal with the Talents held, and its first win pays one Star. It keeps its own Record and never touches the Stage's.
_Avoid_: challenge mode, heroic, trial, Difficulty (a Challenge isn't one)

**Tower Level**:
How experienced a single tower is within the current Run, from 1 to 10; towers gain XP from kills and lose it when the Run ends. "Level" means only this.
_Avoid_: rank, veterancy, tier

**Open ground**:
In the Original, every cell of a Stage's Map that is neither road nor Scenery. A 2 × 2 tower may stand on any four of its cells that no tower holds, so it never touches the road and never Blocks.
_Avoid_: plot (Element's word), free ground, buildable (fine in code), grass

**Scenery**:
A named piece of a Stage's Map that nothing is built on: water, a building, a cliff or a pit, such as the Greyriver, the mill or the Rift. It gives the Stage its look and shapes where towers go. Creeps keep to the road, and flyers fly over it.
_Avoid_: obstacle, doodad, rock (Gem's word), terrain (the whole grid)

**Build Spot**:
Retired on 2026-10-19. A fixed 2 × 2 place on a Stage's Map where one tower could stand, before the Original moved to Open ground. Older saves were built on them and the docs' history uses the word, so don't reuse it for anything else.
_Avoid_: plot, pad, slot, tile

**Build ring**:
The ring of unlocked Tower Families, each with its price, that opens around the 2 × 2 of Open ground a tap lands on. Tapping a family shows its Ghost there; tapping it again, or the Ghost, builds. A tap on other Open ground moves the ring there.
_Avoid_: radial menu, build menu (Element's word), wheel

**Burnt ground**:
Open ground a Challenge takes away: Scenery its Map adds, such as The Burnt Mill's lower bend or Glass Slope's middle row, where nothing is built.
_Avoid_: no-build zone, blocked area, scorched

**Tower cap**:
The most towers a Challenge lets stand at once, such as 4 in The Burnt Mill. Selling a tower frees room under it. Outside those Challenges there is none, and gold is the limit.
_Avoid_: tower limit, supply, food, Stock (Line Wars' word)

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

### Line Wars (Line Tower Wars rules)

**Side**:
One of the two players in Line Wars, with its own Field, Race, gold, income, lives and Stock. Against the AI, Side 0 is you and Side 1 the Rival; in Versus, Side 0 is the Host and Side 1 the Guest. Each device shows its Viewer Side as you.
_Avoid_: player (in code), team, slot, seat

**Rival**:
The other Side in Line Wars, as each player sees it: the sim's AI, or in Versus the other person.
_Avoid_: enemy, opponent bot, CPU, computer, AI (in player text)

**Field**:
A Side's own 16 × 28 part of the Line Wars Map, between a spawn strip and an exit strip. Only that Side builds in it, and only the Rival's Sends walk it.
_Avoid_: lane (Element's Lane), line, board, arena

**Divide**:
The band of rock between the two Fields of the Line Wars Map, wider than any tower's reach, so no tower touches the other Field and no creep crosses it.
_Avoid_: wall (Maul's Wall), border, gap, river

**Send**:
A creep, or a pack of them, bought in Line Wars for the Rival's Field. It enters at once and raises the buyer's Income at once and for good.
_Avoid_: summon (Line Tower Wars' word), spawn, attack, wave

**Income**:
The gold a Side is paid each Income tick in Line Wars: 10 plus the income of every Send it has bought.
_Avoid_: interest, salary, upkeep

**Income tick**:
The payout of Income every 10 s in Line Wars, counted down on the HUD.
_Avoid_: payday, round, cycle

**Stock**:
How many of one Send a Side can buy right now. It starts at 1 when the Send unlocks and refills one at a time up to its cap.
_Avoid_: charges, supply, food

**Sudden Death**:
Line Wars from 11:00: Income stops growing, every Income tick takes a life from each Side, Leaks steal double, and new Sends get tougher. It ends every Run by 15:50.
_Avoid_: overtime, endgame, drain mode

### Versus (Line Wars on two devices)

**Versus**:
Line Wars between two people on two devices, connected directly over WebRTC with no server. Each device runs the whole sim in lockstep, and they send each other only commands.
_Avoid_: multiplayer, online, PvP, match, netplay

**Host**:
In Versus, the player who makes the Join code. The Host plays Side 0 and starts the Run, and its state is the one a resync copies.
_Avoid_: server, owner, player 1

**Guest**:
In Versus, the player who joins with the Host's Join code and plays Side 1.
_Avoid_: client, joiner, player 2

**Session**:
In code only (`src/net/session.ts`), one Versus connection's life: Hello, the Lobby, each Run and each Rematch. A session id names each Run, so a rejoin finds it. Never a Run, and never player-facing.
_Avoid_: match, Run, game

**Join code**:
The Host's text that lets a Guest connect, passed on as a link, a QR or a copy. It holds only what can't be rebuilt of WebRTC's offer.
_Avoid_: invite, room code, password, offer (fine in code)

**Answer code**:
The Guest's text that the Host pastes back to finish connecting.
_Avoid_: reply, response, answer on its own (fine in code)

**Turn**:
In Versus, three ticks (100 ms) that step together. No tick of a Turn steps until both players' Batches for it are in.
_Avoid_: frame, round, step, tick (a Turn is three)

**Batch**:
One player's commands for one Turn, sent every Turn even when empty. Each device applies Side 0's Batch before Side 1's, and drops any command in it for the other Side.
_Avoid_: packet, message, input

**Input Delay**:
How many Turns after a tap its command applies: the same for both players, 2 to 5 Turns (200–500 ms), set by the Host from the lobby's ping and fixed for the Run.
_Avoid_: lag, latency (the network's), ping

**Desync**:
The two devices' states disagreeing at a hash check, made once a second. The first is repaired from the Host's state; a second ends the Run with no result.
_Avoid_: divergence, mismatch, out of sync (fine in player text)

**Viewer Side**:
The Side a device shows as you: Side 0, except on a Versus Guest's device, where it is Side 1 and the board is mirrored so its Field is on the right. The sim never knows it.
_Avoid_: local player, perspective, me

**Lobby**:
In Versus, where both players pick their Race and press Ready before a Run, and return to after a Rematch. The Host starts the Run once both are Ready.
_Avoid_: room, waiting room, menu

**Rematch**:
In Versus, both players going back from the end card to the Lobby with their picks, for a new Run with a new seed. It takes the place of single-player's Play again.
_Avoid_: replay (a seed and its commands), restart, play again

**Reconnect**:
In Versus, connecting again after the connection drops, on the same session: the Host makes a new Join code, and the Guest pastes it and sends back a new Answer code. Both then stop on one tick and press Ready.
_Avoid_: retry, resume, ICE restart

**Rejoin**:
In Versus, a Guest whose app restarted taking up its Side again from the Host's state, through the Host's Reconnect code ("Rejoin the Host's Run"). A Host whose app restarted can't be rejoined: its Run is gone.
_Avoid_: reload, restore, resume

**Concede**:
Leaving a Versus Run before it ends, a loss for you and a win for the Rival. After the Rival's app has been gone 2 minutes, the player who stayed may claim the win, which counts as the Rival conceding.
_Avoid_: forfeit, surrender, quit
