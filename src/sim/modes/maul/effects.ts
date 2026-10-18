import { damageCreep } from '../../combat/damage';
import { registerEffect } from '../../combat/registry';
import { applyStatus, statusTicks } from '../../combat/status';
import { canHit, nearestCreeps } from '../../combat/targeting';
import type { Creep } from '../../core/state';
import { modeEvent } from './state';

// Maul's own effect kinds. Everything else a Maul tower does is a core effect
// (splash, slow, poison, stun, crit, multishot) or a core aura. Importing this
// module registers them; it must run before the Maul Game Mode registers.

/** Spores: every creep the attack can hit within `radius` of where it lands is poisoned, and with `armor`, loses armor too. */
export type MaulSpreadEffect = {
  readonly kind: 'maul.spread';
  readonly radius: number;
  readonly dps: number;
  readonly duration: number;
  readonly key: string;
  readonly armor?: number;
  readonly armorKey?: string;
};

/** Venom: poison whose key is the tower's own, so one tower's venom never stacks but every tower's ticks on its own. */
export type MaulVenomEffect = {
  readonly kind: 'maul.venom';
  readonly dps: number;
  readonly duration: number;
};

/** The key a tower's venom goes under on a creep. */
export function venomKey(tower: number): string {
  return `maul:venom:${tower}`;
}

/** Chain lightning: after the hit, it jumps `jumps` times to the nearest creep not yet struck, `falloff` weaker each jump. */
export type MaulChainEffect = {
  readonly kind: 'maul.chain';
  readonly jumps: number;
  readonly falloff: number;
  readonly radius: number;
};

function positive(name: string, v: unknown): string | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? null : `${name} must be a positive number`;
}

function check(...problems: (string | null)[]): string | null {
  return problems.find((p) => p !== null) ?? null;
}

registerEffect<MaulSpreadEffect>({
  kind: 'maul.spread',
  validate: (e) => check(
    positive('spread radius', e.radius), positive('spread dps', e.dps), positive('spread duration', e.duration),
    typeof e.key === 'string' ? null : 'spread needs a key',
    e.armor === undefined || (positive('spread armor', e.armor) === null && typeof e.armorKey === 'string') ? null : 'spread armor needs an amount and a key',
  ),
  onImpact(e, impact, sim) {
    const r2 = e.radius * e.radius;
    const ticks = statusTicks(e.duration);
    const layer = impact.attack.targets;
    for (const c of sim.state.creeps) {
      if (c.hp <= 0 || !canHit(layer, c)) continue;
      const dx = c.x - impact.x;
      const dy = c.y - impact.y;
      if (dx * dx + dy * dy > r2) continue;
      applyStatus(c.status, 'poison', e.key, e.dps, ticks, impact.tower);
      if (e.armor !== undefined && e.armorKey !== undefined) applyStatus(c.status, 'armor', e.armorKey, e.armor, ticks, impact.tower);
    }
  },
});

registerEffect<MaulVenomEffect>({
  kind: 'maul.venom',
  validate: (e) => check(positive('venom dps', e.dps), positive('venom duration', e.duration)),
  onImpact(e, impact) {
    const c = impact.target;
    if (c === null || c.hp <= 0) return;
    applyStatus(c.status, 'poison', venomKey(impact.tower), e.dps, statusTicks(e.duration), impact.tower);
  },
});

registerEffect<MaulChainEffect>({
  kind: 'maul.chain',
  validate: (e) => check(
    Number.isInteger(e.jumps) && e.jumps >= 1 ? null : 'chain jumps must be a whole number of 1 or more',
    typeof e.falloff === 'number' && e.falloff >= 0 && e.falloff < 1 ? null : 'chain falloff must be at least 0 and under 1',
    positive('chain radius', e.radius),
  ),
  onImpact(e, impact, sim) {
    const first = impact.target;
    if (first === null) return;
    const struck: Creep[] = [first];
    const points: [number, number][] = [[impact.x, impact.y]];
    let x = impact.x;
    let y = impact.y;
    let damage = impact.damage;
    for (let j = 0; j < e.jumps; j++) {
      const next = nearestCreeps(sim.state.creeps, x, y, e.radius * e.radius, impact.attack.targets, 1, struck)[0];
      if (!next) break;
      damage *= 1 - e.falloff;
      struck.push(next);
      x = next.x;
      y = next.y;
      points.push([x, y]);
      damageCreep(sim, next, damage, impact.attack.attackType, impact.tower, 'splash');
    }
    if (points.length > 1) modeEvent(sim.events, 'maul.chain', { tower: impact.tower, points });
  },
});
