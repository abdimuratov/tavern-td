import {
  ASSIST_SECONDS, ASSIST_SHARE, BOSS_SLOW_SHARE, DAMAGE_TABLE, LEVEL_XP, MAX_LEVEL, PERK_LEVELS, TOTEM_SHARE,
  type ArmorType, type DamageType, type OriginalTowerInfo,
} from '../../../content/original';
import { spawnCreep } from '../../combat/creeps';
import { armorMultiplier } from '../../combat/damage';
import { creepMods } from '../../combat/mods';
import { registerEffect } from '../../combat/registry';
import { applyStatus, statusTicks } from '../../combat/status';
import { canHit, findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { HitKind } from '../../core/events';
import type { Sim } from '../../core/mode';
import type { TargetLayer } from '../../core/specs';
import type { Creep, GameState, Status, Tower } from '../../core/state';
import { earnGold } from '../../economy';
import { creepLine, placeOnRoute } from '../../path/route';
import { auraRadius } from './auras';
import { familyTalents, runTalents } from './talents';
import {
  creepInfo, creepSpec, creepState, modeEvent, orState, peekCreep, peekTower, ticks, towerInfo, towerSpec, type OriginalCreepState,
} from './state';
import { runGhoulHp } from './waves';

// The Original's damage model (docs/original-design.md §4–5, §7): the damage
// type × armor type table, numeric armor, Shields, kills, bounty, XP and
// Assists, and the creep statuses the families leave. Every Original hit goes
// through deal(); the core's damageCreep is never used.

/** Status kinds. */
export const STATUS = {
  /** Move speed: positive slows, negative hastes (the Gravelord's enrage). */
  speed: 'original.speed',
  freeze: 'original.freeze',
  armor: 'original.armor',
  hex: 'original.hex',
  poison: 'original.poison',
} as const;

/** Status keys. Slows share one key, so only the strongest applies. */
export const KEY = {
  slow: 'original:slow',
  enrage: 'original:enrage',
  freeze: 'original:freeze',
  stun: 'original:stun',
  shrapnel: 'original:shrapnel',
  war: 'original:war',
  hex: 'original:hex',
  poison: 'original:poison',
  /** Widow's Fang stacks: one key per stack slot, so they all tick. */
  fang: 'original:fang:',
  drums: 'original:drums',
} as const;

registerEffect({ kind: STATUS.speed, creepMods(s, mods) { mods.slow += s.value; } });
registerEffect({ kind: STATUS.freeze, creepMods(_s, mods) { mods.stunned = true; } });
registerEffect({ kind: STATUS.armor, creepMods(s, mods) { mods.armor -= s.value; } });
registerEffect({ kind: STATUS.hex, creepMods(s, mods) { mods.damageTaken += s.value; } });
registerEffect({
  kind: STATUS.poison,
  tickCreep(s, creep, sim) {
    deal(sim, creep, s.value / TICK_RATE, 'poison', s.src, 'dot');
  },
});

export function hasKey(list: readonly Status[], key: string): boolean {
  for (const s of list) if (s.key === key) return true;
  return false;
}

/** Carrying any poison: a refreshing one or a Widow's Fang stack. */
export function isPoisoned(creep: Creep): boolean {
  for (const s of creep.status) if (s.kind === STATUS.poison) return true;
  return false;
}

export function isSlowed(creep: Creep): boolean {
  for (const s of creep.status) if (s.key === KEY.slow) return true;
  return false;
}

export function isBoss(creep: Creep): boolean {
  return creepSpec(creep.spec)?.armorType === 'boss';
}

/** The layers a tower's attacks reach: its attack's, or both for a Poison tower with Plague Wind. */
export function attackLayer(state: GameState, spec: string): TargetLayer {
  const atk = towerSpec(spec)?.attack;
  if (!atk) return 'ground';
  return towerInfo(spec)?.family === 'poison' && familyTalents(state, 'poison').hitsAir ? 'both' : atk.targets;
}

/** Whether a tower's attacks can reach this creep's layer. */
export function canTarget(state: GameState, tower: Tower, creep: Creep): boolean {
  return canHit(attackLayer(state, tower.spec), creep);
}

export function distance2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Records that `tower` hit or slowed the creep now, for Assists. */
export function touch(state: GameState, creep: Creep, tower: number): void {
  if (tower === 0) return;
  const cs = peekCreep(state, creep);
  if (!cs) return;
  const t = cs.touched;
  for (let i = 0; i < t.length; i += 2) {
    if (t[i] === tower) {
      t[i + 1] = state.tick;
      return;
    }
  }
  t.push(tower, state.tick);
}

/** Its Shield right now: the creep's own plus any temporary one. */
export function shieldOf(state: GameState, cs: OriginalCreepState | undefined): number {
  if (!cs) return 0;
  return cs.shield + (state.tick < cs.boostUntil ? cs.boost : 0);
}

/** The share `type` deals to `armor`, after Talents and a tower that treats Armored as Unarmored. */
export function typeShare(state: GameState, type: DamageType, armor: ArmorType, info: OriginalTowerInfo | undefined): number {
  const effective = armor === 'armored' && info?.ignoresArmored ? 'unarmored' : armor;
  let share = DAMAGE_TABLE[type][effective];
  for (const t of runTalents(state).armorTypes) if (t.damage === type && t.armor === effective) share = Math.max(share, t.value);
  return share;
}

/**
 * One hit (or a tick of poison) on a creep. A hit goes through the damage
 * table, numeric armor (debuffs only), Brittle and Eagle Feathers, then loses
 * the creep's Shield (scaled by `shieldScale`, which a beam's tick sets to its
 * share of a second). Poison over time skips all of that. Hex and any other
 * damage-taken bonus apply to both. Returns the damage dealt.
 */
export function deal(sim: Sim, creep: Creep, amount: number, type: DamageType, towerId: number, kind: HitKind, shieldScale = 1, spec: string | null = null): number {
  if (creep.hp <= 0 || !(amount > 0)) return 0;
  const { state } = sim;
  const cs = peekCreep(state, creep);
  const mods = creepMods(creep);
  const source = spec ?? (towerId !== 0 ? findTower(state, towerId)?.spec ?? null : null);
  const info = towerInfo(source);
  let d = amount;
  if (kind !== 'dot') {
    const armorType = creepSpec(creep.spec)?.armorType ?? 'unarmored';
    d *= typeShare(state, type, armorType, info);
    const corrode = familyTalents(state, 'poison').corrode;
    const armor = mods.armor - (corrode > 0 && isPoisoned(creep) ? corrode : 0);
    if (armor !== 0) d *= armorMultiplier(armor);
    // assumed: Brittle counts any slow, and Spellbreaker (in typeShare) any Magic.
    const brittle = familyTalents(state, 'frost').brittle;
    if (brittle > 0 && (type === 'pierce' || type === 'siege') && isSlowed(creep)) d *= 1 + brittle;
    if (creep.air && info?.family === 'arrow') d *= 1 + familyTalents(state, 'arrow').flyingDamage;
  }
  if (mods.damageTaken !== 0) d *= 1 + mods.damageTaken;
  if (kind !== 'dot') d = Math.max(0, d - shieldOf(state, cs) * shieldScale);
  touch(state, creep, towerId);
  if (kind !== 'dot') sim.events.push({ type: 'hit', creep: creep.id, tower: towerId, damage: d, kind });
  if (d <= 0) return 0;
  creep.hp -= d;
  if (creep.hp <= 0) kill(sim, creep, towerId);
  else if (cs) bossCheck(sim, creep, cs);
  return d;
}

/** Slows a creep (half as much on a boss), crediting `tower` with the touch. */
export function applySlow(state: GameState, creep: Creep, amount: number, seconds: number, tower: number, auraTicks?: number): void {
  if (creep.hp <= 0 || amount <= 0) return;
  const value = isBoss(creep) ? amount * BOSS_SLOW_SHARE : amount;
  applyStatus(creep.status, STATUS.speed, KEY.slow, value, auraTicks ?? statusTicks(seconds), tower);
  touch(state, creep, tower);
}

/** Freezes or stuns a creep in place; bosses ignore both. */
export function applyFreeze(creep: Creep, key: string, seconds: number, tower: number): boolean {
  if (creep.hp <= 0 || isBoss(creep)) return false;
  applyStatus(creep.status, STATUS.freeze, key, 1, statusTicks(seconds), tower);
  return true;
}

/** Poisons a creep: refreshing, so only the strongest poison on it counts. Thick Venom slows it too. */
export function applyPoison(state: GameState, creep: Creep, dps: number, poisonTicks: number, tower: number): void {
  if (creep.hp <= 0 || dps <= 0) return;
  applyStatus(creep.status, STATUS.poison, KEY.poison, dps, poisonTicks, tower);
  thickVenom(state, creep, poisonTicks, tower);
  touch(state, creep, tower);
}

function thickVenom(state: GameState, creep: Creep, poisonTicks: number, tower: number): void {
  const slow = familyTalents(state, 'poison').poisonSlow;
  if (slow > 0) applySlow(state, creep, slow, 0, tower, poisonTicks);
}

/**
 * Adds a Widow's Fang stack: up to `max` on a creep, after which a new one
 * replaces the stack closest to running out. assumed: the cap is per creep,
 * whichever towers put the stacks there.
 */
export function addStack(state: GameState, creep: Creep, dps: number, stackTicks: number, max: number, tower: number): void {
  if (creep.hp <= 0 || dps <= 0) return;
  const used = new Set<string>();
  let oldest: Status | null = null;
  for (const s of creep.status) {
    if (!s.key.startsWith(KEY.fang)) continue;
    used.add(s.key);
    if (oldest === null || s.ticks < oldest.ticks) oldest = s;
  }
  if (used.size >= max && oldest) {
    oldest.value = dps;
    oldest.ticks = stackTicks;
    oldest.src = tower;
  } else {
    let slot = 0;
    while (used.has(`${KEY.fang}${slot}`)) slot++;
    creep.status.push({ kind: STATUS.poison, key: `${KEY.fang}${slot}`, value: dps, ticks: stackTicks, src: tower });
  }
  thickVenom(state, creep, stackTicks, tower);
  touch(state, creep, tower);
}

/** Widow's Fang stacks on a creep. */
export function stackCount(creep: Creep): number {
  let n = 0;
  for (const s of creep.status) if (s.key.startsWith(KEY.fang)) n++;
  return n;
}

// --- Bosses --------------------------------------------------------------------

/** After a hit that didn't kill: the Gravelord's enrage and the Riftlord's Shields and calls. */
function bossCheck(sim: Sim, creep: Creep, cs: OriginalCreepState): void {
  const boss = creepInfo(creep.spec)?.boss;
  if (!boss) return;
  const { state, events } = sim;
  if (boss.kind === 'enrage') {
    if (cs.phase === 0 && creep.hp <= creep.maxHp * boss.at) {
      cs.phase = 1;
      applyStatus(creep.status, STATUS.speed, KEY.enrage, -boss.haste, statusTicks(boss.duration), 0);
      modeEvent(events, 'original.enrage', { creep: creep.id, x: creep.x, y: creep.y });
    }
  } else if (boss.kind === 'rift') {
    while (cs.phase < boss.at.length && creep.hp <= creep.maxHp * boss.at[cs.phase]!) {
      cs.phase++;
      cs.boost = boss.shield * runGhoulHp(state, cs.threat);
      cs.boostUntil = state.tick + ticks(boss.duration);
      drop(sim, creep, boss.creep, boss.count, 1);
      modeEvent(events, 'original.rift', { creep: creep.id, phase: cs.phase, shield: cs.boost, until: cs.boostUntil });
    }
  }
}

/** Spacing between creeps a creep drops, along its route. */
const DROP_SPACING = 20;

/**
 * assumed: dropped creeps belong to the dropper's Wave and still give XP.
 * Puts `count` creeps of `spec` on the dropping creep's route, `behind`
 * spacings back and one spacing apart, in its Wave, at its Wave's Threat.
 * They pay no bounty.
 */
export function drop(sim: Sim, from: Creep, spec: string, count: number, behind = 0): Creep[] {
  const { state, events } = sim;
  const info = creepInfo(spec);
  const fromState = creepState(state, from);
  if (!info) return [];
  const hp = Math.max(1, Math.round(info.hpMult * runGhoulHp(state, fromState.threat)));
  const out: Creep[] = [];
  for (let k = 0; k < count; k++) {
    const opts = { wave: from.wave, hp, bounty: 0 };
    const c = spawnCreep(state, spec, from.route === undefined ? opts : { ...opts, route: from.route }, events);
    const cs = creepState(state, c);
    cs.dropped = true;
    cs.threat = fromState.threat;
    if (creepLine(state.map, c)) {
      placeOnRoute(state, c, Math.max(0, (from.dist ?? 0) - (k + behind) * DROP_SPACING));
    } else {
      c.x = from.x;
      c.y = from.y;
      c.seg = from.seg;
    }
    out.push(c);
  }
  return out;
}

// --- Kills and XP ----------------------------------------------------------------

/** A creep dies: bounty, kill credit, XP and Assists, then what its death sets off. */
export function kill(sim: Sim, creep: Creep, towerId: number): void {
  const { state, events } = sim;
  const es = orState(state);
  const cs = peekCreep(state, creep);
  creep.hp = 0;
  const killer = towerId !== 0 ? findTower(state, towerId) : undefined;
  const killerInfo = towerInfo(killer?.spec ?? null);
  let cents = cs?.dropped ? 0 : Math.round(creep.bounty * 100);
  if (killerInfo) cents += familyTalents(state, killerInfo.family).killGold * 100;
  es.carry += cents;
  const gold = Math.floor(es.carry / 100);
  es.carry -= gold * 100;
  if (killer) killer.kills++;
  events.push({ type: 'kill', creep: creep.id, tower: towerId, bounty: gold, x: creep.x, y: creep.y });
  earnGold(state, gold, events);
  if (cs) {
    awardXp(sim, creep, cs, killer);
    onDeath(sim, creep);
  }
  delete es.creeps[String(creep.id)];
}

/** Totems whose aura reaches `tower`, the tower itself excepted. */
export function totemsAround(state: GameState, tower: Tower): Tower[] {
  const out: Tower[] = [];
  for (const t of state.towers) {
    if (t === tower || towerInfo(t.spec)?.family !== 'totem') continue;
    const r = auraRadius(state, t);
    if (distance2(t.x, t.y, tower.x, tower.y) <= r * r) out.push(t);
  }
  return out;
}

/** XP a tower gains from `xp`: Spirit Link adds a share while a Totem's aura reaches it. */
function linked(state: GameState, tower: Tower, xp: number): number {
  const link = familyTalents(state, 'totem').auraXp;
  return link > 0 && totemsAround(state, tower).length > 0 ? xp * (1 + link) : xp;
}

function awardXp(sim: Sim, creep: Creep, cs: OriginalCreepState, killer: Tower | undefined): void {
  const xp = creepInfo(creep.spec)?.xp ?? 0;
  if (xp <= 0) return;
  const { state } = sim;
  if (killer) gainXp(sim, killer, linked(state, killer, xp));
  const since = state.tick - ASSIST_SECONDS * TICK_RATE;
  const t = cs.touched;
  for (let i = 0; i < t.length; i += 2) {
    if (t[i] === killer?.id || t[i + 1]! < since) continue;
    const helper = findTower(state, t[i]!);
    if (helper) gainXp(sim, helper, linked(state, helper, xp * ASSIST_SHARE));
  }
  if (killer) for (const totem of totemsAround(state, killer)) gainXp(sim, totem, xp * TOTEM_SHARE);
}

/** The Tower Level `xp` reaches. */
export function levelFor(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= LEVEL_XP[level]!) level++;
  return level;
}

export function gainXp(sim: Sim, tower: Tower, amount: number): void {
  const ts = peekTower(sim.state, tower.id);
  if (!ts || amount <= 0) return;
  ts.xp += amount;
  const level = levelFor(ts.xp);
  if (level <= ts.level) return;
  const from = ts.level;
  ts.level = level;
  const perks = PERK_LEVELS.filter((l) => l > from && l <= level);
  modeEvent(sim.events, 'original.levelUp', { tower: tower.id, level, perks: [...perks] });
}

/** What a death sets off: a Bloater's split, Contagion and Shatter. */
function onDeath(sim: Sim, creep: Creep): void {
  const { state, events } = sim;
  const info = creepInfo(creep.spec);
  if (info?.split && creep.dist !== undefined) {
    const dropped = drop(sim, creep, info.split.creep, info.split.count);
    modeEvent(events, 'original.split', { creep: creep.id, into: dropped.map((c) => c.id), x: creep.x, y: creep.y });
  }
  const contagion = familyTalents(state, 'poison').contagion;
  if (contagion !== null) spreadPoison(state, creep, contagion);
  const shatter = familyTalents(state, 'frost').shatter;
  if (shatter !== null) {
    const frost = frostSlow(state, creep);
    if (frost !== 0) {
      const damage = creep.maxHp * shatter.share;
      const r2 = shatter.radius * shatter.radius;
      const creeps = state.creeps;
      const n = creeps.length;
      modeEvent(events, 'original.shatter', { creep: creep.id, x: creep.x, y: creep.y });
      for (let i = 0; i < n; i++) {
        const c = creeps[i]!;
        if (c !== creep && c.hp > 0 && distance2(c.x, c.y, creep.x, creep.y) <= r2) deal(sim, c, damage, 'magic', frost, 'splash');
      }
    }
  }
}

/** The Frost tower whose slow is on the creep, or 0. */
function frostSlow(state: GameState, creep: Creep): number {
  for (const s of creep.status) {
    if (s.key !== KEY.slow || s.src === 0) continue;
    const t = findTower(state, s.src);
    if (t && towerInfo(t.spec)?.family === 'frost') return s.src;
  }
  return 0;
}

/** Contagion: the dead creep's poison passes to the nearest creep within `radius`. */
function spreadPoison(state: GameState, dead: Creep, radius: number): void {
  let poison: Status | null = null;
  for (const s of dead.status) if (s.key === KEY.poison && (poison === null || s.value > poison.value)) poison = s;
  if (!poison) return;
  let best: Creep | null = null;
  let bestD = radius * radius;
  for (const c of state.creeps) {
    if (c === dead || c.hp <= 0) continue;
    const d = distance2(c.x, c.y, dead.x, dead.y);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  if (best) applyPoison(state, best, poison.value, poison.ticks, poison.src);
}
