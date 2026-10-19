import { Container, Graphics, Text } from 'pixi.js';
import {
  airLinePolyline, airRoute, CELL, routeCount, routePolyline, sceneryAt, type GameState, type MapSpec, type Point, type SceneryKind, type ScenerySpec,
} from '../sim';
import { cellsBox } from './footprint';
import type { SceneryLook, TerrainBanner, TerrainLook } from './look';

export const TERRAIN_COLORS = {
  background: 0x12100e,
  buildable: 0x2d2620,
  walkable: 0x3a3025,
  blocked: 0x0b0908,
  blockedRim: 0x1d1813,
  gridLine: 0x43392e,
  border: 0x6b5a43,
  spawn: 0xb07cff,
  checkpoint: 0x4aa3df,
  exit: 0xe0604a,
  air: 0x9fd2ff,
};

export interface Terrain {
  readonly root: Container;
  /** Faded in with zoom, so a 95-column Map at fit isn't a moiré of lines. */
  readonly grid: Graphics;
}

/** The Map's ground, drawn once per Run: terrain, grid, spawn, numbered checkpoints, the exit and the air line. */
export function buildTerrain(state: GameState, look: TerrainLook = {}): Terrain {
  const map = state.map;
  const colors = { ...TERRAIN_COLORS, ...look };
  const root = new Container();
  const ground = new Graphics();
  drawGround(ground, map, colors);
  if (look.scenery && map.scenery) drawScenery(ground, map, look.scenery);
  if (look.plotRim !== undefined) drawPlotRims(ground, map, look.plotRim, look.plotRimEdges ?? true);
  root.addChild(ground);

  const grid = new Graphics();
  for (let c = 1; c < map.cols; c++) grid.moveTo(c * CELL, 0).lineTo(c * CELL, map.rows * CELL);
  for (let r = 1; r < map.rows; r++) grid.moveTo(0, r * CELL).lineTo(map.cols * CELL, r * CELL);
  grid.stroke({ color: colors.gridLine, width: 1.5, alpha: 0.7 });
  root.addChild(grid);

  const marks = new Graphics();
  if (look.airLine !== false) drawAirLine(marks, state, look.airAlpha ?? 0.28);
  const labels: Text[] = [];
  map.waypoints.forEach((region, i) => {
    const exit = i === map.waypoints.length - 1;
    const color = exit ? TERRAIN_COLORS.exit : TERRAIN_COLORS.checkpoint;
    for (const [c, r] of region) marks.rect(c * CELL, r * CELL, CELL, CELL);
    marks.fill({ color, alpha: 0.22 });
    const cells = region.map(([c, r]) => r * map.cols + c);
    for (const piece of look.splitRegions ? pieces(map, cells) : [cells]) {
      const box = cellsBox(map, piece);
      marks.roundRect(box.col * CELL + 3, box.row * CELL + 3, box.w * CELL - 6, box.h * CELL - 6, 12)
        .stroke({ color, width: 4, alpha: 0.85 });
      labels.push(label(exit ? 'Exit' : String(i + 1), (box.col + box.w / 2) * CELL, (box.row + box.h / 2) * CELL, Math.min(box.w, box.h) * CELL));
    }
  });
  if (look.spawns === 'strip') {
    const spawns = spawnCells(state).map(([c, r]) => r * map.cols + c);
    for (const piece of pieces(map, spawns)) {
      const box = cellsBox(map, piece);
      marks.roundRect(box.col * CELL + 4, box.row * CELL + 6, box.w * CELL - 8, box.h * CELL - 12, 14)
        .fill({ color: TERRAIN_COLORS.spawn, alpha: 0.16 })
        .stroke({ color: TERRAIN_COLORS.spawn, width: 4, alpha: 0.75 });
    }
  } else {
    for (const [sc, sr] of spawnCells(state)) {
      const sx = (sc + 0.5) * CELL;
      const sy = (sr + 0.5) * CELL;
      marks.circle(sx, sy, CELL * 0.42).fill({ color: TERRAIN_COLORS.spawn, alpha: 0.25 });
      marks.circle(sx, sy, CELL * 0.42).stroke({ color: TERRAIN_COLORS.spawn, width: 5 });
      marks.circle(sx, sy, CELL * 0.2).stroke({ color: TERRAIN_COLORS.spawn, width: 3, alpha: 0.8 });
    }
  }
  root.addChild(marks);
  for (const b of look.banners ?? []) root.addChild(banner(b));
  for (const l of labels) root.addChild(l);

  const border = new Graphics().rect(0, 0, map.cols * CELL, map.rows * CELL).stroke({ color: TERRAIN_COLORS.border, width: 4 });
  root.addChild(border);
  return { root, grid };
}

/** Runs of equal terrain merged into one rect each, so a big Map is a few hundred rects, not thousands. */
function drawGround(g: Graphics, map: MapSpec, colors: typeof TERRAIN_COLORS): void {
  const fills: Record<string, number> = { '.': colors.buildable, ',': colors.walkable, '#': colors.blocked };
  for (const ch of ['.', ',', '#']) {
    for (let r = 0; r < map.rows; r++) {
      const line = map.terrain[r]!;
      let c = 0;
      while (c < map.cols) {
        if (line[c] !== ch) {
          c++;
          continue;
        }
        const start = c;
        while (c < map.cols && line[c] === ch) c++;
        g.rect(start * CELL, r * CELL, (c - start) * CELL, CELL);
      }
    }
    g.fill(fills[ch]!);
  }
  // Blocked cells get a faint inner rim, so a wall reads as a pit rather than a hole in the canvas.
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (map.terrain[r]![c] === '#') g.roundRect(c * CELL + 8, r * CELL + 8, CELL - 16, CELL - 16, 10);
    }
  }
  g.fill(colors.blockedRim);
}

/**
 * A light edge on each side of buildable ground that meets something else, so
 * plots read as raised; along the Map's own edge too, unless `edges` is false.
 */
function drawPlotRims(g: Graphics, map: MapSpec, color: number, edges: boolean): void {
  const W = 5;
  const buildable = (c: number, r: number): boolean => (r >= 0 && r < map.rows && c >= 0 && c < map.cols ? map.terrain[r]![c] === '.' : !edges);
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (!buildable(c, r)) continue;
      const x = c * CELL;
      const y = r * CELL;
      if (!buildable(c, r - 1)) g.rect(x, y, CELL, W);
      if (!buildable(c, r + 1)) g.rect(x, y + CELL - W, CELL, W);
      if (!buildable(c - 1, r)) g.rect(x, y, W, CELL);
      if (!buildable(c + 1, r)) g.rect(x + CELL - W, y, W, CELL);
    }
  }
  g.fill({ color, alpha: 0.9 });
}

/**
 * The Map's named Scenery, each piece in its kind's look: water rippled, a
 * building's hipped roof, a cliff's strata, a pit's rim falling away to black
 * and burnt ground's embers. Only the `#` cells a piece owns (the first piece
 * naming a cell, as the Ghost names it) are drawn: where a piece crosses the
 * road, the road stays on top. Plain shapes, drawn once per Run.
 */
function drawScenery(g: Graphics, map: MapSpec, looks: Readonly<Record<SceneryKind, SceneryLook>>): void {
  const owner = (c: number, r: number): ScenerySpec | undefined =>
    c >= 0 && r >= 0 && c < map.cols && r < map.rows && map.terrain[r]![c] === '#' ? sceneryAt(map, c, r) : undefined;
  for (const piece of map.scenery ?? []) {
    const look = looks[piece.kind];
    const mine = (c: number, r: number): boolean => owner(c, r) === piece;
    const cells = new Set<number>();
    for (const [c0, r0, w, h] of piece.rects) {
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (mine(c, r)) cells.add(r * map.cols + c);
    }
    if (cells.size === 0) continue;
    const list = [...cells];
    // The fill, in runs along each row so neighbouring cells show no seams.
    for (let r = 0; r < map.rows; r++) {
      let c = 0;
      while (c < map.cols) {
        if (!cells.has(r * map.cols + c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < map.cols && cells.has(r * map.cols + c)) c++;
        g.rect(start * CELL, r * CELL, (c - start) * CELL, CELL);
      }
    }
    g.fill(look.fill);
    switch (piece.kind) {
      case 'water':
        // A ripple in each cell, staggered so they don't line up in rows.
        for (const cell of list) {
          const [x, y] = cellOrigin(map, cell);
          const odd = ((cell % map.cols) + Math.floor(cell / map.cols)) % 2 === 1;
          const ox = x + (odd ? 26 : 8);
          const oy = y + (odd ? 44 : 22);
          g.moveTo(ox, oy).quadraticCurveTo(ox + 7.5, oy - 7, ox + 15, oy).quadraticCurveTo(ox + 22.5, oy + 7, ox + 30, oy);
        }
        g.stroke({ color: look.mark, width: 4, alpha: 0.7, cap: 'round' });
        bands(g, map, list, mine, 0, 5);
        g.fill({ color: look.edge, alpha: 0.85 });
        break;
      case 'building':
        bands(g, map, list, mine, 0, 6);
        g.fill(look.edge);
        for (const [c0, r0, w, h] of piece.rects) {
          let whole = true;
          for (let r = r0; r < r0 + h && whole; r++) for (let c = c0; c < c0 + w; c++) if (!mine(c, r)) whole = false;
          if (whole) roof(g, c0 * CELL + 6, r0 * CELL + 6, (c0 + w) * CELL - 6, (r0 + h) * CELL - 6, look.mark);
        }
        break;
      case 'cliff':
        // Strata: diagonals that run on from cell to cell.
        for (const cell of list) {
          const [x, y] = cellOrigin(map, cell);
          const half = CELL / 2;
          g.moveTo(x, y + CELL).lineTo(x + CELL, y);
          g.moveTo(x, y + half).lineTo(x + half, y);
          g.moveTo(x + half, y + CELL).lineTo(x + CELL, y + half);
        }
        g.stroke({ color: look.mark, width: 5, alpha: 0.55 });
        bands(g, map, list, mine, 0, 6);
        g.fill(look.edge);
        break;
      case 'pit':
        // A lit rim, then a darker band inside it, falling away to the black.
        bands(g, map, list, mine, 0, 9);
        g.fill(look.edge);
        bands(g, map, list, mine, 9, 9);
        g.fill({ color: look.mark, alpha: 0.6 });
        break;
      case 'burnt':
        // Embers scattered by each cell's own number, so the pattern never changes.
        for (const cell of list) {
          const [x, y] = cellOrigin(map, cell);
          const n = (cell * 2654435761) >>> 0;
          g.circle(x + 12 + (n % 40), y + 12 + ((n >>> 8) % 40), 4);
          if (n % 3 === 0) g.circle(x + 12 + ((n >>> 16) % 40), y + 12 + ((n >>> 4) % 40), 3);
        }
        g.fill({ color: look.mark, alpha: 0.75 });
        bands(g, map, list, mine, 0, 4);
        g.fill({ color: look.edge, alpha: 0.8 });
        break;
    }
  }
}

function cellOrigin(map: MapSpec, cell: number): [number, number] {
  const c = cell % map.cols;
  return [c * CELL, ((cell - c) / map.cols) * CELL];
}

/**
 * A band `width` wide, `from` in from each side of `cells` that meets other
 * ground on the Map (not the Map's own edge, where Scenery runs on). Clipped
 * at corners, so a band inside another doesn't cross it.
 */
function bands(g: Graphics, map: MapSpec, cells: readonly number[], mine: (c: number, r: number) => boolean, from: number, width: number): void {
  const open = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < map.cols && r < map.rows && !mine(c, r);
  for (const cell of cells) {
    const c = cell % map.cols;
    const r = (cell - c) / map.cols;
    const [x, y] = [c * CELL, r * CELL];
    const top = open(c, r - 1) ? from : 0;
    const bottom = open(c, r + 1) ? from : 0;
    const left = open(c - 1, r) ? from : 0;
    const right = open(c + 1, r) ? from : 0;
    if (open(c, r - 1)) g.rect(x + left, y + from, CELL - left - right, width);
    if (open(c, r + 1)) g.rect(x + left, y + CELL - from - width, CELL - left - right, width);
    if (open(c - 1, r)) g.rect(x + from, y + top, width, CELL - top - bottom);
    if (open(c + 1, r)) g.rect(x + CELL - from - width, y + top, width, CELL - top - bottom);
  }
}

/** A hipped roof seen from above over (x0, y0)–(x1, y1): its ridge along the long side, the far facets shaded. */
function roof(g: Graphics, x0: number, y0: number, x1: number, y1: number, color: number): void {
  const wide = x1 - x0 >= y1 - y0;
  const half = (wide ? y1 - y0 : x1 - x0) / 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // The ridge's two ends.
  const [ax, ay, bx, by] = wide ? [x0 + half, cy, x1 - half, cy] : [cx, y0 + half, cx, y1 - half];
  // The south and east facets in shade.
  g.poly(wide ? [x0, y1, ax, ay, bx, by, x1, y1] : [x1, y0, ax, ay, bx, by, x1, y1]).fill({ color, alpha: 0.32 });
  g.poly(wide ? [x1, y0, bx, by, x1, y1] : [x0, y1, bx, by, x1, y1]).fill({ color, alpha: 0.32 });
  g.rect(x0, y0, x1 - x0, y1 - y0);
  g.moveTo(ax, ay).lineTo(bx, by);
  g.moveTo(x0, y0).lineTo(ax, ay).moveTo(x0, y1).lineTo(wide ? ax : bx, wide ? ay : by);
  g.moveTo(x1, y0).lineTo(wide ? bx : ax, wide ? by : ay).moveTo(x1, y1).lineTo(bx, by);
  g.stroke({ color, width: 4, alpha: 0.9, join: 'round' });
}

/** The Map's spawns (a mazing Map may list several), and on a Map with several fixed routes the start of each. */
function spawnCells(state: GameState): (readonly [number, number])[] {
  const map = state.map;
  const cells: (readonly [number, number])[] = [...(map.spawns ?? [map.spawn])];
  for (let i = 1; i < routeCount(map); i++) {
    const p = routePolyline(state, i)[0];
    if (!p) continue;
    const cell = [Math.max(0, Math.min(map.cols - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(map.rows - 1, Math.floor(p.y / CELL)))] as const;
    if (!cells.some(([c, r]) => c === cell[0] && r === cell[1])) cells.push(cell);
  }
  return cells;
}

/** Each fixed route's own air line, or on a mazing Map the straight line from each spawn through the checkpoints. */
function airLines(state: GameState): Point[][] {
  const n = routeCount(state.map);
  if (n === 0) return (state.map.spawns ?? [state.map.spawn]).map((_, i) => airRoute(state, i));
  const lines: Point[][] = [];
  for (let i = 0; i < n; i++) {
    const line = airLinePolyline(state, i);
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

function drawAirLine(g: Graphics, state: GameState, alpha: number): void {
  for (const pts of airLines(state)) dashed(g, pts);
  g.stroke({ color: TERRAIN_COLORS.air, width: 3, alpha, cap: 'round' });
}

/** Cells split into the pieces that touch side by side or end to end. */
function pieces(map: MapSpec, cells: readonly number[]): number[][] {
  const left = new Set(cells);
  const out: number[][] = [];
  for (const start of cells) {
    if (!left.delete(start)) continue;
    const piece = [start];
    for (let i = 0; i < piece.length; i++) {
      const c = piece[i]!;
      const col = c % map.cols;
      for (const n of [col > 0 ? c - 1 : -1, col < map.cols - 1 ? c + 1 : -1, c - map.cols, c + map.cols]) {
        if (n >= 0 && left.delete(n)) piece.push(n);
      }
    }
    out.push(piece);
  }
  return out;
}

/** A pennant with a swallowtail, its title across the head and its word running down it. */
function banner(b: TerrainBanner): Container {
  const root = new Container();
  const g = new Graphics();
  const { x, y, width: w, height: h, color } = b;
  const notch = w * 0.4;
  g.rect(x - w / 2 - 14, y - 12, w + 28, 16).fill({ color: TERRAIN_COLORS.border, alpha: 0.9 });
  g.poly([x - w / 2, y, x + w / 2, y, x + w / 2, y + h, x, y + h - notch, x - w / 2, y + h])
    .fill({ color, alpha: 0.2 })
    .stroke({ color, width: 5, alpha: 0.75, join: 'round' });
  root.addChild(g);
  const title = new Text({
    text: b.title,
    resolution: 3,
    style: { fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: '700', fontSize: w * 0.24, fill: 0xf1e6d2, stroke: { color: 0x0b0908, width: 5 } },
  });
  title.anchor.set(0.5);
  title.alpha = 0.85;
  title.position.set(x, y + w * 0.28);
  root.addChild(title);
  const room = h - notch - w * 0.62;
  const word = new Text({
    text: b.text.toUpperCase(),
    resolution: 3,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: '800', fontSize: Math.min(w * 0.46, room / (b.text.length * 0.7)),
      fill: color, letterSpacing: 6, stroke: { color: 0x0b0908, width: 6 },
    },
  });
  word.anchor.set(0.5);
  word.rotation = -Math.PI / 2;
  word.alpha = 0.9;
  word.position.set(x, y + w * 0.55 + room / 2);
  root.addChild(word);
  return root;
}

function dashed(g: Graphics, pts: readonly Point[]): void {
  const DASH = 22;
  const GAP = 18;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    for (let d = 0; d < len; d += DASH + GAP) {
      const e = Math.min(len, d + DASH);
      g.moveTo(a.x + (dx * d) / len, a.y + (dy * d) / len).lineTo(a.x + (dx * e) / len, a.y + (dy * e) / len);
    }
  }
}

function label(text: string, x: number, y: number, span: number): Text {
  const t = new Text({
    text,
    resolution: 3,
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontWeight: '700',
      fontSize: Math.max(18, Math.min(36, span * 0.24)),
      fill: 0xffffff,
      stroke: { color: 0x0b0908, width: 5 },
    },
  });
  t.anchor.set(0.5);
  t.alpha = 0.85;
  t.position.set(x, y);
  return t;
}
