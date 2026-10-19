import type { GameState } from '../core/state';
import { placementError } from './block';
import { mapData, nearestPart, openCells, walkOverIds, type MapData, type Point } from './grid';

// One flow field per route segment: the octile distance from every cell to that
// segment's waypoint region, plus the downhill neighbour to step to, worked out
// the first time a cell asks. Fields are derived data, so they live in a cache
// keyed by the state object and rebuild when `pathVersion` moves; a
// JSON-restored state rebuilds identical ones.

export interface Flow extends Fields {
  readonly version: number;
  readonly map: GameState['map'];
}

/** A build's fields. Read a cell's next step through stepOf(), which works it out the first time it's asked. */
interface Fields {
  /** dist[segment][cell]; Infinity where the region can't be reached. */
  readonly dist: readonly Float64Array[];
  /** next[segment][cell]: the neighbour to step to, -1 inside the region or when unreachable, NOT_YET until asked. */
  readonly next: readonly Int32Array[];
  /** Each cell's open steps (stepMasks) and its neighbours, for working out a next step. */
  readonly moves: Uint8Array;
  readonly nb: Int32Array;
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

/** A next step not worked out yet. */
const NOT_YET = -2;

function fields(md: MapData, open: Uint8Array): Fields {
  const dist: Float64Array[] = [];
  const next: Int32Array[] = [];
  const nb = neighbours(md);
  const moves = stepMasks(md, open, nb);
  const done = new Uint8Array(md.size);
  for (const region of md.regions) {
    dist.push(distances(md, open, region, nb, moves, done));
    next.push(new Int32Array(md.size).fill(NOT_YET));
  }
  return { dist, next, moves, nb };
}

/** For a diagonal step k, the two straight neighbours it passes between (no corner cutting): the column step's, then the row step's. */
const SIDE_A = [0, 0, 0, 0, 1, 1, 3, 3] as const;
const SIDE_B = [0, 0, 0, 0, 0, 2, 2, 0] as const;

const neighbourCache = new WeakMap<MapData, Int32Array>();

/** Every cell's 8 neighbours in DC/DR order, -1 off the Map: entry cell × 8 + k. Derived from the Map's size alone. */
function neighbours(md: MapData): Int32Array {
  const cached = neighbourCache.get(md);
  if (cached) return cached;
  const nb = new Int32Array(md.size * 8);
  for (let u = 0; u < md.size; u++) {
    const c = u % md.cols;
    const r = (u - c) / md.cols;
    for (let k = 0; k < 8; k++) {
      const nc = c + DC[k]!;
      const nr = r + DR[k]!;
      nb[u * 8 + k] = nc < 0 || nr < 0 || nc >= md.cols || nr >= md.rows ? -1 : nr * md.cols + nc;
    }
  }
  neighbourCache.set(md, nb);
  return nb;
}

/**
 * Per cell, bit k set when a step in direction k stays on open cells without
 * cutting a corner: worked out once per build and shared by every region.
 */
function stepMasks(md: MapData, open: Uint8Array, nb: Int32Array): Uint8Array {
  const moves = new Uint8Array(md.size);
  for (let u = 0; u < md.size; u++) {
    if (open[u] !== 1) continue;
    let m = 0;
    for (let k = 0; k < 8; k++) {
      const v = nb[u * 8 + k]!;
      if (v < 0 || open[v] !== 1) continue;
      if (k >= 4 && (open[nb[u * 8 + SIDE_A[k]!]!] !== 1 || open[nb[u * 8 + SIDE_B[k]!]!] !== 1)) continue;
      m |= 1 << k;
    }
    moves[u] = m;
  }
  return moves;
}

/**
 * Dijkstra from the region outward. Moves are symmetric, so distance to the
 * region equals distance from it. A cell's distance is the least of its
 * neighbours' distances plus the step, so every correct Dijkstra gives the
 * same floats; this one keeps its queue in buckets one cell wide. Every step
 * is at least 1, so a cell's best neighbour sits in an earlier bucket and two
 * cells in one bucket never shorten each other: a bucket's cells are final
 * when it is reached, in any order, and new ones land one or two buckets on,
 * so three buckets in a ring hold the queue.
 */
function distances(md: MapData, open: Uint8Array, targets: Int32Array, nb: Int32Array, moves: Uint8Array, done: Uint8Array): Float64Array {
  const dist = new Float64Array(md.size).fill(Infinity);
  done.fill(0);
  const ring: number[][] = [[], [], []];
  let queued = 0;
  for (const t of targets) {
    if (open[t] === 1 && dist[t] !== 0) {
      dist[t] = 0;
      ring[0]!.push(t);
      queued++;
    }
  }
  for (let b = 0; queued > 0; b++) {
    const bucket = ring[b % 3]!;
    // Nothing joins this bucket while it is read: every new distance is at least b + 1.
    for (let i = 0; i < bucket.length; i++) {
      const u = bucket[i]!;
      if (done[u] === 1) continue;
      done[u] = 1;
      const d = dist[u]!;
      const m = moves[u]!;
      for (let k = 0; k < 8; k++) {
        if ((m & (1 << k)) === 0) continue;
        const v = nb[u * 8 + k]!;
        const nd = d + STEP[k]!;
        if (nd < dist[v]!) {
          dist[v] = nd;
          ring[Math.floor(nd) % 3]!.push(v);
          queued++;
        }
      }
    }
    queued -= bucket.length;
    bucket.length = 0;
  }
  return dist;
}

/**
 * The neighbour a ground creep in `cell` heading for region `segment` steps
 * to: the open neighbour with the shortest way on, straight steps first on a
 * tie; -1 inside the region or when it can't be reached. Worked out the first
 * time a cell is asked and kept, since creeps and routes visit few cells.
 */
export function stepOf(fl: Fields, segment: number, cell: number): number {
  const next = fl.next[segment];
  const known = next?.[cell];
  if (known === undefined) return -1;
  if (known !== NOT_YET) return known;
  const dist = fl.dist[segment]!;
  const du = dist[cell]!;
  let best = -1;
  if (du !== 0 && du !== Infinity) {
    let bestLen = Infinity;
    const m = fl.moves[cell]!;
    for (let k = 0; k < 8; k++) {
      if ((m & (1 << k)) === 0) continue;
      const v = fl.nb[cell * 8 + k]!;
      const len = dist[v]! + STEP[k]!;
      if (len < bestLen - TIE) {
        best = v;
        bestLen = len;
      }
    }
  }
  next![cell] = best;
  return best;
}

/** Octile distance from `cell` to waypoint region `segment`, Infinity when it can't be reached. */
export function pathDistance(state: GameState, segment: number, cell: number): number {
  return flow(state).dist[segment]?.[cell] ?? Infinity;
}

/** The neighbour a ground creep in `cell` heading for region `segment` steps to, or -1. */
export function nextCell(state: GameState, segment: number, cell: number): number {
  return stepOf(flow(state), segment, cell);
}

/**
 * The ground route as cells: spawn `spawn`, through each checkpoint, into the exit.
 * For the renderer's live path line. Stops early if a segment is unreachable.
 */
export function routeCells(state: GameState, spawn = 0): number[] {
  return trace(mapData(state.map), flow(state), spawn);
}

/** The ground route from every spawn, spawn 0 first. */
export function allRouteCells(state: GameState): number[][] {
  const md = mapData(state.map);
  const fl = flow(state);
  return md.spawns.map((_, i) => trace(md, fl, i));
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
  const fl = fields(md, open);
  return md.spawns.map((_, i) => trace(md, fl, i));
}

function trace(md: MapData, fl: Fields, spawn: number): number[] {
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
    const n = stepOf(fl, seg, cell);
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
