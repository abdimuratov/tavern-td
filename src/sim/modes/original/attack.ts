import { BEAM_TICK, type OriginalTowerInfo } from '../../../content/original';
import { rollChance } from '../../combat/effects';
import { registerEffect } from '../../combat/registry';
import { applyStatus, statusTicks } from '../../combat/status';
import { canHit, findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import type { CustomEffect, TargetLayer } from '../../core/specs';
import type { Creep, Tower } from '../../core/state';
import { attackRange, damageFactor, perkOf } from './auras';
import { KEY, STATUS, addStack, applyFreeze, applyPoison, applySlow, attackLayer, deal, distance2, isBoss } from './combat';
import { familyTalents } from './talents';
import { moreTargets } from './targeting';
import { modeEvent, orState, peekTower, ticks, towerInfo } from './state';

// How an Original tower's attack lands (docs/original-design.md §6–8). Every
// attacking tower carries one `original.attack` effect naming its spec; its
// OriginalTowerInfo, its Tower Level's Perks and the Run's Talents decide the rest.

export type AttackEffect = CustomEffect & { readonly kind: 'original.attack'; readonly tower: string };

function infoOf(e: AttackEffect): OriginalTowerInfo {
  return towerInfo(e.tower)!;
}

function liveTower(sim: Sim, id: number): Tower | undefined {
  return id === 0 ? undefined : findTower(sim.state, id);
}

/** The every-Nth Perk counts arrows for the Arrow family and attacks for the rest. */
function countsArrows(info: OriginalTowerInfo): boolean {
  return info.family === 'arrow';
}

/** Seconds a Talent adds to the family's slows, and points it adds to their strength. */
function frostSlow(sim: Sim, amount: number, seconds: number): { amount: number; seconds: number } {
  const t = familyTalents(sim.state, 'frost');
  return { amount: amount + t.slowStrength, seconds: seconds + t.slowDuration };
}

/** The family's poison: damage per second after the tower's damage bonus, Potency and Virulence, and its length in ticks. */
function poisonOf(sim: Sim, tower: Tower | undefined, towerId: number, dps: number, seconds: number): { dps: number; ticks: number } {
  const t = familyTalents(sim.state, 'poison');
  const virulence = tower ? perkOf(sim.state, tower, 1) : null;
  const bonus = t.poisonDamage + (virulence?.kind === 'poisonDamage' ? virulence.value : 0);
  return { dps: dps * damageFactor(sim.state, towerId) * (1 + bonus), ticks: statusTicks(seconds + t.poisonDuration) };
}

registerEffect<AttackEffect>({
  kind: 'original.attack',
  validate: (e) => (typeof e.tower === 'string' && towerInfo(e.tower) !== undefined ? null : 'original.attack needs an Original tower spec'),

  onAttack(e, attack, sim) {
    const { state } = sim;
    const info = infoOf(e);
    const tower = attack.tower;
    const ts = peekTower(state, tower.id);
    const primary = attack.targets[0]!;
    if (ts && info.beam && ts.beamOn !== primary.id) {
      ts.beamOn = primary.id;
      ts.beamSince = state.tick;
    }
    if (ts && !countsArrows(info)) ts.shots++;
    // assumed: Double Charge's shell and Echo's bolt hit as hard as the first.
    let extra = (info.multishot ?? 1) - 1;
    // Double Charge (Cannon, Level 10): every 3rd shot fires a second shell.
    const second = perkOf(state, tower, 1);
    if (ts && second?.kind === 'secondShot' && ts.shots % second.every === 0) extra++;
    // Echo (Arcane Talent): a share of attacks fire a second bolt.
    const echo = familyTalents(state, info.family).echo;
    if (echo > 0 && rollChance(sim, echo)) extra++;
    if (extra > 0) for (const c of moreTargets(state, tower, attack.range, extra, attack.targets)) attack.targets.push(c);
  },

  onLaunch(e, shot, sim) {
    const { state } = sim;
    const info = infoOf(e);
    const ts = peekTower(state, shot.tower.id);
    if (ts && countsArrows(info)) ts.shots++;
    // Crits: the tower's own, raised by Hawkeye (Arrow capstone) or given by it.
    const hawkeye = familyTalents(state, info.family).crit;
    const chance = (info.crit?.chance ?? 0) + (hawkeye?.chance ?? 0);
    const multiplier = info.crit?.multiplier ?? hawkeye?.multiplier ?? 1;
    let crit = chance > 0 && rollChance(sim, chance) ? multiplier : 1;
    const nth = perkOf(state, shot.tower, info.family === 'arrow' ? 1 : 0);
    if (ts && nth?.kind === 'everyNth' && ts.shots % nth.every === 0) {
      // Heartseeker crits; Surge simply doubles.
      if (info.family === 'arrow') crit = Math.max(crit, nth.multiplier);
      else shot.damage *= nth.multiplier;
    }
    if (crit > 1) {
      shot.damage *= crit;
      shot.crit *= crit;
    }
    if (ts && info.beam && shot.target.id === ts.beamOn) {
      const seconds = (state.tick - ts.beamSince) / TICK_RATE;
      shot.damage *= Math.min(info.beam.max, 1 + info.beam.ramp * seconds);
    }
  },

  onImpact(e, impact, sim) {
    const { state, events } = sim;
    const info = infoOf(e);
    const type = info.damageType!;
    const tower = liveTower(sim, impact.tower);
    const id = impact.tower;
    const target = impact.target !== null && impact.target.hp > 0 ? impact.target : null;
    const kind = impact.crit > 1 ? 'crit' : 'attack';

    if (info.cloud) {
      // assumed: the poison lingers 1 s after a creep leaves the cloud.
      const p = poisonOf(sim, tower, id, info.cloud.dps, 0);
      const linger = ticks(1 + familyTalents(state, 'poison').poisonDuration);
      orState(state).clouds.push({
        tower: id, x: impact.x, y: impact.y, radius: info.cloud.radius, dps: p.dps, linger,
        air: attackLayer(state, e.tower) !== 'ground', until: state.tick + ticks(info.cloud.duration),
      });
      modeEvent(events, 'original.cloud', { tower: id, x: impact.x, y: impact.y, radius: info.cloud.radius, ticks: ticks(info.cloud.duration) });
      spores(sim, tower, info, impact.x, impact.y, null);
      return;
    }

    const struck: Creep[] = [];
    if (info.nova) {
      // Blizzard Spire: every creep in range takes the hit.
      if (!tower) return;
      const range = attackRange(state, tower);
      const layer = attackLayer(state, e.tower);
      const creeps = state.creeps;
      const n = creeps.length;
      for (let i = 0; i < n; i++) {
        const c = creeps[i]!;
        if (c.hp <= 0 || !canHit(layer, c) || distance2(c.x, c.y, tower.x, tower.y) > range * range) continue;
        deal(sim, c, impact.damage, type, id, kind, 1, e.tower);
        struck.push(c);
      }
    } else if (target) {
      deal(sim, target, impact.damage, type, id, kind, info.beam ? BEAM_TICK : 1, e.tower);
      struck.push(target);
    }

    if (info.splash) splash(sim, e, info, tower, impact.x, impact.y, impact.damage, target, struck);
    if (info.bounce && target) bounce(sim, e, info, target, impact.damage, id);

    for (const c of struck) afterHit(sim, info, tower, c);

    // Arc (Arcane, Level 10): the hit jumps to one more creep for half.
    const arc = tower ? perkOf(state, tower, 1) : null;
    if (arc?.kind === 'arc' && target) {
      const next = nearest(sim, target.x, target.y, arc.radius, attackLayer(state, e.tower), [target, ...struck]);
      if (next) deal(sim, next, impact.damage * arc.share, type, id, 'splash', 1, e.tower);
    }
    if (target) spores(sim, tower, info, target.x, target.y, target);
  },
});

/** The nearest live creep of a layer within `radius` of a point, skipping `exclude`. */
function nearest(sim: Sim, x: number, y: number, radius: number, layer: TargetLayer, exclude: readonly Creep[]): Creep | null {
  let best: Creep | null = null;
  let bestD = radius * radius;
  for (const c of sim.state.creeps) {
    if (c.hp <= 0 || !canHit(layer, c) || exclude.includes(c)) continue;
    const d = distance2(c.x, c.y, x, y);
    if (d < bestD || (d === bestD && best === null)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** What a hit leaves on the creep it struck: slows, freezes, poison, Shrapnel. */
function afterHit(sim: Sim, info: OriginalTowerInfo, tower: Tower | undefined, c: Creep): void {
  const { state } = sim;
  const id = tower?.id ?? 0;
  if (c.hp <= 0) return;
  if (info.slow) {
    const s = frostSlow(sim, info.slow.amount, info.slow.duration);
    applySlow(state, c, s.amount, s.seconds, id);
  }
  // Bosses ignore freezes, so no chance is rolled for them.
  if (info.freeze && !isBoss(c) && rollChance(sim, info.freeze.chance)) applyFreeze(c, KEY.freeze, info.freeze.duration, id);
  const deep = tower ? perkOf(state, tower, 1) : null;
  if (deep?.kind === 'freeze' && !isBoss(c) && rollChance(sim, deep.chance)) applyFreeze(c, KEY.freeze, deep.duration, id);
  if (info.poison) {
    const p = poisonOf(sim, tower, id, info.poison.dps, info.poison.duration);
    applyPoison(state, c, p.dps, p.ticks, id);
  }
  if (info.stacks) {
    const p = poisonOf(sim, tower, id, info.stacks.dps, info.stacks.duration);
    addStack(state, c, p.dps, p.ticks, info.stacks.max, id);
  }
  const shrapnel = info.family === 'cannon' ? familyTalents(state, 'cannon').shrapnel : null;
  if (shrapnel) applyStatus(c.status, STATUS.armor, KEY.shrapnel, shrapnel.armor, statusTicks(shrapnel.duration), id);
}

/** Cannon splash: full damage within the inner radius, half within the outer, both grown by Wide Shells and Wide Blast. */
function splash(
  sim: Sim, e: AttackEffect, info: OriginalTowerInfo, tower: Tower | undefined, x: number, y: number, damage: number,
  target: Creep | null, struck: Creep[],
): void {
  const { state } = sim;
  const wide = tower ? perkOf(state, tower, 0) : null;
  const grow = 1 + familyTalents(state, info.family).splashRadius + (wide?.kind === 'splashRadius' ? wide.value : 0);
  const full = info.splash!.full * grow;
  const half = info.splash!.half * grow;
  const layer = attackLayer(state, e.tower);
  const creeps = state.creeps;
  const n = creeps.length;
  const inFull: Creep[] = target ? [target] : [];
  for (let i = 0; i < n; i++) {
    const c = creeps[i]!;
    if (c === target || c.hp <= 0 || !canHit(layer, c)) continue;
    const d2 = distance2(c.x, c.y, x, y);
    if (d2 > half * half) continue;
    const inner = d2 <= full * full;
    if (inner) inFull.push(c);
    deal(sim, c, inner ? damage : damage / 2, info.damageType!, tower?.id ?? 0, 'splash', 1, e.tower);
    struck.push(c);
  }
  // Concussion (Cannon capstone): a share of shots stun everything in the full-damage splash.
  const concussion = familyTalents(state, info.family).concussion;
  if (concussion && rollChance(sim, concussion.chance)) {
    for (const c of inFull) applyFreeze(c, KEY.stun, concussion.duration, tower?.id ?? 0);
  }
}

/** Prism Tower: the bolt jumps on to the nearest unhit creeps, losing a share of its damage each jump. */
function bounce(sim: Sim, e: AttackEffect, info: OriginalTowerInfo, first: Creep, damage: number, id: number): void {
  const b = info.bounce!;
  const hit: Creep[] = [first];
  let from = first;
  let d = damage;
  for (let j = 0; j < b.jumps; j++) {
    const next = nearest(sim, from.x, from.y, b.radius, attackLayer(sim.state, e.tower), hit);
    if (!next) break;
    d *= 1 - b.falloff;
    modeEvent(sim.events, 'original.bounce', { from: from.id, to: next.id });
    deal(sim, next, d, info.damageType!, id, 'splash', 1, e.tower);
    hit.push(next);
    from = next;
  }
}

/** Spores (Poison, Level 5): the hit also poisons the nearest other creep within reach. */
function spores(sim: Sim, tower: Tower | undefined, info: OriginalTowerInfo, x: number, y: number, target: Creep | null): void {
  if (!tower) return;
  const perk = perkOf(sim.state, tower, 0);
  if (perk?.kind !== 'spores') return;
  const exclude: Creep[] = target ? [target] : [];
  const cloud = info.cloud;
  const next = nearest(sim, x, y, perk.radius + (cloud ? cloud.radius : 0), attackLayer(sim.state, tower.spec), exclude);
  if (!next || (cloud && distance2(next.x, next.y, x, y) <= cloud.radius * cloud.radius)) return;
  if (info.stacks) {
    const p = poisonOf(sim, tower, tower.id, info.stacks.dps, info.stacks.duration);
    addStack(sim.state, next, p.dps, p.ticks, info.stacks.max, tower.id);
    return;
  }
  // assumed: a cloud's spores poison as the cloud does, lingering 1 s.
  const poison = info.poison ?? (cloud ? { dps: cloud.dps, duration: 1 } : null);
  if (!poison) return;
  const p = poisonOf(sim, tower, tower.id, poison.dps, poison.duration);
  applyPoison(sim.state, next, p.dps, p.ticks, tower.id);
}

/** Clouds poison every creep inside each tick, and drift away when their time is up. */
export function runClouds(sim: Sim): void {
  const { state } = sim;
  const clouds = orState(state).clouds;
  if (clouds.length === 0) return;
  let w = 0;
  for (const cloud of clouds) {
    if (state.tick >= cloud.until) continue;
    clouds[w++] = cloud;
    const r2 = cloud.radius * cloud.radius;
    for (const c of state.creeps) {
      if (c.hp <= 0 || (c.air && !cloud.air) || distance2(c.x, c.y, cloud.x, cloud.y) > r2) continue;
      applyPoison(state, c, cloud.dps, cloud.linger, cloud.tower);
    }
  }
  clouds.length = w;
}
