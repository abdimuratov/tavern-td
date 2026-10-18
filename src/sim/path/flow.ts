import type { GameState } from '../core/state';
import { placementError } from './block';
import { mapData, nearestPart, openCells, walkOverIds, type MapData, type Point } from './grid';

// One flow field per route segment: the octile distance from every cell to that
// segment's waypoint region, plus the downhill neighbour to step to. Fields are
// derived data, so they live in a cache keyed by the state object and rebuild
// when `pathVersion` moves; a JSON-restored state rebuilds identical ones.

export interface Flow {
  readonly version: number;
  readonly map: GameState['map'];
  /** dist[segment][cell]; Infinity where the region can't be reached. */
  readonly dist: readonly Float64Array[];
  /** next[segment][cell]: the neighbour to step to, -1 inside the region or when unreachable. */
  readonly next: readonly Int32Array[];
}

/** Neighbour offsets: N, E, S, W, then NE, SE, SW, NW. Orthogonal first breaks ties toward straight steps. */
const DC = [0, 1, 0, -1, 1, 1, -1, -1] as const;
const DR = [-1, 0, 1, 0, -1, 1, 1, -1] as const;
const STEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2] as const;
/** Two routes this close in length count as equal, so float noise never decides a tie. */
const TIE = 1e-9;

const flows = new WeakMap<GameState, Flow>();

export function flow(state: GameState): Flow {
  const cached = flows.get(state);
  if (cached && cached.version === state.pathVersion && cached.map === state.map) return cached;
  const md = mapData(state.map);
  const built: Flow = { version: state.pathVersion, map: state.map, ...fields(md, openCells(md, state.grid, walkOverIds(state))) };
  flows.set(state, built);
  return built;
}

function fields(md: MapData, open: Uint8Array): Pick<Flow, 'dist' | 'next'> {
  const dist: Float64Array[] = [];
  const next: Int32Array[] = [];
  for (const region of md.regions) {
    const d = distances(md, open, region);
    dist.push(d);
    next.push(downhill(md, open, d));
  }
  return { dist, next };
}

/** Whether a step from (c, r) in direction k stays on open cells without cutting a corner. */
function canStep(md: MapData, open: Uint8Array, c: number, r: number, k: number): number {
  const nc = c + DC[k]!;
  const nr = r + DR[k]!;
  if (nc < 0 || nr < 0 || nc >= md.cols || nr >= md.rows) return -1;
  const n = nr * md.cols + nc;
  if (open[n] !== 1) return -1;
  if (k >= 4 && (open[r * md.cols + nc] !== 1 || open[nr * md.cols + c] !== 1)) return -1;
  return n;
}

/** Dijkstra from the region outward. Moves are symmetric, so distance to the region equals distance from it. */
function distances(md: MapData, open: Uint8Array, targets: Int32Array): Float64Array {
  const dist = new Float64Array(md.size).fill(Infinity);
  const heap = new MinHeap();
  for (const t of targets) {
    if (open[t] === 1 && dist[t] !== 0) {
      dist[t] = 0;
      heap.push(0, t);
    }
  }
  while (heap.size > 0) {
    const d = heap.peekKey();
    const u = heap.pop();
    if (d > dist[u]!) continue;
    const c = u % md.cols;
    const r = (u - c) / md.cols;
    for (let k = 0; k < 8; k++) {
      const v = canStep(md, open, c, r, k);
      if (v < 0) continue;
      const nd = d + STEP[k]!;
      if (nd < dist[v]!) {
        dist[v] = nd;
        heap.push(nd, v);
      }
    }
  }
  return dist;
}

function downhill(md: MapData, open: Uint8Array, dist: Float64Array): Int32Array {
  const next = new Int32Array(md.size).fill(-1);
  for (let u = 0; u < md.size; u++) {
    const du = dist[u]!;
    if (open[u] !== 1 || du === 0 || du === Infinity) continue;
    const c = u % md.cols;
    const r = (u - c) / md.cols;
    let best = -1;
    let bestLen = Infinity;
    for (let k = 0; k < 8; k++) {
      const v = canStep(md, open, c, r, k);
      if (v < 0) continue;
      const len = dist[v]! + STEP[k]!;
      if (len < bestLen - TIE) {
        best = v;
        bestLen = len;
      }
    }
    next[u] = best;
  }
  return next;
}

/** Binary min-heap of (key, cell), ordered by key then cell so pop order never depends on insertion luck. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  peekKey(): number {
    return this.keys[0]!;
  }

  push(key: number, val: number): void {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(key, val, keys[p]!, vals[p]!)) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0]!;
    const key = keys.pop()!;
    const val = vals.pop()!;
    const n = keys.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      const m = r < n && less(keys[r]!, vals[r]!, keys[l]!, vals[l]!) ? r : l;
      if (!less(keys[m]!, vals[m]!, key, val)) break;
      keys[i] = keys[m]!;
      vals[i] = vals[m]!;
      i = m;
    }
    keys[i] = key;
    vals[i] = val;
    return top;
  }
}

function less(ka: number, va: number, kb: number, vb: number): boolean {
  return ka < kb || (ka === kb && va < vb);
}

/** Octile distance from `cell` to waypoint region `segment`, Infinity when it can't be reached. */
export function pathDistance(state: GameState, segment: number, cell: number): number {
  return flow(state).dist[segment]?.[cell] ?? Infinity;
}

/** The neighbour a ground creep in `cell` heading for region `segment` steps to, or -1. */
export function nextCell(state: GameState, segment: number, cell: number): number {
  return flow(state).next[segment]?.[cell] ?? -1;
}

/**
 * The ground route as cells: spawn `spawn`, through each checkpoint, into the exit.
 * For the renderer's live path line. Stops early if a segment is unreachable.
 */
export function routeCells(state: GameState, spawn = 0): number[] {
  return trace(mapData(state.map), flow(state).next, spawn);
}

/** The ground route from every spawn, spawn 0 first. */
export function allRouteCells(state: GameState): number[][] {
  const md = mapData(state.map);
  const next = flow(state).next;
  return md.spawns.map((_, i) => trace(md, next, i));
}

/**
 * The route as it would run with structures on `cells`, for the path preview
 * while placing; null when the placement would be refused. Leaves the state untouched.
 */
export function previewRoute(state: GameState, cells: readonly number[], spawn = 0): number[] | null {
  return previewAllRoutes(state, cells)?.[spawn] ?? null;
}

/** previewRoute from every spawn, spawn 0 first, building the fields once. */
export function previewAllRoutes(state: GameState, cells: readonly number[]): number[][] | null {
  if (placementError(state, cells) !== null) return null;
  const md = mapData(state.map);
  const open = openCells(md, state.grid, walkOverIds(state));
  for (const c of cells) open[c] = 0;
  const next = fields(md, open).next;
  return md.spawns.map((_, i) => trace(md, next, i));
}

function trace(md: MapData, next: readonly Int32Array[], spawn: number): number[] {
  const last = md.regions.length;
  let cell = md.spawns[spawn] ?? md.spawn;
  let seg = 0;
  const route = [cell];
  const limit = md.size * last + 1;
  while (route.length <= limit) {
    while (md.inRegion[seg]![cell] === 1) {
      seg++;
      if (seg >= last) return route;
    }
    const n = next[seg]![cell]!;
    if (n < 0) return route;
    route.push(n);
    cell = n;
  }
  return route;
}

/** The air route from spawn `spawn`: its centre, then the nearest place of each waypoint region in turn. */
export function airRoute(state: GameState, spawn = 0): Point[] {
  const md = mapData(state.map);
  const start = md.spawnPoints[spawn] ?? md.spawnPoints[0]!;
  const out: Point[] = [{ x: start.x, y: start.y }];
  for (let seg = 0; seg < md.regions.length; seg++) {
    const from = out[out.length - 1]!;
    const p = nearestPart(md, seg, from.x, from.y);
    out.push({ x: p.x, y: p.y });
  }
  return out;
}
