import { stageMap } from '../maps';
import type { StageSpec } from '../types';
import { group as g, wave } from './waves';

// Region 2, Blightfen (docs/original-design.md §11): plague marsh and drowned
// villages. Plague and its cults: Cultists, Flesh Golems and Bloaters join the
// dead, and the Plague Mother waits in the Blight Pit.

/**
 * Stage 5, Drowned Causeway: the causeway zigzags north and south through the
 * marsh, which drowns the inside of every turn, so towers stand mid-strip
 * between its legs. Cultists arrive alone at Wave 4. The road is 5,888 long.
 * Poison opens here.
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
      // Inside each turn, between two legs.
      { kind: 'water', name: 'the marsh', at: 'in the marsh', rects: [[7, 10, 4, 4], [13, 4, 4, 4], [19, 10, 4, 4], [25, 4, 4, 4]] },
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
    wave(g('crawler', 45, { gap: 0.15 }), g('hound', 15, { gap: 0.45 })),
    wave(g('cultist', 11, { gap: 0.55 }), g('bloodbat', 19, { gap: 0.33 })),
    wave(g('cultist', 9, { gap: 0.7 }), g('revenant', 5, { gap: 0.65 }), g('cultist', 7, { gap: 0.5 })),
    wave(g('hound', 29, { gap: 0.27 }), g('crawler', 29, { gap: 0.14 }), g('bloodbat', 14, { gap: 0.33 })),
    wave(g('cultist', 17, { gap: 0.36 }), g('revenant', 6, { gap: 0.55 }), g('revenant', 3, { gap: 1.35 })),
  ],
};

/**
 * Stage 6, Sunken Chapel: the road spirals in to the drowned chapel at its
 * end. The centre, between the inner legs, reaches three stretches of the
 * spiral; black water fills everything below the outer ring and beside the
 * lower east leg. Flesh Golems arrive alone at Wave 5. The road is 6,016 long.
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
      // At the road's end.
      { kind: 'building', name: 'the chapel', at: 'on the chapel', rects: [[7, 8, 4, 2]] },
      // Beside the lower east leg, and below the outer ring.
      { kind: 'water', name: 'the black water', at: 'in the black water', rects: [[26, 10, 6, 8], [0, 16, 26, 2]] },
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
    wave(g('cultist', 13, { gap: 0.45 }), g('crawler', 34, { gap: 0.15 })),
    wave(g('cultist', 13, { gap: 0.65 }), g('flesh_golem', 8, { gap: 0.45 }), g('bloodbat', 15, { gap: 0.32 })),
    wave(g('revenant', 8, { gap: 0.62 }), g('cultist', 10, { gap: 0.5 })),
    wave(g('hound', 40, { gap: 0.26 }), g('flesh_golem', 8, { gap: 0.45 })),
    wave(g('crawler', 70, { gap: 0.11 }), g('revenant', 5, { gap: 0.66 }), g('bloodbat', 17, { gap: 0.28 })),
    wave(
      g('flesh_golem', 11, { gap: 0.41 }),
      g('cultist', 9, { gap: 0.39 }),
      g('revenant', 6, { gap: 0.53 }),
      g('bloodbat', 11, { gap: 0.3 }),
    ),
  ],
};

/**
 * Stage 7, Plague Fords: two spawns, north and south, whose routes ford the
 * river (cols 13–14), join at the middle of the Map and leave together to the
 * north-east. Bloaters arrive alone at Wave 5. Each route is 2,816 long, 1,536
 * of it before the join. Totem opens here.
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
      // Forded by both roads, it splits the ground between the fords.
      { kind: 'water', name: 'the river', at: 'in the river', rects: [[13, 0, 2, 18]] },
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
    wave(g('flesh_golem', 3), g('revenant', 3, { route: 1, gap: 1.05, at: 0 }), g('hound', 6, { gap: 0.82 })),
    wave(g('bloater', 5, { gap: 1.2 }), g('bloater', 5, { route: 1, gap: 1.2, at: 0 }), g('bloodbat', 7, { gap: 0.7 })),
    wave(g('flesh_golem', 3, { gap: 1.6 }), g('revenant', 3, { route: 1, gap: 1.05, at: 0 }), g('cultist', 3), g('bloater', 3, { route: 1, gap: 1.6 })),
  ],
};

/**
 * Stage 8, The Blight Pit: a figure eight round the plague pit, which lies
 * inside the south-east loop. The road runs down through the centre, round
 * that loop, and back west through the centre again, so the ground by the
 * crossing sees it twice. The Plague Mother leads the last Wave. The road is
 * 5,120 long.
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
      // Inside the south-east loop.
      { kind: 'pit', name: 'the plague pit', at: 'in the plague pit', rects: [[20, 10, 2, 4], [22, 10, 4, 2]] },
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
    wave(g('cultist', 9, { gap: 0.67 }), g('crawler', 29, { gap: 0.15 })),
    wave(g('flesh_golem', 9, { gap: 0.67 }), g('hound', 15, { gap: 0.43 })),
    wave(g('revenant', 5, { gap: 0.96 }), g('bloater', 7, { gap: 0.69 }), g('bloodbat', 11, { gap: 0.44 })),
    wave(g('cultist', 8, { gap: 0.62 }), g('flesh_golem', 5, { gap: 0.72 }), g('crawler', 27, { gap: 0.16 })),
    wave(g('revenant', 3, { gap: 1.07 }), g('hound', 15, { gap: 0.39 }), g('bloodbat', 15, { gap: 0.39 }), g('revenant', 2, { gap: 2.03 })),
    // The Plague Mother and her escort; she drops Crawlers as she goes.
    wave(g('plague_mother', 1), g('bloater', 11, { gap: 0.59, at: 3 }), g('cultist', 6, { gap: 0.87 })),
  ],
};
