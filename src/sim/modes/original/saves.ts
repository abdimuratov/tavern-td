import { TOWER_FOOTPRINT, challengeById, stageByNumber } from '../../../content/original';
import type { MapSpec } from '../../core/specs';
import type { GameState } from '../../core/state';
import { cellCol, cellRow, footprintCells } from '../../path/grid';
import { runMap } from './challenge';

// Older saves (docs/original-design.md §17). A save is a snapshot of the whole
// state, its Map included. A Run saved before free placement carries a Map
// that lists its Build Spots, and its towers stand on them. Loading it moves
// the Run onto its Stage's (or Challenge's) current Map: the roads are the
// same, so creeps walk on, and no Scenery or Burnt ground covers an old Spot,
// so every tower keeps its cells.

const NO_FIT = 'This saved Run\'s towers don\'t fit the Stage\'s Map any more, so it can\'t be loaded.';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Moves an older Original save, whose Map lists Build Spots, onto its Run's
 * current Map, keeping every tower where it stands; null once the save is
 * playable, or why it can't be. A save made since keeps the Map it carries.
 * The shape of the rest is checked after this, so it reads only what it needs.
 */
export function upgradeSave(state: GameState): string | null {
  const old = state.map as unknown;
  if (!isObj(old) || !Object.hasOwn(old, 'buildSpots')) return null;
  const mode = state.mode as unknown;
  const stage = isObj(mode) && typeof mode['stage'] === 'number' ? stageByNumber(mode['stage']) : undefined;
  const id = isObj(mode) ? mode['challenge'] : undefined;
  const challenge = id === undefined ? null : typeof id === 'string' ? challengeById(id) : undefined;
  // A Run on a Map of its own (the tests' and tools') has no current Map to move onto.
  if (!stage || challenge === undefined || (challenge && challenge.stage !== stage.number) || old['id'] !== stage.map.id) return NO_FIT;
  const map = runMap(stage, challenge);
  if (!Array.isArray(state.grid) || state.grid.length !== map.cols * map.rows) return NO_FIT;
  if (!state.towers.every((t) => fits(map, state.grid, t.id, t.cell, t.cells))) return NO_FIT;
  state.map = map;
  state.pathVersion++;
  return null;
}

/** Whether a tower's cells are its 2 × 2 at its top-left, all Open ground on `map`, and the grid's for it. */
function fits(map: MapSpec, grid: readonly number[], id: number, anchor: number, cells: readonly number[]): boolean {
  const want = footprintCells(map, anchor, TOWER_FOOTPRINT);
  if (want.length === 0 || !Array.isArray(cells) || cells.length !== want.length) return false;
  return want.every((c, i) => cells[i] === c && grid[c] === id && map.terrain[cellRow(map, c)]![cellCol(map, c)] === '.');
}
