import { stageMap } from '../maps';
import type { OriginalWave, StageSpec } from '../types';
import { group as g, wave } from './waves';

// Region 1, Ashfield (docs/original-design.md §11): burning farms, a river and
// the border forts. The risen dead: Ghouls, Hounds, Crawlers, Bloodbats and
// Revenants, and the Gravelord at Fort Harrow's gate.

/**
 * Stage 1, The Mill Road: one S-bend road past a burning mill. The mill and
 * its pond take the middle of each bend's inside, so towers crowd its corners
 * and ends. Ghouls, then Hounds from Wave 5. The road is 5,376 units: about
 * 34 s for a Ghoul, 21 s for a Hound.
 */
const MILL_ROAD_WAVES: readonly OriginalWave[] = [
  wave(g('ghoul', 7, { gap: 1.45 })),
  wave(g('ghoul', 8, { gap: 1.25 })),
  wave(g('ghoul', 13, { gap: 0.9 })),
  wave(g('ghoul', 14, { gap: 0.7 })),
  // Hounds arrive alone, then mix with Ghouls.
  wave(g('hound', 16, { gap: 0.55 })),
  wave(g('ghoul', 9, { gap: 0.65 }), g('hound', 9, { gap: 0.55 })),
  wave(g('ghoul', 15, { gap: 0.5 }), g('hound', 11, { gap: 0.45, at: 3 })),
  wave(g('hound', 31, { gap: 0.3 })),
  wave(g('ghoul', 22, { gap: 0.45 }), g('hound', 13, { gap: 0.4, at: 4 })),
  wave(g('hound', 29, { gap: 0.3 }), g('ghoul', 15, { gap: 0.4 })),
  wave(g('ghoul', 31, { gap: 0.35 }), g('hound', 10, { gap: 0.3 })),
  // The last Wave is the hardest: Hounds catch up with the Ghouls on the second bend.
  wave(g('ghoul', 28, { gap: 0.35 }), g('hound', 25, { gap: 0.3, at: 5 })),
];

export const MILL_ROAD: StageSpec = {
  number: 1,
  id: 'mill-road',
  name: 'The Mill Road',
  region: 'ashfield',
  line: 'The mill burns. The dead come down the road beside it.',
  map: stageMap(
    'mill-road',
    [{
      points: [[0, 192], [1664, 192], [1664, 576], [384, 576], [384, 960], [2048, 960]],
      air: [[0, 192], [1024, 576], [2048, 960]],
    }],
    [
      // The mill inside the first bend, its pond inside the second.
      { kind: 'building', name: 'the mill', at: 'on the mill', rects: [[13, 4, 4, 4]] },
      { kind: 'water', name: 'the millpond', at: 'in the millpond', rects: [[17, 10, 4, 4]] },
    ],
  ),
  threat: 1,
  gold: 250,
  waves: MILL_ROAD_WAVES,
};

/**
 * Stage 2, Greyriver Crossing: a horseshoe road. It crosses the Greyriver
 * (cols 9–12) eastward on the top leg, switches back twice on the east bank,
 * and crosses again westward on the bottom leg. The river splits the west bank
 * from the east, and an island by each bridge holds one tower. Crawlers arrive
 * alone at Wave 4. The road is 5,504 long.
 */
export const GREYRIVER_CROSSING: StageSpec = {
  number: 2,
  id: 'greyriver-crossing',
  name: 'Greyriver Crossing',
  region: 'ashfield',
  line: 'The river runs grey with ash. The dead cross it twice.',
  map: stageMap(
    'greyriver-crossing',
    [{
      points: [[0, 128], [1792, 128], [1792, 512], [1280, 512], [1280, 768], [1792, 768], [1792, 1024], [0, 1024]],
      air: [[0, 128], [768, 576], [0, 1024]],
    }],
    [
      // The whole height of cols 9–12, less the two bridges (the road wins) and
      // the islands at cols 10–11, rows 3–4 and 13–14.
      {
        kind: 'water', name: 'the Greyriver', at: 'in the river',
        rects: [[9, 0, 4, 3], [9, 3, 1, 2], [12, 3, 1, 2], [9, 5, 4, 8], [9, 13, 1, 2], [12, 13, 1, 2], [9, 15, 4, 3]],
      },
    ],
  ),
  threat: 2,
  gold: 270,
  waves: [
    wave(g('ghoul', 8, { gap: 1.25 })),
    wave(g('ghoul', 6), g('hound', 6, { at: 3 })),
    wave(g('hound', 10, { gap: 0.65 }), g('ghoul', 7, { gap: 0.85 })),
    // Crawlers alone, then mixed in.
    wave(g('crawler', 30, { gap: 0.25 })),
    wave(g('ghoul', 10, { gap: 0.6 }), g('crawler', 24, { gap: 0.2 })),
    wave(g('hound', 20, { gap: 0.45 }), g('crawler', 23, { gap: 0.2, at: 2 })),
    wave(g('ghoul', 27, { gap: 0.4 })),
    wave(g('crawler', 44, { gap: 0.15 }), g('ghoul', 15, { gap: 0.5 })),
    wave(g('ghoul', 28, { gap: 0.3 }), g('crawler', 38, { gap: 0.15, at: 4 })),
    wave(g('hound', 32, { gap: 0.25 }), g('crawler', 35, { gap: 0.15 })),
    wave(g('ghoul', 38, { gap: 0.25 }), g('hound', 23, { gap: 0.3, at: 5 })),
    wave(g('ghoul', 39, { gap: 0.2 }), g('hound', 30, { gap: 0.2, at: 4 }), g('hound', 30, { gap: 0.25, at: 7 })),
  ],
};

/**
 * Stage 3, Gallows Hill: the road loops three sides round the hill. The
 * gallows take the hilltop's west shoulder; the crest stands 256 from both
 * legs, so it sees both sides, while Bloodbats (new at Wave 5) cut straight
 * over it. The road is 4,544 long and the air line 2,096. Tier 3 opens here.
 */
export const GALLOWS_HILL: StageSpec = {
  number: 3,
  id: 'gallows-hill',
  name: 'Gallows Hill',
  region: 'ashfield',
  line: 'The road winds round the hanged. The bats fly straight over.',
  map: stageMap(
    'gallows-hill',
    [{
      points: [[0, 640], [576, 640], [576, 256], [1600, 256], [1600, 768], [960, 768], [960, 1088], [2048, 1088]],
      air: [[0, 640], [2048, 1088]],
    }],
    [
      // On the hilltop's west shoulder, between the top and bottom legs.
      { kind: 'building', name: 'the gallows', at: 'on the gallows', rects: [[12, 7, 3, 4]] },
    ],
  ),
  threat: 3,
  gold: 300,
  waves: [
    wave(g('ghoul', 8, { gap: 1.25 })),
    wave(g('hound', 7, { gap: 0.9 }), g('crawler', 9, { gap: 0.4 })),
    wave(g('ghoul', 8), g('hound', 6, { at: 3 })),
    wave(g('crawler', 23, { gap: 0.3 }), g('ghoul', 4)),
    // Bloodbats alone, then mixed in.
    wave(g('bloodbat', 10, { gap: 0.65 })),
    wave(g('ghoul', 10, { gap: 0.8 }), g('bloodbat', 8, { gap: 0.6, at: 3 })),
    wave(g('hound', 18, { gap: 0.5 }), g('crawler', 18, { gap: 0.25, at: 3 })),
    wave(g('bloodbat', 19, { gap: 0.4 })),
    wave(g('ghoul', 14, { gap: 0.55 }), g('crawler', 20, { gap: 0.2 })),
    wave(g('hound', 18, { gap: 0.45 }), g('bloodbat', 15, { gap: 0.4, at: 2 })),
    wave(g('ghoul', 19, { gap: 0.5 }), g('hound', 12, { gap: 0.4 })),
    wave(g('crawler', 41, { gap: 0.2 }), g('bloodbat', 16, { gap: 0.4, at: 3 })),
    wave(g('ghoul', 17, { gap: 0.45 }), g('hound', 17, { gap: 0.4 }), g('bloodbat', 13, { gap: 0.35 })),
    wave(g('ghoul', 23, { gap: 0.45 }), g('crawler', 32, { gap: 0.15, at: 3 }), g('bloodbat', 19, { gap: 0.35, at: 6 })),
  ],
};

/**
 * Stage 4, Fort Harrow: two hairpins down to the gate of the last border
 * fort. The road runs in at the gate between the fort's walls, and its keep
 * holds the south-east. Revenants arrive alone at Wave 5, and the Gravelord
 * leads the last Wave with an escort. The road is 5,120 long. Arcane opens here.
 */
export const FORT_HARROW: StageSpec = {
  number: 4,
  id: 'fort-harrow',
  name: 'Fort Harrow',
  region: 'ashfield',
  line: 'The last border fort. Its gate is the only way south.',
  map: stageMap(
    'fort-harrow',
    [{
      points: [[0, 128], [1792, 128], [1792, 448], [256, 448], [256, 832], [1024, 832], [1024, 1152]],
      air: [[0, 128], [1024, 1152]],
    }],
    [
      // The wall either side of the gate, and the keep.
      { kind: 'building', name: 'the fort', at: 'on the fort', rects: [[0, 16, 15, 2], [17, 16, 15, 2], [22, 10, 10, 6]] },
    ],
  ),
  threat: 4,
  gold: 330,
  waves: [
    wave(g('ghoul', 6, { gap: 1.35 }), g('hound', 3, { gap: 1.05 })),
    wave(g('crawler', 15), g('ghoul', 4)),
    wave(g('bloodbat', 8), g('ghoul', 6)),
    wave(g('hound', 12, { gap: 0.65 }), g('crawler', 12, { gap: 0.3 })),
    // Revenants alone, then mixed in.
    wave(g('revenant', 4, { gap: 1.2 })),
    wave(g('ghoul', 9, { gap: 0.65 }), g('revenant', 2, { at: 3 })),
    wave(g('crawler', 31, { gap: 0.25 }), g('bloodbat', 9, { gap: 0.55 })),
    wave(g('revenant', 3, { gap: 1.05 }), g('hound', 14, { gap: 0.45, at: 2 })),
    wave(g('ghoul', 18, { gap: 0.55 }), g('bloodbat', 15, { gap: 0.45, at: 3 })),
    wave(g('revenant', 8, { gap: 0.8 })),
    wave(g('hound', 16, { gap: 0.55 }), g('crawler', 20, { gap: 0.2, at: 2 })),
    wave(g('ghoul', 13, { gap: 0.45 }), g('revenant', 4, { gap: 0.8 }), g('bloodbat', 13, { gap: 0.35 })),
    wave(g('crawler', 56, { gap: 0.15 }), g('revenant', 5, { gap: 0.65 })),
    wave(g('ghoul', 18, { gap: 0.45 }), g('hound', 12, { gap: 0.35 }), g('bloodbat', 16, { gap: 0.35 })),
    // The Gravelord and his escort.
    wave(g('gravelord', 1), g('revenant', 4, { gap: 0.55, at: 2 }), g('ghoul', 11, { gap: 0.4, at: 4 })),
  ],
};
