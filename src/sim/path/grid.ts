import { CELL } from '../core/constants';
import type { MapSpec, ScenerySpec } from '../core/specs';
import type { GameState } from '../core/state';
import { getMode } from '../modes/registry';
import { routeProblem } from './route';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Static facts derived from a MapSpec. Not part of the state; rebuilt from it on demand. */
export interface MapData {
  readonly map: MapSpec;
  readonly cols: number;
  readonly rows: number;
  readonly size: number;
  readonly walkable: Uint8Array;
  readonly buildable: Uint8Array;
  /** Cell centres, indexed by cell. */
  readonly cx: Float64Array;
  readonly cy: Float64Array;
  /** Spawn 0: `spawn`. */
  readonly spawn: number;
  readonly spawnX: number;
  readonly spawnY: number;
  /** Every spawn's cell, spawn 0 first; just `spawn` on a Map without a `spawns` list. */
  readonly spawns: readonly number[];
  readonly spawnPoints: readonly Point[];
  /** Cells of each waypoint region, in visiting order; the exit is last. */
  readonly regions: readonly Int32Array[];
  /** inRegion[r][cell] is 1 when the cell belongs to region r. */
  readonly inRegion: readonly Uint8Array[];
  /** Mean of each region's cell centres. */
  readonly centres: readonly Point[];
  /**
   * Each region's places: the centre of every 4-connected group of its cells,
   * so a Checkpoint can stand in several places at once (Maul's two corners).
   * Air creeps fly to the nearest. A region in one piece has its centre as its only place.
   */
  readonly parts: readonly (readonly Point[])[];
}

const mapCache = new WeakMap<MapSpec, MapData>();

/** A problem with the Map, or null when it is usable. */
export function validateMap(map: MapSpec): string | null {
  const { cols, rows, terrain, spawn, waypoints } = map;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return 'cols and rows must be positive integers';
  if (terrain.length !== rows) return `terrain has ${terrain.length} rows, expected ${rows}`;
  for (let r = 0; r < rows; r++) {
    const line = terrain[r]!;
    if (line.length !== cols) return `terrain row ${r} has ${line.length} cells, expected ${cols}`;
    if (!/^[.,#]*$/.test(line)) return `terrain row ${r} has a character other than . , #`;
  }
  const walkable = (c: readonly number[]): boolean => {
    const [col, row] = c;
    return col !== undefined && row !== undefined && Number.isInteger(col) && Number.isInteger(row)
      && col >= 0 && row >= 0 && col < cols && row < rows && terrain[row]![col] !== '#';
  };
  if (!walkable(spawn)) return 'spawn must be a walkable cell on the Map';
  const spawns = map.spawns;
  if (spawns !== undefined) {
    if (!Array.isArray(spawns) || spawns.length < 1) return 'spawns needs at least one spawn';
    if (!spawns.every(walkable)) return 'every spawn must be a walkable cell on the Map';
    if (spawns[0]![0] !== spawn[0] || spawns[0]![1] !== spawn[1]) return 'spawns must list spawn first';
    if (map.route !== undefined || map.routes !== undefined) return 'a Map with routes starts its creeps on them, so it has no spawns list';
  }
  if (waypoints.length < 1) return 'needs at least one waypoint region (the exit)';
  for (let i = 0; i < waypoints.length; i++) {
    const region = waypoints[i]!;
    if (region.length < 1) return `waypoint region ${i} is empty`;
    if (!region.every(walkable)) return `waypoint region ${i} has a cell that is off the Map or unwalkable`;
  }
  return routeProblem(map) ?? sceneryProblem(map);
}

/**
 * A problem with the Map's Scenery: each piece is a list of whole-number
 * rectangles on the Map, and every cell they cover is `#` or road.
 */
function sceneryProblem(map: MapSpec): string | null {
  const scenery = map.scenery;
  if (scenery === undefined) return null;
  if (!Array.isArray(scenery)) return 'scenery must be a list of pieces';
  for (let i = 0; i < scenery.length; i++) {
    const rects = scenery[i]?.rects;
    if (!Array.isArray(rects) || rects.length < 1) return `Scenery ${i} needs at least one rectangle`;
    for (const rect of rects) {
      const [col, row, w, h] = Array.isArray(rect) ? rect : [];
      if (![col, row, w, h].every(Number.isInteger) || w! < 1 || h! < 1) return `Scenery ${i} has a rectangle that isn't four whole numbers`;
      if (col! < 0 || row! < 0 || col! + w! > map.cols || row! + h! > map.rows) return `Scenery ${i} runs off the Map`;
      for (let r = row!; r < row! + h!; r++) {
        for (let c = col!; c < col! + w!; c++) if (map.terrain[r]![c] === '.') return `Scenery ${i} covers a buildable cell`;
      }
    }
  }
  return null;
}

export function mapData(map: MapSpec): MapData {
  const cached = mapCache.get(map);
  if (cached) return cached;
  const { cols, rows } = map;
  const size = cols * rows;
  const walkable = new Uint8Array(size);
  const buildable = new Uint8Array(size);
  const cx = new Float64Array(size);
  const cy = new Float64Array(size);
  for (let r = 0; r < rows; r++) {
    const line = map.terrain[r]!;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const ch = line[c];
      walkable[i] = ch === '#' ? 0 : 1;
      buildable[i] = ch === '.' ? 1 : 0;
      cx[i] = (c + 0.5) * CELL;
      cy[i] = (r + 0.5) * CELL;
    }
  }
  const regions: Int32Array[] = [];
  const inRegion: Uint8Array[] = [];
  const centres: Point[] = [];
  const parts: Point[][] = [];
  for (const cells of map.waypoints) {
    const list = new Int32Array(cells.length);
    const member = new Uint8Array(size);
    let sx = 0;
    let sy = 0;
    cells.forEach(([c, r], k) => {
      const i = r * cols + c;
      list[k] = i;
      member[i] = 1;
      sx += cx[i]!;
      sy += cy[i]!;
    });
    regions.push(list);
    inRegion.push(member);
    const centre = { x: sx / cells.length, y: sy / cells.length };
    centres.push(centre);
    const groups = pieces(list, member, cols);
    parts.push(groups.length === 1 ? [centre] : groups.map((g) => {
      let gx = 0;
      let gy = 0;
      for (const i of g) {
        gx += cx[i]!;
        gy += cy[i]!;
      }
      return { x: gx / g.length, y: gy / g.length };
    }));
  }
  const spawns = (map.spawns ?? [map.spawn]).map(([c, r]) => r * cols + c);
  const spawn = spawns[0]!;
  const data: MapData = {
    map, cols, rows, size, walkable, buildable, cx, cy,
    spawn, spawnX: cx[spawn]!, spawnY: cy[spawn]!,
    spawns, spawnPoints: spawns.map((i) => ({ x: cx[i]!, y: cy[i]! })),
    regions, inRegion, centres, parts,
  };
  mapCache.set(map, data);
  return data;
}

/** A region's cells split into 4-connected groups, each in the region's own order. */
function pieces(list: Int32Array, member: Uint8Array, cols: number): number[][] {
  const group = new Map<number, number>();
  const out: number[][] = [];
  for (const start of list) {
    if (group.has(start)) continue;
    const g = out.length;
    const stack = [start];
    group.set(start, g);
    while (stack.length > 0) {
      const u = stack.pop()!;
      const c = u % cols;
      for (const v of [c > 0 ? u - 1 : -1, c < cols - 1 ? u + 1 : -1, u - cols, u + cols]) {
        if (v >= 0 && v < member.length && member[v] === 1 && !group.has(v)) {
          group.set(v, g);
          stack.push(v);
        }
      }
    }
    out.push([]);
  }
  for (const i of list) out[group.get(i)!]!.push(i);
  return out;
}

/** The place of region `seg` nearest (x, y): where a flyer there heads next. */
export function nearestPart(md: MapData, seg: number, x: number, y: number): Point {
  const parts = md.parts[seg]!;
  let best = parts[0]!;
  if (parts.length === 1) return best;
  let bestD = Infinity;
  for (const p of parts) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** How many spawns the Map has: its `spawns` list, or 1. */
export function spawnCount(map: MapSpec): number {
  return map.spawns?.length ?? 1;
}

/** Installs the Run's Map with an empty grid. Throws on a malformed Map: that is a content bug. */
export function setMap(state: GameState, map: MapSpec): void {
  const problem = validateMap(map);
  if (problem) throw new Error(`Map ${map.id}: ${problem}`);
  state.map = map;
  state.grid = new Array<number>(map.cols * map.rows).fill(0);
  state.pathVersion++;
}

/** Cell index of (col, row), or -1 off the Map. */
export function cellOf(map: MapSpec, col: number, row: number): number {
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= map.cols || row >= map.rows) return -1;
  return row * map.cols + col;
}

/**
 * The piece of Scenery the Map names at (col, row), or undefined. A cell under
 * two pieces is the first's, so a Stage's own Scenery outranks a Challenge's
 * Burnt ground. It reads only the list: a road cell a piece crosses still finds it.
 */
export function sceneryAt(map: MapSpec, col: number, row: number): ScenerySpec | undefined {
  for (const piece of map.scenery ?? []) {
    for (const [c, r, w, h] of piece.rects) if (col >= c && col < c + w && row >= r && row < r + h) return piece;
  }
  return undefined;
}

export function cellCol(map: MapSpec, cell: number): number {
  return cell % map.cols;
}

export function cellRow(map: MapSpec, cell: number): number {
  return (cell - (cell % map.cols)) / map.cols;
}

export function cellCentre(map: MapSpec, cell: number): Point {
  const col = cellCol(map, cell);
  return { x: (col + 0.5) * CELL, y: (cellRow(map, cell) + 0.5) * CELL };
}

/** Cell under a world position, or -1 off the Map. */
export function cellAt(md: MapData, x: number, y: number): number {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || row < 0 || col >= md.cols || row >= md.rows) return -1;
  return row * md.cols + col;
}

/**
 * Cells creeps can walk right now: walkable terrain with nothing built on it,
 * or with only a structure creeps walk over (an id in `walkOver`).
 */
export function openCells(md: MapData, grid: readonly number[], walkOver?: ReadonlySet<number>): Uint8Array {
  const open = new Uint8Array(md.size);
  const over = walkOver !== undefined && walkOver.size > 0 ? walkOver : null;
  for (let i = 0; i < md.size; i++) {
    const id = grid[i]!;
    open[i] = md.walkable[i] === 1 && (id === 0 || (over !== null && over.has(id))) ? 1 : 0;
  }
  return open;
}

/** Ids of the structures whose spec is walkable: they hold their cells but creeps walk over them. */
export function walkOverIds(state: GameState): Set<number> {
  const ids = new Set<number>();
  if (state.towers.length === 0) return ids;
  const towers = getMode(state.modeId).towers;
  for (const t of state.towers) if (towers[t.spec]?.walkable === true) ids.add(t.id);
  return ids;
}

/**
 * The cells of a `size`×`size` footprint anchored (top-left) at `anchor`, anchor
 * first and row by row; empty when any of them would be off the Map.
 */
export function footprintCells(map: MapSpec, anchor: number, size = 1): number[] {
  if (!Number.isInteger(anchor) || anchor < 0 || anchor >= map.cols * map.rows || !Number.isInteger(size) || size < 1) return [];
  const col = cellCol(map, anchor);
  const row = cellRow(map, anchor);
  if (col + size > map.cols || row + size > map.rows) return [];
  const cells: number[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push((row + r) * map.cols + col + c);
  return cells;
}

/** World position of the centre of a `size`×`size` footprint anchored at `anchor`. */
export function footprintCentre(map: MapSpec, anchor: number, size = 1): Point {
  const col = cellCol(map, anchor);
  return { x: (col + size / 2) * CELL, y: (cellRow(map, anchor) + size / 2) * CELL };
}
