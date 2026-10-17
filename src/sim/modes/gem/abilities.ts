import { damageCreep } from '../../combat/damage';
import { effectHandler, type Impact } from '../../combat/registry';
import { applyStatus } from '../../combat/status';
import { nearestCreeps } from '../../combat/targeting';
import { AURA_TICKS, TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import { creepsNear, spellDamage } from './combat';
import { burnBonus, byStep, gemState, killAward, specOf, towerState } from './state';

// What Gem towers do every tick beyond the core's attacks and static auras:
// mana regeneration, kill awards, Kill-Step auras, Barrage, burns and Wraith
// explosions. Runs from the Game Mode's onTick, before creeps and towers move.

/** Mana regenerates all the time, even while towers are frozen between Waves. */
export function regenMana(sim: Sim): void {
  for (const t of sim.state.towers) {
    const mana = specOf(t.spec)?.gem.mana;
    if (!mana) continue;
    const ts = towerState(sim.state, t);
    if (ts.mana < mana.max) ts.mana = Math.min(mana.max, ts.mana + mana.regen / TICK_RATE);
  }
}

/** The per-tower kill award and Viper Slate's Kill-Step aura, refreshed like auras. */
export function runKillBuffs(sim: Sim): void {
  const towers = sim.state.towers;
  for (const t of towers) {
    const spec = specOf(t.spec);
    if (!spec) continue;
    if (spec.attack && t.kills >= 10) applyStatus(t.status, 'damage', 'gem:kill-award', killAward(t.kills), AURA_TICKS, t.id);
    const aura = spec.gem.killAura;
    if (!aura) continue;
    const value = byStep(aura.byKillStep, t.kills);
    const r2 = aura.radius * aura.radius;
    for (const u of towers) {
      if (!specOf(u.spec)?.attack) continue;
      const dx = u.x - t.x;
      const dy = u.y - t.y;
      if (dx * dx + dy * dy <= r2) applyStatus(u.status, aura.kind, aura.key, value, AURA_TICKS, t.id);
    }
  }
}

/**
 * Barrage (assumed WC3 Aroc semantics): on its own cooldown, independent of
 * the attack, it hits up to N of the nearest enemies in its radius (every
 * enemy for 0) instantly, with the tower's attack type against armor and no
 * damage bonuses. An idle Barrage stays ready.
 */
export function runBarrages(sim: Sim): void {
  const { state, events } = sim;
  for (const t of state.towers) {
    const spec = specOf(t.spec);
    const b = spec?.gem.barrage;
    if (!spec || !b) continue;
    const ts = towerState(state, t);
    if (ts.barrage > 0) {
      ts.barrage -= 1;
      if (ts.barrage > 0) continue;
    }
    const layer = spec.attack?.targets ?? 'both';
    const targets = b.targets === 0
      ? creepsNear(sim, t.x, t.y, b.radius, layer)
      : nearestCreeps(state.creeps, t.x, t.y, b.radius * b.radius, layer, b.targets, []);
    if (targets.length === 0) {
      ts.barrage = 0;
      continue;
    }
    ts.barrage += b.cooldown * TICK_RATE;
    const attackType = spec.attack?.attackType ?? 'normal';
    const attack = spec.attack ?? { damage: [0, 0], cooldown: b.cooldown, range: b.radius, attackType, targets: layer, projectileSpeed: 0 };
    const onHit = b.onHit ?? [];
    for (const c of targets) {
      events.push({ type: 'fire', tower: t.id, target: c.id, projectile: 0 });
      if (b.damage > 0) damageCreep(sim, c, b.damage, attackType, t.id, 'attack');
      if (onHit.length === 0) continue;
      const impact: Impact = { tower: t.id, attack: { ...attack, effects: onHit }, target: c, x: c.x, y: c.y, damage: b.damage, crit: 1 };
      for (const e of onHit) effectHandler(e.kind)?.onImpact?.(e, impact, sim);
    }
  }
}

/**
 * Immolation: spell damage to every enemy in the radius, scaled by the tower's
 * kills; several burns stack. assumed: it lands every tick at its per-second
 * rate, where Gem TD+ ticks every 0.1–0.25 s for the same total.
 */
export function runBurns(sim: Sim): void {
  for (const t of sim.state.towers) {
    const burn = specOf(t.spec)?.gem.burn;
    if (!burn) continue;
    const per = (burn.dps * burnBonus(t.kills)) / TICK_RATE;
    for (const c of creepsNear(sim, t.x, t.y, burn.radius)) spellDamage(sim, c, per, t.id, 'dot');
  }
}

/** Wraith Slate explosions whose delay is up: full damage close in, half further out (spell damage, assumed). */
export function runBlasts(sim: Sim): void {
  const gs = gemState(sim.state);
  if (gs.blasts.length === 0) return;
  const due = gs.blasts.filter((b) => b.tick <= sim.state.tick);
  if (due.length === 0) return;
  gs.blasts = gs.blasts.filter((b) => b.tick > sim.state.tick);
  for (const b of due) {
    sim.events.push({ type: 'mode', name: 'gem.blast', data: { tower: b.tower, x: b.x, y: b.y } });
    const near = b.fullRadius * b.fullRadius;
    for (const c of creepsNear(sim, b.x, b.y, b.halfRadius)) {
      const dx = c.x - b.x;
      const dy = c.y - b.y;
      spellDamage(sim, c, dx * dx + dy * dy <= near ? b.full : b.half, b.tower, 'splash');
    }
  }
}
