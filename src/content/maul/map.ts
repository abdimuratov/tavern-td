import type { Cell, MapSpec } from '../../sim';

// Maul's one Map, the Crossing (docs/maul-design.md §3), one 64-unit cell per
// character, row 0 at the north edge. `.` is open ground where towers go, `,`
// the gate pens, Checkpoints and exit neck (walkable, never buildable), `#` rock.
//
// As in Wintermaul, creeps walk through the build field: there is no lane but
// the maze you make. Each gate in the top corners feeds its own approach, with
// a ridge between them, and both streams meet at the Ford below the ridge. From
// there every creep crosses the lower field to the West Post, then the East
// Post, then turns back to the exit in the middle of the south edge, so the
// lower field sees the whole Wave three times over.

/** The west and east gates. */
export const WEST_GATE: Cell = [4, 0];
export const EAST_GATE: Cell = [43, 0];

/** Checkpoint 1: the Ford, where both gates' streams meet. */
export const FORD: readonly Cell[] = [[23, 12], [24, 12], [23, 13], [24, 13]];
/** Checkpoints 2 and 3: the lower field's south-west and south-east corners. */
export const WEST_POST: readonly Cell[] = [[1, 28], [2, 28], [1, 29], [2, 29]];
export const EAST_POST: readonly Cell[] = [[45, 28], [46, 28], [45, 29], [46, 29]];

export const MAUL_EXIT: readonly Cell[] = [[22, 31], [23, 31], [24, 31], [25, 31]];

export const MAUL_MAP: MapSpec = {
  id: 'maul-crossing',
  cols: 48,
  rows: 32,
  terrain: [
    '##,,,,,,################################,,,,,,##',
    '##,,,,,,################################,,,,,,##',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#....................######....................#',
    '#.....................,,,,.....................#',
    '#.....................,,,,.....................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#,,..........................................,,#',
    '#,,..........................................,,#',
    '######################,,,,######################',
    '######################,,,,######################',
  ],
  spawn: WEST_GATE,
  spawns: [WEST_GATE, EAST_GATE],
  waypoints: [FORD, WEST_POST, EAST_POST, MAUL_EXIT],
};
