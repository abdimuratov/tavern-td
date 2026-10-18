// The Maul Game Mode (Wintermaul). Importing this module registers Maul's
// effect kinds, then the mode itself, under the id `maul`.

import './effects';
import { registerMode } from '../registry';
import { MAUL_RULES } from './rules';

registerMode(MAUL_RULES);

export { MAUL_RULES, MAUL_COMMANDS, DEFAULT_OPTIONS, maulOptions, sendNowError, addRaceError, type MaulCommand, type MaulOptions } from './rules';
export { MAUL_MODE_ID, type MaulState, type MaulGameState, type MaulTowerState } from './state';
export { footprintAt, sellValue, spotError, buildError, upgradeError, buildable, nextOf } from './build';
export { raiderHp, bountyPool, waveBonus, interestOn, waveSpec, runWaves, spawnsOf } from './waves';
export {
  maulStatus, buildOptions, buildSpot, towerActions, wavePreview, maulRecord, FOOTPRINT,
  type MaulStep, type MaulStatus, type AttackInfo, type BuildOption, type UpgradeOption, type TowerActions,
  type WavePreview, type WavePreviewGroup, type MaulRecord,
} from './queries';
export { venomKey, type MaulSpreadEffect, type MaulChainEffect, type MaulVenomEffect } from './effects';
