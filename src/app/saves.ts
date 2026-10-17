import { decodeSave, encodeSave, SaveCodeError } from '../platform/savecode';
import { DIFFICULTIES, getMode, hasMode, restore, validateMap, type GameState } from '../sim';

/**
 * What autosaves and save codes hold: a GameState snapshot. Version 1 was the
 * dev sandbox's autosave before Continue existed; bump this whenever a build
 * can no longer play an older save, so it is refused instead of misread.
 */
export const SAVE_VERSION = 2;

/** A save this build can't play, with a message the player can read. */
export class SaveProblem extends Error {
  override name = 'SaveProblem';
}

const DAMAGED = "This save is damaged and can't be loaded.";

/** Which Game Modes can be played, and a deeper check of a mode's own state. */
export interface SaveRules {
  playable(modeId: string): boolean;
  /** False refuses the save: its mode state isn't what this build's Game Mode keeps. */
  validState?(state: GameState): boolean;
}

function known(table: Readonly<Record<string, unknown>>, id: unknown): boolean {
  return typeof id === 'string' && Object.hasOwn(table, id);
}

/**
 * A saved Run as a playable GameState, or a SaveProblem. Beyond restore()'s
 * shape check it refuses Game Modes and spec ids this build doesn't have, a
 * broken Map, and a Run that is already over.
 */
export function checkRun(data: unknown, rules: SaveRules): GameState {
  let state: GameState;
  try {
    state = restore(JSON.stringify(data));
  } catch {
    throw new SaveProblem("This save is from another version of Tavern TD and can't be loaded.");
  }
  if (!hasMode(state.modeId) || !rules.playable(state.modeId)) {
    throw new SaveProblem("This save is for a Game Mode this version doesn't have.");
  }
  if (!DIFFICULTIES.includes(state.difficulty)) throw new SaveProblem(DAMAGED);
  if (state.phase !== 'build' && state.phase !== 'wave') throw new SaveProblem('That Run is already over.');
  const mode = getMode(state.modeId);
  const specsKnown = state.towers.every((t) => known(mode.towers, t.spec))
    && state.projectiles.every((p) => known(mode.towers, p.spec))
    && state.creeps.every((c) => known(mode.creeps, c.spec));
  if (!specsKnown) throw new SaveProblem("This save has towers or creeps this version doesn't know.");
  let mapOk: boolean;
  try {
    mapOk = validateMap(state.map) === null && state.grid.length === state.map.cols * state.map.rows;
  } catch {
    mapOk = false;
  }
  if (!mapOk || typeof state.mode !== 'object' || state.mode === null) throw new SaveProblem(DAMAGED);
  if (rules.validState && !rules.validState(state)) throw new SaveProblem(DAMAGED);
  return state;
}

/** The Run as a save code. */
export function writeCode(state: GameState): Promise<string> {
  return encodeSave({ v: SAVE_VERSION, state });
}

/** A pasted save code as a playable GameState, or a SaveProblem saying what's wrong with it. */
export async function readCode(code: string, rules: SaveRules): Promise<GameState> {
  let payload: unknown;
  try {
    payload = await decodeSave(code);
  } catch (err) {
    if (err instanceof SaveCodeError) throw new SaveProblem(err.message);
    throw new SaveProblem(DAMAGED);
  }
  const v = typeof payload === 'object' && payload !== null ? (payload as { v?: unknown }).v : undefined;
  if (typeof v !== 'number') throw new SaveProblem("That isn't a Tavern TD save code.");
  if (v > SAVE_VERSION) throw new SaveProblem('This save code is from a newer version of Tavern TD. Update the app and try again.');
  if (v < SAVE_VERSION) throw new SaveProblem("This save code is from an older version of Tavern TD and can't be loaded.");
  return checkRun((payload as { state?: unknown }).state, rules);
}
