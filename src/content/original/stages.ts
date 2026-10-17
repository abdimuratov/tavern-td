import { stageMap } from './maps';
import type { OriginalWave, StageSpec } from './types';

// The Campaign's Stages (docs/original-design.md §11). Stage 1 is built in
// full; Stages 2–12 follow the same format: a Map from stageMap, a first
// Threat, starting gold and the Waves. A Wave lists its groups, and groups
// follow one another unless they set `at`.

/** Stages in the Campaign. */
export const CAMPAIGN_LENGTH = 12;

/**
 * Stage 1, The Mill Road (Ashfield): one S-bend road past a burning mill, with
 * Build Spots on the inside of both bends. Ghouls, then Hounds from Wave 5.
 * The road is 5,376 units: about 34 s for a Ghoul, 21 s for a Hound.
 */
const MILL_ROAD_WAVES: readonly OriginalWave[] = [
  { groups: [{ creep: 'ghoul', count: 10 }] },
  { groups: [{ creep: 'ghoul', count: 10 }] },
  { groups: [{ creep: 'ghoul', count: 12 }] },
  { groups: [{ creep: 'ghoul', count: 12, gap: 0.8 }] },
  // Hounds arrive alone at 0.8×, then mix with Ghouls.
  { groups: [{ creep: 'hound', count: 11 }] },
  { groups: [{ creep: 'ghoul', count: 6 }, { creep: 'hound', count: 6 }] },
  { groups: [{ creep: 'ghoul', count: 8 }, { creep: 'hound', count: 6, at: 3 }] },
  { groups: [{ creep: 'hound', count: 16, gap: 0.6 }] },
  { groups: [{ creep: 'ghoul', count: 10 }, { creep: 'hound', count: 6, at: 4 }] },
  { groups: [{ creep: 'hound', count: 12 }, { creep: 'ghoul', count: 6 }] },
  { groups: [{ creep: 'ghoul', count: 12, gap: 0.8 }, { creep: 'hound', count: 4 }] },
  // The last Wave is the hardest: Hounds catch up with the Ghouls on the second bend.
  { groups: [{ creep: 'ghoul', count: 10 }, { creep: 'hound', count: 9, at: 5 }] },
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
    // Four Spots inside the first bend, four inside the second.
    [[19, 4], [23, 4], [19, 6], [23, 6], [7, 10], [11, 10], [7, 12], [11, 12]],
  ),
  threat: 1,
  gold: 250,
  waves: MILL_ROAD_WAVES,
};

/** The Stages built so far, in Campaign order. */
export const STAGES: readonly StageSpec[] = [MILL_ROAD];

/** Stage `number` (1-based), or undefined when it isn't built yet. */
export function stageByNumber(number: number): StageSpec | undefined {
  return STAGES.find((s) => s.number === number);
}
