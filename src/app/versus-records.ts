import { recordResult, type RecordUpdate, type RunResult } from '../platform/storage';
import type { GameState } from '../sim';
import type { ModeUi, ViewerSide } from '../ui/mode-ui';

// A Versus Run's Record (docs/versus-design.md §6): each device records its own
// Side's result on Line Wars' Versus board, `record/linewars/versus/normal`.

/** The Records board a Versus Run counts toward, beside the mode's boards by Difficulty. */
export const VERSUS_BOARD = 'versus';

/**
 * How a Versus Run ended, as the session tells it (src/net's `Outcome`):
 * the sim ended it, this player conceded, the Rival conceded, this player
 * claimed the win after the Rival was gone 2 minutes, or a second Desync.
 */
export type VersusOutcome = 'run' | 'conceded' | 'rival-conceded' | 'claimed' | 'desync';

/**
 * The Record entry a Versus Run gives `side`. A Run the sim ended counts as it
 * stands, so a draw counts as played and not won. Conceding is a loss, and the
 * Rival conceding or a claimed win is a win, each with the score so far and no
 * fastest-win time. A Run a Desync ended records nothing (null).
 */
export function versusResult(ui: ModeUi, state: GameState, side: ViewerSide, outcome: VersusOutcome): RunResult | null {
  if (outcome === 'desync') return null;
  const r = ui.result?.(state, side);
  if (!r) return null;
  if (outcome === 'run') return r;
  // A time of 0 is no time: the Record keeps no fastest win for it.
  return { ...r, won: outcome !== 'conceded', seconds: 0 };
}

/**
 * Records a Versus Run the session ended rather than the sim ('conceded',
 * 'rival-conceded', 'claimed'), from the Viewer Side. 'run' was recorded by
 * the Run's own end and 'desync' records nothing, so both resolve to null.
 */
export function recordVersus(ui: ModeUi, state: GameState, side: ViewerSide, outcome: VersusOutcome): Promise<RecordUpdate | null> {
  if (outcome === 'run') return Promise.resolve(null);
  const result = versusResult(ui, state, side, outcome);
  if (!result) return Promise.resolve(null);
  return recordResult(state.modeId, state.difficulty, result, VERSUS_BOARD);
}
