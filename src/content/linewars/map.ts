import type { Cell, MapSpec } from '../../sim';

// Line Wars' one Map, the Twin Fields (docs/line-wars-design.md §3), one
// 64-unit cell per character, row 0 at the north edge. `.` is open ground, `,`
// the spawn and exit strips (walkable, never buildable), `#` the Divide's rock.
//
// The Rival's Field is columns 0–15 and yours columns 28–43, with twelve
// columns of rock between them, so no walkable cell joins the two and no
// tower reaches across. Every cell of row 0 is a spawn, yours first; row 31 of
// both Fields is the one exit region, in two pieces. There are no Checkpoints.

export const LW_COLS = 44;
export const LW_ROWS = 32;

/** First and last column of each Side's Field: Side 0 (you) east, Side 1 (the Rival) west. */
export const FIELD_COLS: readonly [readonly [number, number], readonly [number, number]] = [[28, 43], [0, 15]];
/** Each Field's width in cells. */
export const FIELD_WIDTH = 16;
/** Rows of each Field's open ground, between the spawn strip (rows 0–1) and the exit strip (rows 30–31). */
export const FIELD_ROWS: readonly [number, number] = [2, 29];
export const SPAWN_ROW = 0;
export const EXIT_ROW = 31;

/** The Field (Side) a column belongs to, or -1 in the Divide or off the Map. */
export function fieldOfCol(col: number): -1 | 0 | 1 {
  if (col >= FIELD_COLS[0][0] && col <= FIELD_COLS[0][1]) return 0;
  if (col >= FIELD_COLS[1][0] && col <= FIELD_COLS[1][1]) return 1;
  return -1;
}

/**
 * A Field's local column 0–15 as a Map column. The Fields are mirror images,
 * so local column 0 is each Field's outer edge: column 43 for Side 0 and 0 for Side 1.
 */
export function mapCol(side: 0 | 1, local: number): number {
  return side === 0 ? FIELD_COLS[0][1] - local : FIELD_COLS[1][0] + local;
}

/** Each Field's spawns in the Map's list: Side 0's are 0–15, Side 1's 16–31, west to east. */
export function fieldSpawns(side: 0 | 1): readonly [first: number, count: number] {
  return [side === 0 ? 0 : FIELD_WIDTH, FIELD_WIDTH];
}

const strip = ',,,,,,,,,,,,,,,,############,,,,,,,,,,,,,,,,';
const open = '................############................';

function spawnCells(): Cell[] {
  const out: Cell[] = [];
  for (const side of [0, 1] as const) for (let c = FIELD_COLS[side][0]; c <= FIELD_COLS[side][1]; c++) out.push([c, SPAWN_ROW]);
  return out;
}

function exitCells(): Cell[] {
  const out: Cell[] = [];
  for (const side of [0, 1] as const) for (let c = FIELD_COLS[side][0]; c <= FIELD_COLS[side][1]; c++) out.push([c, EXIT_ROW]);
  return out;
}

const SPAWNS = spawnCells();

export const LW_MAP: MapSpec = {
  id: 'linewars-twin-fields',
  cols: LW_COLS,
  rows: LW_ROWS,
  terrain: Array.from({ length: LW_ROWS }, (_, r) => (r < FIELD_ROWS[0] || r > FIELD_ROWS[1] ? strip : open)),
  spawn: SPAWNS[0]!,
  spawns: SPAWNS,
  waypoints: [exitCells()],
};
