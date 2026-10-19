import type { StageSpec } from '../../src/content/original';
import { CELL, airLineData, routeCount, routeData, routePoint, type MapSpec, type SceneryKind } from '../../src/sim';

// A text preview of a Stage's Map: `,` road, `.` Open ground, Scenery by its
// kind, `^` where an air line flies over Open ground. Below it, each route's
// and air line's length, and the Open cells left.

const SCENERY_MARKS: Readonly<Record<SceneryKind, string>> = { water: '~', building: 'H', cliff: 'A', pit: 'O', burnt: 'x' };

/** Cells of Open ground on the Map: where towers may stand. */
export function openCells(map: MapSpec): number {
  let n = 0;
  for (const line of map.terrain) for (const ch of line) if (ch === '.') n++;
  return n;
}

export function drawStage(stage: StageSpec): string[] {
  const map = stage.map;
  const grid = map.terrain.map((line) => line.split(''));
  for (const piece of map.scenery ?? []) {
    for (const [col, row, w, h] of piece.rects) {
      for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (grid[r]![c] === '#') grid[r]![c] = SCENERY_MARKS[piece.kind];
    }
  }
  for (let r = 0; r < routeCount(map); r++) {
    const air = airLineData(map, r);
    if (!air) continue;
    for (let d = 0; d < air.length; d += 16) {
      const p = routePoint(air, d);
      const col = Math.min(map.cols - 1, Math.floor(p.x / CELL));
      const row = Math.min(map.rows - 1, Math.floor(p.y / CELL));
      if (grid[row]![col] === '.') grid[row]![col] = '^';
    }
  }
  const scenery = (map.scenery ?? []).map((s) => `${SCENERY_MARKS[s.kind]} ${s.name}`).join(', ');
  const lines = [`Stage ${stage.number}: ${stage.name} (${stage.region}), ${openCells(map)} Open cells, ${stage.waves.length} Waves; ${scenery}`];
  lines.push(...grid.map((row) => '  ' + row.join('')));
  for (let r = 0; r < routeCount(map); r++) {
    lines.push(`  route ${r}: ${routeData(map, r)!.length.toFixed(0)} long, air line ${airLineData(map, r)?.length.toFixed(0) ?? 'none'}`);
  }
  return lines;
}
