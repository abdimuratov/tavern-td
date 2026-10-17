import type { Command } from './commands';
import type { RunOptions } from './mode';
import { createRun } from './run';
import { hashState } from './snapshot';
import type { GameState } from './state';
import { step } from './step';

export interface ReplayEntry {
  /** The tick whose step applied the command (state.tick before that step). */
  readonly tick: number;
  readonly command: Command;
}

/** A seed plus the command log reproduces a whole Run. Plain JSON, for tests, bug reports and versus. */
export interface Replay extends RunOptions {
  /** Sorted by tick; commands on the same tick apply in log order. */
  readonly log: readonly ReplayEntry[];
  /** Where replayHash stops; one tick past the last command by default. */
  readonly until?: number;
}

/** Plays a replay from the start until `state.tick === untilTick`. */
export function replay(r: Replay, untilTick: number): GameState {
  const state = createRun(r);
  let i = 0;
  while (state.tick < untilTick) {
    const batch: Command[] = [];
    while (i < r.log.length && r.log[i]!.tick <= state.tick) batch.push(r.log[i++]!.command);
    step(state, batch);
  }
  return state;
}

/** The state hash at the end of a replay: what WebKit and Node must agree on. */
export function replayHash(r: Replay, untilTick?: number): string {
  const lastTick = r.log.length > 0 ? r.log[r.log.length - 1]!.tick + 1 : 0;
  return hashState(replay(r, untilTick ?? r.until ?? lastTick));
}
