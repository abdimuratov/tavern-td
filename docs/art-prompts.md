# Art prompts

Prompts for ChatGPT's image generator. They make 14 sprite sheets for the Original's and Maul's towers and creeps (Line Wars and Versus reuse Maul's). Gem, Element, terrain, Scenery, effects and the menus stay drawn in code (PLAN §1).

## How to use them

1. Open **one** new ChatGPT chat for all 14 sheets, so the style stays the same.
2. Send the style block below as the first message. It asks ChatGPT not to draw yet.
3. Send the sheet prompts one at a time. Once a sheet comes out well (the Arrow sheet, say), attach it to each later prompt and add "Match the style of the attached sheet exactly."
4. Redo a sheet if it has text or labels, an item missing or doubled, items touching, a shadow or glow around them, a ground tile under them, or a checkered or tinted background. You can also ask, for example, "Same sheet, but make the background flat white and remove the labels."
5. Download each sheet at full size as a PNG named by its number: `01-arrow.png` … `14-maul-bosses.png`. Put them in `art/sheets/` in the repo, or send them to me.

I'll find each sprite on the white, cut it out, take away the white around it and name it by its place in the order below. The grid doesn't have to be exact, as long as items don't touch.

## The style

Write it once, at the start of the chat:

```text
For every image in this chat, use this style. I'll call it the Tavern TD style. Don't make an image yet: reply "Ready" and wait for my sprite sheets.

Tavern TD style: 2D game sprites for a grim dark-fantasy tower defense game, painted like chunky tabletop miniatures seen from above.
- View: a high three-quarter top-down view, looking down at about 70 degrees, so you mostly see the top and a sliver of the front. Same angle and same light for every sprite. Towers stand on a square footprint, about as deep as they are wide. Creatures face right.
- Shapes: bold, chunky and simple, slightly exaggerated (stout towers, big heads, big weapons). One clear silhouette that still reads when shrunk to 24 pixels. No thin spikes, no tiny details, no busy texture.
- Line: a thick, even, near-black brown outline (#1A1410) around every sprite's outer edge, with thinner dark lines inside.
- Shading: flat cel shading with 3 tones per colour, lit from the top left. No airbrushed gradients, no photorealism, no 3D-render look.
- Palette: muted and weathered (old wood, dark iron, bone, cold stone, ash), plus ONE bright accent colour per sprite, which I give with each sheet. Magic parts are painted bright but never glow past the outline.
- Tone: grim and serious, never cute or comic, and not gory: no blood, no wounds.
- Each sprite stands alone: no ground, no base tile, no cast shadow, no glow, no smoke or effects spilling out, no text, no numbers, no frame.
- Background: flat pure white (#FFFFFF), perfectly even from edge to edge.

Sprite sheet rules: the image is an invisible grid of equal cells. Exactly one sprite per cell, centred, all drawn at the same size, each filling about 70% of its cell with clear white space on every side. Nothing touches or crosses into another cell. No grid lines, no labels. Fill the cells left to right, top to bottom, in the order I list. Small creatures are drawn as big as large ones, because the game scales them.
```

## The sheets

| # | Sheet | Shape | Grid | Items |
|---|---|---|---|---|
| 1 | Original: Arrow | landscape 3:2 | 3 × 2 | 5 towers + emblem |
| 2 | Original: Cannon | landscape 3:2 | 3 × 2 | 5 towers + emblem |
| 3 | Original: Frost | landscape 3:2 | 3 × 2 | 5 towers + emblem |
| 4 | Original: Arcane | landscape 3:2 | 3 × 2 | 5 towers + emblem |
| 5 | Original: Poison | landscape 3:2 | 3 × 2 | 5 towers + emblem |
| 6 | Original: Totem | landscape 3:2 | 3 × 2 | 5 towers + emblem |
| 7 | Original: creeps 1 | landscape 3:2 | 4 × 2 | 8 creeps |
| 8 | Original: creeps 2 and bosses | landscape 3:2 | 3 × 2 | 2 creeps, 1 empty, 3 bosses |
| 9 | Maul: Ironclad | square | 3 × 3 | 9 towers |
| 10 | Maul: Rimeborn | square | 3 × 3 | 9 towers |
| 11 | Maul: Mirefolk | square | 3 × 3 | 9 towers |
| 12 | Maul: Runecasters | square | 3 × 3 | 9 towers |
| 13 | Maul: creeps | landscape 3:2 | 4 × 2 | 8 creeps |
| 14 | Maul: bosses | square | 2 × 2 | 4 bosses |

Each Original tower sheet ends with the family's emblem: a flat badge for the build ring, the Talent trees and the Waves & Towers sheet.

### 1. Original: Arrow

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows, 6 items.
The Arrow family: archers' towers of weathered timber, rope and iron bands. Accent colour: warm wood brown (#B07A46), with pale straw-coloured fletching. They grow from crude to grand.
Top row:
1. Arrow Tower: a small square platform of lashed logs with a short bow mounted on top.
2. Longbow Tower: a taller timber tower with iron-banded corners and a big longbow on top.
3. Marksman Tower: a stone base under a timber top, a shingled roof with an archer's window and a small pennant.
Bottom row:
4. Ranger Lodge: a wide timber lodge with three bows facing three ways and bundles of arrows.
5. Deadeye Perch: a tall, narrow stone-and-timber perch with one huge great-bow aimed forward and a hooded sniper's nest.
6. The Arrow family's emblem: a flat round badge with a single arrowhead, seen straight on, for a menu button.
```

### 2. Original: Cannon

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows, 6 items.
The Cannon family: siege towers of stone, black iron and rivets. Accent colour: iron grey (#8E949C), with brass fittings. They grow from crude to grand.
Top row:
1. Cannon Tower: a round stone emplacement with one short iron cannon.
2. Bombard: a larger round stone fort with a thick riveted bombard barrel.
3. Great Bombard: a heavy eight-sided stone fortress with a huge black cannon and powder kegs.
Bottom row:
4. Thunder Mortar: a squat stone bunker with a wide mortar tube pointing up and a stack of round shells.
5. Flak Battery: a turning gun platform with four short barrels angled at the sky, ringed with sandbags.
6. The Cannon family's emblem: a flat round badge with a cannonball and a lit fuse, seen straight on, for a menu button.
```

### 3. Original: Frost

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows, 6 items.
The Frost family: towers of grey stone and ice crystal, rimed with frost. Accent colour: ice blue (#7CC8F2), with white frost. They grow from crude to grand.
Top row:
1. Frost Tower: a short stone pillar topped with a single pale blue ice crystal.
2. Ice Spire: a six-sided stone tower with a cluster of ice crystals and frost on its edges.
3. Glacier Spire: a tall six-sided spire of grey stone and blue ice with a big crystal floating above it.
Bottom row:
4. Blizzard Spire: a frost spire wrapped in a tight ring of ice shards swirling close around it, all inside its cell.
5. Rime Lance: a frost spire holding a long, sharp lance of ice that points forward.
6. The Frost family's emblem: a flat round badge with a six-pointed snowflake, seen straight on, for a menu button.
```

### 4. Original: Arcane

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows, 6 items.
The Arcane family: mage towers of dark slate with pale gold trim and violet crystals. Accent colour: violet (#A070E8). They grow from crude to grand.
Top row:
1. Mage Tower: a small round stone tower with a violet orb on top.
2. Sorcerer Tower: a taller tower with a pointed slate roof and violet runes on its walls.
3. Archmage Tower: a grand tower with a diamond-shaped violet crystal floating above a ring of runes.
Bottom row:
4. Arcane Lance: a tower crowned by a focusing crystal and a narrow lens aimed forward, made to fire a beam.
5. Prism Tower: a tower crowned by a large faceted prism crystal with several sharp points.
6. The Arcane family's emblem: a flat round badge with a violet diamond and a rune, seen straight on, for a menu button.
```

### 5. Original: Poison

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows, 6 items.
The Poison family: towers of dark wood, black iron, copper pipes and green glass. Accent colour: acid green (#8FD448). They grow from crude to grand.
Top row:
1. Venom Dart: a small reed-and-wood hut with a blowpipe launcher and a green vial.
2. Venom Spitter: a bigger hut with a bubbling green vat feeding its launcher.
3. Venom Spire: a dark wooden tower with copper drip pipes and a large green glass bulb.
Bottom row:
4. Plague Cauldron: a wide iron cauldron of bubbling green brew on a stone base, with a catapult arm to lob it.
5. Widow's Fang: a black spire shaped like a crouching spider with one huge fang dripping green venom.
6. The Poison family's emblem: a flat round badge with a green venom drop, seen straight on, for a menu button.
```

### 6. Original: Totem

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows, 6 items.
The Totem family: carved wooden totems with hide, bone and feathers. Accent colour: red ochre (#C0603A). They grow from crude to grand.
Top row:
1. Drum Totem: a short carved post with a hide war drum.
2. Spirit Totem: a taller totem pole with carved spirit masks and feathers.
3. Ancestor Totem: a big totem of three stacked ancestor faces between two small braziers.
Bottom row:
4. War Totem: a totem with crossed axes, horned animal skulls and red war banners.
5. Storm Totem: a totem crowned by a carved thunderbird, with blue lightning crackling between its wings.
6. The Totem family's emblem: a flat round badge with a carved totem face, seen straight on, for a menu button.
```

### 7. Original: creeps 1

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 4 columns × 2 rows, 8 items.
The horde of a burning frontier: the risen dead and the plague that follows them. Every creature faces right, in mid-stride or mid-flight, from the same high three-quarter view.
Top row:
1. Ghoul (grey-green #9AA58A): a hunched undead ghoul with long arms and ragged cloth.
2. Hound (rust brown #B8673E): a lean undead hound running, ribs showing under its hide.
3. Crawler (bone #D8CFB4): a small pale many-legged grub, low to the ground.
4. Bloodbat (dark red #C8323C): a big red bat flying, wings spread wide.
Bottom row:
5. Revenant (steel grey #8D9097): a skeletal knight in heavy dented plate armour with a round shield.
6. Cultist (purple #8A52AA): a hooded, robed cultist holding a staff topped with a violet ward sigil.
7. Flesh Golem (dusty pink #C98A7A): a hulking brute stitched together from parts, with stitches and iron staples.
8. Bloater (sickly yellow-green #B4C04A): a swollen, round, bloated plague zombie.
```

### 8. Original: creeps 2 and bosses

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 3 columns × 2 rows: 5 items and one empty cell.
More of the horde, then its three bosses. Every creature faces right, from the same high three-quarter view. The bosses are more detailed and imposing, but drawn at the same size as the others.
Top row:
1. Shieldbearer (steel blue #6F8FB0): an undead soldier behind a tall tower shield.
2. Gargoyle (stone grey #9A948A): a stone gargoyle flying, wings spread.
3. Leave this cell completely white.
Bottom row:
4. Gravelord (bone white #E6DCC0): a skeletal warlord with an iron crown, a great sword and a tattered cloak.
5. Plague Mother (sick green #8FAE3C): a swollen horror, a huge bloated body covered in sacs, dragging itself on thin limbs.
6. Riftlord (hellfire orange #FF6A2A on black obsidian): a huge horned demon lord of obsidian, with fiery cracks and folded wings.
```

### 9. Maul: Ironclad

```text
Tavern TD style. One sprite sheet, square, a grid of 3 columns × 3 rows, 9 items.
The Ironclad: stout iron-and-brass siege engineering for a frozen northern crossing. Accent colour: brass (#D9A35C), on dark iron with rivets. Item 1 is a wall: a square block that fills its footprint, so a row of them reads as one wall.
Top row:
1. Bulwark: a squat square block of riveted iron plates on stone, with brass trim.
2. Ballista: a small wood-and-iron ballista on a square platform.
3. Mortar: a short iron mortar tube on a square stone platform.
Middle row:
4. Heavy Ballista: a bigger ballista with doubled arms and a thick bolt.
5. Skypiercer: a tall ballista tower with a very long bolt aimed high.
6. Repeater: a ballista loaded with three bolts side by side.
Bottom row:
7. Siege Mortar: a heavier riveted mortar beside crates of shells.
8. Thunder Mortar: a mortar wrapped in copper coils, with blue sparks.
9. Bombard: a huge long-barrelled brass bombard.
```

### 10. Maul: Rimeborn

```text
Tavern TD style. One sprite sheet, square, a grid of 3 columns × 3 rows, 9 items.
The Rimeborn: frost-carvers of a frozen northern crossing, building in packed ice, pale stone and white fur. Accent colour: ice blue (#7FD0FF). Item 1 is a wall: a square block that fills its footprint, so a row of them reads as one wall.
Top row:
1. Rime Wall: a square block of packed ice and pale stone.
2. Frost Spire: a short stone spire with an ice crystal point.
3. Chill Totem: a carved stone-and-ice totem with a frosty face.
Middle row:
4. Frost Lance: a taller spire with a long ice lance on top.
5. Glacier Spike: a massive, heavy ice spike on a stone base.
6. Hailcaller: a spire with four small ice crystals floating around it.
Bottom row:
7. Rime Totem: a taller frosty totem hung with icicles.
8. Blizzard Totem: a totem in a tight swirl of snow, kept inside its cell.
9. Shatter Totem: a totem bristling with cracked, jagged shards of ice.
```

### 11. Maul: Mirefolk

```text
Tavern TD style. One sprite sheet, square, a grid of 3 columns × 3 rows, 9 items.
The Mirefolk: swamp folk who build from reeds, bone, gourds and dark mud-soaked wood. Accent colour: swamp green (#8BD65A). Item 1 is a wall: a square block that fills its footprint, so a row of them reads as one wall.
Top row:
1. Bramble: a square tangle of thorny brambles and roots.
2. Dart Tower: a reed hut with a blowpipe and a green venom gourd.
3. Spore Pod: a big round mushroom pod on a mossy stump.
Middle row:
4. Viper Tower: a wooden post with a carved coiled viper on top.
5. Asp Spire: a tall spire wrapped by a huge carved asp, fangs bared.
6. Spitter: a reed tower with four spouts pointing outward.
Bottom row:
7. Plague Pod: a larger, bulging spore pod with several caps.
8. Blight Pod: a dark rotting pod with purple blotches.
9. Rot Bloom: a huge, rotting carnivorous flower.
```

### 12. Maul: Runecasters

```text
Tavern TD style. One sprite sheet, square, a grid of 3 columns × 3 rows, 9 items.
The Runecasters: carved grey standing stones and stone discs with glowing violet runes. Accent colour: violet (#B88CFF). Item 1 is a wall: a square block that fills its footprint, so a row of them reads as one wall.
Top row:
1. Runestone: a squat, square standing stone carved with one violet rune.
2. Spark Rune: an upright stone with a crackling violet rune.
3. Glyph: a flat round stone disc carved with a violet glyph.
Middle row:
4. Storm Rune: a taller stone carved with storm runes, small violet sparks around it.
5. Chain Rune: a stone wrapped in a chain of linked rune plates.
6. Void Rune: a black stone split by a deep purple crack.
Bottom row:
7. Sigil: a larger carved stone disc ringed with sigils.
8. Nova Circle: a wide ring of small standing stones around a violet starburst.
9. Ley Shrine: a small stone shrine with a violet flame, lines carved outward from it.
```

### 13. Maul: creeps

```text
Tavern TD style. One sprite sheet, landscape 3:2, a grid of 4 columns × 2 rows, 8 items.
Raiders and beasts of the frozen north. Every creature faces right, in mid-stride or mid-flight, from the same high three-quarter view.
Top row:
1. Brawler (tan #D9C7A3): a stocky raider in furs with a club.
2. Snowling (snow white #EEF6FF): a tiny round snow imp.
3. Sleet Hound (grey-blue #9FB8C8): a lean grey-blue wolf running.
4. Brute (ochre #C0875A): a big ogre-like brute in thick hide armour.
Bottom row:
5. Ice Golem (blue-grey #8FA3B0): a golem built from blocks of blue-grey ice and stone.
6. Troll (moss green #7FB36A): a lanky green troll with long arms.
7. Hollow (pale lavender #B9A8E0): a ghostly hooded wraith with no legs, its mist kept inside its cell.
8. Harpy (sky blue #9FD2FF): a harpy flying, wings spread.
```

### 14. Maul: bosses

```text
Tavern TD style. One sprite sheet, square, a grid of 2 columns × 2 rows, 4 items.
The four bosses of the frozen north, more detailed and imposing. Every creature faces right, from the same high three-quarter view.
Top row:
1. Tusked Warlord (orange #E08A4C): a tusked warlord in a horned helm and fur cloak, with a great axe.
2. War Mammoth (brown #A89078): a woolly war mammoth with armour plates and a small war platform on its back.
Bottom row:
3. Glacier Colossus (ice blue #9FC6D9): a towering giant made of glacier ice.
4. The Winter King (frost white #E6F2FF): a regal frost king with an ice crown, an icicle cloak and a frozen sceptre.
```

## How the game uses them

- `pnpm sprites` cuts `art/sheets/*.webp` into `src/assets/art/<original|maul>/<id>.webp`, 256 × 256 each. To replace a sheet, save the new one over the old file and run it again. If an item's art doesn't match the order above, fix the ids in `tools/sprites.mjs`, not the image.
- Sprites replace the shapes only where one exists; everything else stays a shape. A sprite tower has no plate.
- Tier pips, the Specialisation crest, the Tower Level and halos stay drawn by the game, over or under the sprite.
- Creatures face right. The game mirrors one while it moves left, instead of turning it, flyers included.
- Status effects (frozen, poisoned, slowed, enraged) tint the sprite.
- Each accent colour matches the colour the game already used, so the wave preview's dots and the HUD's chips still match.
