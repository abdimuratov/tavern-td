import { runCreeps } from '../combat/creeps';
import { runAuras, runProjectiles, runTowers } from '../combat/towers';
import { getMode } from '../modes/registry';
import { reject, type Command } from './commands';
import type { SimEvent } from './events';
import type { Sim } from './mode';
import type { GameState } from './state';
import { endTick, runWaves, startNextWave } from './waves';

/**
 * Advances the Run one tick (1/30 s), mutating `state` in place: this tick's
 * commands first, then the Game Mode's tick hook, spawns, auras, creeps,
 * towers, projectiles, and the end-of-tick bookkeeping. Returns what happened.
 */
export function step(state: GameState, commands: readonly Command[]): SimEvent[] {
  const rules = getMode(state.modeId);
  const events: SimEvent[] = [];
  const sim: Sim = { state, rules, events };
  for (const command of commands) applyCommand(sim, command);
  if (state.phase !== 'won' && state.phase !== 'lost') {
    rules.onTick?.(state, events);
    runWaves(sim);
    runAuras(sim);
    runCreeps(sim);
    runTowers(sim);
    runProjectiles(sim);
    endTick(sim);
  }
  state.tick++;
  return events;
}

/**
 * Runs `ticks` steps with `commands` applied on the first. This is how the app
 * plays 2× and 3×: it is exactly that many single steps, so speed can't change outcomes.
 */
export function advance(state: GameState, ticks: number, commands: readonly Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    for (const e of step(state, i === 0 ? commands : [])) events.push(e);
  }
  return events;
}

function applyCommand(sim: Sim, command: Command): void {
  const { state, rules, events } = sim;
  if (typeof command !== 'object' || command === null || typeof command.type !== 'string') {
    reject(events, command, 'malformed command');
    return;
  }
  if (state.phase === 'won' || state.phase === 'lost') {
    reject(events, command, 'the Run is over');
    return;
  }
  if (command.type === 'startWave') {
    const refused = startNextWave(state, events);
    if (refused !== null) reject(events, command, refused);
    return;
  }
  if (!rules.handleCommand?.(state, command, events)) reject(events, command, 'unknown command');
}
