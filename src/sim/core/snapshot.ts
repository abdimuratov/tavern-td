import { SNAPSHOT_VERSION } from './constants';
import type { GameState } from './state';

/** The whole Run as JSON: an autosave, an export code, or a hash input. */
export function snapshot(state: GameState): string {
  return JSON.stringify(state);
}

/** A Run from snapshot(). Throws on text that isn't a snapshot of this version. */
export function restore(json: string): GameState {
  const state = JSON.parse(json) as Partial<GameState> | null;
  if (typeof state !== 'object' || state === null || state.v !== SNAPSHOT_VERSION) {
    throw new Error(`Not a snapshot of version ${SNAPSHOT_VERSION}`);
  }
  const lists = [state.grid, state.creeps, state.towers, state.projectiles, state.wave?.active];
  if (typeof state.modeId !== 'string' || typeof state.tick !== 'number' || !lists.every(Array.isArray)) {
    throw new Error('Snapshot is missing parts of the state');
  }
  // Saves from before footprints: every tower covered just its anchor cell.
  for (const t of state.towers!) if (!Array.isArray(t.cells)) t.cells = [t.cell];
  return state as GameState;
}

/** FNV-1a 32-bit over the snapshot's UTF-16 code units, as 8 hex digits. Equal states hash equal on every engine. */
export function hashState(state: GameState): string {
  return fnv1a(snapshot(state));
}

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
