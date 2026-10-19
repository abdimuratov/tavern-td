import type { Cell, MapSpec, RouteSpec, ScenerySpec } from '../../sim';

// Original Maps (docs/original-design.md §12, §17): 32 × 18 cells of 64 units.
// A Stage declares only its routes, air lines and Scenery; stageMap paints
// the terrain from them, so the cells and the polylines can never disagree.
// Every route leg runs along a row or column boundary and is two cells wide:
// `,` is road, `#` Scenery, `.` Open ground (everything else, where a 2 × 2
// tower may stand).

export const MAP_COLS = 32;
export const MAP_ROWS = 18;
const CELL = 64;

export interface StageRoute {
  /** World units, spawn first, exit last; each leg horizontal or vertical, on cell boundaries. */
  readonly points: readonly (readonly [number, number])[];
  /** The air line its flyers follow: 2–4 points from the spawn to the exit. */
  readonly air: readonly (readonly [number, number])[];
}

function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(max - 1, v));
}

/** The cells a leg from a to b paints: two wide, centred on the leg, running one cell past each end to fill the corners. */
function legCells(a: readonly [number, number], b: readonly [number, number]): Cell[] {
  const cells: Cell[] = [];
  const [ax, ay] = a;
  const [bx, by] = b;
  if (ay === by) {
    const row = ay / CELL;
    for (let col = Math.floor(Math.min(ax, bx) / CELL) - 1; col <= Math.ceil(Math.max(ax, bx) / CELL); col++) cells.push([col, row - 1], [col, row]);
  } else if (ax === bx) {
    const col = ax / CELL;
    for (let row = Math.floor(Math.min(ay, by) / CELL) - 1; row <= Math.ceil(Math.max(ay, by) / CELL); row++) cells.push([col - 1, row], [col, row]);
  } else {
    throw new Error(`route leg (${ax}, ${ay}) → (${bx}, ${by}) is neither horizontal nor vertical`);
  }
  return cells;
}

/** The road cell a route end point stands on. */
function endCell(p: readonly [number, number]): Cell {
  return [clamp(Math.floor(p[0] / CELL), MAP_COLS), clamp(Math.floor(p[1] / CELL), MAP_ROWS)];
}

/**
 * A Stage's Map: its routes (the first one's spawn is the Map's spawn) and its
 * Scenery. The road is painted first and Scenery after, on every cell but the
 * road's: a rectangle may cross the road, which stays road (a bridge, a ford).
 */
export function stageMap(id: string, routes: readonly StageRoute[], scenery: readonly ScenerySpec[]): MapSpec {
  const grid = Array.from({ length: MAP_ROWS }, () => Array.from({ length: MAP_COLS }, () => '.'));
  for (const r of routes) {
    for (let i = 1; i < r.points.length; i++) {
      for (const [col, row] of legCells(r.points[i - 1]!, r.points[i]!)) {
        if (col >= 0 && row >= 0 && col < MAP_COLS && row < MAP_ROWS) grid[row]![col] = ',';
      }
    }
  }
  for (const piece of scenery) {
    for (const [col, row, w, h] of piece.rects) {
      if (col < 0 || row < 0 || col + w > MAP_COLS || row + h > MAP_ROWS) throw new Error(`Map ${id}: ${piece.name} runs off the Map`);
      for (let rr = row; rr < row + h; rr++) for (let c = col; c < col + w; c++) if (grid[rr]![c] !== ',') grid[rr]![c] = '#';
    }
  }
  const exits = routes.map((r) => endCell(r.points[r.points.length - 1]!));
  const routeSpecs: RouteSpec[] = routes.map((r) => ({ points: r.points, air: r.air }));
  return {
    id,
    cols: MAP_COLS,
    rows: MAP_ROWS,
    terrain: grid.map((row) => row.join('')),
    spawn: endCell(routes[0]!.points[0]!),
    waypoints: [exits],
    routes: routeSpecs,
    scenery,
  };
}
