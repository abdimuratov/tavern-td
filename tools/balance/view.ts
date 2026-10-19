import { CELL, airLineData, routeCount, routeData, routePoint, type MapSpec } from '../../src/sim';

// A Stage's Map as the bots see it: points along every road and air line, the
// places a player builds on, and how much of each road a 2 × 2 covers at a
// given range.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A 2 × 2 of Open ground by its top-left cell, and its centre. */
export interface Place {
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
}

export interface MapView {
  /** The places this player builds on, in the order it fills them. */
  readonly places: readonly Place[];
  /** Units of route `route`'s road (or air line) within `range` of the centre of the 2 × 2 at (col, row). Cached. */
  cover(col: number, row: number, range: number, flying: boolean, route: number): number;
}

const STEP = 16;

/** How far from a place's centre the layout counts road. */
const REACH = 340;
/** The most places a player lays out by road, and the share of the best that the last may score. */
const MAX_PLACES = 32;
const CUTOFF = 0.4;
/** Places by the air line seen, on top of those by road. */
const AIR_PLACES = 4;
/** Each score is given or taken this share at random, by the player's seed. */
const NOISE = 0.2;

function samples(line: ReturnType<typeof routeData>): Point[] {
  const out: Point[] = [];
  if (line) for (let d = STEP / 2; d < line.length; d += STEP) out.push(routePoint(line, d));
  return out;
}

function lines(map: MapSpec): { ground: Point[][]; air: Point[][] } {
  const ground: Point[][] = [];
  const air: Point[][] = [];
  for (let r = 0; r < routeCount(map); r++) {
    ground.push(samples(routeData(map, r)));
    air.push(samples(airLineData(map, r) ?? routeData(map, r)));
  }
  return { ground, air };
}

function within(points: readonly Point[], x: number, y: number, range: number): number {
  let n = 0;
  for (const p of points) if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) <= range * range) n += STEP;
  return n;
}

function overlaps(a: Place, b: Place): boolean {
  return Math.abs(a.col - b.col) < 2 && Math.abs(a.row - b.row) < 2;
}

/**
 * The places a player lays out before Wave 1 (docs/original-design.md §17):
 * every 2 × 2 of Open ground scored by the road within 340 of its centre,
 * summed over the routes, each score given or taken 20% by `rand` (none
 * without it). Best first, each overlapping none taken before it, up to 32 or
 * until one scores under 40% of the best; then the 4 best by air line seen
 * join them, if they aren't there already.
 */
export function layPlaces(map: MapSpec, rand: (() => number) | null = null): Place[] {
  const { ground, air } = lines(map);
  const open = (c: number, r: number): boolean => map.terrain[r]?.[c] === '.';
  const all: { place: Place; road: number; flight: number }[] = [];
  for (let row = 0; row + 1 < map.rows; row++) {
    for (let col = 0; col + 1 < map.cols; col++) {
      if (!open(col, row) || !open(col + 1, row) || !open(col, row + 1) || !open(col + 1, row + 1)) continue;
      const place = { col, row, x: (col + 1) * CELL, y: (row + 1) * CELL };
      let road = 0;
      let flight = 0;
      for (const g of ground) road += within(g, place.x, place.y, REACH);
      for (const a of air) flight += within(a, place.x, place.y, REACH);
      const jitter = (): number => (rand ? 1 + (rand() - 0.5) * 2 * NOISE : 1);
      all.push({ place, road: road * jitter(), flight: flight * jitter() });
    }
  }
  const taken: Place[] = [];
  const free = (p: Place): boolean => taken.every((t) => !overlaps(t, p));
  const byRoad = [...all].sort((a, b) => b.road - a.road);
  const best = byRoad[0]?.road ?? 0;
  for (const c of byRoad) {
    if (taken.length >= MAX_PLACES || c.road < CUTOFF * best) break;
    if (free(c.place)) taken.push(c.place);
  }
  const byAir = [...all].sort((a, b) => b.flight - a.flight);
  let seen = 0;
  for (const c of byAir) {
    if (seen >= AIR_PLACES) break;
    if (taken.includes(c.place)) seen++;
    else if (free(c.place)) {
      taken.push(c.place);
      seen++;
    }
  }
  return taken;
}

export function mapView(map: MapSpec, places: readonly Place[]): MapView {
  const { ground, air } = lines(map);
  const cache = new Map<string, number>();
  const cover = (col: number, row: number, range: number, flying: boolean, route: number): number => {
    const key = `${col}:${row}:${range}:${flying ? 1 : 0}:${route}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const n = within((flying ? air : ground)[route] ?? [], (col + 1) * CELL, (row + 1) * CELL, range);
    cache.set(key, n);
    return n;
  };
  return { places, cover };
}

/** The places the rotation bot fills, in order: the layout without a player's noise. */
export function rankedPlaces(map: MapSpec): Place[] {
  return layPlaces(map);
}
