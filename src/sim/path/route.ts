import type { MapSpec, RouteSpec } from '../core/specs';
import type { Creep, GameState } from '../core/state';
import type { Point } from './grid';

// Fixed routes (PLAN §2): on a Map with a `route` (or a `routes` list), ground
// creeps walk its polyline and track the distance travelled, instead of
// following a flow field. Towers stand beside the route, so nothing they do
// can change it. A route may carry an air line, which its flying creeps follow
// the same way. Derived data lives in a cache keyed by the Map, like grid.ts's MapData.

export interface RouteData {
  readonly points: readonly Point[];
  /** cum[i]: distance along the route from the first point to point i. */
  readonly cum: readonly number[];
  readonly length: number;
  /** Distance at which a creep has reached the exit: the length less the leak radius. */
  readonly leakAt: number;
}

export interface MapRoutes {
  readonly ground: readonly RouteData[];
  /** The air line of each route, null where a route has none. */
  readonly air: readonly (RouteData | null)[];
}

const routeCache = new WeakMap<MapSpec, MapRoutes>();

type Polyline = readonly (readonly [number, number])[];

function routeSpecs(map: MapSpec): readonly RouteSpec[] {
  if (map.routes !== undefined) return map.routes;
  return map.route !== undefined ? [map.route] : [];
}

/** How many fixed routes the Map has: 0 on a mazing Map. */
export function routeCount(map: MapSpec): number {
  return routeSpecs(map).length;
}

function polylineProblem(name: string, pts: unknown): string | null {
  if (!Array.isArray(pts) || pts.length < 2) return `${name} needs at least two points`;
  for (const p of pts as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return `${name} points must be [x, y] pairs of finite numbers`;
    }
  }
  return null;
}

/** A problem with the Map's routes, or null when it has none or they are usable. */
export function routeProblem(map: MapSpec): string | null {
  if (map.route !== undefined && map.routes !== undefined) return 'a Map has route or routes, not both';
  if (map.routes !== undefined && (!Array.isArray(map.routes) || map.routes.length < 1)) return 'routes needs at least one route';
  const specs = routeSpecs(map);
  for (let i = 0; i < specs.length; i++) {
    const route = specs[i]!;
    const name = specs.length > 1 ? `route ${i}` : 'route';
    const problem = polylineProblem(name, route.points) ?? (route.air === undefined ? null : polylineProblem(`${name} air line`, route.air));
    if (problem) return problem;
    const leak = route.leakRadius ?? 0;
    if (!(typeof leak === 'number' && Number.isFinite(leak) && leak >= 0)) return `${name} leakRadius must be 0 or more`;
    if (leak >= polylineLength(route.points)) return `${name} leakRadius must be shorter than the route`;
  }
  return null;
}

function polylineLength(points: Polyline): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]![0] - points[i - 1]![0];
    const dy = points[i]![1] - points[i - 1]![1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function polylineData(polyline: Polyline, leakRadius: number): RouteData {
  const points = polyline.map(([x, y]) => ({ x, y }));
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    cum.push(cum[i - 1]! + Math.sqrt(dx * dx + dy * dy));
  }
  const length = cum[cum.length - 1]!;
  return { points, cum, length, leakAt: length - leakRadius };
}

function mapRoutes(map: MapSpec): MapRoutes {
  const cached = routeCache.get(map);
  if (cached !== undefined) return cached;
  const specs = routeSpecs(map);
  const data: MapRoutes = {
    ground: specs.map((r) => polylineData(r.points, r.leakRadius ?? 0)),
    air: specs.map((r) => (r.air === undefined ? null : polylineData(r.air, 0))),
  };
  routeCache.set(map, data);
  return data;
}

/** Route `index` (0, the only one, by default), or null when the Map has no such route and its creeps follow flow fields. */
export function routeData(map: MapSpec, index = 0): RouteData | null {
  return mapRoutes(map).ground[index] ?? null;
}

/** The air line of route `index`, or null when it has none and its flyers fly between the waypoint centres. */
export function airLineData(map: MapSpec, index = 0): RouteData | null {
  return mapRoutes(map).air[index] ?? null;
}

/** The line a creep follows: its route's air line if it flies, its route if it walks; null when it follows neither. */
export function creepLine(map: MapSpec, creep: Creep): RouteData | null {
  return lineOf(mapRoutes(map), creep);
}

/** Every route and air line of a Map, for loops that look up many creeps' lines in one tick. */
export function mapLines(map: MapSpec): MapRoutes {
  return mapRoutes(map);
}

export function lineOf(lines: MapRoutes, creep: Creep): RouteData | null {
  const index = creep.route ?? 0;
  return (creep.air ? lines.air[index] : lines.ground[index]) ?? null;
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

/** Route `index`'s corners in world units, spawn first and exit last, for the renderer's path line; empty without one. */
export function routePolyline(state: GameState, index = 0): Point[] {
  const route = routeData(state.map, index);
  return route ? route.points.map((p) => ({ x: p.x, y: p.y })) : [];
}

/** Route `index`'s air line in world units, spawn first; empty without one. */
export function airLinePolyline(state: GameState, index = 0): Point[] {
  const line = airLineData(state.map, index);
  return line ? line.points.map((p) => ({ x: p.x, y: p.y })) : [];
}

/** Puts a creep `dist` along its line (a spawn, a restart after a leak, a rewind, a split). */
export function placeOnRoute(state: GameState, creep: Creep, dist: number): void {
  const route = creepLine(state.map, creep);
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
