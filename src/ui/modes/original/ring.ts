import { signal } from '@preact/signals';
import type { Family } from '../../../content/original';
import type { PointerKind } from '../../../render/gestures';
import { CELL, original, type GameState, type Point } from '../../../sim';
import type { RunView } from '../../mode-ui';

// The build ring (docs/original-design.md §3, §17): tap Open ground and a ring
// shows the unlocked families with their prices round the 2 × 2 there; tap
// one for its Ghost and range, then tap it (or the Ghost) again to build.
// None of this is in the Run: it is only what the player is in the middle of picking.

/** A 2 × 2 place by its top-left cell. */
export interface Place {
  readonly col: number;
  readonly row: number;
}

export interface RingState {
  /** The 2 × 2 of Open ground it is open on. */
  readonly place: Place;
  /** The family picked, whose Ghost stands on the place; null until one is. */
  readonly family: Family | null;
  /** The pointer that opened it, for the hint's words. */
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
 * The 2 × 2 a tap at `p` takes, as Element's Ghost snaps: of the four that
 * cover the tapped cell, the open one whose centre is nearest the tap; with
 * none open, the one centred nearest the tap, with the reason. Null off the Map.
 */
export function placeAt(state: GameState, p: Point): { readonly place: Place; readonly error: string | null } | null {
  const cell = cellAtPoint(state, p);
  if (!cell) return null;
  const clamp = (v: number, n: number): number => Math.min(n - 2, Math.max(0, v));
  let best: { place: Place; d: number } | null = null;
  for (let dr = -1; dr <= 0; dr++) {
    for (let dc = -1; dc <= 0; dc++) {
      const place = { col: clamp(cell.col + dc, state.map.cols), row: clamp(cell.row + dr, state.map.rows) };
      if (original.placeError(state, place.col, place.row) !== null) continue;
      const cx = (place.col + 1) * CELL - p.x;
      const cy = (place.row + 1) * CELL - p.y;
      const d = cx * cx + cy * cy;
      if (!best || d < best.d) best = { place, d };
    }
  }
  if (best) return { place: best.place, error: null };
  const place = { col: clamp(Math.round(p.x / CELL) - 1, state.map.cols), row: clamp(Math.round(p.y / CELL) - 1, state.map.rows) };
  return { place, error: original.placeError(state, place.col, place.row) };
}

/** Whether cell (col, row) is one of the 2 × 2 place's. */
export function inPlace(place: Place, col: number, row: number): boolean {
  return col >= place.col && col < place.col + 2 && row >= place.row && row < place.row + 2;
}

/** The world point at the middle of a 2 × 2 place. */
export function placeCentre(place: Place): Point {
  return { x: (place.col + 1) * CELL, y: (place.row + 1) * CELL };
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

/** Builds the picked family on the ring's place. A refusal (gold, the Tower cap) keeps the ring open; the Run says why. */
export function buildPicked(view: RunView): void {
  const r = ring.value;
  if (!r?.family) return;
  const option = original.placeInfo(view.state, r.place.col, r.place.row).options.find((o) => o.family === r.family);
  if (!option) return;
  view.send({ type: 'original.build', col: r.place.col, row: r.place.row, spec: option.spec });
  if (option.blocked === null) closeRing(view);
}

/** A tap on a family in the ring: the first shows its Ghost, a second builds it. */
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
