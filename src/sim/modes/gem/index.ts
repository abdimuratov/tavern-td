// The Gem Game Mode (Gem TD+). Importing this module registers Gem's effect
// kinds and then the mode itself, under the id `gem`.

import './effects';
import { registerMode } from '../registry';
import { GEM_RULES } from './rules';

registerMode(GEM_RULES);

export { GEM_RULES, GEM_COMMANDS, waveEndGold, leakEndsRun, type GemCommand } from './rules';
export {
  GEM_MODE_ID, GEM_TOWERS, DRAFT_SIZE, SWAP_MANA, START_GOLD,
  killStep, killAward, burnBonus,
  type GemState, type GemGameState, type GemTowerState, type ExtraChanceState,
} from './state';
export {
  GEM_FOOTPRINT, gemFootprint, draftChoices, draftRecipe, mergeResult, mergeAllowed, mergedSpec, downgradedSpec,
  type DraftChoice, type MergeCount,
} from './draft';
export { upgradeOf, nextQualityCost } from './field';
export { qualityOdds, rollGem } from './chance';
export {
  gemStatus, extraChanceQuote, draftSpot, draftHighlights, towerInfo, towerActions, slateMoveError, gemRecord,
  type GemStep, type GemStatus, type ExtraChanceStatus, type GemTowerInfo, type GemTowerActions, type GemAction, type GemRecord,
} from './queries';
