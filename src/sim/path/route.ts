import type { MapSpec } from '../core/specs';
import type { Creep, GameState } from '../core/state';
import type { Point } from './grid';

// Fixed routes (PLAN §2): on a Map with a `route`, ground creeps walk its
// polyline and track the distance travelled, instead of following a flow
// field. Towers stand beside the route, so nothing they do can change it.
// Derived data lives in a cache keyed by the Map, like grid.ts's MapData.

export interface RouteData {
  readonly points: readonly Point[];
  /** cum[i]: distance along the route from the first point to point i. */
  readonly cum: readonly number[];
  readonly length: number;
  /** Distance at which a creep has reached the exit: the length less the leak radius. */
  readonly leakAt: number;
}

const routeCache = new WeakMap<MapSpec, RouteData | null>();

/** A problem with the Map's route, or null when it has none or it is usable. */
export function routeProblem(map: MapSpec): string | null {
  const route = map.route;
  if (route === undefined) return null;
  const pts = route.points as unknown;
  if (!Array.isArray(pts) || pts.length < 2) return 'route needs at least two points';
  for (const p of pts as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return 'route points must be [x, y] pairs of finite numbers';
    }
  }
  const leak = route.leakRadius ?? 0;
  if (!(typeof leak === 'number' && Number.isFinite(leak) && leak >= 0)) return 'route leakRadius must be 0 or more';
  if (leak >= routeLength(route.points)) return 'route leakRadius must be shorter than the route';
  return null;
}

function routeLength(points: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]![0] - points[i - 1]![0];
    const dy = points[i]![1] - points[i - 1]![1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/** The Map's route, or null when its creeps follow flow fields. */
export function routeData(map: MapSpec): RouteData | null {
  const cached = routeCache.get(map);
  if (cached !== undefined) return cached;
  let data: RouteData | null = null;
  if (map.route !== undefined) {
    const points = map.route.points.map(([x, y]) => ({ x, y }));
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i]!.x - points[i - 1]!.x;
      const dy = points[i]!.y - points[i - 1]!.y;
      cum.push(cum[i - 1]! + Math.sqrt(dx * dx + dy * dy));
    }
    const length = cum[cum.length - 1]!;
    data = { points, cum, length, leakAt: length - (map.route.leakRadius ?? 0) };
  }
  routeCache.set(map, data);
  return data;
}

/** The point `dist` along the route, clamped to its ends. */
export function routePoint(route: RouteData, dist: number): Point {
  const { points, cum } = route;
  if (dist <= 0) return points[0]!;
  const last = points.length - 1;
  if (dist >= route.length) return points[last]!;
  // Few corners, so a linear scan beats a binary search's bookkeeping.
  let i = 1;
  while (i < last && cum[i]! < dist) i++;
  const a = points[i - 1]!;
  const b = points[i]!;
  const span = cum[i]! - cum[i - 1]!;
  const k = span > 0 ? (dist - cum[i - 1]!) / span : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** The route's corners in world units, spawn first and exit last, for the renderer's path line; empty without a route. */
export function routePolyline(state: GameState): Point[] {
  const route = routeData(state.map);
  return route ? route.points.map((p) => ({ x: p.x, y: p.y })) : [];
}

/** Puts a route creep `dist` along the route (a spawn, a restart after a leak, a rewind). */
export function placeOnRoute(state: GameState, creep: Creep, dist: number): void {
  const route = routeData(state.map);
  if (!route) return;
  const d = Math.max(0, Math.min(dist, route.length));
  const p = routePoint(route, d);
  creep.dist = d;
  creep.x = p.x;
  creep.y = p.y;
}

/** Moves a route creep `step` further along; true when it reached the exit (the leak distance). */
export function moveOnRoute(route: RouteData, creep: Creep, step: number): boolean {
  const d = (creep.dist ?? 0) + step;
  const at = Math.min(d, route.leakAt);
  const p = routePoint(route, at);
  creep.dist = at;
  creep.x = p.x;
  creep.y = p.y;
  return d >= route.leakAt;
}
