import { signal } from '@preact/signals';
import type { Family } from '../../../content/original';
import type { PointerKind } from '../../../render/gestures';
import { buildSpotAt, CELL, original, type GameState, type Point } from '../../../sim';
import type { RunView } from '../../mode-ui';

// The build ring (docs/original-design.md §3): tap an empty Build Spot and a
// ring shows the unlocked families with their prices; tap one for its Ghost
// and range, then tap it (or the Ghost) again to build. None of this is in
// the Run: it is only what the player is in the middle of picking.

export interface RingState {
  /** The Build Spot it is open on, by its index in the Map's list. */
  readonly spot: number;
  /** The family picked, whose Ghost stands on the Spot; null until one is. */
  readonly family: Family | null;
  /** The pointer that opened it, for the hint's words. */
  readonly kind: PointerKind;
}

export const ring = signal<RingState | null>(null);

/** Mac hotkeys in ring order, WC3's top row. */
export const RING_KEYS = ['q', 'w', 'e', 'r', 't', 'y'] as const;

/** The Build Spot under world point `p`, or -1. */
export function spotAtPoint(state: GameState, p: Point): number {
  if (p.x < 0 || p.y < 0) return -1;
  return buildSpotAt(state.map, Math.floor(p.x / CELL), Math.floor(p.y / CELL));
}

/** The world point at the middle of Build Spot `spot`. */
export function spotCentre(state: GameState, spot: number): Point | null {
  const s = state.map.buildSpots?.[spot];
  return s ? { x: (s[0] + 1) * CELL, y: (s[1] + 1) * CELL } : null;
}

export function openRing(view: RunView, spot: number, kind: PointerKind): void {
  view.select(0);
  ring.value = { spot, family: null, kind };
  view.showGhost?.(null);
}

export function closeRing(view: RunView): void {
  if (ring.value === null) return;
  ring.value = null;
  view.showGhost?.(null);
}

/** Builds the picked family on the ring's Spot. A refusal (gold) keeps the ring open; the Run says why. */
export function buildPicked(view: RunView): void {
  const r = ring.value;
  if (!r?.family) return;
  const option = original.spotInfo(view.state, r.spot).options.find((o) => o.family === r.family);
  if (!option) return;
  view.send({ type: 'original.build', spot: r.spot, spec: option.spec });
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
  const centre = spotCentre(view.state, r.spot);
  if (centre) view.showGhost?.(centre, r.kind);
  view.refresh();
}
