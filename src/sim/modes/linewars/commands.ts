import { isSendId } from '../../../content/linewars';
import { intArg, reject, stringArg, type Command } from '../../core/commands';
import type { SimEvent } from '../../core/events';
import type { GameState } from '../../core/state';
import { spotError } from '../maul/tree';
import { fieldError, lwBuild, lwBuildError, lwSell, lwSellError, lwUpgrade, lwUpgradeError, towerById } from './build';
import { applySend, sendError } from './sends';
import { isSide, lwState, type SideId } from './state';

// The one handler every Line Wars command goes through, whether it comes from
// the log (a person, or a replay) or from the AI inside the sim
// (docs/line-wars-design.md §4). Each command names its Side; the handler
// treats every field as untrusted and refuses, never throws.

/** Line Wars' commands. Towers are named by id; (col, row) is a 2 × 2 tower's top-left cell. */
export type LwCommand =
  /** Build the Side's Race's Wall, or either line's Tier 1, in its own Field. */
  | { readonly type: 'lw.build'; readonly side: SideId; readonly spec: string; readonly col: number; readonly row: number }
  /** Climb a Tier, or pick a fork at Tier 2. */
  | { readonly type: 'lw.upgrade'; readonly side: SideId; readonly tower: number; readonly to: string }
  | { readonly type: 'lw.sell'; readonly side: SideId; readonly tower: number }
  /** Buy a Send for the other Side's Field. */
  | { readonly type: 'lw.send'; readonly side: SideId; readonly send: string };

export const LW_COMMANDS: readonly LwCommand['type'][] = ['lw.build', 'lw.upgrade', 'lw.sell', 'lw.send'];

/** Where a command came from: the log (a person, or a replay) or the AI inside the sim. */
export type CommandSource = 'log' | 'ai';

/**
 * Applies one Line Wars command for the Side it names. The log's commands
 * and the AI's both come through here, so both are refused for the same
 * reasons and push the same events. True when it was applied.
 */
export function applyLwCommand(state: GameState, command: Command, events: SimEvent[], from: CommandSource): boolean {
  const ms = lwState(state);
  const no = (reason: string): false => {
    reject(events, command, reason);
    return false;
  };
  const side = intArg(command, 'side');
  if (!isSide(side)) return no('no such Side');
  if (from === 'log' && ms.sides[side].driver === 'ai') return no('the Rival\'s AI plays that Side');
  if (ms.result !== 'playing' || state.phase === 'won' || state.phase === 'lost') return no('the Run is over');
  switch (command.type as LwCommand['type']) {
    case 'lw.build': {
      const spec = stringArg(command, 'spec');
      const col = intArg(command, 'col');
      const row = intArg(command, 'row');
      if (spec === null || col === null || row === null) return no('build needs spec, col and row');
      const refused = fieldError(state, side, col, row) ?? lwBuildError(state, side, spec) ?? spotError(state, col, row);
      if (refused) return no(refused);
      lwBuild(state, side, spec, col, row, events);
      return true;
    }
    case 'lw.upgrade': {
      const tower = towerById(state, intArg(command, 'tower'));
      const to = stringArg(command, 'to');
      if (to === null) return no('upgrade needs the tower to become');
      const refused = lwUpgradeError(state, side, tower, to);
      if (refused || !tower) return no(refused ?? 'no such tower');
      lwUpgrade(state, side, tower, to, events);
      return true;
    }
    case 'lw.sell': {
      const tower = towerById(state, intArg(command, 'tower'));
      const refused = lwSellError(state, side, tower);
      if (refused || !tower) return no(refused ?? 'no such tower');
      lwSell(state, side, tower, events);
      return true;
    }
    case 'lw.send': {
      const send = stringArg(command, 'send');
      const refused = sendError(state, side, send);
      if (refused) return no(refused);
      if (!isSendId(send)) return no('no such Send');
      applySend(state, side, send, events);
      return true;
    }
  }
  return no('unknown command');
}

export function isLwCommand(type: string): type is LwCommand['type'] {
  return (LW_COMMANDS as readonly string[]).includes(type);
}

