// The Element Game Mode (Element TD). Importing this module registers Element's
// statuses and effect kinds, then the mode itself, under the id `element`.

import './combat';
import './effects';
import { registerMode } from '../registry';
import { ELEMENT_RULES } from './rules';

registerMode(ELEMENT_RULES);

export {
  ELEMENT_RULES, ELEMENT_COMMANDS, DEFAULT_OPTIONS, elementOptions, sendNowError,
  type ElementCommand, type ElementOptions,
} from './rules';
export {
  ELEMENT_MODE_ID, ELEMENT_RULE_TOWERS, newTowerState,
  type ElementState, type ElementGameState, type ElementTowerState, type ElementCreepState, type ElementTimer,
  type ElementDraw, type InterestState, type Tornado,
} from './state';
export { FOOTPRINT, sellValue } from './build';
export { drawOrder, elementalHp } from './elements';
export { bossGroups, bossHp, breakSeconds, netWorth } from './waves';
export { STATUS, SHIELD, DEAD, STUN, HASTE, ACID, FAERIE, FIRE_UP, SPRING, slowKey, targetable, type DamageResult } from './combat';
export { dealDamage } from './api';
export {
  elementStatus, buildOptions, buildSpot, summonOptions, towerActions, towerInfo, wavePreview, routePolyline, elementRecord,
  type ElementStep, type ElementStatus, type BuildOption, type SummonOption, type SummonOptions, type UpgradeOption,
  type ElementTowerActions, type ElementTowerInfo, type WavePreview, type ElementRecord,
} from './queries';
