import { stageMap } from '../maps';
import type { StageSpec } from '../types';
import { group as g, wave } from './waves';

// Region 3, Rift (docs/original-design.md §11): the torn northern pass of
// obsidian and fire. The demons come through: Shieldbearers and Gargoyles
// join the horde, and the Riftlord holds the Rift open. No new towers here;
// the Region is about Specialisations and Talents.

/**
 * Stage 9, The Scar: four switchbacks up a burnt slope. Each strip between
 * two legs faces both. The crags shut out the ground west of the exit leg,
 * and the cliff edge leaves a two-cell strip outside the east legs.
 * Shieldbearers arrive alone at Wave 5. The road is 6,272 long.
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
      { kind: 'cliff', name: 'the crags', at: 'on the crags', rects: [[0, 0, 9, 5]] },
      { kind: 'cliff', name: 'the cliff edge', at: 'on the cliff edge', rects: [[29, 0, 3, 18]] },
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
    wave(g('crawler', 40, { gap: 0.2 }), g('revenant', 3, { gap: 1.05 })),
    wave(g('shieldbearer', 7, { gap: 0.8 }), g('bloater', 7, { gap: 0.7 }), g('bloodbat', 10, { gap: 0.5 })),
    wave(g('cultist', 9, { gap: 0.65 }), g('flesh_golem', 7, { gap: 0.7 })),
    wave(g('revenant', 6, { gap: 0.8 }), g('shieldbearer', 6, { gap: 0.7 }), g('hound', 16, { gap: 0.42 })),
    wave(
      g('shieldbearer', 9, { gap: 0.75 }),
      g('flesh_golem', 5, { gap: 0.7 }),
      g('cultist', 6, { gap: 0.6 }),
      g('bloodbat', 16, { gap: 0.42 }),
    ),
  ],
};

/**
 * Stage 10, Black Cliffs: the road keeps to the cliff the long way round a
 * chasm (cols 13–18), down the west side and up the east, while the air line
 * crosses the gap straight. A ledge (cols 13–14, rows 4–5) stands over the
 * chasm, which splits the loop's inside down to its foot. Gargoyles arrive
 * alone at Wave 5. The road is 5,760 long and the air line 2,048.
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
      // Down to row 11, less the ledge.
      { kind: 'pit', name: 'the chasm', at: 'in the chasm', rects: [[15, 0, 4, 12], [13, 0, 2, 4], [13, 6, 2, 6]] },
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
    wave(g('flesh_golem', 6, { gap: 1 }), g('hound', 14, { gap: 0.6 })),
    wave(g('gargoyle', 11, { gap: 0.73 })),
    wave(g('revenant', 4, { gap: 1.2 }), g('shieldbearer', 4, { gap: 1.05 }), g('crawler', 20, { gap: 0.24 })),
    wave(
      g('gargoyle', 10, { gap: 0.59 }),
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
 * together through the east half to the exit. The broken wall leaves nothing
 * beside the gates, so towers go to the joins. Every creep comes back. Routes
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
      // Beside the gates, north and south of the west road.
      { kind: 'building', name: 'the broken wall', at: 'on the broken wall', rects: [[0, 0, 5, 6], [0, 10, 5, 8]] },
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
    wave(g('cultist', 3, { gap: 1.6 }), g('flesh_golem', 3, { route: 1, at: 0 }), g('crawler', 11, { route: 2, gap: 0.41, at: 0 })),
    wave(g('shieldbearer', 3, { route: 2 }), g('bloodbat', 7, { gap: 0.9, at: 0 }), g('bloater', 3, { route: 1, at: 0 })),
    wave(g('revenant', 3), g('gargoyle', 3, { route: 2, gap: 1.35, at: 0 })),
    wave(
      g('flesh_golem', 2, { gap: 1.8 }),
      g('flesh_golem', 2, { route: 1, gap: 1.8, at: 0 }),
      g('flesh_golem', 2, { route: 2, gap: 1.8, at: 0 }),
    ),
    wave(g('cultist', 4, { route: 1, gap: 1.2 }), g('shieldbearer', 2, { gap: 2.1, at: 0 }), g('hound', 9, { route: 2, gap: 0.71, at: 0 })),
    wave(g('bloater', 4, { gap: 1.2 }), g('bloater', 4, { route: 2, gap: 1.2, at: 0 }), g('gargoyle', 7, { route: 1, gap: 0.86, at: 0 })),
    wave(
      g('revenant', 2),
      g('revenant', 2, { route: 1, at: 0 }),
      g('revenant', 2, { route: 2, at: 0 }),
      g('bloodbat', 5, { route: 1, gap: 0.96 }),
    ),
    wave(
      g('shieldbearer', 4, { gap: 1.05 }),
      g('flesh_golem', 3, { route: 1, gap: 1.2, at: 0 }),
      g('cultist', 3, { route: 2, gap: 1.2, at: 0 }),
      g('gargoyle', 4, { route: 1, gap: 1.01 }),
      g('crawler', 15, { gap: 0.28 }),
    ),
  ],
};

/**
 * Stage 12, Riftmaw: the longest road. It rings the Rift twice, closing in,
 * then turns north across its own outer ring and up to the pass. The Rift
 * fills the inner ring; only its rim and the ring's west end stay open. The
 * Riftlord leads the last Wave. The road is 7,744 long.
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
      // Inside the inner ring.
      { kind: 'pit', name: 'the Rift', at: 'in the Rift', rects: [[11, 8, 3, 3], [14, 10, 2, 1], [16, 8, 3, 3]] },
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
    wave(g('revenant', 3), g('shieldbearer', 3), g('hound', 8, { gap: 0.61 })),
    wave(g('flesh_golem', 7, { gap: 0.86 }), g('gargoyle', 6, { gap: 0.67 }), g('crawler', 16, { gap: 0.26 })),
    wave(g('cultist', 7, { gap: 0.86 }), g('bloater', 7, { gap: 0.86 }), g('bloodbat', 10, { gap: 0.63 })),
    wave(g('shieldbearer', 6, { gap: 0.92 }), g('revenant', 5, { gap: 0.96 }), g('gargoyle', 6, { gap: 0.67 })),
    // The Riftlord and his guard; he calls Hounds as he breaks.
    wave(g('riftlord', 1), g('shieldbearer', 2, { at: 2 }), g('gargoyle', 5, { gap: 0.6, at: 4 })),
  ],
};
