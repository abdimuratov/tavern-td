import type { StageSpec } from '../../src/content/original';
import { CELL, airLineData, routeCount, routeData, routePoint, type MapSpec } from '../../src/sim';

// A text preview of a Stage's Map: `,` road, `#` other ground, a Build Spot as
// its index (0–9, then a, b, c…), `^` where an air line flies over. Below it,
// each route's and air line's length, and how much route each Spot covers.

const SPOT_MARKS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** World units of every route within `range` of a Spot's centre. */
export function spotCoverage(map: MapSpec, spot: number, range: number): number {
  const [col, row] = map.buildSpots![spot]!;
  const cx = (col + 1) * CELL;
  const cy = (row + 1) * CELL;
  let covered = 0;
  for (let r = 0; r < routeCount(map); r++) {
    const route = routeData(map, r)!;
    for (let d = 8; d < route.length; d += 16) {
      const p = routePoint(route, d);
      if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) <= range * range) covered += 16;
    }
  }
  return covered;
}

export function drawStage(stage: StageSpec): string[] {
  const map = stage.map;
  const grid = map.terrain.map((line) => line.split(''));
  for (let r = 0; r < routeCount(map); r++) {
    const air = airLineData(map, r);
    if (!air) continue;
    for (let d = 0; d < air.length; d += 16) {
      const p = routePoint(air, d);
      const col = Math.min(map.cols - 1, Math.floor(p.x / CELL));
      const row = Math.min(map.rows - 1, Math.floor(p.y / CELL));
      if (grid[row]![col] === '#') grid[row]![col] = '^';
    }
  }
  (map.buildSpots ?? []).forEach(([col, row], i) => {
    for (const [c, rr] of [[col, row], [col + 1, row], [col, row + 1], [col + 1, row + 1]] as const) grid[rr]![c] = SPOT_MARKS[i]!;
  });
  const lines = [`Stage ${stage.number}: ${stage.name} (${stage.region}), ${map.buildSpots?.length ?? 0} Spots, ${stage.waves.length} Waves`];
  lines.push(...grid.map((row) => '  ' + row.join('')));
  for (let r = 0; r < routeCount(map); r++) {
    lines.push(`  route ${r}: ${routeData(map, r)!.length.toFixed(0)} long, air line ${airLineData(map, r)?.length.toFixed(0) ?? 'none'}`);
  }
  const cover = (map.buildSpots ?? []).map((_, i) => `${SPOT_MARKS[i]} ${spotCoverage(map, i, 320)}`);
  lines.push(`  route within 320 of each Spot: ${cover.join(', ')}`);
  return lines;
}
