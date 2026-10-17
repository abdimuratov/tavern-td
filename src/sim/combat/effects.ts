import { TICK_RATE } from '../core/constants';
import type { Sim } from '../core/mode';
import { nextFloat } from '../core/rng';
import type {
  ArmorEffect, CritEffect, MultishotEffect, PoisonEffect, SlowEffect, SplashEffect, StunEffect,
} from '../core/specs';
import type { Creep } from '../core/state';
import { damageCreep } from './damage';
import { registerEffect, type Impact } from './registry';
import { applyStatus, statusTicks } from './status';
import { canHit, nearestCreeps } from './targeting';

// The built-in effect kinds. Each is a self-contained handler; a Game Mode adds
// its own the same way. Importing this module registers them.

/** Rolls a chance with the Run's RNG. No draw for certain or impossible outcomes. */
export function rollChance(sim: Sim, chance: number | undefined): boolean {
  if (chance === undefined || chance >= 1) return true;
  if (chance <= 0) return false;
  return nextFloat(sim.state.rng) < chance;
}

function liveTarget(impact: Impact): Creep | null {
  return impact.target !== null && impact.target.hp > 0 ? impact.target : null;
}

function check(...problems: (string | null)[]): string | null {
  return problems.find((p) => p !== null) ?? null;
}

function positive(name: string, v: unknown): string | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? null : `${name} must be a positive number`;
}

function fraction(name: string, v: unknown, optional = false): string | null {
  if (optional && v === undefined) return null;
  return typeof v === 'number' && v >= 0 && v <= 1 ? null : `${name} must be between 0 and 1`;
}

registerEffect<SplashEffect>({
  kind: 'splash',
  validate(e) {
    const bands = e.bands as unknown;
    if (!Array.isArray(bands) || bands.length < 1 || bands.length > 3) return 'splash needs 1 to 3 bands';
    if (e.targets !== undefined && e.targets !== 'ground' && e.targets !== 'air' && e.targets !== 'both') return 'splash targets must be ground, air or both';
    let last = 0;
    for (const band of bands as readonly (readonly [number, number])[]) {
      const [radius, factor] = band;
      if (!(radius > last)) return 'splash band radii must be positive and increasing';
      if (!(factor >= 0)) return 'splash band factors must be 0 or more';
      last = radius;
    }
    return null;
  },
  onImpact(e, impact, sim) {
    const creeps = sim.state.creeps;
    const bands = e.bands;
    const outer = bands[bands.length - 1]![0];
    const outer2 = outer * outer;
    const layer = e.targets ?? impact.attack.targets;
    const n = creeps.length;
    for (let i = 0; i < n; i++) {
      const c = creeps[i]!;
      if (c === impact.target || c.hp <= 0 || !canHit(layer, c)) continue;
      const dx = c.x - impact.x;
      const dy = c.y - impact.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > outer2) continue;
      let factor = 0;
      for (const [radius, f] of bands) {
        if (d2 <= radius * radius) {
          factor = f;
          break;
        }
      }
      damageCreep(sim, c, impact.damage * factor, impact.attack.attackType, impact.tower, 'splash');
    }
  },
});

registerEffect<SlowEffect>({
  kind: 'slow',
  validate: (e) => check(fraction('slow amount', e.amount), positive('slow duration', e.duration), fraction('slow chance', e.chance, true)),
  onImpact(e, impact, sim) {
    const c = liveTarget(impact);
    if (c && rollChance(sim, e.chance)) applyStatus(c.status, 'slow', e.key ?? 'slow', e.amount, statusTicks(e.duration), impact.tower);
  },
  creepMods(s, mods) {
    mods.slow += s.value;
  },
});

registerEffect<PoisonEffect>({
  kind: 'poison',
  validate: (e) => check(positive('poison dps', e.dps), positive('poison duration', e.duration), fraction('poison chance', e.chance, true)),
  onImpact(e, impact, sim) {
    const c = liveTarget(impact);
    if (c && rollChance(sim, e.chance)) applyStatus(c.status, 'poison', e.key ?? 'poison', e.dps, statusTicks(e.duration), impact.tower);
  },
  tickCreep(s, creep, sim) {
    damageCreep(sim, creep, s.value / TICK_RATE, null, s.src, 'dot');
  },
});

registerEffect<ArmorEffect>({
  kind: 'armor',
  validate: (e) => check(positive('armor amount', e.amount), positive('armor duration', e.duration), fraction('armor chance', e.chance, true)),
  onImpact(e, impact, sim) {
    const c = liveTarget(impact);
    if (c && rollChance(sim, e.chance)) applyStatus(c.status, 'armor', e.key ?? 'armor', e.amount, statusTicks(e.duration), impact.tower);
  },
  creepMods(s, mods) {
    mods.armor -= s.value;
  },
});

registerEffect<StunEffect>({
  kind: 'stun',
  validate: (e) => check(fraction('stun chance', e.chance), positive('stun duration', e.duration)),
  onImpact(e, impact, sim) {
    const c = liveTarget(impact);
    if (c && rollChance(sim, e.chance)) applyStatus(c.status, 'stun', e.key ?? 'stun', 1, statusTicks(e.duration), impact.tower);
  },
  creepMods(_s, mods) {
    mods.stunned = true;
  },
});

registerEffect<CritEffect>({
  kind: 'crit',
  validate: (e) => check(fraction('crit chance', e.chance), positive('crit multiplier', e.multiplier)),
  onLaunch(e, shot, sim) {
    if (!rollChance(sim, e.chance)) return;
    shot.damage *= e.multiplier;
    shot.crit *= e.multiplier;
  },
});

registerEffect<MultishotEffect>({
  kind: 'multishot',
  validate: (e) => (Number.isInteger(e.count) && e.count >= 1 ? null : 'multishot count must be a whole number of 1 or more'),
  onAttack(e, attack, sim) {
    const { tower, targets } = attack;
    const more = nearestCreeps(sim.state.creeps, tower.x, tower.y, attack.range * attack.range, attack.attack.targets, e.count - targets.length, targets);
    for (const c of more) targets.push(c);
  },
});

// Statuses only auras give out: tower buffs.

registerEffect({
  kind: 'attackSpeed',
  towerMods(s, mods) {
    mods.attackSpeed += s.value;
  },
});

registerEffect({
  kind: 'damage',
  towerMods(s, mods) {
    mods.damage += s.value;
  },
});

registerEffect({
  kind: 'range',
  towerMods(s, mods) {
    mods.range += s.value;
  },
});
