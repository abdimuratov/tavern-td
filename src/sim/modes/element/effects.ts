import {
  PERIODIC_CYCLE, SHOT,
  type AcidShot, type AcidValues, type BasicHit, type DamageElement, type DarkHit, type DiseaseHit, type EarthHit,
  type ElectricityHit, type EnchantmentHit, type EphemeralHit, type ErosionHit, type FireHit, type FlameHit,
  type FlamethrowerHit, type FloodingHit, type GoldHit, type GunpowderHit, type HailHit, type HasteHit, type HydroHit,
  type IceHit, type ImpulseHit, type JinxHit, type LaserHit, type LifeHit, type LightHit, type MagicHit, type MossHit,
  type MuckHit, type NatureHit, type NovaHit, type ObliterationHit, type PeriodicHit, type PoisonHit, type PolarHit,
  type QuakeHit, type QuarkHit, type RootsHit, type RunicHit, type ShotHit, type TidalHit, type WaterHit,
} from '../../../content/element';
import { towerMods } from '../../combat/mods';
import { registerEffect, type Attack, type EffectHandler, type Impact } from '../../combat/registry';
import { applyStatus } from '../../combat/status';
import { findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import { nextFloat, nextInt } from '../../core/rng';
import type { EffectSpec } from '../../core/specs';
import type { Creep, Projectile, Tower } from '../../core/state';
import {
  ACID, MAGIC_RANGE, STATUS, STUN, abilityDamage, applySlow, blast, creepsInArea, deal, distance2, setStatus, splash, targetable,
} from './combat';
import { creepState, elState, modeEvent, towerState, towerStateById } from './state';

// Element's tower families as effect kinds (docs/research/element-td-rules.md §3).
// Every Element attack is `direct: false`: the core flies the projectile and
// these handlers land the hit through Element's damage model. Hit damage is
// read at launch (assumed: the port reads most of it at impact). A tracking
// shot whose target died in flight does nothing (assumed, as a Dota attack projectile).
// Importing this module registers them; it must run before the mode registers.

const POW_115: readonly number[] = (() => {
  const out = [1];
  for (let i = 1; i <= 11; i++) out.push(out[i - 1]! * 1.15);
  return out;
})();

function live(impact: Impact): Creep | null {
  return impact.target !== null && impact.target.hp > 0 ? impact.target : null;
}

function elemOf(impact: Impact): DamageElement {
  return impact.attack.attackType as DamageElement;
}

function towerOf(sim: Sim, id: number): Tower | undefined {
  return id === 0 ? undefined : findTower(sim.state, id);
}

/** The tower's attack damage now, base-damage bonuses included: what a shot it fires itself carries. */
export function shotDamage(tower: Tower, base: number): number {
  return base * (1 + towerMods(tower).damage);
}

export interface Launch {
  readonly tower: number;
  /** Spec whose attack effects resolve the landing: a tower's or a shot's. */
  readonly spec: string;
  readonly from: { readonly x: number; readonly y: number };
  /** Creep to home on, or null for a shell aimed at (tx, ty). */
  readonly target: Creep | null;
  readonly tx: number;
  readonly ty: number;
  /** World units per second. */
  readonly speed: number;
  readonly damage: number;
  readonly crit?: number;
}

/** Fires a projectile the core flies and lands like an attack's. */
export function launch(sim: Sim, l: Launch): Projectile {
  const { state, events } = sim;
  const p: Projectile = {
    id: state.nextId++, tower: l.tower, spec: l.spec, target: l.target?.id ?? 0,
    x: l.from.x, y: l.from.y, tx: l.tx, ty: l.ty, speed: l.speed / TICK_RATE, damage: l.damage, crit: l.crit ?? 1,
  };
  state.projectiles.push(p);
  events.push({ type: 'fire', tower: l.tower, target: p.target, projectile: p.id });
  return p;
}

function pick<T>(sim: Sim, list: readonly T[]): T | undefined {
  return list.length === 0 ? undefined : list[nextInt(sim.state.rng, 0, list.length - 1)];
}

/** Turns this attack into artillery shells aimed where each target stands now (ground_attacks.lua). */
function shellInstead(attack: Attack, sim: Sim, damage: number): void {
  const { tower, attack: atk } = attack;
  for (const target of attack.targets) {
    launch(sim, { tower: tower.id, spec: tower.spec, from: tower, target: null, tx: target.x, ty: target.y, speed: atk.projectileSpeed, damage });
  }
  attack.targets.length = 0;
}

function register<E extends EffectSpec>(handler: EffectHandler<E>): void {
  registerEffect(handler);
}

// --- Basic families -------------------------------------------------------------

register<BasicHit>({
  kind: 'element.basic',
  validate: (e) => (['single', 'splash', 'ground'].includes(e.mode) ? null : 'basic hit mode must be single, splash or ground'),
  onAttack(e, attack, sim) {
    if (e.mode === 'ground') shellInstead(attack, sim, shotDamage(attack.tower, attack.attack.damage[0]));
  },
  onImpact(e, impact, sim) {
    if (e.mode === 'ground') {
      splash(sim, impact.x, impact.y, e.full ?? 0, e.half ?? 0, impact.damage, impact.tower, elemOf(impact));
      return;
    }
    const c = live(impact);
    if (!c) return;
    if (e.mode === 'splash') splash(sim, c.x, c.y, e.full ?? 0, e.half ?? 0, impact.damage, impact.tower, elemOf(impact));
    else deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<DarkHit>({
  kind: 'element.dark',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const r = deal(sim, c, impact.damage, impact.tower, elemOf(impact));
    if (!r.killed || r.overkill <= 0) return;
    // The excess flies on to a random creep near the dead one, as pure damage that never chains.
    // assumed: each bolt carries its own damage (the port keeps one pending value per receiving creep).
    const to = pick(sim, creepsInArea(sim.state, c.x, c.y, e.radius, c));
    if (to) launch(sim, { tower: impact.tower, spec: SHOT.overkill, from: c, target: to, tx: to.x, ty: to.y, speed: e.speed, damage: r.overkill });
  },
});

register<EarthHit>({
  kind: 'element.earth',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    splash(sim, x, y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
    elState(sim.state).timers.push({
      kind: 'aftershock', at: sim.state.tick + Math.round(e.delay * TICK_RATE), tower: impact.tower, x, y,
      damage: impact.damage * e.pct, full: e.full, half: e.half, elem: elemOf(impact),
    });
  },
});

register<FireHit>({
  kind: 'element.fire',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const ts = towerStateById(sim.state, impact.tower);
    const n = ts && ts.last === c.id ? ts.stacks : 0;
    if (ts) {
      ts.last = c.id;
      ts.stacks = n + 1;
    }
    splash(sim, c.x, c.y, e.full + (e.grow / 2) * n, e.half + e.grow * n, impact.damage, impact.tower, elemOf(impact));
  },
});

register<LightHit>({
  kind: 'element.light',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const ts = towerStateById(sim.state, impact.tower);
    const n = ts && ts.last === c.id ? ts.stacks : 0;
    if (ts) {
      ts.last = c.id;
      ts.stacks = n + 1;
    }
    const base = impact.attack.damage[0];
    const damage = base > 0 ? (impact.damage * (base + n * e.bonus)) / base : impact.damage;
    deal(sim, c, damage, impact.tower, elemOf(impact));
  },
});

register<NatureHit>({
  kind: 'element.nature',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const k = creepsInArea(sim.state, c.x, c.y, e.radius, c).length;
    deal(sim, c, Math.floor(impact.damage * (1 + e.per * k)), impact.tower, elemOf(impact));
  },
});

register<WaterHit>({
  kind: 'element.water',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    splash(sim, x, y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
    const to = pick(sim, creepsInArea(sim.state, x, y, e.range, c));
    if (to) launch(sim, { tower: impact.tower, spec: SHOT.bounce, from: { x, y }, target: to, tx: to.x, ty: to.y, speed: e.speed, damage: impact.damage * e.pct });
  },
});

register<PeriodicHit>({
  kind: 'element.periodic',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    const target = attack.targets[0];
    attack.targets.length = 0;
    if (!target) return;
    const ts = towerState(sim.state, tower);
    const start = ts.count;
    ts.count = (start + 1) % PERIODIC_CYCLE.length;
    const damage = abilityDamage(sim.state, tower.id, e.damage);
    const shots: Creep[] = [target];
    // PeriodicTower.lua: a first pass over the creeps in range skips the target, later passes include it;
    // stop at `count` shots, or when a pass ends on count − 1. Only living creeps are listed, so a later
    // pass always fires (the port loops forever when every creep in range is dead).
    const inRange = creepsInArea(sim.state, tower.x, tower.y, e.range);
    for (let pass = 0; inRange.length > 0 && shots.length < e.count; pass++) {
      let fired = 0;
      for (const c of inRange) {
        if (shots.length >= e.count) break;
        if (pass === 0 && c === target) continue;
        shots.push(c);
        fired++;
      }
      if ((fired === 0 && pass > 0) || shots.length === e.count - 1) break;
    }
    shots.forEach((c, k) => {
      const elem = PERIODIC_CYCLE[(start + k) % PERIODIC_CYCLE.length]!;
      launch(sim, { tower: tower.id, spec: SHOT.periodic(elem), from: tower, target: c, tx: c.x, ty: c.y, speed: e.speed, damage });
    });
  },
});

// --- Duals -----------------------------------------------------------------------

register<DiseaseHit>({
  kind: 'element.disease',
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const r = c.maxHp / c.hp;
    deal(sim, c, impact.damage * r * (1 + r / 10), impact.tower, elemOf(impact));
  },
});

register<ElectricityHit>({
  kind: 'element.electricity',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    const target = attack.targets[0];
    attack.targets.length = 0;
    if (!target) return;
    sim.events.push({ type: 'fire', tower: tower.id, target: target.id, projectile: 0 });
    const elem = attack.attack.attackType as DamageElement;
    const { x, y } = target;
    deal(sim, target, abilityDamage(sim.state, tower.id, e.damage), tower.id, elem);
    if (e.jumps > 0) {
      elState(sim.state).timers.push({
        kind: 'chain', at: sim.state.tick + Math.round(e.every * TICK_RATE), tower: tower.id, last: target.id, x, y,
        jump: 1, jumps: e.jumps, radius: e.radius, shrink: e.shrink, damage: e.damage, grow: e.grow, elem,
      });
    }
  },
});

register<FlameHit>({
  kind: 'element.flame',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const elem = elemOf(impact);
    blast(sim, c.x, c.y, e.radius, abilityDamage(sim.state, impact.tower, e.burn), impact.tower, elem);
    deal(sim, c, impact.damage, impact.tower, elem);
    if (!targetable(c)) return;
    elState(sim.state).timers.push({
      kind: 'sunburn', at: sim.state.tick + TICK_RATE, tower: impact.tower, creep: c.id, damage: e.burn, radius: e.radius,
      end: sim.state.tick + Math.round(e.duration * TICK_RATE), elem,
    });
  },
});

register<GunpowderHit>({
  kind: 'element.gunpowder',
  onAttack(e, attack, sim) {
    shellInstead(attack, sim, abilityDamage(sim.state, attack.tower.id, e.damage));
  },
  onImpact(e, impact, sim) {
    const { x, y } = impact;
    const o = e.offset;
    // The impact point, then four blasts around it (GunpowderTower.lua's 90° turns as fixed offsets).
    for (const [dx, dy] of [[0, 0], [0, o], [-o, 0], [0, -o], [o, 0]] as const) {
      blast(sim, x + dx, y + dy, e.radius, impact.damage, impact.tower, elemOf(impact));
    }
  },
});

register<HydroHit>({
  kind: 'element.hydro',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const r = deal(sim, c, impact.damage, impact.tower, elemOf(impact));
    // Not boosted by Fire Up; explosion kills never chain.
    if (r.killed) blast(sim, c.x, c.y, e.radius, e.damage, impact.tower, elemOf(impact), c);
  },
});

register<IceHit>({
  kind: 'element.ice',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    splash(sim, c.x, c.y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
    if (!targetable(c)) return;
    const cs = creepState(sim.state, c);
    if (sim.state.tick < cs.iceUntil) return;
    cs.iceUntil = sim.state.tick + Math.round(e.lockout * TICK_RATE);
    applyStatus(c.status, STATUS.stun, STUN, 1, Math.max(1, Math.round(e.stun * TICK_RATE)), impact.tower);
  },
});

register<LifeHit>({
  kind: 'element.life',
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (c) deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<MagicHit>({
  kind: 'element.magic',
  onAttack(e, attack, sim) {
    const ts = towerState(sim.state, attack.tower);
    ts.stacks = Math.min(e.max, ts.stacks + 1);
    ts.lastAt = sim.state.tick;
    // assumed: −25 range per stack, as the tooltip says (the engine may apply it once).
    setStatus(attack.tower.status, 'range', MAGIC_RANGE, e.perStack * ts.stacks, Math.round(e.reset * TICK_RATE), attack.tower.id);
  },
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (c) splash(sim, c.x, c.y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
  },
});

register<MossHit>({
  kind: 'element.moss',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    // Each creep's share is fixed by its HP before any of the hit lands.
    const near = creepsInArea(sim.state, x, y, e.half);
    const share = near.map((n) => impact.damage * (1 + n.hp / n.maxHp));
    near.forEach((n, i) => deal(sim, n, share[i]! / 2, impact.tower, elemOf(impact), 'splash'));
    const f2 = e.full * e.full;
    near.forEach((n, i) => {
      if (targetable(n) && distance2(n.x, n.y, x, y) <= f2) deal(sim, n, share[i]! / 2, impact.tower, elemOf(impact), 'splash');
    });
  },
});

register<PoisonHit>({
  kind: 'element.poison',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    const elem = elemOf(impact);
    splash(sim, x, y, e.full, e.half, impact.damage, impact.tower, elem);
    const per = abilityDamage(sim.state, impact.tower, e.perTick);
    const every = Math.round(e.every * TICK_RATE);
    const timers = elState(sim.state).timers;
    for (const n of creepsInArea(sim.state, x, y, e.full)) {
      timers.push({ kind: 'dot', at: sim.state.tick + every, tower: impact.tower, creep: n.id, damage: per, every, left: Math.round(e.duration / e.every), elem });
    }
  },
});

register<QuarkHit>({
  kind: 'element.quark',
  onAttack(e, attack, sim) {
    const target = attack.targets[0];
    if (!target) return;
    const ts = towerState(sim.state, attack.tower);
    ts.stacks = ts.last === target.id ? Math.min(e.max, ts.stacks + 1) : Math.floor(ts.stacks / 2);
    ts.last = target.id;
  },
  onLaunch(_e, shot, sim) {
    shot.damage *= POW_115[towerState(sim.state, shot.tower).stacks] ?? 1;
  },
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (c) splash(sim, c.x, c.y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
  },
});

// --- Triples ---------------------------------------------------------------------

register<EnchantmentHit>({
  kind: 'element.enchantment',
  onImpact(e, impact, sim) {
    const c = live(impact);
    // EnchantmentTower.lua deals the full-radius half first.
    if (c) splash(sim, c.x, c.y, e.full, e.half, impact.damage, impact.tower, elemOf(impact), true);
  },
});

register<EphemeralHit>({
  kind: 'element.ephemeral',
  // EphemeralTower.lua OnAttack: below the cap a launch refreshes the stack buff; the 1 s timer adds the stacks.
  onAttack(e, attack, sim) {
    const { state } = sim;
    const ts = towerState(state, attack.tower);
    const reset = Math.round(e.reset * TICK_RATE);
    const buff = ts.activeUntil >= 0;
    if (buff && ts.stacks >= e.maxStacks) return;
    if (buff && ts.lastAt >= 0 && state.tick - ts.lastAt <= reset) ts.activeUntil = state.tick + reset;
    ts.lastAt = state.tick;
    if (ts.timer < 0) ts.timer = state.tick + TICK_RATE;
  },
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (c) deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<ErosionHit>({
  kind: 'element.erosion',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    const target = attack.targets[0];
    if (!target) return;
    const level = acidLevel(e);
    for (const c of creepsInArea(sim.state, target.x, target.y, e.radius, target)) {
      launch(sim, { tower: tower.id, spec: SHOT.acid(level), from: tower, target: c, tx: c.x, ty: c.y, speed: e.speed, damage: 0 });
    }
  },
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (c) applyAcid(sim, c, impact.tower, e);
  },
});

function acidLevel(e: AcidValues): number {
  return e.amp >= 120 ? 3 : e.amp >= 36 ? 2 : 1;
}

/** Acid (ErosionTower.lua): +amp% damage taken for the duration (one, refreshed), plus a new stacking DoT that also ticks at once. */
function applyAcid(sim: Sim, c: Creep, towerId: number, e: AcidValues): void {
  setStatus(c.status, STATUS.acid, ACID, e.amp, Math.round(e.duration * TICK_RATE), towerId);
  const damage = abilityDamage(sim.state, towerId, e.dot);
  const every = Math.round(e.every * TICK_RATE);
  deal(sim, c, damage, towerId, 'fire', 'dot');
  if (!targetable(c)) return;
  elState(sim.state).timers.push({
    kind: 'dot', at: sim.state.tick + every, tower: towerId, creep: c.id, damage, every, left: Math.floor(e.duration / e.every), elem: 'fire',
  });
}

register<AcidShot>({
  kind: 'element.acid',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (c) applyAcid(sim, c, impact.tower, e);
  },
});

register<FlamethrowerHit>({
  kind: 'element.flamethrower',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    const elem = elemOf(impact);
    const until = sim.state.tick + Math.round(e.duration * TICK_RATE);
    for (const n of creepsInArea(sim.state, x, y, e.half)) {
      deal(sim, n, impact.damage / 2, impact.tower, elem, 'splash');
      if (!targetable(n)) continue;
      const cs = creepState(sim.state, n);
      cs.napalm += e.napalm;
      cs.napalmUntil = until;
      cs.napalmBy = impact.tower;
    }
    for (const n of creepsInArea(sim.state, x, y, e.full)) deal(sim, n, impact.damage / 2, impact.tower, elem, 'splash');
  },
});

register<FloodingHit>({
  kind: 'element.flooding',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    const damage = abilityDamage(sim.state, impact.tower, e.damage);
    modeEvent(sim.events, 'element.flood', { tower: impact.tower, x, y, radius: e.radius });
    blast(sim, x, y, e.radius, damage, impact.tower, elemOf(impact));
    if (e.hits > 1) {
      elState(sim.state).timers.push({
        kind: 'flood', at: sim.state.tick + TICK_RATE, tower: impact.tower, x, y, damage, radius: e.radius, left: e.hits - 1, elem: elemOf(impact),
      });
    }
  },
});

register<GoldHit>({
  kind: 'element.gold',
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (c) deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<HailHit>({
  kind: 'element.hail',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    const target = attack.targets[0];
    const ts = towerState(sim.state, tower);
    ts.count++;
    if (ts.count < e.every) return;
    ts.count = 0;
    const base = shotDamage(tower, attack.attack.damage[0]);
    for (const c of creepsInArea(sim.state, tower.x, tower.y, e.radius, target)) {
      const crit = nextFloat(sim.state.rng) < e.chance ? e.multiplier : 1;
      launch(sim, { tower: tower.id, spec: SHOT.hail, from: tower, target: c, tx: c.x, ty: c.y, speed: attack.attack.projectileSpeed, damage: base * crit, crit });
    }
  },
  // assumed: the crit is rolled at launch (the port rolls as the hit lands).
  onLaunch(e, shot, sim) {
    if (nextFloat(sim.state.rng) >= e.chance) return;
    shot.damage *= e.multiplier;
    shot.crit *= e.multiplier;
  },
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (c) deal(sim, c, impact.damage, impact.tower, elemOf(impact), impact.crit > 1 ? 'crit' : 'attack');
  },
});

register<HasteHit>({
  kind: 'element.haste',
  onAttack(e, attack, sim) {
    const ts = towerState(sim.state, attack.tower);
    if (ts.lastAt >= 0 && sim.state.tick - ts.lastAt >= Math.round(e.reset * TICK_RATE)) ts.stacks = 0;
    ts.stacks = Math.min(e.max, ts.stacks + 1);
    ts.lastAt = sim.state.tick;
  },
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (c) deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<ImpulseHit>({
  kind: 'element.impulse',
  onImpact(e, impact, sim) {
    const c = live(impact);
    const tower = towerOf(sim, impact.tower);
    if (!c || !tower) return;
    const dist = Math.sqrt(distance2(tower.x, tower.y, c.x, c.y));
    deal(sim, c, abilityDamage(sim.state, tower.id, (dist / 1000) * e.multiplier), tower.id, elemOf(impact));
  },
});

register<JinxHit>({
  kind: 'element.jinx',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const every = Math.round(e.every * TICK_RATE);
    for (const n of creepsInArea(sim.state, c.x, c.y, e.radius)) {
      const cs = creepState(sim.state, n);
      if (cs.jinx === null) cs.jinx = { hp: n.hp, by: impact.tower, pct: e.pct, next: sim.state.tick + every, left: e.ticks };
    }
    deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<LaserHit>({
  kind: 'element.laser',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const k = creepsInArea(sim.state, c.x, c.y, e.radius, c).length;
    deal(sim, c, impact.damage * (1 - Math.min(e.per * k, e.cap)), impact.tower, elemOf(impact));
  },
});

register<MuckHit>({
  kind: 'element.muck',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const { x, y } = c;
    splash(sim, x, y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
    for (const n of creepsInArea(sim.state, x, y, e.radius)) applySlow(n, 'sludge', e.slow, e.duration, impact.tower);
  },
});

register<NovaHit>({
  kind: 'element.nova',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    attack.targets.length = 0;
    modeEvent(sim.events, 'element.nova', { tower: tower.id, x: tower.x, y: tower.y, radius: e.radius });
    blast(sim, tower.x, tower.y, e.radius, abilityDamage(sim.state, tower.id, e.damage), tower.id, attack.attack.attackType as DamageElement);
    for (const c of creepsInArea(sim.state, tower.x, tower.y, e.slowRadius)) applySlow(c, 'explode', e.slow, e.duration, tower.id);
  },
});

register<ObliterationHit>({
  kind: 'element.obliteration',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const tower = towerOf(sim, impact.tower);
    const dist = tower ? Math.sqrt(distance2(tower.x, tower.y, c.x, c.y)) : 0;
    const radius = e.base + e.per * dist;
    modeEvent(sim.events, 'element.obliterate', { tower: impact.tower, x: c.x, y: c.y, radius });
    blast(sim, c.x, c.y, radius, impact.damage, impact.tower, elemOf(impact));
  },
});

register<PolarHit>({
  kind: 'element.polar',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (c) splash(sim, c.x, c.y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
  },
});

register<QuakeHit>({
  kind: 'element.quake',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    const ts = towerState(sim.state, tower);
    ts.count++;
    if (ts.count % e.every !== 0) return;
    const damage = abilityDamage(sim.state, tower.id, e.damage);
    const elem = attack.attack.attackType as DamageElement;
    modeEvent(sim.events, 'element.quake', { tower: tower.id, x: tower.x, y: tower.y, radius: e.radius });
    for (const c of creepsInArea(sim.state, tower.x, tower.y, e.radius)) {
      deal(sim, c, damage + (e.pct / 100) * c.hp, tower.id, elem, 'splash');
    }
  },
  onImpact(_e, impact, sim) {
    const c = live(impact);
    if (c) deal(sim, c, impact.damage, impact.tower, elemOf(impact));
  },
});

register<RootsHit>({
  kind: 'element.roots',
  onAttack(e, attack, sim) {
    const { tower } = attack;
    const target = attack.targets[0];
    attack.targets.length = 0;
    if (!target) return;
    let dx = target.x - tower.x;
    let dy = target.y - tower.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    } else {
      dx = 1;
      dy = 0;
    }
    const elem = attack.attack.attackType as DamageElement;
    const hit = new Set<Creep>();
    for (let i = 1; i <= e.count; i++) {
      const d = e.first + e.step * i;
      for (const c of creepsInArea(sim.state, tower.x + dx * d, tower.y + dy * d, e.radius)) hit.add(c);
    }
    modeEvent(sim.events, 'element.roots', { tower: tower.id, x: tower.x, y: tower.y, dx, dy, length: e.first + e.step * e.count });
    const damage = abilityDamage(sim.state, tower.id, e.dps);
    const timers = elState(sim.state).timers;
    for (const c of [...hit].sort((a, b) => a.id - b.id)) {
      applySlow(c, 'gaia', e.slow, e.duration, tower.id);
      deal(sim, c, damage, tower.id, elem, 'splash');
      if (targetable(c)) {
        timers.push({ kind: 'dot', at: sim.state.tick + TICK_RATE, tower: tower.id, creep: c.id, damage, every: TICK_RATE, left: e.duration, elem });
      }
    }
  },
});

register<RunicHit>({
  kind: 'element.runic',
  onAttack(_e, attack, sim) {
    const { tower } = attack;
    const target = attack.targets[0];
    const ts = towerState(sim.state, tower);
    if (!target || ts.activeUntil < sim.state.tick) return;
    const damage = shotDamage(tower, attack.attack.damage[0]) * 0.5;
    for (const c of creepsInArea(sim.state, target.x, target.y, 150, target)) {
      launch(sim, { tower: tower.id, spec: SHOT.runic, from: tower, target: c, tx: c.x, ty: c.y, speed: attack.attack.projectileSpeed, damage });
    }
  },
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (c) splash(sim, c.x, c.y, e.full, e.half, impact.damage, impact.tower, elemOf(impact));
  },
});

register<TidalHit>({
  kind: 'element.tidal',
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const ts = towerStateById(sim.state, impact.tower);
    const s = ts ? ts.stacks : 0;
    // assumed: +bonus per stack, as the tooltip says (the engine may apply it once).
    splash(sim, c.x, c.y, e.full - e.shrinkFull * s, e.half - e.shrinkHalf * s, impact.damage + e.bonus * s, impact.tower, elemOf(impact));
    if (ts) {
      ts.stacks = Math.min(e.max, s + 1);
      ts.lastAt = sim.state.tick;
    }
  },
});

// --- Secondary shots -------------------------------------------------------------

register<ShotHit>({
  kind: 'element.shot',
  validate: (e) => (['single', 'pure', 'splash', 'area'].includes(e.mode) ? null : 'shot mode must be single, pure, splash or area'),
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c) return;
    const elem = elemOf(impact);
    switch (e.mode) {
      case 'single': deal(sim, c, impact.damage, impact.tower, elem, impact.crit > 1 ? 'crit' : 'attack'); break;
      case 'pure': deal(sim, c, impact.damage, impact.tower, elem, 'attack', true); break;
      case 'splash': splash(sim, c.x, c.y, e.full ?? 0, e.half ?? 0, impact.damage, impact.tower, elem); break;
      case 'area': blast(sim, c.x, c.y, e.radius ?? 0, impact.damage, impact.tower, elem); break;
    }
  },
});
