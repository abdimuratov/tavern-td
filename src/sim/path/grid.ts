import { CELL } from '../core/constants';
import type { MapSpec } from '../core/specs';
import type { GameState } from '../core/state';

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
  readonly spawn: number;
  readonly spawnX: number;
  readonly spawnY: number;
  /** Cells of each waypoint region, in visiting order; the exit is last. */
  readonly regions: readonly Int32Array[];
  /** inRegion[r][cell] is 1 when the cell belongs to region r. */
  readonly inRegion: readonly Uint8Array[];
  /** Mean of each region's cell centres: where air creeps fly. */
  readonly centres: readonly Point[];
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
  if (waypoints.length < 1) return 'needs at least one waypoint region (the exit)';
  for (let i = 0; i < waypoints.length; i++) {
    const region = waypoints[i]!;
    if (region.length < 1) return `waypoint region ${i} is empty`;
    if (!region.every(walkable)) return `waypoint region ${i} has a cell that is off the Map or unwalkable`;
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
    centres.push({ x: sx / cells.length, y: sy / cells.length });
  }
  const spawn = map.spawn[1] * cols + map.spawn[0];
  const data: MapData = {
    map, cols, rows, size, walkable, buildable, cx, cy,
    spawn, spawnX: cx[spawn]!, spawnY: cy[spawn]!,
    regions, inRegion, centres,
  };
  mapCache.set(map, data);
  return data;
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

/** Cells creeps can walk right now: walkable terrain with nothing built on it. */
export function openCells(md: MapData, grid: readonly number[]): Uint8Array {
  const open = new Uint8Array(md.size);
  for (let i = 0; i < md.size; i++) open[i] = md.walkable[i] === 1 && grid[i] === 0 ? 1 : 0;
  return open;
}
