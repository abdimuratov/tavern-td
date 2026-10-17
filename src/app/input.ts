import type { Board } from '../render/board';
import { boxCentre, cellAtPoint, cellsBox, sameCells, towerCells } from '../render/footprint';
import type { PointerKind } from '../render/gestures';
import {
  CELL, findTower, getMode, placementError, previewRoute, routeCells, routePolyline, towerMods,
  type GameState, type Point, type SimEvent, type Tower,
} from '../sim';
import type { ModeUi, Placement, RunView } from '../ui/mode-ui';
import { hint, revision, selected, type HintTone } from '../ui/state';
import type { RunController } from './controller';
import type { Feedback } from './feedback';

export interface InputDeps {
  readonly controller: RunController;
  readonly board: Board;
  readonly ui: ModeUi;
  readonly view: RunView;
  readonly feedback: Feedback;
}

interface Ghost {
  /** Where the pointer was, so the same footprint can be re-checked as the Run moves. */
  readonly p: Point;
  readonly placement: Placement;
  readonly error: string | null;
  readonly by: PointerKind;
}

/** A ghost is re-checked this often while it is up: creeps walk into and out of its footprint. */
const RECHECK_TICKS = 3;
const FLASH_MS = 1800;

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The structure on a cell: the grid's id, or a tower whose footprint covers it (structures creeps walk over aren't on the grid). */
export function towerAt(state: GameState, cell: number): Tower | undefined {
  const id = state.grid[cell] ?? 0;
  if (id !== 0) {
    const t = findTower(state, id);
    if (t) return t;
  }
  for (const t of state.towers) {
    const cells = (t as Tower & { readonly cells?: readonly number[] }).cells;
    if (cells ? cells.includes(cell) : t.cell === cell) return t;
  }
  return undefined;
}

/** Attack range, or the widest aura for a tower without an attack, in world units. */
export function reach(state: GameState, spec: string, tower?: Tower): number {
  const ts = getMode(state.modeId).towers[spec];
  if (!ts) return 0;
  if (ts.attack) return ts.attack.range + (tower ? towerMods(tower).range : 0);
  let r = 0;
  for (const a of ts.auras ?? []) r = Math.max(r, a.radius);
  return r;
}

/**
 * Pointer input on the board. Touch: a tap shows a ghost, a second tap inside
 * it builds, a tap elsewhere moves it, a tap on a tower selects it. Mouse:
 * the ghost follows the pointer and a click builds. Either way the ghost is
 * red with a reason when the Map refuses it, and the path line shows the route
 * the placement would make. What gets built is the Game Mode's call.
 */
export function createInput({ controller, board, ui, view, feedback }: InputDeps) {
  let ghost: Ghost | null = null;
  let mouse: Point | null = null;
  let routeVersion = -1;
  let routeShown: readonly number[] | null = null;
  let sinceCheck = 0;
  let flashUntil = 0;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  const state = (): GameState => controller.state;

  function evaluate(p: Point, by: PointerKind): Ghost | null {
    const s = state();
    if (s.phase === 'won' || s.phase === 'lost') return null;
    const placement = ui.placement?.(view, p) ?? null;
    if (!placement || placement.cells.length === 0) return null;
    const error = placement.checked ? (placement.error ?? null) : placement.error ?? placementError(s, placement.cells);
    return { p, placement, error, by };
  }

  /**
   * The route to draw, worked out at most once per frame: on a big Map a
   * preview is a few milliseconds, and a pan can move the ghost every event.
   */
  let routeWanted: 'current' | 'preview' | null = null;

  function currentRoute(): void {
    routeVersion = state().pathVersion;
    routeWanted = 'current';
  }

  function flushRoute(): void {
    if (!routeWanted) return;
    const s = state();
    // A fixed route never changes, so it is drawn as the line creeps walk.
    const line = routePolyline(s);
    if (line.length >= 2) {
      routeWanted = null;
      routeShown = [];
      board.setRoutePath(line, 'current');
      return;
    }
    const preview = routeWanted === 'preview' && ghost !== null && ghost.error === null && ghost.placement.route !== false
      ? previewRoute(s, ghost.placement.cells) : null;
    routeWanted = null;
    routeShown = preview ?? routeCells(s);
    board.setRoute(routeShown, preview ? 'preview' : 'current');
  }

  function updateHint(): void {
    if (performance.now() < flashUntil) return;
    if (!ghost) {
      hint.value = null;
      return;
    }
    if (ghost.error) {
      hint.value = { text: sentence(ghost.error), tone: 'error' };
      return;
    }
    const what = ghost.placement.label ?? 'Build here';
    hint.value = { text: ghost.by === 'mouse' ? what : `${what}: tap again to build`, tone: 'ok' };
  }

  function flash(text: string, tone: HintTone, ms = FLASH_MS): void {
    flashUntil = performance.now() + ms;
    hint.value = { text: sentence(text), tone };
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashUntil = 0;
      updateHint();
    }, ms);
  }

  /** Whether a touch at `p` confirms the ghost: on its cells, or within its tap slop on screen. */
  function onGhost(g: Ghost, p: Point, cell: number): boolean {
    if (g.placement.cells.includes(cell)) return true;
    const slop = g.placement.tapSlop;
    if (!slop) return false;
    const c = boxCentre(cellsBox(state().map, g.placement.cells));
    const a = board.worldToClient(p);
    const b = board.worldToClient(c);
    return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) <= slop * slop;
  }

  function setGhost(next: Ghost | null): void {
    const prev = ghost;
    ghost = next;
    const s = state();
    if (!next) {
      if (prev) {
        board.setGhost(null);
        currentRoute();
        updateHint();
      }
      return;
    }
    const { cells, spec } = next.placement;
    const changed = !prev || !sameCells(prev.placement.cells, cells) || prev.placement.spec !== spec
      || prev.error !== next.error || routeVersion !== s.pathVersion;
    if (changed) {
      board.setGhost({
        box: cellsBox(s.map, cells),
        valid: next.error === null,
        look: spec ? board.looks.tower(spec) : next.placement.look ?? null,
        range: spec ? reach(s, spec) : 0,
      });
      routeVersion = s.pathVersion;
      routeWanted = next.error === null ? 'preview' : 'current';
    }
    updateHint();
  }

  function select(id: number): void {
    const s = state();
    const t = id === 0 ? undefined : findTower(s, id);
    selected.value = t ? t.id : 0;
    if (!t) {
      board.setSelection(null);
    } else {
      const box = cellsBox(s.map, towerCells(t));
      board.setSelection({ x: t.x, y: t.y, span: Math.min(box.w, box.h) * CELL, range: reach(s, t.spec, t) });
    }
    revision.value++;
  }

  function confirm(g: Ghost): void {
    if (g.error) {
      feedback.refused();
      flash(g.error, 'error');
      return;
    }
    controller.send(g.placement.command);
    // Hidden until the tick lands, so a double click can't send the same placement twice.
    setGhost(null);
  }

  /** The hover ghost: none over a tower (a click there selects it) or off the Map. */
  function hoverGhost(): void {
    if (!mouse) return;
    const s = state();
    const cell = cellAtPoint(s.map, mouse);
    setGhost(cell < 0 || towerAt(s, cell) ? null : evaluate(mouse, 'mouse'));
  }

  function cancel(): void {
    setGhost(null);
    select(0);
    ui.cancel?.(view);
    revision.value++;
  }

  return {
    tap(p: Point, kind: PointerKind): void {
      const s = state();
      const cell = cellAtPoint(s.map, p);
      if (cell < 0) {
        setGhost(null);
        select(0);
        return;
      }
      const tower = towerAt(s, cell);
      if (tower) {
        if (kind !== 'mouse') setGhost(null);
        feedback.tap();
        if (ui.tapTower?.(view, tower)) {
          revision.value++;
          return;
        }
        select(tower.id);
        return;
      }
      if (kind === 'mouse') {
        const g = evaluate(p, 'mouse');
        select(0);
        if (g) confirm(g);
        return;
      }
      if (ghost && ghost.by !== 'mouse' && onGhost(ghost, p, cell)) {
        const now = evaluate(ghost.p, kind);
        if (now) confirm(now);
        else setGhost(null);
        return;
      }
      select(0);
      const g = evaluate(p, kind);
      setGhost(g);
      if (g) feedback.tap();
    },
    hover(p: Point | null): void {
      mouse = p;
      if (!p) {
        if (ghost?.by === 'mouse') setGhost(null);
        return;
      }
      hoverGhost();
    },
    secondary(): void {
      cancel();
    },
    cancel,
    select,
    /** Whether Esc has something to drop: a tapped ghost or a selection. A mouse's hover ghost doesn't count. */
    busy(): boolean {
      return selected.value !== 0 || (ghost !== null && ghost.by !== 'mouse');
    },
    /** Re-reads the Game Mode's placement, after its own UI state changed. */
    refresh(): void {
      if (ghost?.by === 'mouse' || (!ghost && mouse)) hoverGhost();
      else if (ghost) setGhost(evaluate(ghost.p, ghost.by));
      revision.value++;
    },
    /** A rejection the HUD should explain, such as starting a Wave while one runs. */
    flash,
    /** Once per display frame, before the board draws. */
    frame: flushRoute,
    afterStep(s: GameState, events: readonly SimEvent[]): void {
      let structural = false;
      for (const e of events) {
        if (e.type === 'rejected') flash(e.reason, 'error');
        // A mode event can move structures too, such as Gem's swap.
        else if (e.type === 'placed' || e.type === 'removed' || e.type === 'changed' || e.type === 'waveStart'
          || e.type === 'waveEnd' || e.type === 'won' || e.type === 'lost' || e.type === 'mode') structural = true;
      }
      if (selected.value !== 0 && (structural || !findTower(s, selected.value))) select(selected.value);
      sinceCheck++;
      if (ghost || mouse) {
        if (structural || sinceCheck >= RECHECK_TICKS) {
          sinceCheck = 0;
          if (ghost?.by === 'mouse' || (!ghost && mouse)) hoverGhost();
          else if (ghost) setGhost(evaluate(ghost.p, ghost.by));
        }
      }
      if (!ghost && (routeVersion !== s.pathVersion || routeShown === null)) currentRoute();
    },
    /** A new Run: nothing selected, no ghost, the new Map's route. */
    reset(): void {
      ghost = null;
      board.setGhost(null);
      selected.value = 0;
      board.setSelection(null);
      flashUntil = 0;
      hint.value = null;
      currentRoute();
    },
  };
}

export type Input = ReturnType<typeof createInput>;
