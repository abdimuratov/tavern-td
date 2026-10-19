import { ORIGINAL_CREEPS, ORIGINAL_TOWERS, type ArmorType, type OriginalTowerSpec } from '../../src/content/original';
import { CELL, cellCol, cellRow, original } from '../../src/sim';
import type { MapView } from './view';

// What a purchase is worth to the bots. The defense is judged against the
// creep streams of the next few Waves (one stream per Wave group): how much
// damage the towers can deal each stream as it passes, against the HP it
// brings. A purchase is worth the lives it would save, plus a little for the
// extra damage, so the player first closes the gaps (flyers, armor, Shields)
// and then keeps building ahead of the HP curve.

/** One Wave group the defense must clear. */
export interface Stream {
  readonly flying: boolean;
  readonly armor: ArmorType;
  readonly speed: number;
  /** Seconds between two of its creeps. */
  readonly gap: number;
  readonly hp: number;
  readonly shield: number;
  readonly count: number;
  /** Lives each one costs if it leaks. */
  readonly lives: number;
  readonly route: number;
  readonly boss: boolean;
  /** Damage the defense must have for it: its HP with a margin for overkill, misses and regeneration. */
  readonly need: number;
  /** How much the player weighs it: Waves further off count for less. */
  readonly weight: number;
}

/** How much more damage than HP a defense wants. assumed: 1.25 for overkill, 1.3 for safety. */
const MARGIN = 1.6;
/** What extra damage is worth once nothing would leak, per Stream cleared once more. */
const SURPLUS = 0.1;

/** Each Wave further ahead counts for this share of the one before. assumed. */
const LOOKAHEAD = 0.75;

/** The groups of the Wave on the Map and the `waves` − 1 after it. */
export function streamsAhead(state: original.OriginalGameState, routes: number, waves = 5): Stream[] {
  const first = Math.max(1, state.wave.number);
  const last = Math.min(state.wave.total, first + waves - 1);
  const out: Stream[] = [];
  for (let w = first; w <= last; w++) {
    const preview = original.wavePreview(state, w);
    const spec = original.waveSpec(state, w - 1);
    if (!preview || !spec) continue;
    preview.groups.forEach((g, i) => {
      const creep = ORIGINAL_CREEPS[g.creep];
      if (!creep) return;
      const gap = spec.groups[i]?.interval ?? creep.original.gap;
      // Regeneration over half its walk adds to what must be dealt.
      const regen = 1 + (creep.original.regen ?? 0) * 15;
      out.push({
        flying: creep.flying, armor: creep.armorType, speed: creep.speed, gap, hp: g.hp,
        shield: (creep.original.shield ?? 0) * preview.ghoulHp, count: g.count, lives: creep.leakCost ?? 1,
        route: Math.min(routes - 1, g.route), boss: creep.armorType === 'boss', need: g.count * g.hp * MARGIN * regen,
        weight: LOOKAHEAD ** (w - first),
      });
    });
  }
  return out;
}

/** A plain stream of 10 Ghouls at the next Wave's Threat, split over the routes: what the greedy player plans for. */
export function ghoulStreams(state: original.OriginalGameState, routes: number): Stream[] {
  const hp = original.wavePreview(state, Math.min(state.wave.total, state.wave.number + 1))?.ghoulHp ?? 20;
  return Array.from({ length: routes }, (_, route) => ({
    flying: false, armor: 'unarmored' as const, speed: 160, gap: 1, hp, shield: 0, count: 10 / routes, lives: 1, route, boss: false,
    need: (10 / routes) * hp * MARGIN, weight: 1,
  }));
}

/** How many creeps of a stream fall within a stretch of road `width` long: at least 1, at most `cap`. */
function crowd(width: number, spacing: number, cap = 6): number {
  return Math.max(1, Math.min(cap, width / spacing));
}

/** Creeps of a stream within `radius` of one of them: the one hit, and those spaced along the road either side. */
function within(radius: number, spacing: number): number {
  return 1 + 2 * Math.max(0, radius / spacing - 0.5);
}

/** Creeps a splash catches, the half-damage ring counting half. */
function splashCount(full: number, half: number, spacing: number): number {
  const inner = within(full, spacing);
  return Math.min(6, inner + (within(half, spacing) - inner) / 2);
}

/**
 * Damage per second `spec` deals to a stream, with the Run's Talents: its hits
 * and Widow's Fang stacks, and apart from them its refreshing poison, which
 * doesn't stack with another tower's (one poison per creep).
 */
export function dpsAgainst(state: original.OriginalGameState, spec: OriginalTowerSpec, s: Stream): { hit: number; poison: number } {
  const info = spec.original;
  const atk = spec.attack;
  const none = { hit: 0, poison: 0 };
  if (!atk || !info.damageType) return none;
  const ft = original.runTalents(state).families[info.family];
  const hitsAir = atk.targets === 'both' || (info.family === 'poison' && ft.hitsAir);
  if (s.flying && !hitsAir) return none;
  const spacing = s.speed * s.gap;
  const share = original.typeShare(state, info.damageType, s.armor, info);
  const cooldown = atk.cooldown / (1 + ft.attackSpeed);
  const crit = info.crit ? { chance: info.crit.chance + (ft.crit?.chance ?? 0), multiplier: info.crit.multiplier } : ft.crit;
  const critFactor = crit ? 1 + crit.chance * (crit.multiplier - 1) : 1;
  let hit = atk.damage[0] * (1 + ft.damage + (s.flying ? ft.flyingDamage : 0)) * share;
  // A beam ramps the longer it stays on one creep, and a Shield blocks it once a second.
  let block = s.shield;
  if (info.beam) {
    const seconds = Math.min(8, s.hp / Math.max(1, (hit / cooldown) * 1.5));
    hit *= Math.min(info.beam.max, 1 + info.beam.ramp * seconds * 0.5);
    block = s.shield * cooldown;
  }
  // A hit can't take more than the creep has: overkill is wasted.
  let dps = Math.min(Math.max(0, hit - block) * critFactor, s.hp) / cooldown;
  const inRange = crowd(2 * atk.range, spacing);
  if (info.multishot) dps *= Math.min(info.multishot, inRange);
  if (info.nova) dps *= inRange;
  if (info.splash) {
    const wider = 1 + ft.splashRadius;
    dps *= splashCount(info.splash.full * wider, info.splash.half * wider, spacing);
  }
  if (info.bounce) {
    const n = Math.floor(Math.min(1 + info.bounce.jumps, crowd(2 * info.bounce.radius, spacing, 1 + info.bounce.jumps)));
    let sum = 0;
    for (let k = 0; k < n; k++) sum += (1 - info.bounce.falloff) ** k;
    dps *= sum;
  }
  // Damage over time skips armor types and Shields.
  const venom = (1 + ft.poisonDamage) * (1 + ft.damage);
  let poison = 0;
  if (info.poison) {
    const lasts = info.poison.duration + ft.poisonDuration;
    poison += info.poison.dps * venom * Math.min(Math.ceil(lasts / cooldown), inRange);
  }
  if (info.cloud) poison += info.cloud.dps * venom * splashCount(info.cloud.radius, info.cloud.radius, spacing) * Math.min(1.5, info.cloud.duration / cooldown);
  if (info.stacks) dps += info.stacks.dps * venom * Math.min(info.stacks.max, info.stacks.duration / cooldown);
  return { hit: dps, poison };
}

/** A tower as the planner sees it: what stands (or would stand) with its top-left at (col, row). */
export interface Placed {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly spec: string;
}

export interface Planner {
  readonly state: original.OriginalGameState;
  readonly view: MapView;
  readonly streams: readonly Stream[];
  /** Counts slows (balanced and single). */
  readonly slows: boolean;
  /** Counts lives saved; the greedy player counts only damage. */
  readonly leaks: boolean;
  readonly memo: Map<string, Capacity>;
}

export function makePlanner(state: original.OriginalGameState, view: MapView, streams: readonly Stream[], greedy: boolean): Planner {
  return { state, view, streams, slows: !greedy, leaks: !greedy, memo: new Map() };
}

/** The towers standing now, by their top-left cells. */
export function placedTowers(state: original.OriginalGameState): Placed[] {
  return state.towers.map((t) => ({ id: t.id, col: cellCol(state.map, t.cell), row: cellRow(state.map, t.cell), spec: t.spec }));
}

/** Damage a tower at a place can deal each stream as it passes, before auras and slows: its hits, and its poison. */
interface Capacity {
  readonly hit: readonly number[];
  readonly poison: readonly number[];
}

function capacities(p: Planner, spec: string, col: number, row: number): Capacity {
  const key = `${spec}:${col}:${row}`;
  const known = p.memo.get(key);
  if (known) return known;
  const tower = ORIGINAL_TOWERS[spec]!;
  const range = tower.attack?.range ?? 0;
  const hit: number[] = [];
  const poison: number[] = [];
  for (const s of p.streams) {
    const dps = tower.attack ? dpsAgainst(p.state, tower, s) : { hit: 0, poison: 0 };
    const cover = dps.hit + dps.poison > 0 ? p.view.cover(col, row, range, s.flying, s.route) : 0;
    // Busy while any creep of the stream is in range.
    const inRange = cover / s.speed;
    const busy = cover > 0 ? (s.count - 1) * Math.min(s.gap, inRange) + inRange : 0;
    hit.push(dps.hit * busy);
    poison.push(dps.poison * busy);
  }
  const out = { hit, poison };
  p.memo.set(key, out);
  return out;
}

/** Centre to centre, between two towers' places. */
function placeDistance(a: Placed, b: Placed): number {
  const dx = (a.col - b.col) * CELL;
  const dy = (a.row - b.row) * CELL;
  return Math.sqrt(dx * dx + dy * dy);
}

type TotemTalents = ReturnType<typeof original.runTalents>['families']['totem'];

/** What the towers of a set lend one of them: the best Totem aura in reach, and the best slow on each stream. */
interface Lent {
  aura: number;
  readonly slow: number[];
}

/** Folds what tower `o` lends tower `t` (its own slow included) into `into`. */
function lend(p: Planner, totem: TotemTalents, o: Placed, t: Placed, into: Lent): void {
  const info = ORIGINAL_TOWERS[o.spec]!.original;
  const d = o.id === t.id ? 0 : placeDistance(o, t);
  if (info.family === 'totem' && info.auras && o.id !== t.id) {
    const a = info.auras;
    if (d <= (a.radius ?? 256) * (1 + totem.auraRadius)) {
      into.aura = Math.max(into.aura, (a.attackSpeed ?? 0) + totem.auraAttackSpeed + (a.damage ?? 0) + 0.5 * ((a.range ?? 0) + totem.auraRange) + (a.armor ? 0.15 : 0));
    }
  }
  if (p.slows) {
    const amount = info.slow?.amount ?? info.auras?.slow ?? 0;
    const atk = ORIGINAL_TOWERS[o.spec]!.attack;
    if (amount > 0 && atk && d <= atk.range + 64) {
      // A slowing shot holds one creep for its slow's length; an aura holds every creep in range.
      p.streams.forEach((st, i) => {
        const inRange = Math.max(1, (2 * atk.range) / (st.speed * st.gap));
        const held = info.auras?.slow ? 1 : Math.min(1, (info.slow!.duration / atk.cooldown) / inRange);
        into.slow[i] = Math.max(into.slow[i]!, (amount / (1 - amount)) * 0.5 * held);
      });
    }
  }
}

function lentTo(p: Planner, totem: TotemTalents, towers: readonly Placed[], t: Placed): Lent {
  const into: Lent = { aura: 0, slow: p.streams.map(() => 0) };
  for (const o of towers) lend(p, totem, o, t, into);
  return into;
}

/** A tower that deals damage, with what it can deal and what the set lends it. */
interface Share {
  readonly tower: Placed;
  readonly caps: Capacity;
  readonly lent: Lent;
}

function deals(caps: Capacity): boolean {
  return !(caps.hit.every((c) => c === 0) && caps.poison.every((c) => c === 0));
}

/**
 * The damage the shares add up to on each stream. Poison doesn't stack, so
 * only the strongest counts in full and each further one half as much as the
 * last (towers far apart along the road poison a creep again once it wears off).
 */
function sum(p: Planner, shares: readonly Share[]): number[] {
  const have = p.streams.map(() => 0);
  const poisons: number[][] = p.streams.map(() => []);
  for (const { caps, lent } of shares) {
    p.streams.forEach((s, i) => {
      const lift = (1 + lent.aura) * (1 + (s.boss ? lent.slow[i]! / 2 : lent.slow[i]!));
      have[i]! += caps.hit[i]! * lift;
      if (caps.poison[i]! > 0) poisons[i]!.push(caps.poison[i]! * lift);
    });
  }
  poisons.forEach((list, i) => {
    list.sort((a, b) => b - a);
    let share = 1;
    for (const v of list) {
      have[i]! += v * share;
      share /= 2;
    }
  });
  return have;
}

/** A set of towers with each one's share worked out once, so valuing one more on top is a pass over the set, not a pass per tower. */
export interface Prepared {
  readonly towers: readonly Placed[];
  readonly shares: readonly Share[];
  readonly totem: TotemTalents;
}

export function prepare(p: Planner, towers: readonly Placed[]): Prepared {
  const totem = original.runTalents(p.state).families.totem;
  const shares: Share[] = [];
  for (const t of towers) {
    const caps = capacities(p, t.spec, t.col, t.row);
    if (deals(caps)) shares.push({ tower: t, caps, lent: lentTo(p, totem, towers, t) });
  }
  return { towers, shares, totem };
}

/** The damage a set of towers can deal each stream: their own, raised by Totems' auras and by slows around them. */
export function defense(p: Planner, towers: readonly Placed[]): number[] {
  return sum(p, prepare(p, towers).shares);
}

/** defense() of the prepared set with `extra` added last: the same numbers, worked out from what the set already lends. */
function defenseAdding(p: Planner, set: Prepared, extra: Placed): number[] {
  const shares: Share[] = set.shares.map((s) => {
    const lent: Lent = { aura: s.lent.aura, slow: [...s.lent.slow] };
    lend(p, set.totem, extra, s.tower, lent);
    return { tower: s.tower, caps: s.caps, lent };
  });
  const caps = capacities(p, extra.spec, extra.col, extra.row);
  if (deals(caps)) shares.push({ tower: extra, caps, lent: lentTo(p, set.totem, [...set.towers, extra], extra) });
  return sum(p, shares);
}

/** Lives the streams would cost against `have`, and how well they're covered beyond that. */
function score(p: Planner, have: readonly number[]): number {
  let v = 0;
  p.streams.forEach((s, i) => {
    const ratio = have[i]! / s.need;
    const weight = s.count * s.lives * s.weight;
    if (p.leaks) v -= weight * Math.max(0, 1 - ratio);
    v += weight * SURPLUS * (p.leaks ? Math.min(2, ratio) : ratio);
  });
  return v;
}

/** What changing the towers from `before` to `after` is worth: lives saved, plus a little for spare damage. */
export function gain(p: Planner, before: number, after: readonly Placed[]): number {
  return score(p, defense(p, after)) - before;
}

/** gain() of the prepared set with one more tower: the same number, for the many builds a turn weighs. */
export function gainAdding(p: Planner, before: number, set: Prepared, extra: Placed): number {
  return score(p, defenseAdding(p, set, extra)) - before;
}

export function baseline(p: Planner, towers: readonly Placed[]): number {
  return score(p, defense(p, towers));
}
