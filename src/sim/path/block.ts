import type { GameState } from '../core/state';
import { cellAt, mapData, openCells, type MapData } from './grid';

export type PlacementError = 'out of bounds' | 'unbuildable' | 'occupied' | 'creep in the way' | 'blocks the path';

/**
 * Why structures can't go on `cells` right now, or null when they can.
 * Every placement goes through this, so a Block is never built.
 */
export function placementError(state: GameState, cells: readonly number[]): PlacementError | null {
  const md = mapData(state.map);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (!Number.isInteger(c) || c < 0 || c >= md.size) return 'out of bounds';
    if (md.buildable[c] !== 1) return 'unbuildable';
    if (state.grid[c] !== 0 || cells.indexOf(c) !== i) return 'occupied';
  }
  return blockError(state, md, cells);
}

/**
 * The Block check: true if closing `cells` would cut any route segment, land
 * on a ground creep, or strand a live ground creep from its next waypoint.
 */
export function wouldBlock(state: GameState, cells: readonly number[]): boolean {
  return blockError(state, mapData(state.map), cells) !== null;
}

function blockError(state: GameState, md: MapData, cells: readonly number[]): 'creep in the way' | 'blocks the path' | null {
  for (const creep of state.creeps) {
    if (creep.hp > 0 && !creep.air && cells.includes(cellAt(md, creep.x, creep.y))) return 'creep in the way';
  }
  const open = openCells(md, state.grid);
  for (const c of cells) if (c >= 0 && c < md.size) open[c] = 0;

  // With no corner cutting, 8-way reachability equals 4-way reachability, so
  // one flood fill into components answers every "can this cell reach that region".
  const comp = components(md, open);
  const reach = md.regions.map((region) => {
    const mark = new Uint8Array(comp.count);
    for (const c of region) if (comp.label[c]! >= 0) mark[comp.label[c]!] = 1;
    return mark;
  });
  const canReach = (cell: number, seg: number): boolean => {
    const l = cell >= 0 ? comp.label[cell]! : -1;
    return l >= 0 && reach[seg]![l] === 1;
  };

  if (!canReach(md.spawn, 0)) return 'blocks the path';
  for (let seg = 1; seg < md.regions.length; seg++) {
    for (const c of md.regions[seg - 1]!) if (open[c] === 1 && !canReach(c, seg)) return 'blocks the path';
  }
  for (const creep of state.creeps) {
    if (creep.hp > 0 && !creep.air && !canReach(cellAt(md, creep.x, creep.y), creep.seg)) return 'blocks the path';
  }
  return null;
}

function components(md: MapData, open: Uint8Array): { label: Int32Array; count: number } {
  const label = new Int32Array(md.size).fill(-1);
  const stack = new Int32Array(md.size);
  let count = 0;
  for (let start = 0; start < md.size; start++) {
    if (open[start] !== 1 || label[start] !== -1) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = count;
    while (top > 0) {
      const u = stack[--top]!;
      const c = u % md.cols;
      const visit = (v: number): void => {
        if (open[v] === 1 && label[v] === -1) {
          label[v] = count;
          stack[top++] = v;
        }
      };
      if (c > 0) visit(u - 1);
      if (c < md.cols - 1) visit(u + 1);
      if (u >= md.cols) visit(u - md.cols);
      if (u + md.cols < md.size) visit(u + md.cols);
    }
    count++;
  }
  return { label, count };
}
