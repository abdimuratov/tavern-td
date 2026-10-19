import { signal } from '@preact/signals';
import type { Family } from '../../../content/original';
import { snapSquare } from '../../../render/footprint';
import type { PointerKind } from '../../../render/gestures';
import { CELL, original, sceneryAt, type GameState, type Point } from '../../../sim';
import type { RunView } from '../../mode-ui';

// The build ring (docs/original-design.md §3, §17): tap Open ground and a ring
// shows the unlocked families with their prices round the 2 × 2 there; tap
// one for its Ghost and range, then tap it (or the Ghost) again to build. On
// the Mac the picked family's Ghost follows the mouse instead, and a click on
// Open ground builds where it stands. None of this is in the Run: it is only
// what the player is in the middle of picking.

/** A 2 × 2 place by its top-left cell. */
export interface Place {
  readonly col: number;
  readonly row: number;
}

export interface RingState {
  /** The 2 × 2 it is open on: Open ground, though something may stand in the way (the reason shows). */
  readonly place: Place;
  /** The family picked, whose Ghost stands on the place (or under the mouse); null until one is. */
  readonly family: Family | null;
  /** The pointer that opened it: a mouse's Ghost follows the pointer, a tap's stays on the place. */
  readonly kind: PointerKind;
}

export const ring = signal<RingState | null>(null);

/** Mac hotkeys in ring order, WC3's top row. */
export const RING_KEYS = ['q', 'w', 'e', 'r', 't', 'y'] as const;

/** The cell under world point `p`, or null off the Map. */
export function cellAtPoint(state: GameState, p: Point): Place | null {
  const col = Math.floor(p.x / CELL);
  const row = Math.floor(p.y / CELL);
  return p.x < 0 || p.y < 0 || col >= state.map.cols || row >= state.map.rows ? null : { col, row };
}

/**
 * The 2 × 2 a tap at `p` takes, snapped as Element's Ghost is: of the four
 * that cover the tapped cell, the open one whose centre is nearest the tap;
 * with none open, the one centred nearest the tap, with the reason. Null off the Map.
 */
export function placeAt(state: GameState, p: Point): { readonly place: Place; readonly error: string | null } | null {
  const pick = snapSquare(state.map, p, (col, row) => original.placeError(state, col, row) === null);
  if (!pick) return null;
  const place = { col: pick.col, row: pick.row };
  return { place, error: pick.open ? null : original.placeError(state, place.col, place.row) };
}

/** Whether cell (col, row) is one of the 2 × 2 place's. */
export function inPlace(place: Place, col: number, row: number): boolean {
  return col >= place.col && col < place.col + 2 && row >= place.row && row < place.row + 2;
}

/** The world point at the middle of a 2 × 2 place. */
export function placeCentre(place: Place): Point {
  return { x: (place.col + 1) * CELL, y: (place.row + 1) * CELL };
}

/** Whether cell (col, row) is Open ground: neither road nor Scenery, whether or not a tower stands on it. */
export function isOpenGround(state: GameState, col: number, row: number): boolean {
  return state.map.terrain[row]?.[col] === '.';
}

/** Why a tap on road or Scenery builds nothing, in the hint's words ("Not on the road", "Nothing stands in the river"); null on Open ground. */
export function groundWhyNot(state: GameState, col: number, row: number): string | null {
  const ground = state.map.terrain[row]?.[col];
  if (ground === undefined || ground === '.') return null;
  if (ground === ',') return 'Not on the road';
  return `Nothing stands ${sceneryAt(state.map, col, row)?.at ?? 'there'}`;
}

/**
 * Where a mouse ring's Ghost stands with the mouse at `p`: on the 2 × 2 the
 * pointer snaps to, red where it can't go. While the mouse is off the board,
 * on a tower (a click there selects it) or on the ring's own 2 × 2, it stands
 * on the ring's place.
 */
export function followPlace(state: GameState, r: RingState, p: Point | null): Place {
  const cell = p ? cellAtPoint(state, p) : null;
  if (!p || !cell || inPlace(r.place, cell.col, cell.row) || state.grid[cell.row * state.map.cols + cell.col] !== 0) return r.place;
  return placeAt(state, p)?.place ?? r.place;
}

/** Where the picked family's Ghost stands now: under the mouse for a mouse ring, else on the ring's place. */
export function ghostPlace(view: RunView): Place | null {
  const r = ring.value;
  if (!r) return null;
  return r.family && r.kind === 'mouse' ? followPlace(view.state, r, view.pointer?.() ?? null) : r.place;
}

/** Opens the ring on `place`, or moves it there keeping the family picked, whose Ghost follows. */
export function openRing(view: RunView, place: Place, kind: PointerKind): void {
  view.select(0);
  const family = ring.value?.family ?? null;
  ring.value = { place, family, kind };
  view.showGhost?.(family ? placeCentre(place) : null, kind);
}

export function closeRing(view: RunView): void {
  if (ring.value === null) return;
  ring.value = null;
  view.showGhost?.(null);
}

/**
 * Builds the picked family where its Ghost stands, or on `at`. A refusal (the
 * ground, gold, the Tower cap) keeps the ring open and the Run says why; a
 * build closes it.
 */
export function buildPicked(view: RunView, at?: Place): void {
  const r = ring.value;
  const place = at ?? ghostPlace(view);
  if (!r?.family || !place) return;
  const option = original.placeInfo(view.state, place.col, place.row).options.find((o) => o.family === r.family);
  if (!option) return;
  view.send({ type: 'original.build', col: place.col, row: place.row, spec: option.spec });
  if (option.blocked === null) closeRing(view);
}

/** A tap on a family in the ring, or its hotkey: the first shows its Ghost, a second builds it. */
export function pickFamily(view: RunView, family: Family): void {
  const r = ring.value;
  if (!r) return;
  if (r.family === family) {
    buildPicked(view);
    return;
  }
  ring.value = { ...r, family };
  view.showGhost?.(placeCentre(r.place), r.kind);
  view.refresh();
}
