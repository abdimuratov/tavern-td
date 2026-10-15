import type { Point } from './camera';

export interface GestureHandlers {
  /** A press that didn't move far and didn't become a pinch. */
  tap(p: Point): void;
  pan(dx: number, dy: number): void;
  zoom(anchor: Point, factor: number): void;
}

/** Beyond this many CSS pixels of movement a press is a drag, not a tap. */
const TAP_SLOP = 8;

/**
 * Turns raw pointer events on `el` into tap, pan and zoom. One finger or the
 * mouse drags to pan, two fingers pinch, and the wheel or trackpad zooms.
 */
export function attachGestures(el: HTMLElement, on: GestureHandlers): () => void {
  const pointers = new Map<number, Point>();
  let tapCandidate: { id: number; start: Point } | null = null;
  let lastPinch: { mid: Point; dist: number } | null = null;

  const local = (e: PointerEvent | WheelEvent): Point => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchState = (): { mid: Point; dist: number } | null => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return null;
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist: Math.hypot(a.x - b.x, a.y - b.y),
    };
  };

  const down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      tapCandidate = { id: e.pointerId, start: p };
    } else {
      tapCandidate = null;
      lastPinch = pinchState();
    }
  };

  const move = (e: PointerEvent): void => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.set(e.pointerId, p);

    if (pointers.size >= 2) {
      const now = pinchState();
      if (now && lastPinch) {
        on.pan(now.mid.x - lastPinch.mid.x, now.mid.y - lastPinch.mid.y);
        if (lastPinch.dist > 0) on.zoom(now.mid, now.dist / lastPinch.dist);
      }
      lastPinch = now;
      return;
    }

    if (tapCandidate && Math.hypot(p.x - tapCandidate.start.x, p.y - tapCandidate.start.y) > TAP_SLOP) {
      // The press became a drag: catch up with the movement swallowed by the slop.
      on.pan(p.x - tapCandidate.start.x, p.y - tapCandidate.start.y);
      tapCandidate = null;
      return;
    }
    if (!tapCandidate) on.pan(p.x - prev.x, p.y - prev.y);
  };

  const up = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && tapCandidate?.id === e.pointerId) on.tap(p);
    tapCandidate = null;
    lastPinch = pointers.size >= 2 ? pinchState() : null;
  };

  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel and a two-finger scroll pans. A
    // mouse wheel moves in coarse, purely vertical notches, and zooms.
    const mouseNotch = e.deltaMode !== 0
      || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
    if (e.ctrlKey) {
      on.zoom(local(e), Math.exp(-e.deltaY * 0.01));
    } else if (mouseNotch) {
      on.zoom(local(e), e.deltaY < 0 ? 1.15 : 1 / 1.15);
    } else {
      on.pan(-e.deltaX, -e.deltaY);
    }
  };

  // Safari's own pinch-zoom gesture events would fight ours.
  const stopGesture = (e: Event): void => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('gesturestart', stopGesture);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('gesturestart', stopGesture);
  };
}
