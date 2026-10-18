import { stageMap } from '../maps';
import type { StageSpec } from '../types';
import { group as g, wave } from './waves';

// Region 2, Blightfen (docs/original-design.md §11): plague marsh and drowned
// villages. Plague and its cults: Cultists, Flesh Golems and Bloaters join the
// dead, and the Plague Mother waits in the Blight Pit.

/**
 * Stage 5, Drowned Causeway: the causeway zigzags north and south through the
 * marsh, with Spots in pairs between its legs. Cultists arrive alone at Wave
 * 4. The road is 5,888 long. Poison opens here.
 */
export const DROWNED_CAUSEWAY: StageSpec = {
  number: 5,
  id: 'drowned-causeway',
  name: 'Drowned Causeway',
  region: 'blightfen',
  line: 'The marsh took the villages. Only the causeway stands above the water.',
  map: stageMap(
    'drowned-causeway',
    [{
      points: [
        [0, 192], [384, 192], [384, 960], [768, 960], [768, 192], [1152, 192], [1152, 960], [1536, 960], [1536, 192],
        [1920, 192], [1920, 960], [2048, 960],
      ],
      air: [[0, 192], [2048, 960]],
    }],
    [
      // A pair between each two legs.
      [7, 6], [9, 6], [13, 9], [15, 9], [19, 6], [21, 6], [25, 9], [27, 9],
      // Beside the first leg, and above and below the turns.
      [3, 8], [13, 0], [19, 16],
    ],
  ),
  threat: 6,
  gold: 400,
  waves: [
    wave(g('ghoul', 10)),
    wave(g('hound', 9, { gap: 0.7 }), g('crawler', 11, { gap: 0.3 })),
    wave(g('revenant', 2), g('ghoul', 5, { gap: 0.8 })),
    // Cultists alone, then mixed in.
    wave(g('cultist', 7, { gap: 0.85 })),
    wave(g('ghoul', 9, { gap: 0.65 }), g('cultist', 6, { gap: 0.8 })),
    wave(g('bloodbat', 16, { gap: 0.5 })),
    wave(g('cultist', 7, { gap: 0.7 }), g('crawler', 24, { gap: 0.2 })),
    wave(g('revenant', 5, { gap: 0.95 }), g('hound', 11, { gap: 0.45 })),
    wave(g('revenant', 5, { gap: 1.65 }), g('bloodbat', 15, { gap: 0.45 })),
    wave(g('cultist', 12, { gap: 0.6 }), g('revenant', 4, { gap: 0.8 })),
    wave(g('crawler', 44, { gap: 0.15 }), g('hound', 15, { gap: 0.45 })),
    wave(g('cultist', 11, { gap: 0.55 }), g('bloodbat', 18, { gap: 0.35 })),
    wave(g('cultist', 9, { gap: 0.7 }), g('revenant', 5, { gap: 0.65 }), g('cultist', 7, { gap: 0.5 })),
    wave(g('hound', 26, { gap: 0.3 }), g('crawler', 26, { gap: 0.15 }), g('bloodbat', 13, { gap: 0.35 })),
    wave(g('cultist', 15, { gap: 0.4 }), g('revenant', 6, { gap: 0.55 }), g('revenant', 3, { gap: 1.35 })),
  ],
};

/**
 * Stage 6, Sunken Chapel: the road spirals in to the drowned chapel. The
 * centre Spots stand between the inner legs and reach three stretches of the
 * spiral. Flesh Golems arrive alone at Wave 5. The road is 6,016 long.
 * Specialisations open here.
 */
export const SUNKEN_CHAPEL: StageSpec = {
  number: 6,
  id: 'sunken-chapel',
  name: 'Sunken Chapel',
  region: 'blightfen',
  line: 'The road winds down to the drowned chapel. Its dead were sewn back together.',
  map: stageMap(
    'sunken-chapel',
    [{
      points: [[0, 192], [1600, 192], [1600, 960], [256, 960], [256, 448], [1216, 448], [1216, 704], [640, 704]],
      air: [[0, 192], [1408, 576], [640, 704]],
    }],
    [
      // The centre, between the inner legs.
      [11, 8], [15, 8], [20, 8],
      // Between the rings.
      [7, 4], [13, 4], [22, 4], [11, 12], [15, 12], [22, 12], [5, 10],
      // Outside the spiral.
      [26, 8],
    ],
  ),
  threat: 7,
  gold: 430,
  waves: [
    wave(g('ghoul', 8), g('hound', 4)),
    wave(g('cultist', 5, { gap: 0.95 }), g('crawler', 12, { gap: 0.3 })),
    wave(g('revenant', 3, { gap: 1.05 }), g('hound', 8, { gap: 0.6 })),
    wave(g('bloodbat', 12, { gap: 0.55 }), g('ghoul', 9, { gap: 0.65 })),
    // Flesh Golems alone, then mixed in.
    wave(g('flesh_golem', 8, { gap: 0.75 })),
    wave(g('flesh_golem', 5, { gap: 0.7 }), g('revenant', 4, { gap: 1.5 })),
    wave(g('crawler', 38, { gap: 0.2 }), g('cultist', 6, { gap: 0.6 })),
    wave(g('flesh_golem', 8, { gap: 0.6 }), g('hound', 17, { gap: 0.4 })),
    wave(g('revenant', 7, { gap: 0.7 }), g('bloodbat', 18, { gap: 0.35 })),
    wave(g('flesh_golem', 14, { gap: 0.5 })),
    wave(g('cultist', 13, { gap: 0.45 }), g('crawler', 35, { gap: 0.15 })),
    wave(g('cultist', 14, { gap: 0.6 }), g('flesh_golem', 8, { gap: 0.45 }), g('bloodbat', 16, { gap: 0.3 })),
    wave(g('revenant', 9, { gap: 0.55 }), g('cultist', 11, { gap: 0.45 })),
    wave(g('hound', 42, { gap: 0.25 }), g('flesh_golem', 9, { gap: 0.4 })),
    wave(g('crawler', 76, { gap: 0.1 }), g('revenant', 6, { gap: 0.55 }), g('bloodbat', 19, { gap: 0.25 })),
    wave(
      g('flesh_golem', 13, { gap: 0.35 }),
      g('cultist', 10, { gap: 0.35 }),
      g('revenant', 7, { gap: 0.45 }),
      g('bloodbat', 13, { gap: 0.25 }),
    ),
  ],
};

/**
 * Stage 7, Plague Fords: two spawns, north and south, whose routes join at
 * the middle of the Map and leave together to the north-east. Bloaters arrive
 * alone at Wave 5. Each route is 2,816 long, 1,536 of it before the join.
 * Totem opens here.
 */
export const PLAGUE_FORDS: StageSpec = {
  number: 7,
  id: 'plague-fords',
  name: 'Plague Fords',
  region: 'blightfen',
  line: 'Two fords, two columns of the sick. They meet halfway.',
  map: stageMap(
    'plague-fords',
    [
      {
        points: [[192, 0], [192, 320], [1152, 320], [1152, 576], [1664, 576], [1664, 192], [2048, 192]],
        air: [[192, 0], [1152, 448], [2048, 192]],
      },
      {
        points: [[192, 1152], [192, 832], [1152, 832], [1152, 576], [1664, 576], [1664, 192], [2048, 192]],
        air: [[192, 1152], [1152, 704], [2048, 192]],
      },
    ],
    [
      // Between the two fords.
      [6, 6], [11, 6], [6, 10], [11, 10], [15, 8],
      // Outside the fords.
      [9, 2], [9, 14],
      // Along the joined road.
      [20, 6], [23, 4], [21, 10], [25, 10], [27, 5],
    ],
  ),
  threat: 8,
  gold: 460,
  waves: [
    wave(g('ghoul', 4, { gap: 1.25 }), g('ghoul', 4, { route: 1, gap: 1.25, at: 0 })),
    wave(g('hound', 7, { gap: 0.9 }), g('crawler', 8, { route: 1, gap: 0.45, at: 0 })),
    wave(g('ghoul', 4, { gap: 1.25 }), g('cultist', 3, { route: 1, gap: 1.6, at: 0 })),
    wave(g('bloodbat', 5, { gap: 0.95 }), g('bloodbat', 5, { route: 1, gap: 0.95, at: 1 })),
    // Bloaters alone, then mixed in.
    wave(g('bloater', 6)),
    wave(g('revenant', 2, { gap: 3 }), g('bloater', 3, { route: 1, at: 0 })),
    wave(g('revenant', 2), g('flesh_golem', 3, { route: 1, at: 0 })),
    wave(g('crawler', 14, { gap: 0.4 }), g('bloater', 4, { route: 1, at: 0 })),
    wave(g('hound', 8), g('hound', 8, { route: 1, at: 2 })),
    wave(g('cultist', 5, { gap: 0.95 }), g('bloater', 5, { route: 1, gap: 0.95, at: 0 }), g('bloodbat', 6, { at: 6 })),
    wave(g('revenant', 2), g('flesh_golem', 5, { route: 1, gap: 0.95, at: 0 })),
    wave(g('bloater', 6, { gap: 1.25 }), g('crawler', 17, { route: 1, at: 0 })),
    wave(g('cultist', 4, { gap: 1.5 }), g('cultist', 4, { route: 1, at: 0 }), g('bloodbat', 6, { route: 1 })),
    wave(g('flesh_golem', 3), g('revenant', 3, { route: 1, gap: 1.05, at: 0 }), g('hound', 7, { gap: 0.7 })),
    wave(g('bloater', 6, { gap: 1 }), g('bloater', 6, { route: 1, gap: 1, at: 0 }), g('bloodbat', 7, { gap: 0.7 })),
    wave(g('flesh_golem', 4), g('revenant', 3, { route: 1, gap: 1.05, at: 0 }), g('cultist', 3), g('bloater', 4, { route: 1 })),
  ],
};

/**
 * Stage 8, The Blight Pit: a figure eight round the plague pit. The road runs
 * down through the centre, round the south-east loop, and back west through
 * the centre again, so the four Spots by the crossing see it twice. The
 * Plague Mother leads the last Wave. The road is 5,120 long.
 */
export const BLIGHT_PIT: StageSpec = {
  number: 8,
  id: 'blight-pit',
  name: 'The Blight Pit',
  region: 'blightfen',
  line: 'The plague comes up out of the pit. Its mother waits at the bottom.',
  map: stageMap(
    'blight-pit',
    [{
      points: [[0, 192], [1088, 192], [1088, 960], [1856, 960], [1856, 576], [320, 576], [320, 1152]],
      air: [[0, 192], [1088, 576], [320, 1152]],
    }],
    [
      // Round the crossing.
      [14, 6], [18, 6], [14, 10], [18, 10],
      // The north-west loop.
      [6, 4], [10, 6], [14, 4],
      // The south-east loop.
      [22, 12], [26, 10], [18, 12],
      // Outside.
      [6, 12], [24, 6],
    ],
  ),
  threat: 9,
  gold: 500,
  waves: [
    wave(g('ghoul', 6), g('hound', 6)),
    wave(g('crawler', 15), g('bloodbat', 7, { gap: 0.7 })),
    wave(g('revenant', 2), g('cultist', 4, { gap: 0.9 })),
    wave(g('flesh_golem', 4, { gap: 0.9 }), g('bloater', 4, { gap: 0.9 })),
    wave(g('hound', 14, { gap: 0.55 }), g('crawler', 16, { gap: 0.25 })),
    wave(g('cultist', 6, { gap: 0.8 }), g('bloodbat', 11, { gap: 0.6 })),
    wave(g('bloater', 8, { gap: 0.75 }), g('revenant', 3, { gap: 1.95 })),
    wave(g('revenant', 5, { gap: 0.95 }), g('flesh_golem', 3, { gap: 0.8 })),
    wave(g('crawler', 33, { gap: 0.2 }), g('hound', 13, { gap: 0.5 })),
    wave(g('flesh_golem', 6, { gap: 0.8 }), g('cultist', 6, { gap: 0.6 }), g('bloodbat', 10, { gap: 0.5 })),
    wave(g('bloater', 11, { gap: 0.65 }), g('revenant', 4, { gap: 0.8 })),
    wave(g('cultist', 12, { gap: 0.8 }), g('bloodbat', 14, { gap: 0.45 })),
    wave(g('cultist', 10, { gap: 0.6 }), g('crawler', 30, { gap: 0.15 })),
    wave(g('flesh_golem', 10, { gap: 0.6 }), g('hound', 16, { gap: 0.4 })),
    wave(g('revenant', 6, { gap: 0.8 }), g('bloater', 8, { gap: 0.6 }), g('bloodbat', 12, { gap: 0.4 })),
    wave(g('cultist', 9, { gap: 0.55 }), g('flesh_golem', 6, { gap: 0.6 }), g('crawler', 30, { gap: 0.15 })),
    wave(g('revenant', 4, { gap: 0.8 }), g('hound', 17, { gap: 0.35 }), g('bloodbat', 17, { gap: 0.35 }), g('revenant', 3, { gap: 1.35 })),
    // The Plague Mother and her escort; she drops Crawlers as she goes.
    wave(g('plague_mother', 1), g('bloater', 13, { gap: 0.5, at: 3 }), g('cultist', 8, { gap: 0.65 })),
  ],
};
