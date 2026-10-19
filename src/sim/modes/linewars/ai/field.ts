import {
  FIELD_COLS, LW_AI_WEIGHTS, LW_CREEPS, LW_SENDS, fieldSpawns, mapCol,
  type SalvoSight, type SendId,
} from '../../../../content/linewars';
import { ARMOR_TYPES, BOSS_SLOW_FLOOR, MAUL_DAMAGE_TABLE, MAUL_TOWERS, type ArmorType } from '../../../../content/maul';
import { armorMultiplier } from '../../../combat/damage';
import { CELL, MIN_SPEED_FACTOR } from '../../../core/constants';
import type { Creep, GameState, Tower } from '../../../core/state';
import { pathDistance, routeCells } from '../../../path/flow';
import { cellAt, mapData } from '../../../path/grid';
import { towerSide, type SideId } from '../state';

// What the AI computes about a Field (docs/line-wars-design.md §11.3): its
// ground route, how much damage per second its towers deal on each cell of it
// and of its air line against each armor type, and from that the damage a
// lone creep would take walking the rest of the way: its potential. Plain
// sums over towers and cells, with + − × ÷ and sqrt only (ADR-0002).
//
// A Field's map is derived data, so it is cached like a flow field: keyed by
// the state object, and kept in two parts. Its route and air line are traced
// again when any path changes, and kept (the same object) when the route comes
// out the same, as it does after a build in the other Field; what its towers
// deal along them is summed again when the Side's tower version or the route
// changes. A restored Run rebuilds identical maps.

export const ARMORS = ARMOR_TYPES.length;

export function armorIndex(a: ArmorType): number {
  return ARMOR_TYPES.indexOf(a);
}

/** What a tower spec does, as the AI counts it. Derived once per spec. */
export interface SpecProfile {
  readonly spec: string;
  readonly ground: boolean;
  readonly air: boolean;
  readonly range: number;
  /** Weighted direct DPS against each armor type, before numeric armor. */
  readonly direct: readonly number[];
  /** The same without the damage table: what Normal judges a maze by. */
  readonly raw: number;
  /** Poison per second on ground creeps it hits (venom and spores), and on flyers (venom). */
  readonly dot: number;
  readonly dotAir: number;
  /** Slow on what it hits (weighted), and armor its spores strip. */
  readonly hitSlow: number;
  readonly hitStrip: number;
  /** Its creep auras: radius, slow, poison (ground only), armor stripped, and whether they reach flyers. */
  readonly auraRadius: number;
  readonly auraSlow: number;
  readonly auraPoison: number;
  readonly auraStrip: number;
  readonly auraAir: boolean;
  /** A tower aura (the Ley Shrine): its radius and the DPS factor it gives towers in it; 0 and 1 without one. */
  readonly leyRadius: number;
  readonly leyFactor: number;
}

const profiles = new Map<string, SpecProfile>();

export function profileOf(spec: string): SpecProfile {
  const cached = profiles.get(spec);
  if (cached) return cached;
  const t = MAUL_TOWERS[spec];
  const W = LW_AI_WEIGHTS;
  const a = t?.attack;
  let dps = 0;
  let group = 1;
  let crit = 1;
  let multi = 1;
  let venom = 0;
  let spores = 0;
  let hitSlow = 0;
  let hitStrip = 0;
  if (a) {
    dps = (a.damage[0] + a.damage[1]) / 2 / a.cooldown;
    for (const e of a.effects ?? []) {
      const x = e as { kind: string; count?: number; jumps?: number; falloff?: number; chance?: number; multiplier?: number; amount?: number };
      if (x.kind === 'splash') group += W.splash;
      if (x.kind === 'multishot' && x.count) multi = 1 + (x.count - 1) * W.multishot;
      if (x.kind === 'maul.chain' && x.jumps) {
        let f = 1;
        for (let j = 0; j < x.jumps; j++) {
          f *= 1 - (x.falloff ?? 0);
          group += f * W.chain;
        }
      }
      if (x.kind === 'crit' && x.chance && x.multiplier) crit = 1 + x.chance * (x.multiplier - 1);
      if (x.kind === 'slow' && x.amount) hitSlow = Math.max(hitSlow, x.amount * W.hitSlow);
    }
    group *= multi;
    for (const e of a.effects ?? []) {
      const x = e as { kind: string; dps?: number; armor?: number };
      if (x.kind === 'maul.venom' && x.dps) venom += x.dps * W.venom * multi;
      if (x.kind === 'maul.spread' && x.dps) {
        spores += x.dps * W.spread;
        if (x.armor) hitStrip = Math.max(hitStrip, x.armor);
      }
    }
  }
  const ground = !!a && a.targets !== 'air';
  const air = !!a && a.targets !== 'ground';
  const direct = ARMOR_TYPES.map((armor) => dps * group * crit * (a ? MAUL_DAMAGE_TABLE[a.attackType as keyof typeof MAUL_DAMAGE_TABLE]?.[armor] ?? 1 : 0));
  let auraRadius = 0;
  let auraSlow = 0;
  let auraPoison = 0;
  let auraStrip = 0;
  let auraAir = false;
  let leyRadius = 0;
  let leyFactor = 1;
  for (const aura of t?.auras ?? []) {
    if (aura.to === 'towers') {
      leyRadius = Math.max(leyRadius, aura.radius);
      if (aura.kind === 'damage' || aura.kind === 'attackSpeed') leyFactor *= 1 + aura.value;
      continue;
    }
    auraRadius = Math.max(auraRadius, aura.radius);
    if (aura.kind === 'slow') auraSlow = Math.max(auraSlow, aura.value);
    if (aura.kind === 'poison') auraPoison += aura.value;
    if (aura.kind === 'armor') auraStrip = Math.max(auraStrip, aura.value);
    if ((aura.targets ?? 'both') !== 'ground' && aura.kind !== 'poison') auraAir = true;
  }
  const profile: SpecProfile = {
    spec, ground, air, range: a?.range ?? 0, direct, raw: dps * group * crit,
    // Spores burst on the ground, so only venom reaches flyers.
    dot: ground ? venom + spores : 0, dotAir: air ? venom : 0, hitSlow, hitStrip,
    auraRadius, auraSlow, auraPoison, auraStrip, auraAir, leyRadius, leyFactor,
  };
  profiles.set(spec, profile);
  return profile;
}

/** A Field's ground route and air line, without its towers. */
export interface RouteLine {
  /** The route's cells in order, and each cell's step on it (-1 off it); null if the route crosses a cell twice. */
  readonly cells: readonly number[];
  readonly stepAt: Int32Array | null;
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly len: Float64Array;
  readonly dist: Float64Array;
  readonly m: number;
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly alen: Float64Array;
}

/** A Field as the AI sees it. */
export interface FieldMap {
  readonly side: SideId;
  /** The route and air line it was summed over: kept while the route stays the same, so what is derived from it can be kept too. */
  readonly route: RouteLine;
  /** The ground route from the spawn row's middle cell: its cells in order and their centres. */
  readonly n: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** World units walked into each route cell from the one before. */
  readonly len: Float64Array;
  /** Each route cell's distance (in cells) to the exit, for placing a creep on the route. */
  readonly dist: Float64Array;
  /** Per route cell: direct DPS by armor type (n × 5), raw DPS, poison, slow and armor stripped. */
  readonly direct: Float64Array;
  readonly raw: Float64Array;
  readonly dot: Float64Array;
  readonly slow: Float64Array;
  readonly strip: Float64Array;
  /** The same over the air line's samples, from the spawn row's middle to the exit's. */
  readonly m: number;
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly alen: Float64Array;
  readonly adirect: Float64Array;
  readonly araw: Float64Array;
  readonly adot: Float64Array;
  readonly aslow: Float64Array;
  readonly astrip: Float64Array;
  /** The towers it counted, with the Ley factor each stands in. */
  readonly towers: readonly Tower[];
  readonly ley: readonly number[];
  /** Suffix sums of potential by Send and sight, filled on demand. */
  readonly suffix: Map<string, Float64Array>;
}

/** Spacing of the air line's samples, in world units. */
const AIR_STEP = CELL / 2;

/** Each Field's middle spawn and the middle of its spawn and exit rows: where its route and air line are traced from. */
export function fieldMiddle(side: SideId): { readonly spawn: number; readonly x: number } {
  const [first] = fieldSpawns(side);
  const col = mapCol(side, 8);
  return { spawn: first + col - FIELD_COLS[side][0], x: ((FIELD_COLS[side][0] + FIELD_COLS[side][1] + 1) / 2) * CELL };
}

/** The towers standing in `side`'s Field, in id order. */
export function fieldTowers(state: GameState, side: SideId): Tower[] {
  return state.towers.filter((t) => towerSide(state, t) === side);
}

interface SideCache {
  readonly pathVersion: number;
  readonly version: number;
  readonly route: RouteLine;
  readonly map: FieldMap;
}

const caches = new WeakMap<GameState, [SideCache | null, SideCache | null]>();

/**
 * `side`'s Field map. `version` is the Side's tower version, bumped by every
 * build, upgrade and sale in its Field; the route is traced again when any
 * path changed, and the towers summed again only if it or `version` did.
 */
export function fieldMap(state: GameState, side: SideId, version: number): FieldMap {
  let pair = caches.get(state);
  if (!pair) {
    pair = [null, null];
    caches.set(state, pair);
  }
  const cached = pair[side];
  if (cached && cached.pathVersion === state.pathVersion && cached.version === version) return cached.map;
  const route = cached && cached.pathVersion === state.pathVersion ? cached.route : routeLine(state, side, cached?.route ?? null);
  const map = cached && cached.version === version && cached.route === route ? cached.map : buildMap(state, side, route);
  pair[side] = { pathVersion: state.pathVersion, version, route, map };
  return map;
}

const airLines = new WeakMap<GameState['map'], [AirLine | null, AirLine | null]>();

interface AirLine {
  readonly m: number;
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly alen: Float64Array;
}

/** `side`'s air line: samples from the middle of its spawn row to its exit row's. It depends on the Map alone. */
function airLine(state: GameState, side: SideId): AirLine {
  let pair = airLines.get(state.map);
  if (!pair) {
    pair = [null, null];
    airLines.set(state.map, pair);
  }
  const cached = pair[side];
  if (cached) return cached;
  const md = mapData(state.map);
  const y0 = (0 + 0.5) * CELL;
  const y1 = (md.rows - 0.5) * CELL;
  const m = Math.floor((y1 - y0) / AIR_STEP) + 1;
  const ax = new Float64Array(m).fill(fieldMiddle(side).x);
  const ay = new Float64Array(m);
  const alen = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    ay[j] = y0 + j * AIR_STEP;
    if (j > 0) alen[j] = AIR_STEP;
  }
  const line: AirLine = { m, ax, ay, alen };
  pair[side] = line;
  return line;
}

/** `side`'s route as it runs now: `last` itself when its cells and their distances are unchanged. */
function routeLine(state: GameState, side: SideId, last: RouteLine | null): RouteLine {
  const md = mapData(state.map);
  const cells = routeCells(state, fieldMiddle(side).spawn);
  const n = cells.length;
  const dist = new Float64Array(n);
  for (let j = 0; j < n; j++) dist[j] = pathDistance(state, 0, cells[j]!);
  if (last && last.n === n) {
    let same = true;
    for (let j = 0; j < n && same; j++) same = cells[j] === last.cells[j] && dist[j] === last.dist[j];
    if (same) return last;
  }
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const len = new Float64Array(n);
  let stepAt: Int32Array | null = new Int32Array(md.size).fill(-1);
  for (let j = 0; j < n; j++) {
    const c = cells[j]!;
    x[j] = md.cx[c]!;
    y[j] = md.cy[c]!;
    if (stepAt && stepAt[c] !== -1) stepAt = null;
    else if (stepAt) stepAt[c] = j;
    if (j > 0) {
      const dx = x[j]! - x[j - 1]!;
      const dy = y[j]! - y[j - 1]!;
      len[j] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  return { cells, stepAt, n, x, y, len, dist, ...airLine(state, side) };
}

/**
 * The Map cells and air line samples a tower reaches: in its range, then in
 * its creep aura's radius. A tower never moves and only its spec changes its
 * range, so this is kept by tower id and spec, whatever the route.
 */
interface Reach {
  readonly spec: string;
  readonly cells: Int32Array;
  readonly auraCells: Int32Array;
  readonly air: Int32Array;
  readonly airAura: Int32Array;
}

const reaches = new WeakMap<GameState, Map<number, Reach>>();

function reachOf(state: GameState, route: RouteLine, t: Tower, p: SpecProfile): Reach {
  let byTower = reaches.get(state);
  if (!byTower) {
    byTower = new Map();
    reaches.set(state, byTower);
  }
  const cached = byTower.get(t.id);
  if (cached && cached.spec === t.spec) return cached;
  const md = mapData(state.map);
  const r2 = p.range * p.range;
  const q2 = p.auraRadius * p.auraRadius;
  const cells: number[] = [];
  const auraCells: number[] = [];
  const air: number[] = [];
  const airAura: number[] = [];
  if (p.ground || p.auraRadius > 0) {
    // Cell centres within reach of it, from a box a cell wider than its reach.
    const r = Math.max(p.ground ? p.range : 0, p.auraRadius) + CELL;
    const c0 = Math.max(0, Math.floor((t.x - r) / CELL));
    const c1 = Math.min(md.cols - 1, Math.floor((t.x + r) / CELL));
    const r0 = Math.max(0, Math.floor((t.y - r) / CELL));
    const r1 = Math.min(md.rows - 1, Math.floor((t.y + r) / CELL));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const c = row * md.cols + col;
        const dx = md.cx[c]! - t.x;
        const dy = md.cy[c]! - t.y;
        const d2 = dx * dx + dy * dy;
        if (p.ground && d2 <= r2) cells.push(c);
        if (p.auraRadius > 0 && d2 <= q2) auraCells.push(c);
      }
    }
  }
  if (p.air || p.auraAir) {
    const { m, ax, ay } = route;
    for (let j = 0; j < m; j++) {
      const dx = ax[j]! - t.x;
      const dy = ay[j]! - t.y;
      const d2 = dx * dx + dy * dy;
      if (p.air && d2 <= r2) air.push(j);
      if (p.auraAir && d2 <= q2) airAura.push(j);
    }
  }
  const reach: Reach = {
    spec: t.spec, cells: Int32Array.from(cells), auraCells: Int32Array.from(auraCells), air: Int32Array.from(air), airAura: Int32Array.from(airAura),
  };
  byTower.set(t.id, reach);
  return reach;
}

/**
 * What the Field's towers deal along its route and air line. Each step adds
 * the towers in id order, a tower's hits before its aura's, so a step's sums
 * come out the same however a tower's reach was found.
 */
function buildMap(state: GameState, side: SideId, route: RouteLine): FieldMap {
  const { n, m, stepAt } = route;
  const towers = fieldTowers(state, side);
  const profiles = towers.map((t) => profileOf(t.spec));
  const shrines = towers.filter((_, i) => profiles[i]!.leyRadius > 0);
  const ley = towers.map((t) => leyFactorAt(shrines, t));
  const direct = new Float64Array(n * ARMORS);
  const raw = new Float64Array(n);
  const dot = new Float64Array(n);
  const slow = new Float64Array(n);
  const strip = new Float64Array(n);
  const adirect = new Float64Array(m * ARMORS);
  const araw = new Float64Array(m);
  const adot = new Float64Array(m);
  const aslow = new Float64Array(m);
  const astrip = new Float64Array(m);
  // A tower's DPS by armor type times its Ley factor: the same products a sum over every step would take.
  const dk = new Float64Array(ARMORS);
  towers.forEach((t, i) => {
    const p = profiles[i]!;
    const k = ley[i]!;
    for (let a = 0; a < ARMORS; a++) dk[a] = p.direct[a]! * k;
    const rk = p.raw * k;
    const reach = reachOf(state, route, t, p);
    const hits = stepAt ? reach.cells : stepsIn(route, reach.cells);
    for (let h = 0; h < hits.length; h++) {
      const j = stepAt ? stepAt[hits[h]!]! : hits[h]!;
      if (j < 0) continue;
      const base = j * ARMORS;
      for (let a = 0; a < ARMORS; a++) direct[base + a] = direct[base + a]! + dk[a]!;
      raw[j] = raw[j]! + rk;
      dot[j] = dot[j]! + p.dot;
      if (p.hitSlow > slow[j]!) slow[j] = p.hitSlow;
      if (p.hitStrip > strip[j]!) strip[j] = p.hitStrip;
    }
    const auras = stepAt ? reach.auraCells : stepsIn(route, reach.auraCells);
    for (let h = 0; h < auras.length; h++) {
      const j = stepAt ? stepAt[auras[h]!]! : auras[h]!;
      if (j < 0) continue;
      dot[j] = dot[j]! + p.auraPoison;
      if (p.auraSlow > slow[j]!) slow[j] = p.auraSlow;
      if (p.auraStrip > strip[j]!) strip[j] = p.auraStrip;
    }
    for (const j of reach.air) {
      const base = j * ARMORS;
      for (let a = 0; a < ARMORS; a++) adirect[base + a] = adirect[base + a]! + dk[a]!;
      araw[j] = araw[j]! + rk;
      adot[j] = adot[j]! + p.dotAir;
      if (p.hitSlow > aslow[j]!) aslow[j] = p.hitSlow;
    }
    for (const j of reach.airAura) {
      if (p.auraSlow > aslow[j]!) aslow[j] = p.auraSlow;
      if (p.auraStrip > astrip[j]!) astrip[j] = p.auraStrip;
    }
  });
  return {
    side, route, n, x: route.x, y: route.y, len: route.len, dist: route.dist, direct, raw, dot, slow, strip,
    m, ax: route.ax, ay: route.ay, alen: route.alen, adirect, araw, adot, aslow, astrip, towers, ley, suffix: new Map(),
  };
}

/** For a route that crosses a cell twice: the steps on any of `cells`, in route order. */
function stepsIn(route: RouteLine, cells: Int32Array): number[] {
  const set = new Set(cells);
  const out: number[] = [];
  for (let j = 0; j < route.n; j++) if (set.has(route.cells[j]!)) out.push(j);
  return out;
}

/** The DPS factor a Ley Shrine near `t` gives it (shrines share their keys, so they don't stack). `shrines` are the Field's towers with a tower aura. */
function leyFactorAt(shrines: readonly Tower[], t: Tower): number {
  if (!MAUL_TOWERS[t.spec]?.attack) return 1;
  let best = 1;
  for (const u of shrines) {
    if (u === t) continue;
    const p = profileOf(u.spec);
    const dx = u.x - t.x;
    const dy = u.y - t.y;
    if (dx * dx + dy * dy <= p.leyRadius * p.leyRadius && p.leyFactor > best) best = p.leyFactor;
  }
  return best;
}

/** Potential suffix sums for one Send's creep: entry j is the damage it takes from route step j to the exit. */
function suffixOf(fm: FieldMap, send: SendId, sight: SalvoSight): Float64Array {
  const key = `${send}:${sight}`;
  const cached = fm.suffix.get(key);
  if (cached) return cached;
  const cs = LW_CREEPS[LW_SENDS[send].creep]!;
  const a = armorIndex(cs.armorType);
  const floor = cs.maul.unslowable ? 1 : cs.maul.kind === 'boss' ? BOSS_SLOW_FLOOR : MIN_SPEED_FACTOR;
  const air = cs.flying;
  const count = air ? fm.m : fm.n;
  const out = new Float64Array(count + 1);
  const dir = air ? fm.adirect : fm.direct;
  const rw = air ? fm.araw : fm.raw;
  const dt = air ? fm.adot : fm.dot;
  const sl = air ? fm.aslow : fm.slow;
  const st = air ? fm.astrip : fm.strip;
  const ln = air ? fm.alen : fm.len;
  for (let j = count - 1; j >= 0; j--) {
    const rate = sight === 'raw' ? rw[j]! + dt[j]! : dir[j * ARMORS + a]! * armorMultiplier(cs.armor - st[j]!) + dt[j]!;
    const factor = Math.max(floor, 1 - sl[j]!);
    out[j] = out[j + 1]! + (rate * ln[j]!) / (cs.speed * factor);
  }
  fm.suffix.set(key, out);
  return out;
}

/** The damage a lone creep of `send` takes walking the whole of the Field. */
export function potential(fm: FieldMap, send: SendId, sight: SalvoSight): number {
  return suffixOf(fm, send, sight)[0]!;
}

/** The damage a creep takes from where it is now to the exit. */
export function potentialLeft(state: GameState, fm: FieldMap, creep: Creep, send: SendId): number {
  const s = suffixOf(fm, send, 'armor');
  if (creep.air) {
    let lo = 0;
    let hi = fm.m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fm.ay[mid]! < creep.y) lo = mid + 1;
      else hi = mid;
    }
    return s[lo]!;
  }
  const md = mapData(state.map);
  const cell = cellAt(md, creep.x, creep.y);
  const d = cell >= 0 ? pathDistance(state, 0, cell) : 0;
  // The route's distances fall toward the exit: find its first step no further than the creep.
  let lo = 0;
  let hi = fm.n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fm.dist[mid]! > d) lo = mid + 1;
    else hi = mid;
  }
  return s[lo]!;
}

/** Route length (in cells) and air line length (in cells) within `r` of (x, y). */
export function coverAt(fm: FieldMap, x: number, y: number, r: number): { readonly ground: number; readonly air: number } {
  const r2 = r * r;
  let ground = 0;
  let air = 0;
  for (let j = 0; j < fm.n; j++) {
    const dx = fm.x[j]! - x;
    const dy = fm.y[j]! - y;
    if (dx * dx + dy * dy <= r2) ground += fm.len[j]!;
  }
  for (let j = 0; j < fm.m; j++) {
    const dx = fm.ax[j]! - x;
    const dy = fm.ay[j]! - y;
    if (dx * dx + dy * dy <= r2) air += fm.alen[j]!;
  }
  return { ground: ground / CELL, air: air / CELL };
}

/** Air line samples within `r` of (x, y) among its last `share` (from the exit back). */
export function airTailCover(fm: FieldMap, x: number, y: number, r: number, share: number): number {
  const r2 = r * r;
  const from = Math.floor(fm.m * (1 - share));
  let n = 0;
  for (let j = from; j < fm.m; j++) {
    const dx = fm.ax[j]! - x;
    const dy = fm.ay[j]! - y;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}
