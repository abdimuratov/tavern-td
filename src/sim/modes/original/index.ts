// The Original Game Mode: Tavern TD's own Campaign. Importing this module
// registers the Original's statuses and effect kind, then the mode itself,
// under the id `original`.

import './combat';
import './attack';
import { registerMode } from '../registry';
import { ORIGINAL_RULES } from './rules';

registerMode(ORIGINAL_RULES);

export {
  ORIGINAL_RULES, ORIGINAL_COMMANDS, originalOptions, sendNowError,
  type OriginalCommand, type OriginalOptions,
} from './rules';
export {
  ORIGINAL_MODE_ID, newTowerState,
  type OriginalState, type OriginalGameState, type OriginalTowerState, type OriginalCreepState, type Cloud,
} from './state';
export { STATUS, KEY, deal, kill, levelFor, isPoisoned, stackCount, shieldOf, typeShare } from './combat';
export { priceOf, sellValue, sellShare, runUnlocks, towerOnSpot } from './build';
export { ghoulHp, bountyPool, waveBonus, earlyCallGold, waveSpec, groupStarts } from './waves';
export { towerBonus, attackRange, auraRadius, perkOf } from './auras';
export { pickTarget, remaining } from './targeting';
export { foldTalents, runTalents, type FamilyTalents, type RunTalents } from './talents';
export {
  unlocksFor, starsFor, starsGained, maxStars, maxStageStars, maxChallengeStars, talentCost, starsSpent, talentsProblem, talentError,
  buyTalent, resetTalents, treeRows, mergeStageRecord, mergeChallengeRecord, challengeStarsGained,
  type Unlocks, type StageResult, type StageRecord, type ChallengeRecord,
} from './progression';
export { runChallenge, runModifiers, challengeProblem, challengeUnlocks, challengeMap } from './challenge';
export {
  originalStatus, spotInfo, towerActions, wavePreview, originalResult,
  type OriginalStep, type OriginalStatus, type BuildOption, type SpotInfo, type UpgradeOption, type TowerActions, type WavePreview,
} from './queries';
