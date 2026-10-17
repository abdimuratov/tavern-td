import type { DamageElement } from '../../../content/element';
import type { SimEvent } from '../../core/events';
import type { Creep, GameState } from '../../core/state';
import { deal, type DamageResult } from './combat';
import { makeSim } from './state';

// Entry points for tools and tests that act on a Run outside a tower's attack.

/** One hit through Element's damage model (element table, amplification, rounding, time lapse, kills). */
export function dealDamage(
  state: GameState, creep: Creep, amount: number, tower: number, elem: DamageElement, events: SimEvent[], pure = false,
): DamageResult {
  return deal(makeSim(state, events), creep, amount, tower, elem, 'attack', pure);
}
