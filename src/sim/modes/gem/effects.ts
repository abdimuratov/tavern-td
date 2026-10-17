import {
  GEM_SLATES,
  type GemBounceEffect, type GemFireMarkEffect, type GemFrostEffect, type GemGrabEffect, type GemIncinerateEffect,
  type GemKillCritEffect, type GemLightningEffect, type GemLuckyEffect, type GemNovaEffect, type GemPermaSlowEffect,
  type GemPoisonEffect, type GemShadowStrikeEffect, type GemSpell, type GemSpellsEffect, type GemStrikeEffect,
  type GemStunHitEffect,
} from '../../../content/gem';
import { damageCreep } from '../../combat/damage';
import { rollChance } from '../../combat/effects';
import { effectHandler, registerEffect, type Impact } from '../../combat/registry';
import { applyStatus, statusTicks } from '../../combat/status';
import { canHit, findTower, nearestCreeps } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import { nextFloat, nextInt } from '../../core/rng';
import type { EffectSpec } from '../../core/specs';
import type { Creep, Tower } from '../../core/state';
import { earnGold } from '../../economy';
import { creepsNear, isHero, isStunned, spellDamage, stun } from './combat';
import { burnBonus, byStep, gemState, infoOf, isSlate, modeEvent, ownedCount, specOf, towerState } from './state';

// Gem's own effect kinds. Importing this module registers them; it must run
// before the Gem Game Mode registers (src/sim/modes/gem/index.ts).

function live(impact: Impact): Creep | null {
  return impact.target !== null && impact.target.hp > 0 ? impact.target : null;
}

function check(...problems: (string | null)[]): string | null {
  return problems.find((p) => p !== null) ?? null;
}

function num(name: string, v: unknown, min = 0): string | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min ? null : `${name} must be a number of ${min} or more`;
}

function frac(name: string, v: unknown): string | null {
  return typeof v === 'number' && v >= 0 && v <= 1 ? null : `${name} must be between 0 and 1`;
}

function table(name: string, v: unknown): string | null {
  return Array.isArray(v) && v.length >= 1 && v.length <= 11 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? null : `${name} must list 1 to 11 numbers`;
}

function towerOf(sim: Sim, id: number): Tower | undefined {
  return id === 0 ? undefined : findTower(sim.state, id);
}

/** Spends a tower's mana if it has enough. */
function spendMana(sim: Sim, tower: Tower | undefined, amount: number): boolean {
  if (amount <= 0) return true;
  if (!tower) return false;
  const ts = towerState(sim.state, tower);
  if (ts.mana < amount) return false;
  ts.mana -= amount;
  return true;
}

function slow(creep: Creep, key: string, amount: number, seconds: number, tower: number): void {
  applyStatus(creep.status, 'slow', key, amount, statusTicks(seconds), tower);
}

// --- Statuses Gem's effects leave on creeps ---------------------------------

registerEffect({ kind: 'gem.stun', creepMods(_s, mods) { mods.stunned = true; } });
registerEffect({ kind: 'gem.stunGuard' });
registerEffect({ kind: 'gem.vulnerable', creepMods(s, mods) { mods.damageTaken += s.value; } });
registerEffect({ kind: 'gem.incinerated' });

// --- Attack effects ----------------------------------------------------------

registerEffect<GemPoisonEffect>({
  kind: 'gem.poison',
  validate: (e) => check(num('poison dps', e.dps), num('poison duration', e.duration), frac('poison slow', e.slow)),
  onImpact(e, impact) {
    const c = live(impact);
    if (!c) return;
    const ticks = statusTicks(e.duration);
    applyStatus(c.status, 'gem.poison', 'gem:poison', e.dps, ticks, impact.tower);
    if (e.slow > 0) applyStatus(c.status, 'slow', 'gem:poison-slow', e.slow, ticks, impact.tower);
  },
  // assumed: WC3 poison ticks once a second; here it lands every tick at the same rate.
  tickCreep(s, creep, sim) {
    spellDamage(sim, creep, s.value / TICK_RATE, s.src, 'dot');
  },
});

registerEffect<GemFrostEffect>({
  kind: 'gem.frost',
  validate: (e) => check(frac('frost amount', e.amount), num('frost duration', e.duration), num('frost hero duration', e.heroDuration)),
  onImpact(e, impact, sim) {
    const hit = (c: Creep): void => slow(c, 'gem:frost', e.amount, isHero(sim, c) ? e.heroDuration : e.duration, impact.tower);
    const target = live(impact);
    if (target) hit(target);
    if (e.radius === undefined) return;
    for (const c of creepsNear(sim, impact.x, impact.y, e.radius, e.targets ?? 'both')) if (c !== target) hit(c);
  },
});

registerEffect<GemBounceEffect>({
  kind: 'gem.bounce',
  validate: (e) => check(num('bounce radius', e.radius, 1), typeof e.family === 'string' ? null : 'bounce needs a family'),
  onImpact(e, impact, sim) {
    const first = impact.target;
    if (first === null) return;
    // One more target per Dark or Enchanted Emerald you own (upgrade GDEB).
    const bounces = ownedCount(sim.state, e.family);
    const hit: Creep[] = [first];
    let from: Creep = first;
    const others = (impact.attack.effects ?? []).filter((x) => x.kind !== e.kind);
    for (let b = 0; b < bounces; b++) {
      const next = nearestCreeps(sim.state.creeps, from.x, from.y, e.radius * e.radius, impact.attack.targets, 1, hit)[0];
      if (!next) break;
      hit.push(next);
      sim.events.push({ type: 'fire', tower: impact.tower, target: next.id, projectile: 0 });
      damageCreep(sim, next, impact.damage, impact.attack.attackType, impact.tower, impact.crit > 1 ? 'crit' : 'attack');
      const bounce: Impact = { ...impact, target: next, x: next.x, y: next.y };
      for (const o of others) effectHandler(o.kind)?.onImpact?.(o, bounce, sim);
      from = next;
    }
  },
});

registerEffect<GemStunHitEffect>({
  kind: 'gem.stunHit',
  validate: (e) => check(frac('stun chance', e.chance), num('stun duration', e.duration), num('stun damage taken', e.damageTaken)),
  onImpact(e, impact, sim) {
    const c = live(impact);
    if (!c || isStunned(c) || !rollChance(sim, e.chance) || !stun(c, e.duration, impact.tower)) return;
    applyStatus(c.status, 'gem.vulnerable', 'gem:vulnerable', e.damageTaken, statusTicks(e.duration), impact.tower);
    // The stunning hit counts too: top it up so it lands at (1 + damageTaken) of itself.
    damageCreep(sim, c, (impact.damage * e.damageTaken) / (1 + e.damageTaken), impact.attack.attackType, impact.tower, 'dot');
  },
});

registerEffect<GemNovaEffect>({
  kind: 'gem.nova',
  validate: (e) => check(frac('nova chance', e.chance), num('nova mana', e.mana), num('nova damage', e.targetDamage), num('nova area', e.areaDamage), num('nova radius', e.radius)),
  onImpact(e, impact, sim) {
    const c = live(impact);
    const tower = towerOf(sim, impact.tower);
    if (!c || !tower || towerState(sim.state, tower).mana < e.mana || !rollChance(sim, e.chance)) return;
    spendMana(sim, tower, e.mana);
    modeEvent(sim.events, 'gem.spell', { tower: tower.id, spell: 'frostNova', x: c.x, y: c.y });
    spellDamage(sim, c, e.targetDamage, tower.id, 'attack');
    for (const o of creepsNear(sim, c.x, c.y, e.radius)) {
      spellDamage(sim, o, e.areaDamage, tower.id, 'splash');
      if (o.hp > 0) slow(o, 'gem:nova', e.slow, e.slowDuration, tower.id);
    }
  },
});

/** Forked Lightning: the target, then the nearest others within range of the tower. */
function forkTargets(sim: Sim, tower: Tower, target: Creep | null, range: number, max: number): Creep[] {
  const first: Creep[] = [];
  if (target && target.hp > 0) {
    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    if (dx * dx + dy * dy <= range * range) first.push(target);
  }
  return [...first, ...nearestCreeps(sim.state.creeps, tower.x, tower.y, range * range, 'both', max - first.length, first)];
}

registerEffect<GemLightningEffect>({
  kind: 'gem.lightning',
  validate: (e) => check(frac('lightning chance', e.chance), num('lightning mana', e.mana), table('lightning damage', e.byKillStep), num('lightning targets', e.maxTargets, 1)),
  onImpact(e, impact, sim) {
    const tower = towerOf(sim, impact.tower);
    const c = live(impact);
    if (!c || !tower || towerState(sim.state, tower).mana < e.mana) return;
    const count = ownedCount(sim.state, e.family);
    if (!rollChance(sim, e.chance + e.chancePerExtra * (count - 1))) return;
    spendMana(sim, tower, e.mana);
    const damage = byStep(e.byKillStep, tower.kills);
    const targets = forkTargets(sim, tower, c, e.range, e.maxTargets);
    modeEvent(sim.events, 'gem.spell', { tower: tower.id, spell: 'bloodLightning', targets: targets.map((t) => t.id) });
    for (const t of targets) spellDamage(sim, t, damage, tower.id, 'attack');
  },
});

registerEffect<GemLuckyEffect>({
  kind: 'gem.lucky',
  validate: (e) => check(frac('gold chance', e.goldChance), frac('stun chance', e.stunChance), num('stun duration', e.stunDuration)),
  onImpact(e, impact, sim) {
    const roll = nextFloat(sim.state.rng);
    if (roll < e.goldChance) {
      const gold = Math.floor(sim.state.wave.number / 2);
      earnGold(sim.state, gold, sim.events);
      modeEvent(sim.events, 'gem.luckyGold', { tower: impact.tower, gold });
    } else if (roll < e.goldChance + e.stunChance) {
      const c = live(impact);
      if (c && !isStunned(c)) stun(c, e.stunDuration, impact.tower);
    }
  },
});

registerEffect<GemFireMarkEffect>({
  kind: 'gem.fireMark',
  validate: (e) => check(num('mark dps', e.dps), num('mark radius', e.radius, 1), num('mark duration', e.duration)),
  onImpact(e, impact) {
    const c = live(impact);
    if (c) applyStatus(c.status, 'gem.fireMark', `gem:fire-mark:${impact.tower}`, e.dps, statusTicks(e.duration), impact.tower);
  },
  // The marked creep burns itself and everything within the mark's radius; the
  // burn stops if its Fire Star is gone (immolation deregisters with its source).
  tickCreep(s, creep, sim) {
    const tower = towerOf(sim, s.src);
    const mark = tower ? effectOf<GemFireMarkEffect>(tower.spec, 'gem.fireMark') : undefined;
    if (!tower || !mark) return;
    const per = (s.value * burnBonus(tower.kills)) / TICK_RATE;
    for (const c of creepsNear(sim, creep.x, creep.y, mark.radius)) spellDamage(sim, c, per, tower.id, 'dot');
  },
});

/** The first effect of `kind` on a spec's attack or Barrage. */
export function effectOf<E extends EffectSpec>(spec: string, kind: string): E | undefined {
  const info = infoOf(spec);
  const lists = [specAttackEffects(spec), info?.barrage?.onHit ?? []];
  for (const list of lists) for (const e of list) if (e.kind === kind) return e as E;
  return undefined;
}

function specAttackEffects(spec: string): readonly EffectSpec[] {
  return specOf(spec)?.attack?.effects ?? [];
}

/** Orders every attacking tower within `radius` of the victim onto it, except Hold and Ancient Slates (their taunt). */
function taunt(sim: Sim, victim: Creep, radius: number): void {
  const r2 = radius * radius;
  for (const t of sim.state.towers) {
    const family = infoOf(t.spec)?.family;
    if (isSlate(t.spec) && (family === 'hold' || family === 'ancient')) continue;
    const atk = specOf(t.spec)?.attack;
    if (!atk || !canHit(atk.targets, victim)) continue;
    const dx = t.x - victim.x;
    const dy = t.y - victim.y;
    if (dx * dx + dy * dy <= r2) t.target = victim.id;
  }
}

registerEffect<GemGrabEffect>({
  kind: 'gem.grab',
  validate: (e) => check(num('grab stun', e.stun[0]), num('grab stun', e.stun[1], e.stun[0]), num('grab damage', e.damage), num('grab disarm', e.disarm), num('taunt radius', e.taunt)),
  onAttack(e, attack, sim) {
    const victim = attack.targets[0];
    // The attack itself never lands (BlzUnitInterruptAttack).
    attack.targets.length = 0;
    if (!victim || isStunned(victim)) return;
    const [min, max] = e.stun;
    const seconds = max > min ? min + nextFloat(sim.state.rng) * (max - min) : min;
    const tower = attack.tower;
    if (!stun(victim, seconds, tower.id)) return;
    if (e.armor) {
      const n = ownedCount(sim.state, e.armor.family);
      const [base, per] = victim.air ? e.armor.air : e.armor.ground;
      applyStatus(victim.status, 'armor', 'gem:ancient-armor', base + per * n, statusTicks(seconds), tower.id);
    }
    taunt(sim, victim, e.taunt);
    modeEvent(sim.events, 'gem.spell', { tower: tower.id, spell: 'grab', targets: [victim.id] });
    damageCreep(sim, victim, e.damage + e.perKill * tower.kills, e.attackType, tower.id, 'attack');
    tower.cd = e.disarm * TICK_RATE;
  },
});

registerEffect<GemStrikeEffect>({
  kind: 'gem.strike',
  validate: (e) => check(num('strike damage', e.damage), num('strike disarm', e.disarm)),
  onAttack(e, attack, sim) {
    const victim = attack.targets[0];
    if (!victim) return;
    damageCreep(sim, victim, e.damage + e.perKill * attack.tower.kills, e.attackType, attack.tower.id, 'attack');
    attack.tower.cd = e.disarm * TICK_RATE;
  },
});

/** Shadow Strike's tick, in ticks; from the one slate that casts it. */
const SHADOW_INTERVAL = (() => {
  const e = GEM_SLATES['poison-slate']?.attack?.effects?.find((x) => x.kind === 'gem.shadowStrike') as GemShadowStrikeEffect | undefined;
  return Math.max(1, Math.round((e?.interval ?? 2) * TICK_RATE));
})();

registerEffect<GemShadowStrikeEffect>({
  kind: 'gem.shadowStrike',
  validate: (e) => check(num('shadow strike mana', e.mana), table('shadow strike damage', e.byKillStep), table('shadow strike duration', e.durationByKillStep), frac('shadow strike slow', e.slow)),
  onAttack(e, attack, sim) {
    const victim = attack.targets[0];
    const tower = attack.tower;
    if (!victim || !spendMana(sim, tower, e.mana)) {
      // No mana: the slate is ordered to stop, so the attack never lands.
      attack.targets.length = 0;
      return;
    }
    const damage = byStep(e.byKillStep, tower.kills);
    const ticks = statusTicks(byStep(e.durationByKillStep, tower.kills));
    spellDamage(sim, victim, damage, tower.id, 'attack');
    if (victim.hp <= 0) return;
    applyStatus(victim.status, 'gem.shadowStrike', 'gem:shadow-strike', damage, ticks, tower.id);
    applyStatus(victim.status, 'slow', 'gem:shadow-strike-slow', e.slow, ticks, tower.id);
  },
  tickCreep(s, creep, sim) {
    if (s.ticks % SHADOW_INTERVAL === 0) spellDamage(sim, creep, s.value, s.src, 'dot');
  },
});

function castSpell(sim: Sim, tower: Tower, spell: GemSpell, target: Creep | null, tx: number, ty: number): void {
  const kills = tower.kills;
  modeEvent(sim.events, 'gem.spell', { tower: tower.id, spell: spell.spell, x: tx, y: ty });
  switch (spell.spell) {
    case 'fanOfKnives': {
      const hit = creepsNear(sim, tower.x, tower.y, byStep(spell.radius, kills));
      const per = Math.min(byStep(spell.damage, kills), spell.maxTotal / Math.max(1, hit.length));
      for (const c of hit) spellDamage(sim, c, per, tower.id, 'splash');
      break;
    }
    case 'forkedLightning':
      for (const c of forkTargets(sim, tower, target, spell.range, spell.maxTargets)) spellDamage(sim, c, byStep(spell.damage, kills), tower.id, 'attack');
      break;
    case 'carrionSwarm': {
      let dx = tx - tower.x;
      let dy = ty - tower.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) {
        dx = 1;
        dy = 0;
      } else {
        dx /= len;
        dy /= len;
      }
      const hit = creepsNear(sim, tower.x, tower.y, spell.distance + spell.width, 'ground').filter((c) => {
        const along = (c.x - tower.x) * dx + (c.y - tower.y) * dy;
        const side = (c.x - tower.x) * dy - (c.y - tower.y) * dx;
        return along >= 0 && along <= spell.distance && side >= -spell.width && side <= spell.width;
      });
      const per = Math.min(spell.damage, spell.maxTotal / Math.max(1, hit.length));
      for (const c of hit) spellDamage(sim, c, per, tower.id, 'splash');
      break;
    }
    case 'thunderClap':
      for (const c of creepsNear(sim, tower.x, tower.y, byStep(spell.radius, kills))) {
        spellDamage(sim, c, byStep(spell.damage, kills), tower.id, 'splash');
        if (c.hp > 0) slow(c, 'gem:thunder-clap', spell.slow, spell.slowDuration, tower.id);
      }
      break;
    case 'armor':
      if (target && target.hp > 0) applyStatus(target.status, 'armor', 'gem:elder-armor', spell.amount, statusTicks(spell.duration), tower.id);
      break;
  }
}

function trySpells(e: GemSpellsEffect, sim: Sim, tower: Tower, target: Creep | null, tx: number, ty: number): void {
  if (!rollChance(sim, e.chance)) return;
  if (!spendMana(sim, tower, e.mana)) return;
  castSpell(sim, tower, e.spells[nextInt(sim.state.rng, 0, e.spells.length - 1)]!, target, tx, ty);
}

registerEffect<GemSpellsEffect>({
  kind: 'gem.spells',
  validate: (e) => check(frac('spell chance', e.chance), num('spell mana', e.mana), Array.isArray(e.spells) && e.spells.length > 0 ? null : 'spells needs at least one spell'),
  onAttack(e, attack, sim) {
    if (e.on !== 'attack') return;
    const target = attack.targets[0] ?? null;
    if (target) trySpells(e, sim, attack.tower, target, target.x, target.y);
  },
  onImpact(e, impact, sim) {
    if (e.on !== 'impact' || impact.target === null) return;
    const tower = towerOf(sim, impact.tower);
    if (tower) trySpells(e, sim, tower, live(impact), impact.x, impact.y);
  },
});

registerEffect<GemIncinerateEffect>({
  kind: 'gem.incinerate',
  validate: (e) => check(num('incinerate per stack', e.perStack), num('incinerate duration', e.duration), num('explosion damage', e.explosion.full)),
  onLaunch(e, shot) {
    const stacks = shot.target.status.find((s) => s.key === 'gem:incinerate')?.value ?? 0;
    shot.damage += e.perStack * (stacks + 1);
  },
  onImpact(e, impact) {
    const c = live(impact);
    if (!c) return;
    const stacks = c.status.find((s) => s.key === 'gem:incinerate')?.value ?? 0;
    applyStatus(c.status, 'gem.incinerated', 'gem:incinerate', stacks + 1, statusTicks(e.duration), impact.tower);
  },
});

registerEffect<GemPermaSlowEffect>({
  kind: 'gem.permaSlow',
  validate: (e) => frac('slow factor', e.factor),
  onAttack(e, attack, sim) {
    const victim = attack.targets[0];
    const cs = victim ? sim.rules.creeps[victim.spec] : undefined;
    // SetUnitMoveSpeed clamps to the creep's minimum speed.
    if (victim && cs) victim.speed = Math.min(victim.speed, Math.max(cs.minSpeed ?? 0, cs.speed * e.factor) / TICK_RATE);
  },
});

registerEffect<GemKillCritEffect>({
  kind: 'gem.killCrit',
  validate: (e) => check(frac('crit chance', e.chance), table('crit multiplier', e.byKillStep)),
  onLaunch(e, shot, sim) {
    if (!rollChance(sim, e.chance)) return;
    const m = byStep(e.byKillStep, shot.tower.kills);
    shot.damage *= m;
    shot.crit *= m;
  },
});

/** Wraith Slate: a creep that dies while incinerated explodes after a delay. */
export function scheduleBlast(sim: Sim, creep: Creep): void {
  const s = creep.status.find((x) => x.key === 'gem:incinerate');
  if (!s) return;
  const tower = towerOf(sim, s.src);
  const e = (tower ? effectOf<GemIncinerateEffect>(tower.spec, 'gem.incinerate') : undefined)
    ?? effectOf<GemIncinerateEffect>('wraith-slate', 'gem.incinerate');
  if (!e) return;
  gemState(sim.state).blasts.push({
    tick: sim.state.tick + Math.round(e.explosion.delay * TICK_RATE), x: creep.x, y: creep.y, tower: s.src,
    full: e.explosion.full, fullRadius: e.explosion.fullRadius, half: e.explosion.half, halfRadius: e.explosion.halfRadius,
  });
}
