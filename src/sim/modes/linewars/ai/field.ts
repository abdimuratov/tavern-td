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
// the state object, the Side's tower version and the path version. A restored
// Run rebuilds identical maps.

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

/** A Field as the AI sees it. */
export interface FieldMap {
  readonly side: SideId;
  readonly key: string;
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

const caches = new WeakMap<GameState, [FieldMap | null, FieldMap | null]>();

/** `side`'s Field map, rebuilt when its towers or any path changed. `version` is the Side's tower version. */
export function fieldMap(state: GameState, side: SideId, version: number): FieldMap {
  const key = `${version}:${state.pathVersion}`;
  let pair = caches.get(state);
  if (!pair) {
    pair = [null, null];
    caches.set(state, pair);
  }
  const cached = pair[side];
  if (cached && cached.key === key) return cached;
  const built = buildMap(state, side, key);
  pair[side] = built;
  return built;
}

function buildMap(state: GameState, side: SideId, key: string): FieldMap {
  const md = mapData(state.map);
  const mid = fieldMiddle(side);
  const route = routeCells(state, mid.spawn);
  const n = route.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const len = new Float64Array(n);
  const dist = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const c = route[j]!;
    x[j] = md.cx[c]!;
    y[j] = md.cy[c]!;
    dist[j] = pathDistance(state, 0, c);
    if (j > 0) {
      const dx = x[j]! - x[j - 1]!;
      const dy = y[j]! - y[j - 1]!;
      len[j] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  const y0 = (0 + 0.5) * CELL;
  const y1 = (md.rows - 0.5) * CELL;
  const m = Math.floor((y1 - y0) / AIR_STEP) + 1;
  const ax = new Float64Array(m).fill(mid.x);
  const ay = new Float64Array(m);
  const alen = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    ay[j] = y0 + j * AIR_STEP;
    if (j > 0) alen[j] = AIR_STEP;
  }
  const towers = fieldTowers(state, side);
  const ley = towers.map((t) => leyFactorAt(towers, t));
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
  towers.forEach((t, i) => {
    const p = profileOf(t.spec);
    const k = ley[i]!;
    const r2 = p.range * p.range;
    const q2 = p.auraRadius * p.auraRadius;
    if (p.ground || p.auraRadius > 0) {
      for (let j = 0; j < n; j++) {
        const dx = x[j]! - t.x;
        const dy = y[j]! - t.y;
        const d2 = dx * dx + dy * dy;
        if (p.ground && d2 <= r2) {
          for (let a = 0; a < ARMORS; a++) direct[j * ARMORS + a] = direct[j * ARMORS + a]! + p.direct[a]! * k;
          raw[j] = raw[j]! + p.raw * k;
          dot[j] = dot[j]! + p.dot;
          if (p.hitSlow > slow[j]!) slow[j] = p.hitSlow;
          if (p.hitStrip > strip[j]!) strip[j] = p.hitStrip;
        }
        if (p.auraRadius > 0 && d2 <= q2) {
          dot[j] = dot[j]! + p.auraPoison;
          if (p.auraSlow > slow[j]!) slow[j] = p.auraSlow;
          if (p.auraStrip > strip[j]!) strip[j] = p.auraStrip;
        }
      }
    }
    if (p.air || p.auraAir) {
      for (let j = 0; j < m; j++) {
        const dx = ax[j]! - t.x;
        const dy = ay[j]! - t.y;
        const d2 = dx * dx + dy * dy;
        if (p.air && d2 <= r2) {
          for (let a = 0; a < ARMORS; a++) adirect[j * ARMORS + a] = adirect[j * ARMORS + a]! + p.direct[a]! * k;
          araw[j] = araw[j]! + p.raw * k;
          adot[j] = adot[j]! + p.dotAir;
          if (p.hitSlow > aslow[j]!) aslow[j] = p.hitSlow;
        }
        if (p.auraAir && d2 <= q2) {
          if (p.auraSlow > aslow[j]!) aslow[j] = p.auraSlow;
          if (p.auraStrip > astrip[j]!) astrip[j] = p.auraStrip;
        }
      }
    }
  });
  return {
    side, key, n, x, y, len, dist, direct, raw, dot, slow, strip,
    m, ax, ay, alen, adirect, araw, adot, aslow, astrip, towers, ley, suffix: new Map(),
  };
}

/** The DPS factor a Ley Shrine near `t` gives it (shrines share their keys, so they don't stack). */
function leyFactorAt(towers: readonly Tower[], t: Tower): number {
  if (!MAUL_TOWERS[t.spec]?.attack) return 1;
  let best = 1;
  for (const u of towers) {
    if (u === t) continue;
    const p = profileOf(u.spec);
    if (p.leyRadius <= 0) continue;
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
