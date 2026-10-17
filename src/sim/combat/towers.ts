import { AURA_TICKS, TICK_RATE } from '../core/constants';
import type { SimEvent } from '../core/events';
import type { Sim } from '../core/mode';
import { nextFloat, nextInt } from '../core/rng';
import type { AttackSpec, EffectSpec, TowerSpec } from '../core/specs';
import type { Creep, GameState, Projectile, Tower } from '../core/state';
import { getMode } from '../modes/registry';
import { footprintCells, footprintCentre } from '../path/grid';
import { damageCreep } from './damage';
import { cooldownTicks, towerMods } from './mods';
import { effectHandler, type Attack, type Impact, type Shot, type TowerMods } from './registry';
import { applyStatus, tickDown } from './status';
import { canHit, closestCreep, findCreep } from './targeting';

const NO_EFFECTS: readonly EffectSpec[] = [];

// Structure helpers for Game Mode commands. They don't validate: run
// placementError on the footprint first. Every grid change bumps pathVersion.

/**
 * Builds a structure with its footprint's top-left at `cell`. It covers the
 * spec's footprint (1×1 by default), every cell of which goes on the grid, and
 * stands at the footprint's centre.
 */
export function addTower(state: GameState, spec: string, cell: number, events: SimEvent[]): Tower {
  const size = getMode(state.modeId).towers[spec]?.footprint ?? 1;
  const cells = footprintCells(state.map, cell, size);
  if (cells.length === 0) cells.push(cell);
  const { x, y } = footprintCentre(state.map, cell, cells.length === 1 ? 1 : size);
  const tower: Tower = { id: state.nextId++, spec, cell, cells, x, y, cd: 0, target: 0, kills: 0, status: [] };
  state.towers.push(tower);
  for (const c of cells) state.grid[c] = tower.id;
  state.pathVersion++;
  events.push({ type: 'placed', tower: tower.id, spec, cell });
  return tower;
}

/** Removes a structure and frees its cells. Its projectiles in flight still land. */
export function removeTower(state: GameState, id: number, events: SimEvent[]): boolean {
  const i = state.towers.findIndex((t) => t.id === id);
  if (i < 0) return false;
  const tower = state.towers[i]!;
  state.towers.splice(i, 1);
  for (const c of tower.cells) if (state.grid[c] === id) state.grid[c] = 0;
  state.pathVersion++;
  events.push({ type: 'removed', tower: id, spec: tower.spec, cell: tower.cell });
  return true;
}

/**
 * Turns a structure into another spec in place (a Draft gem into a Rock, a merge,
 * an upgrade). The footprint stays; if the new spec's `walkable` differs, the
 * caller bumps `state.pathVersion` so routes rebuild.
 */
export function setTowerSpec(tower: Tower, spec: string, events: SimEvent[]): void {
  const from = tower.spec;
  tower.spec = spec;
  tower.target = 0;
  events.push({ type: 'changed', tower: tower.id, spec, from });
}

/** Refreshes every aura's status on the towers or creeps inside its radius. */
export function runAuras(sim: Sim): void {
  const { state, rules } = sim;
  const towers = state.towers;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i]!;
    const auras = rules.towers[t.spec]?.auras;
    if (!auras) continue;
    for (const a of auras) {
      const r2 = a.radius * a.radius;
      const key = a.key ?? `aura:${a.kind}`;
      if (a.to === 'towers') {
        for (const u of towers) {
          if (!rules.towers[u.spec]?.attack) continue;
          const dx = u.x - t.x;
          const dy = u.y - t.y;
          if (dx * dx + dy * dy <= r2) applyStatus(u.status, a.kind, key, a.value, AURA_TICKS, t.id);
        }
      } else {
        const layer = a.targets ?? 'both';
        for (const c of state.creeps) {
          if (c.hp <= 0 || !canHit(layer, c)) continue;
          const dx = c.x - t.x;
          const dy = c.y - t.y;
          if (dx * dx + dy * dy <= r2) applyStatus(c.status, a.kind, key, a.value, AURA_TICKS, t.id);
        }
      }
    }
  }
}

/**
 * WC3-style targeting: keep the current target while it lives and stays in
 * range, otherwise take the closest valid creep (lower id on a tie).
 */
export function runTowers(sim: Sim): void {
  const { state, rules } = sim;
  const towers = state.towers;
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i]!;
    const spec = rules.towers[t.spec];
    const atk = spec?.attack;
    if (!spec || !atk) continue;
    const mods = withBonus(towerMods(t), rules.towerBonus?.(state, t) ?? null);
    const range = atk.range + mods.range;
    const r2 = range * range;
    if (t.target !== 0) {
      const c = findCreep(state, t.target);
      if (!c || c.hp <= 0 || !canHit(atk.targets, c) || dist2(t, c) > r2) t.target = 0;
    }
    if (t.cd <= 0) {
      if (rules.towerTarget) t.target = rules.towerTarget(state, t, range)?.id ?? 0;
      else if (t.target === 0) t.target = closestCreep(state.creeps, t.x, t.y, r2, atk.targets)?.id ?? 0;
      // An idle tower stays ready without banking time toward a burst later.
      if (t.target === 0) {
        t.cd = 0;
        continue;
      }
      fire(sim, t, spec, atk, mods, range);
      const cooldown = rules.towerCooldown?.(state, t) ?? atk.cooldown;
      t.cd = Math.max(0, t.cd + cooldownTicks(cooldown, mods.attackSpeed));
    }
    t.cd -= 1;
  }
  for (const t of towers) if (t.status.length > 0) tickDown(t.status);
}

/** A tower's statuses plus the Game Mode's bonus for it. */
export function withBonus(mods: Readonly<TowerMods>, bonus: Readonly<TowerMods> | null): Readonly<TowerMods> {
  if (bonus === null) return mods;
  return { attackSpeed: mods.attackSpeed + bonus.attackSpeed, damage: mods.damage + bonus.damage, range: mods.range + bonus.range };
}

function dist2(t: Tower, c: Creep): number {
  const dx = c.x - t.x;
  const dy = c.y - t.y;
  return dx * dx + dy * dy;
}

function rollDamage(sim: Sim, atk: AttackSpec): number {
  const [min, max] = atk.damage;
  if (max <= min) return min;
  if (atk.dice) {
    const [count, sides] = atk.dice;
    let total = min - count;
    for (let i = 0; i < count; i++) total += nextInt(sim.state.rng, 1, sides);
    return total;
  }
  if (Number.isInteger(min) && Number.isInteger(max)) return nextInt(sim.state.rng, min, max);
  return min + nextFloat(sim.state.rng) * (max - min);
}

function fire(sim: Sim, tower: Tower, spec: TowerSpec, atk: AttackSpec, mods: Readonly<TowerMods>, range: number): void {
  const { state, events } = sim;
  const primary = findCreep(state, tower.target)!;
  const attack: Attack = { tower, spec, attack: atk, range, targets: [primary] };
  const effects = atk.effects ?? NO_EFFECTS;
  for (const e of effects) effectHandler(e.kind)?.onAttack?.(e, attack, sim);
  for (const target of attack.targets) {
    const shot: Shot = { tower, attack: atk, target, damage: rollDamage(sim, atk) * (1 + mods.damage), crit: 1 };
    for (const e of effects) effectHandler(e.kind)?.onLaunch?.(e, shot, sim);
    if (atk.projectileSpeed <= 0) {
      events.push({ type: 'fire', tower: tower.id, target: target.id, projectile: 0 });
      resolveImpact(sim, { tower: tower.id, attack: atk, target, x: target.x, y: target.y, damage: shot.damage, crit: shot.crit });
      continue;
    }
    const p: Projectile = {
      id: state.nextId++, tower: tower.id, spec: tower.spec, target: target.id,
      x: tower.x, y: tower.y, tx: target.x, ty: target.y,
      speed: atk.projectileSpeed / TICK_RATE, damage: shot.damage, crit: shot.crit,
    };
    state.projectiles.push(p);
    events.push({ type: 'fire', tower: tower.id, target: target.id, projectile: p.id });
  }
}

/** The target takes the hit, then every impact effect runs in the order the spec lists them. */
export function resolveImpact(sim: Sim, impact: Impact): void {
  const { target, attack } = impact;
  if (target !== null && target.hp > 0 && attack.direct !== false) {
    damageCreep(sim, target, impact.damage, attack.attackType, impact.tower, impact.crit > 1 ? 'crit' : 'attack');
  }
  for (const e of attack.effects ?? NO_EFFECTS) effectHandler(e.kind)?.onImpact?.(e, impact, sim);
}

/** Homing projectiles. One whose target is gone flies on to the last known spot and lands there. */
export function runProjectiles(sim: Sim): void {
  const { state, rules, events } = sim;
  const list = state.projectiles;
  const n = list.length;
  let w = 0;
  for (let i = 0; i < n; i++) {
    const p = list[i]!;
    let target: Creep | null = null;
    if (p.target !== 0) {
      const c = findCreep(state, p.target);
      if (c && c.hp > 0) {
        target = c;
        p.tx = c.x;
        p.ty = c.y;
      } else {
        p.target = 0;
      }
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > p.speed) {
      const k = p.speed / d;
      p.x += dx * k;
      p.y += dy * k;
      list[w++] = p;
      continue;
    }
    p.x = p.tx;
    p.y = p.ty;
    events.push({ type: 'impact', projectile: p.id, tower: p.tower, x: p.x, y: p.y });
    const attack = rules.towers[p.spec]?.attack;
    if (attack) resolveImpact(sim, { tower: p.tower, attack, target, x: p.x, y: p.y, damage: p.damage, crit: p.crit });
  }
  // Keep anything an impact launched (bounces, say) after the survivors.
  for (let i = n; i < list.length; i++) list[w++] = list[i]!;
  list.length = w;
}
