// The Line Wars Game Mode (Line Tower Wars as a duel against an AI Rival).
// Its towers use Maul's effect kinds, so importing this module registers
// those first, then the mode itself, under the id `linewars`.

import '../maul/effects';
import { registerMode } from '../registry';
import { LW_RULES } from './rules';

registerMode(LW_RULES);

export { LW_RULES, DEFAULT_OPTIONS, lwOptions, endRun, type LwOptions } from './rules';
export { LW_COMMANDS, applyLwCommand, isLwCommand, type LwCommand, type CommandSource } from './commands';
export {
  LW_MODE_ID, SIDE_IDS, lwState, sideOf, other, isSide, towerSide, creepField, payOf,
  type LwState, type LwGameState, type LwSide, type LwAi, type LwInbound, type Driver, type SideId,
} from './state';
export {
  fieldError, lwSpotError, lwBuildable, lwNextOf, lwBuildError, lwUpgradeError, lwSellError, lwSellValue, fullSaleOpen,
} from './build';
export { sendError, sendHp, sendIncome, sendLocked, unlockTick, suddenTick, clock } from './sends';
export {
  lwStatus, sendOptions, buildOptions, buildSpot, towerActions, inField, nextUnlock, lwRecord,
  type LwStatus, type LwSideStatus, type SendOption, type LwBuildOption, type LwUpgradeOption, type LwTowerActions,
  type InFieldGroup, type LwRecord,
} from './queries';
export { runAi } from './ai';
export { newAi, aiSeed } from './ai/memory';
export { fieldMap, potential, profileOf, type FieldMap, type SpecProfile } from './ai/field';
