import { Container, Graphics, Text } from 'pixi.js';
import { airLinePolyline, airRoute, BUILD_SPOT, CELL, routeCount, routePolyline, type GameState, type MapSpec, type Point } from '../sim';
import { cellsBox } from './footprint';
import type { TerrainLook } from './look';

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
  if (look.plotRim !== undefined) drawPlotRims(ground, map, look.plotRim);
  if (look.spotRim !== undefined) drawSpotRims(ground, map, look.spotRim);
  root.addChild(ground);

  const grid = new Graphics();
  for (let c = 1; c < map.cols; c++) grid.moveTo(c * CELL, 0).lineTo(c * CELL, map.rows * CELL);
  for (let r = 1; r < map.rows; r++) grid.moveTo(0, r * CELL).lineTo(map.cols * CELL, r * CELL);
  grid.stroke({ color: colors.gridLine, width: 1.5, alpha: 0.7 });
  root.addChild(grid);

  const marks = new Graphics();
  if (look.airLine !== false) drawAirLine(marks, state);
  const labels: Text[] = [];
  map.waypoints.forEach((region, i) => {
    const exit = i === map.waypoints.length - 1;
    const color = exit ? TERRAIN_COLORS.exit : TERRAIN_COLORS.checkpoint;
    for (const [c, r] of region) marks.rect(c * CELL, r * CELL, CELL, CELL);
    marks.fill({ color, alpha: 0.22 });
    const box = cellsBox(map, region.map(([c, r]) => r * map.cols + c));
    marks.roundRect(box.col * CELL + 3, box.row * CELL + 3, box.w * CELL - 6, box.h * CELL - 6, 12)
      .stroke({ color, width: 4, alpha: 0.85 });
    labels.push(label(exit ? 'Exit' : String(i + 1), (box.col + box.w / 2) * CELL, (box.row + box.h / 2) * CELL, Math.min(box.w, box.h) * CELL));
  });
  for (const [sc, sr] of spawnCells(state)) {
    const sx = (sc + 0.5) * CELL;
    const sy = (sr + 0.5) * CELL;
    marks.circle(sx, sy, CELL * 0.42).fill({ color: TERRAIN_COLORS.spawn, alpha: 0.25 });
    marks.circle(sx, sy, CELL * 0.42).stroke({ color: TERRAIN_COLORS.spawn, width: 5 });
    marks.circle(sx, sy, CELL * 0.2).stroke({ color: TERRAIN_COLORS.spawn, width: 3, alpha: 0.8 });
  }
  root.addChild(marks);
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

/** A light edge on each side of buildable ground that meets something else, so plots read as raised. */
function drawPlotRims(g: Graphics, map: MapSpec, color: number): void {
  const W = 5;
  const buildable = (c: number, r: number): boolean => r >= 0 && r < map.rows && c >= 0 && c < map.cols && map.terrain[r]![c] === '.';
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

/** The Map's spawn, and on a Map with several fixed routes the start of each. */
function spawnCells(state: GameState): (readonly [number, number])[] {
  const map = state.map;
  const cells: (readonly [number, number])[] = [map.spawn];
  for (let i = 1; i < routeCount(map); i++) {
    const p = routePolyline(state, i)[0];
    if (!p) continue;
    const cell = [Math.max(0, Math.min(map.cols - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(map.rows - 1, Math.floor(p.y / CELL)))] as const;
    if (!cells.some(([c, r]) => c === cell[0] && r === cell[1])) cells.push(cell);
  }
  return cells;
}

/** Each fixed route's own air line, or on a mazing Map the straight line through the checkpoints. */
function airLines(state: GameState): Point[][] {
  const n = routeCount(state.map);
  if (n === 0) return [airRoute(state)];
  const lines: Point[][] = [];
  for (let i = 0; i < n; i++) {
    const line = airLinePolyline(state, i);
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

/** Each Build Spot as its own pad: an inset edge round its 2 × 2 cells. */
function drawSpotRims(g: Graphics, map: MapSpec, color: number): void {
  const INSET = 5;
  for (const [col, row] of map.buildSpots ?? []) {
    g.roundRect(col * CELL + INSET, row * CELL + INSET, BUILD_SPOT * CELL - INSET * 2, BUILD_SPOT * CELL - INSET * 2, 10);
  }
  g.stroke({ color, width: 5, alpha: 0.9 });
}

function drawAirLine(g: Graphics, state: GameState): void {
  for (const pts of airLines(state)) dashed(g, pts);
  g.stroke({ color: TERRAIN_COLORS.air, width: 3, alpha: 0.28, cap: 'round' });
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
