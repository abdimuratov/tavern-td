import { FORT_HARROW, GALLOWS_HILL, GREYRIVER_CROSSING, MILL_ROAD } from './stages/ashfield';
import { BLIGHT_PIT, DROWNED_CAUSEWAY, PLAGUE_FORDS, SUNKEN_CHAPEL } from './stages/blightfen';
import { BLACK_CLIFFS, RIFTMAW, THE_SCAR, THREE_GATES } from './stages/rift';
import type { StageSpec } from './types';

// The Campaign's Stages (docs/original-design.md §11), one file per Region.
// Each Stage is a Map from stageMap, a first Threat, starting gold and its
// Waves. A Wave lists its groups, and groups follow one another unless they
// set `at`.

export * from './stages/ashfield';
export * from './stages/blightfen';
export * from './stages/rift';

/** Stages in the Campaign. */
export const CAMPAIGN_LENGTH = 12;

/** Every Stage, in Campaign order. */
export const STAGES: readonly StageSpec[] = [
  MILL_ROAD, GREYRIVER_CROSSING, GALLOWS_HILL, FORT_HARROW,
  DROWNED_CAUSEWAY, SUNKEN_CHAPEL, PLAGUE_FORDS, BLIGHT_PIT,
  THE_SCAR, BLACK_CLIFFS, THREE_GATES, RIFTMAW,
];

/** Stage `number` (1-based), or undefined when there is no such Stage. */
export function stageByNumber(number: number): StageSpec | undefined {
  return STAGES.find((s) => s.number === number);
}
