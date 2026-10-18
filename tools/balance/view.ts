import { CELL, airLineData, routeCount, routeData, routePoint, type MapSpec } from '../../src/sim';

// A Stage's Map as the bots see it: points along every road and air line, and
// how much of each a Build Spot covers at a given range.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MapView {
  readonly centres: readonly Point[];
  /** Spots best first: how much route lies within 340 of each. */
  readonly ranked: readonly number[];
  /** Units of route `route`'s road (or air line) within `range` of a Spot's centre. Cached. */
  cover(spot: number, range: number, flying: boolean, route: number): number;
}

const STEP = 16;

function samples(line: ReturnType<typeof routeData>): Point[] {
  const out: Point[] = [];
  if (line) for (let d = STEP / 2; d < line.length; d += STEP) out.push(routePoint(line, d));
  return out;
}

export function mapView(map: MapSpec): MapView {
  const ground: Point[][] = [];
  const air: Point[][] = [];
  for (let r = 0; r < routeCount(map); r++) {
    ground.push(samples(routeData(map, r)));
    air.push(samples(airLineData(map, r) ?? routeData(map, r)));
  }
  const centres = (map.buildSpots ?? []).map(([col, row]) => ({ x: (col + 1) * CELL, y: (row + 1) * CELL }));
  const cache = new Map<string, number>();
  const cover = (spot: number, range: number, flying: boolean, route: number): number => {
    const key = `${spot}:${range}:${flying ? 1 : 0}:${route}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const c = centres[spot]!;
    let n = 0;
    for (const p of (flying ? air : ground)[route] ?? []) if ((p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y) <= range * range) n += STEP;
    cache.set(key, n);
    return n;
  };
  const score = centres.map((_, i) => {
    let s = 0;
    for (let r = 0; r < ground.length; r++) s += cover(i, 340, false, r);
    return { i, s };
  });
  score.sort((a, b) => b.s - a.s || a.i - b.i);
  return { centres, ranked: score.map((s) => s.i), cover };
}

/** Build Spots best first, as the rotation bot fills them: how much of every route lies within 340 of each Spot's centre. */
export function rankedSpots(map: MapSpec): number[] {
  const points: Point[] = [];
  for (let r = 0; r < routeCount(map); r++) {
    const route = routeData(map, r);
    if (!route) continue;
    for (let d = 0; d < route.length; d += 32) points.push(routePoint(route, d));
  }
  const spots = (map.buildSpots ?? []).map(([col, row], i) => {
    const cx = (col + 1) * CELL;
    const cy = (row + 1) * CELL;
    let score = 0;
    for (const p of points) if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) <= 340 * 340) score++;
    return { i, score };
  });
  spots.sort((a, b) => b.score - a.score || a.i - b.i);
  return spots.map((s) => s.i);
}
