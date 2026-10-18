import { stageMap } from '../maps';
import type { StageSpec } from '../types';
import { group as g, wave } from './waves';

// Region 3, Rift (docs/original-design.md §11): the torn northern pass of
// obsidian and fire. The demons come through: Shieldbearers and Gargoyles
// join the horde, and the Riftlord holds the Rift open. No new towers here;
// the Region is about Specialisations and Talents.

/**
 * Stage 9, The Scar: four switchbacks up a burnt slope. Each row of Spots
 * stands between two legs and faces both. Shieldbearers arrive alone at Wave
 * 5. The road is 6,272 long.
 */
export const THE_SCAR: StageSpec = {
  number: 9,
  id: 'the-scar',
  name: 'The Scar',
  region: 'rift',
  line: 'The slope is burnt to glass. They climb it behind shields.',
  map: stageMap(
    'the-scar',
    [{
      points: [[0, 1024], [1664, 1024], [1664, 768], [384, 768], [384, 512], [1664, 512], [1664, 256], [640, 256], [640, 0]],
      air: [[0, 1024], [1664, 640], [640, 0]],
    }],
    [
      [8, 13], [12, 13], [16, 13], [20, 13],
      [8, 9], [12, 9], [16, 9], [20, 9],
      [10, 5], [14, 5], [18, 5], [22, 5],
    ],
  ),
  threat: 11,
  gold: 580,
  waves: [
    wave(g('ghoul', 5, { gap: 1.2 }), g('hound', 5, { gap: 0.95 })),
    wave(g('cultist', 3, { gap: 1.6 }), g('crawler', 9, { gap: 0.4 })),
    wave(g('revenant', 2), g('bloodbat', 6)),
    wave(g('flesh_golem', 3), g('bloater', 3)),
    // Shieldbearers alone, then mixed in.
    wave(g('shieldbearer', 4)),
    wave(g('shieldbearer', 3), g('ghoul', 7, { gap: 0.85 })),
    wave(g('crawler', 24, { gap: 0.3 }), g('bloodbat', 7, { gap: 0.7 })),
    wave(g('shieldbearer', 4, { gap: 1.05 }), g('cultist', 5, { gap: 0.95 })),
    wave(g('revenant', 4, { gap: 1.2 }), g('hound', 11, { gap: 0.6 })),
    wave(g('bloater', 7, { gap: 0.85 }), g('flesh_golem', 4, { gap: 0.9 })),
    wave(g('shieldbearer', 7, { gap: 1 })),
    wave(g('revenant', 4, { gap: 1.95 }), g('bloodbat', 12, { gap: 0.55 }), g('cultist', 5, { gap: 0.7 })),
    wave(g('flesh_golem', 6, { gap: 0.8 }), g('shieldbearer', 5, { gap: 0.85 })),
    wave(g('crawler', 39, { gap: 0.2 }), g('revenant', 3, { gap: 1.05 })),
    wave(g('shieldbearer', 7, { gap: 0.8 }), g('bloater', 7, { gap: 0.7 }), g('bloodbat', 10, { gap: 0.5 })),
    wave(g('cultist', 9, { gap: 0.65 }), g('flesh_golem', 7, { gap: 0.7 })),
    wave(g('revenant', 6, { gap: 0.8 }), g('shieldbearer', 6, { gap: 0.7 }), g('hound', 15, { gap: 0.45 })),
    wave(
      g('shieldbearer', 9, { gap: 0.75 }),
      g('flesh_golem', 5, { gap: 0.7 }),
      g('cultist', 6, { gap: 0.6 }),
      g('bloodbat', 15, { gap: 0.45 }),
    ),
  ],
};

/**
 * Stage 10, Black Cliffs: the road keeps to the cliff the long way round a
 * chasm (cols 13–18), down the west side and up the east, while the air line
 * crosses the gap straight. Gargoyles arrive alone at Wave 5. The road is
 * 5,760 long and the air line 2,048.
 */
export const BLACK_CLIFFS: StageSpec = {
  number: 10,
  id: 'black-cliffs',
  name: 'Black Cliffs',
  region: 'rift',
  line: 'The road keeps to the cliff. The gargoyles do not.',
  map: stageMap(
    'black-cliffs',
    [{
      points: [
        [0, 192], [768, 192], [768, 448], [192, 448], [192, 960], [1792, 960], [1792, 448], [1280, 448], [1280, 192],
        [2048, 192],
      ],
      air: [[0, 192], [2048, 192]],
    }],
    [
      // The west side.
      [5, 4], [8, 4], [6, 0], [4, 8], [4, 12], [9, 12],
      // The cliff edge over the chasm, and its foot.
      [13, 4], [14, 12], [16, 12],
      // The east side.
      [20, 8], [24, 12], [25, 8], [22, 4],
    ],
  ),
  threat: 12,
  gold: 620,
  waves: [
    wave(g('ghoul', 5, { gap: 1.2 }), g('bloodbat', 5, { gap: 0.95 })),
    wave(g('shieldbearer', 3), g('crawler', 8, { gap: 0.45 })),
    wave(g('revenant', 2), g('cultist', 3)),
    wave(g('flesh_golem', 3), g('hound', 8)),
    // Gargoyles alone, then mixed in.
    wave(g('gargoyle', 6)),
    wave(g('gargoyle', 4), g('ghoul', 6)),
    wave(g('bloater', 5), g('crawler', 10)),
    wave(g('gargoyle', 5, { gap: 0.8 }), g('bloodbat', 8)),
    wave(g('shieldbearer', 5, { gap: 1.1 }), g('revenant', 2)),
    wave(g('cultist', 6, { gap: 1 }), g('hound', 9, { gap: 0.7 })),
    wave(g('gargoyle', 7, { gap: 0.85 }), g('flesh_golem', 4, { gap: 0.9 })),
    wave(g('crawler', 29, { gap: 0.3 }), g('bloater', 4, { gap: 0.9 })),
    wave(g('revenant', 4, { gap: 1.2 }), g('gargoyle', 4)),
    wave(g('shieldbearer', 5, { gap: 1.15 }), g('cultist', 5, { gap: 0.95 }), g('bloodbat', 7, { gap: 0.7 })),
    wave(g('flesh_golem', 6, { gap: 1 }), g('hound', 13, { gap: 0.65 })),
    wave(g('gargoyle', 10, { gap: 0.8 })),
    wave(g('revenant', 4, { gap: 1.2 }), g('shieldbearer', 4, { gap: 1.05 }), g('crawler', 19, { gap: 0.25 })),
    wave(
      g('gargoyle', 9, { gap: 0.65 }),
      g('flesh_golem', 5, { gap: 0.95 }),
      g('cultist', 5, { gap: 0.95 }),
      g('shieldbearer', 3, { gap: 0.95 }),
    ),
  ],
};

/** Stage 11's road from where the west road meets the north one, through the south road's join, to the exit. */
const SHARED_TAIL: readonly (readonly [number, number])[] = [
  [640, 576], [1088, 576], [1280, 576], [1280, 128], [1920, 128], [1920, 576], [1600, 576], [1600, 1024], [2048, 1024],
];

/**
 * Stage 11, Three Gates: three spawns on the west side. The north and west
 * roads join first; the south road joins them next, and all three wind
 * together through the east half to the exit. Every creep comes back. Routes
 * are 4,224, 4,032 and 4,224 long, the last 2,944 of each shared.
 */
export const THREE_GATES: StageSpec = {
  number: 11,
  id: 'three-gates',
  name: 'Three Gates',
  region: 'rift',
  line: 'Three gates broken. Three hordes on one road.',
  map: stageMap(
    'three-gates',
    [
      {
        points: [[384, 0], [384, 320], [640, 320], [640, 576], ...SHARED_TAIL],
        air: [[384, 0], [1280, 576], [2048, 1024]],
      },
      {
        points: [[0, 576], ...SHARED_TAIL],
        air: [[0, 576], [1280, 576], [2048, 1024]],
      },
      {
        points: [[384, 1152], [384, 832], [1088, 832], ...SHARED_TAIL.slice(1)],
        air: [[384, 1152], [1280, 576], [2048, 1024]],
      },
    ],
    [
      // Where the north and west roads join.
      [3, 6], [7, 6], [7, 2], [12, 6], [16, 6],
      // Between the west and south roads, where the south road joins.
      [8, 10], [12, 10], [14, 10], [10, 14],
      // The shared road's bends.
      [21, 3], [27, 3], [24, 6], [22, 11], [26, 12],
    ],
  ),
  threat: 13,
  gold: 660,
  waves: [
    wave(g('ghoul', 3, { gap: 1.35 }), g('ghoul', 3, { route: 1, gap: 1.35, at: 0 }), g('ghoul', 3, { route: 2, gap: 1.35, at: 0 })),
    wave(g('hound', 6, { route: 1, gap: 1.05 }), g('crawler', 8, { route: 2, gap: 0.45, at: 0 })),
    wave(g('revenant', 2), g('bloodbat', 5, { route: 1, gap: 0.95, at: 0 })),
    wave(g('cultist', 2, { route: 2, gap: 1.8 }), g('flesh_golem', 2, { gap: 1.8, at: 0 })),
    wave(g('bloater', 3, { route: 1, gap: 1.6 }), g('shieldbearer', 2, { route: 2, at: 0 })),
    wave(g('gargoyle', 3, { gap: 1.35 }), g('hound', 5, { route: 2, gap: 0.95, at: 0 })),
    wave(g('crawler', 9, { gap: 0.45 }), g('crawler', 9, { route: 1, gap: 0.45, at: 0 }), g('crawler', 9, { route: 2, gap: 0.45, at: 0 })),
    wave(g('revenant', 2, { route: 1 }), g('cultist', 3, { gap: 1.6, at: 0 })),
    wave(g('flesh_golem', 3, { route: 2 }), g('bloodbat', 6, { gap: 1.05, at: 0 })),
    wave(g('shieldbearer', 3), g('bloater', 4, { route: 1, at: 0 }), g('revenant', 1, { route: 2, gap: 4, at: 0 })),
    wave(g('hound', 4, { gap: 1.2 }), g('hound', 4, { route: 1, gap: 1.2, at: 0 }), g('hound', 4, { route: 2, gap: 1.2, at: 0 })),
    wave(g('gargoyle', 4, { route: 1, gap: 1.5 }), g('revenant', 2, { route: 2, at: 0 })),
    wave(g('cultist', 3, { gap: 1.6 }), g('flesh_golem', 3, { route: 1, at: 0 }), g('crawler', 10, { route: 2, gap: 0.45, at: 0 })),
    wave(g('shieldbearer', 3, { route: 2 }), g('bloodbat', 6, { gap: 1.05, at: 0 }), g('bloater', 3, { route: 1, at: 0 })),
    wave(g('revenant', 3), g('gargoyle', 3, { route: 2, gap: 1.35, at: 0 })),
    wave(
      g('flesh_golem', 2, { gap: 1.8 }),
      g('flesh_golem', 2, { route: 1, gap: 1.8, at: 0 }),
      g('flesh_golem', 2, { route: 2, gap: 1.8, at: 0 }),
    ),
    wave(g('cultist', 3, { route: 1, gap: 1.6 }), g('shieldbearer', 2, { gap: 2.1, at: 0 }), g('hound', 8, { route: 2, at: 0 })),
    wave(g('bloater', 3, { gap: 1.6 }), g('bloater', 3, { route: 2, gap: 1.6, at: 0 }), g('gargoyle', 6, { route: 1, at: 0 })),
    wave(
      g('revenant', 2),
      g('revenant', 2, { route: 1, at: 0 }),
      g('revenant', 2, { route: 2, at: 0 }),
      g('bloodbat', 4, { route: 1, gap: 1.2 }),
    ),
    wave(
      g('shieldbearer', 3, { gap: 1.4 }),
      g('flesh_golem', 2, { route: 1, gap: 1.8, at: 0 }),
      g('cultist', 2, { route: 2, gap: 1.8, at: 0 }),
      g('gargoyle', 3, { route: 1, gap: 1.35 }),
      g('crawler', 12, { gap: 0.35 }),
    ),
  ],
};

/**
 * Stage 12, Riftmaw: the longest road. It rings the Rift twice, closing in,
 * then turns north across its own outer ring and up to the pass. The Riftlord
 * leads the last Wave. The road is 7,744 long.
 */
export const RIFTMAW: StageSpec = {
  number: 12,
  id: 'riftmaw',
  name: 'Riftmaw',
  region: 'rift',
  line: 'The Rift stands open. Its lord holds it.',
  map: stageMap(
    'riftmaw',
    [{
      points: [[0, 1024], [1856, 1024], [1856, 192], [256, 192], [256, 768], [1536, 768], [1536, 448], [704, 448], [704, 0]],
      air: [[0, 1024], [1344, 640], [704, 0]],
    }],
    [
      // Between the outer ring's south side and the inner ring.
      [6, 13], [11, 13], [16, 13], [21, 13],
      // Between the outer ring's north side and the inner ring.
      [6, 4], [13, 4], [17, 4], [21, 4],
      // At the Rift's edge, inside the inner ring.
      [9, 9], [14, 8], [19, 9], [21, 8],
      // Beside the east and west sides.
      [25, 8], [1, 6],
    ],
  ),
  threat: 14,
  gold: 700,
  waves: [
    wave(g('ghoul', 5, { gap: 1.2 }), g('hound', 5, { gap: 0.95 })),
    wave(g('crawler', 11, { gap: 0.45 }), g('bloodbat', 5, { gap: 0.95 })),
    wave(g('revenant', 2), g('cultist', 3)),
    wave(g('flesh_golem', 3), g('bloater', 3)),
    wave(g('shieldbearer', 3), g('hound', 5, { gap: 0.95 })),
    wave(g('gargoyle', 5), g('ghoul', 4)),
    wave(g('cultist', 4), g('crawler', 13, { gap: 0.4 })),
    wave(g('revenant', 3), g('bloodbat', 8)),
    wave(g('flesh_golem', 4), g('shieldbearer', 2)),
    wave(g('bloater', 5), g('gargoyle', 4)),
    wave(g('hound', 12), g('crawler', 16)),
    wave(g('cultist', 5), g('revenant', 2)),
    wave(g('shieldbearer', 4), g('flesh_golem', 3)),
    wave(g('gargoyle', 6), g('bloodbat', 9, { gap: 0.7 })),
    wave(g('bloater', 7, { gap: 1.05 }), g('cultist', 4)),
    wave(g('revenant', 3), g('shieldbearer', 3), g('hound', 7, { gap: 0.7 })),
    wave(g('flesh_golem', 6, { gap: 1 }), g('gargoyle', 5, { gap: 0.8 }), g('crawler', 14, { gap: 0.3 })),
    wave(g('cultist', 6, { gap: 1 }), g('bloater', 6, { gap: 1 }), g('bloodbat', 9, { gap: 0.7 })),
    wave(g('shieldbearer', 5, { gap: 1.1 }), g('revenant', 4, { gap: 1.2 }), g('gargoyle', 5, { gap: 0.8 })),
    // The Riftlord and his guard; he calls Hounds as he breaks.
    wave(g('riftlord', 1), g('shieldbearer', 2, { at: 2 }), g('gargoyle', 4, { gap: 0.75, at: 4 })),
  ],
};
