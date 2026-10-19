import { CELL, cellOf, type MapSpec, type Point, type Tower } from '../sim';

/** A rectangle of cells. */
export interface Box {
  readonly col: number;
  readonly row: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The cells a structure covers. Gem towers cover 2×2 and keep their anchor in
 * `cell`; until the core gives every tower a `cells` list, a tower without one
 * covers just its anchor.
 */
export function towerCells(tower: Tower): readonly number[] {
  const cells = (tower as Tower & { readonly cells?: readonly number[] }).cells;
  return Array.isArray(cells) && cells.length > 0 ? cells : [tower.cell];
}

/** The bounding box of `cells` on the Map. */
export function cellsBox(map: MapSpec, cells: readonly number[]): Box {
  let c0 = Infinity;
  let r0 = Infinity;
  let c1 = -Infinity;
  let r1 = -Infinity;
  for (const cell of cells) {
    const c = cell % map.cols;
    const r = (cell - c) / map.cols;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
  }
  if (c0 === Infinity) return { col: 0, row: 0, w: 0, h: 0 };
  return { col: c0, row: r0, w: c1 - c0 + 1, h: r1 - r0 + 1 };
}

/** World position of a box's centre. */
export function boxCentre(box: Box): Point {
  return { x: (box.col + box.w / 2) * CELL, y: (box.row + box.h / 2) * CELL };
}

/** The cell under a world position, or -1 off the Map. */
export function cellAtPoint(map: MapSpec, p: Point): number {
  return cellOf(map, Math.floor(p.x / CELL), Math.floor(p.y / CELL));
}

/**
 * The w×h cells a structure would cover with the pointer at `p`. An odd size
 * centres on the cell under the pointer and an even size on the nearest grid
 * corner, so a 2×2 gem can sit half a gem off its neighbours. The box is
 * pushed back inside the Map near an edge; null when the pointer is off the Map.
 */
export function footprintAt(map: MapSpec, p: Point, w = 1, h = w): number[] | null {
  if (p.x < 0 || p.y < 0 || p.x >= map.cols * CELL || p.y >= map.rows * CELL) return null;
  if (w > map.cols || h > map.rows) return null;
  const anchor = (pos: number, size: number, limit: number): number => {
    const start = size % 2 === 1 ? Math.floor(pos / CELL) - (size - 1) / 2 : Math.round(pos / CELL) - size / 2;
    return Math.min(limit - size, Math.max(0, start));
  };
  const col = anchor(p.x, w, map.cols);
  const row = anchor(p.y, h, map.rows);
  const cells: number[] = [];
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) cells.push(r * map.cols + c);
  return cells;
}

/**
 * The top-left cell of the 2×2 a pointer at `p` snaps to: of the four that
 * cover the cell under it, the one `open` takes whose centre is nearest the
 * pointer, so a ghost snaps onto a narrow strip instead of hanging off its
 * edge. With none open, the one centred on the nearest grid corner (as
 * footprintAt's), and `open` false. Kept on the Map; null off it.
 */
export function snapSquare(map: MapSpec, p: Point, open: (col: number, row: number) => boolean): { col: number; row: number; open: boolean } | null {
  const col = Math.floor(p.x / CELL);
  const row = Math.floor(p.y / CELL);
  if (p.x < 0 || p.y < 0 || col >= map.cols || row >= map.rows) return null;
  const clamp = (v: number, n: number): number => Math.min(n - 2, Math.max(0, v));
  let best: { col: number; row: number; d: number } | null = null;
  for (let dr = -1; dr <= 0; dr++) {
    for (let dc = -1; dc <= 0; dc++) {
      const c = clamp(col + dc, map.cols);
      const r = clamp(row + dr, map.rows);
      if (!open(c, r)) continue;
      const dx = (c + 1) * CELL - p.x;
      const dy = (r + 1) * CELL - p.y;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { col: c, row: r, d };
    }
  }
  if (best) return { col: best.col, row: best.row, open: true };
  return { col: clamp(Math.round(p.x / CELL) - 1, map.cols), row: clamp(Math.round(p.y / CELL) - 1, map.rows), open: false };
}

/** Whether two cell lists cover the same cells in the same order. */
export function sameCells(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
