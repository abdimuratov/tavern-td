import {
  CREEP_SPEED, ELEMENT_TOWERS, HASTE_SPEED, LEAK_LIVES, MAX_ELEMENT_LEVEL, damageMultiplier,
  type DamageElement, type ElementCreepSpec, type SlowFamily,
} from '../../../content/element';
import { registerEffect } from '../../combat/registry';
import { applyStatus } from '../../combat/status';
import { findCreep, findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { HitKind } from '../../core/events';
import type { Sim } from '../../core/mode';
import type { Creep, GameState, Status, Tower } from '../../core/state';
import { earnGold, gainLives } from '../../economy';
import { placeOnRoute } from '../../path/route';
import {
  creepSpec, creepState, elState, isClone, modeEvent, peekCreep, roundHalfUp, towerInfoOf, towerStateById,
  type ElementCreepState,
} from './state';

// Element's damage model (docs/research/element-td-rules.md §11, damage.lua
// DamageEntity), kills and deaths, and the creep statuses it uses. Every Element
// hit goes through deal(); the core's damageCreep is never used.

/** Status keys. */
export const SHIELD = 'element:shield';
export const DEAD = 'element:dead';
export const STUN = 'element:stun';
export const HASTE = 'element:haste';
export const ACID = 'element:acid';
export const FAERIE = 'element:faerie';
export const FIRE_UP = 'element:fire-up';
export const SPRING = 'element:spring';
export const LIFE_BONUS = 'element:life';
export const PHASING = 'element:phasing';
export const MAGIC_RANGE = 'element:magic';

/** Status kinds (not attack effect kinds: those are the families' `element.<family>`). */
export const STATUS = {
  slow: 'element.status.slow',
  haste: 'element.status.haste',
  stun: 'element.status.stun',
  dead: 'element.status.dead',
  shield: 'element.status.shield',
  acid: 'element.status.acid',
  faerie: 'element.status.faerie',
} as const;

export function slowKey(family: SlowFamily): string {
  return `element:slow:${family}`;
}

// Slows of different families multiply; a hasted creep ignores them all (modifier_slow_adjustment.lua).
// assumed: the slowed speed isn't rounded to whole units as the port's is.
registerEffect({
  kind: STATUS.slow,
  creepMods(s, mods) {
    if (mods.slow < 0) return;
    mods.slow = 1 - (1 - mods.slow) * (1 - s.value);
  },
});
registerEffect({
  kind: STATUS.haste,
  creepMods(_s, mods) {
    mods.slow = 1 - HASTE_SPEED / CREEP_SPEED;
  },
});
registerEffect({ kind: STATUS.stun, creepMods(_s, mods) { mods.stunned = true; } });
// An undead creep lying dead neither moves nor can be hurt or targeted.
registerEffect({ kind: STATUS.dead, creepMods(_s, mods) { mods.stunned = true; } });
registerEffect({ kind: STATUS.shield });
registerEffect({ kind: STATUS.acid });
registerEffect({ kind: STATUS.faerie });

export function hasStatus(list: readonly Status[], key: string): boolean {
  for (const s of list) if (s.key === key) return true;
  return false;
}

export function statusValue(list: readonly Status[], key: string): number {
  let v = 0;
  let found = false;
  for (const s of list) {
    if (s.key === key && (!found || s.value > v)) {
      v = s.value;
      found = true;
    }
  }
  return v;
}

/** Puts a status on, replacing any with the same key (a refresh, or a weaker value replacing a stronger one). */
export function setStatus(list: Status[], kind: string, key: string, value: number, ticks: number, src: number): void {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.key === key) list.splice(i, 1);
  list.push({ kind, key, value, ticks, src });
}

export function removeStatus(list: Status[], key: string): void {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.key === key) list.splice(i, 1);
}

/** Lying dead between an undead creep's two lives. */
export function isDead(creep: Creep): boolean {
  return hasStatus(creep.status, DEAD);
}

/** Towers can aim at it and area effects find it: alive, not lying dead, not behind a mechanical shield. */
export function targetable(creep: Creep): boolean {
  return creep.hp > 0 && !isDead(creep) && !hasStatus(creep.status, SHIELD);
}

/** Targetable creeps within `radius` of a point (centre distance, assumed), in spawn order. */
export function creepsInArea(state: GameState, x: number, y: number, radius: number, except?: Creep): Creep[] {
  const r2 = radius * radius;
  const out: Creep[] = [];
  for (const c of state.creeps) {
    if (c === except || !targetable(c)) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    if (dx * dx + dy * dy <= r2) out.push(c);
  }
  return out;
}

export function distance2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function armorOf(creep: Creep): DamageElement {
  return creepSpec(creep.spec)?.armorType ?? 'composite';
}

function hasTrait(spec: ElementCreepSpec | undefined, trait: string): boolean {
  return spec?.trait === trait;
}

/** The Blacksmith bonus on a tower, a fraction (0.15 = +15%). */
export function fireUp(state: GameState, towerId: number): number {
  const t = towerId === 0 ? undefined : findTower(state, towerId);
  return t ? statusValue(t.status, FIRE_UP) : 0;
}

/** Ability damage after Fire Up (damage.lua ApplyAbilityDamageFromModifiers). */
export function abilityDamage(state: GameState, towerId: number, damage: number): number {
  return roundHalfUp(damage * (1 + fireUp(state, towerId)));
}

/** Faerie Fire's base and crowded-out amplification by the marking tower's level. */
function faerieAmp(state: GameState, creep: Creep, level: number): number {
  const spec = ELEMENT_TOWERS[level === 1 ? 'enchantment_tower' : `enchantment_tower_${level}`];
  const ability = spec?.element.ability;
  if (ability?.kind !== 'faerieFire') return 0;
  const crowd = creepsInArea(state, creep.x, creep.y, ability.crowd).length;
  return crowd <= ability.crowdMax ? ability.max : ability.base;
}

/** Summed damage amplification in percent: acid, Faerie Fire, and the attacking tower's vengeance stacks. */
export function amplification(state: GameState, creep: Creep, towerId: number): number {
  let amp = 0;
  if (creep.status.length > 0) {
    amp += statusValue(creep.status, ACID);
    if (hasStatus(creep.status, FAERIE)) amp += faerieAmp(state, creep, statusValue(creep.status, FAERIE));
  }
  if (towerId !== 0) amp -= 10 * (towerStateById(state, towerId)?.vengeance.length ?? 0);
  return amp;
}

export interface DamageResult {
  /** Damage taken after the element, amplification and rounding; 0 when nothing landed. */
  readonly dealt: number;
  /** Damage beyond the HP it had, on a kill. */
  readonly overkill: number;
  /** It died to this hit (an undead creep's first death included). */
  readonly killed: boolean;
}

const NOTHING: DamageResult = { dealt: 0, overkill: 0, killed: false };

/**
 * DamageEntity: × the element table (unless `pure`), × (1 + amplification),
 * rounded half up, then up to a whole number. A creep lying dead takes
 * nothing; an armed time-lapse creep rewinds instead of dropping to 25% or
 * less. HP stays whole. `kind` 'dot' raises no hit event.
 */
export function deal(sim: Sim, creep: Creep, amount: number, towerId: number, elem: DamageElement, kind: HitKind = 'attack', pure = false): DamageResult {
  if (creep.hp <= 0 || !(amount > 0) || isDead(creep)) return NOTHING;
  let d = amount;
  if (!pure) {
    d *= damageMultiplier(elem, armorOf(creep));
    d = roundHalfUp(d * (1 + amplification(sim.state, creep, towerId) / 100));
  }
  d = Math.ceil(d);
  // Ten or more vengeance stacks would turn a hit negative; it lands as nothing (assumed).
  if (d <= 0) return NOTHING;
  const cs = peekCreep(sim.state, creep);
  if (cs && timeLapseArmed(sim.state, creep, cs) && (creep.hp - d) / creep.maxHp <= 0.25) {
    rewind(sim, creep, cs);
    return NOTHING;
  }
  if (kind !== 'dot') sim.events.push({ type: 'hit', creep: creep.id, tower: towerId, damage: d, kind });
  if (creep.hp - d <= 0) {
    const overkill = d - creep.hp;
    kill(sim, creep, towerId);
    return { dealt: d, overkill, killed: true };
  }
  creep.hp -= d;
  return { dealt: d, overkill: 0, killed: false };
}

/** Split splash (BasicTowerAOE.lua): half to everything within `half`, then half to everything within `full`. */
export function splash(sim: Sim, x: number, y: number, full: number, half: number, damage: number, towerId: number, elem: DamageElement, fullFirst = false): void {
  const order = fullFirst ? [full, half] : [half, full];
  for (const r of order) {
    for (const c of creepsInArea(sim.state, x, y, r)) deal(sim, c, damage / 2, towerId, elem, 'splash');
  }
}

/** Every targetable creep within `radius` takes `damage` (no falloff). */
export function blast(sim: Sim, x: number, y: number, radius: number, damage: number, towerId: number, elem: DamageElement, except?: Creep): void {
  for (const c of creepsInArea(sim.state, x, y, radius, except)) deal(sim, c, damage, towerId, elem, 'splash');
}

export function applySlow(creep: Creep, family: SlowFamily, value: number, seconds: number, towerId: number): void {
  applyStatus(creep.status, STATUS.slow, slowKey(family), value, Math.round(seconds * TICK_RATE), towerId);
}

// --- Traits that act on damage and death -------------------------------------

/** Time lapse arms 5 s after spawning and works once. */
export function timeLapseArmed(state: GameState, creep: Creep, cs: ElementCreepState): boolean {
  return !cs.lapsed && hasTrait(creepSpec(creep.spec), 'time_lapse') && state.tick - cs.born >= 5 * TICK_RATE && cs.lapse.length > 0;
}

/** Time lapse: back to the place and HP of the newest sample at least 5 s old (temporal.lua Backtrack). */
function rewind(sim: Sim, creep: Creep, cs: ElementCreepState): void {
  const limit = sim.state.tick - 5 * TICK_RATE;
  let sample: [number, number, number] | null = null;
  for (const s of cs.lapse) if (s[0] <= limit) sample = s;
  cs.lapsed = true;
  cs.lapse = [];
  if (!sample) return;
  creep.hp = Math.min(creep.maxHp, sample[2]);
  placeOnRoute(sim.state, creep, sample[1]);
  modeEvent(sim.events, 'element.timeLapse', { creep: creep.id, x: creep.x, y: creep.y });
}

/**
 * A creep dies (or an undead creep falls for the first time): bounty, kill
 * credit, then everything that happens on a death. Pays nothing for a first
 * undead death and doesn't count it as a kill (undead.lua).
 */
export function kill(sim: Sim, creep: Creep, towerId: number): void {
  const { state, events } = sim;
  const spec = creepSpec(creep.spec);
  const cs = creepState(state, creep);
  const firstLife = hasTrait(spec, 'undead') && !cs.revived;
  const killer = towerId !== 0 ? findTower(state, towerId) : undefined;
  let bounty = firstLife ? 0 : creep.bounty;
  if (killer && towerInfoOf(killer.spec)?.family === 'gold' && bounty > 0) bounty += roundHalfUp(bounty * 0.35);
  if (killer && !firstLife && !isClone(state, killer)) killer.kills++;
  const x = creep.x;
  const y = creep.y;
  // Out of every area search before anything its death sets off can reach it.
  if (firstLife) fall(sim, creep, cs);
  else creep.hp = 0;
  onDeath(sim, creep, cs, killer);
  if (firstLife) {
    cs.napalm = 0;
    modeEvent(events, 'element.fell', { creep: creep.id, x, y, rises: cs.dead });
    return;
  }
  events.push({ type: 'kill', creep: creep.id, tower: towerId, bounty, x, y });
  earnGold(state, bounty, events);
  const es = elState(state);
  if (spec?.trait === 'heal') healAround(sim, creep);
  if (spec?.trait === 'vengeance' && killer) avenge(sim, killer);
  if (spec?.boss && state.wave.number === creep.wave) es.bossKills += spec.trait === 'bulky' ? 2 : 1;
  if (spec?.elemental) {
    const { element } = spec.elemental;
    es.levels[element] = Math.min(MAX_ELEMENT_LEVEL, es.levels[element] + 1);
    modeEvent(events, 'element.levelUp', { element, level: es.levels[element], creep: creep.id });
  }
  delete es.creeps[String(creep.id)];
}

/** What every death sets off, the first undead death included: napalm, sunburn remnants, Life points. */
function onDeath(sim: Sim, creep: Creep, cs: ElementCreepState, killer: Tower | undefined): void {
  const es = elState(sim.state);
  for (const t of es.timers) {
    if ((t.kind === 'dot' || t.kind === 'sunburn') && t.creep === creep.id) {
      // A sunburn stack with more than 1 s left keeps burning where the creep died.
      if (t.kind === 'sunburn' && t.end - sim.state.tick > TICK_RATE) {
        es.timers.push({
          kind: 'remnant', at: sim.state.tick + TICK_RATE, tower: t.tower, x: creep.x, y: creep.y, damage: t.damage,
          radius: t.radius, left: Math.round((t.end - sim.state.tick) / TICK_RATE), elem: t.elem,
        });
      }
      t.creep = 0;
    }
  }
  if (killer && towerInfoOf(killer.spec)?.family === 'life') lifePoints(sim, creep, killer);
  if (cs.napalmUntil >= 0) napalmBlast(sim, creep, cs);
}

/** Flamethrower's napalm goes off: everything within 350 takes the creep's whole stored napalm. */
export function napalmBlast(sim: Sim, creep: Creep, cs: ElementCreepState): void {
  cs.napalmUntil = -1;
  const by = cs.napalmBy;
  const damage = abilityDamage(sim.state, by, cs.napalm);
  modeEvent(sim.events, 'element.napalm', { creep: creep.id, x: creep.x, y: creep.y, damage });
  blast(sim, creep.x, creep.y, 350, damage, by, 'fire');
}

/** Life towers share points per kill (bulky ×2); 24 points are a life, up to 70 (LifeTower.lua). */
function lifePoints(sim: Sim, creep: Creep, killer: Tower): void {
  const hit = ELEMENT_TOWERS[killer.spec]?.attack?.effects?.[0];
  if (hit?.kind !== 'element.life') return;
  const life = hit as unknown as { points: number; perLife: number; maxLives: number };
  const es = elState(sim.state);
  const before = es.lifePoints;
  es.lifePoints += life.points * (creepSpec(creep.spec)?.trait === 'bulky' ? 2 : 1);
  if (sim.state.lives < life.maxLives && es.lifePoints >= life.perLife) {
    es.lifePoints -= life.perLife;
    gainLives(sim.state, 1, sim.events);
  } else if (sim.state.lives >= life.maxLives) {
    es.lifePoints = before;
  }
}

/** An undead creep's first death: it lies where it fell for 3 s, then rises at half HP (undead.lua). */
function fall(sim: Sim, creep: Creep, cs: ElementCreepState): void {
  // The port spawns a fresh unit, so debuffs and marks don't carry over.
  creep.status.length = 0;
  cs.jinx = null;
  cs.frost = null;
  cs.iceUntil = -1;
  cs.dead = sim.state.tick + 3 * TICK_RATE;
  creep.hp = Math.max(1, Math.floor(creep.maxHp * 0.5));
  applyStatus(creep.status, STATUS.dead, DEAD, 1, 3 * TICK_RATE + 1, 0);
}

/** The dead undead creep rises and walks on, now paying its bounty when it dies. */
export function rise(sim: Sim, creep: Creep, cs: ElementCreepState): void {
  cs.dead = -1;
  cs.revived = true;
  removeStatus(creep.status, DEAD);
  creep.hp = Math.max(1, Math.floor(creep.maxHp * 0.5));
  modeEvent(sim.events, 'element.rose', { creep: creep.id, x: creep.x, y: creep.y });
}

/** Heal: every creep within 300 regains 18% of its max HP (heal.lua). */
function healAround(sim: Sim, dead: Creep): void {
  for (const c of creepsInArea(sim.state, dead.x, dead.y, 300, dead)) {
    c.hp = Math.min(c.maxHp, Math.floor(c.hp + c.maxHp * 0.18));
  }
  modeEvent(sim.events, 'element.heal', { creep: dead.id, x: dead.x, y: dead.y });
}

/** Vengeance: every tower within 250 of the killer takes a −10% damage stack for 10 s (vengeance.lua). */
function avenge(sim: Sim, killer: Tower): void {
  const r2 = 250 * 250;
  const until = sim.state.tick + 10 * TICK_RATE;
  for (const t of sim.state.towers) {
    if (distance2(t.x, t.y, killer.x, killer.y) > r2) continue;
    const ts = towerStateById(sim.state, t.id);
    if (ts) ts.vengeance.push(until);
  }
  modeEvent(sim.events, 'element.vengeance', { tower: killer.id, x: killer.x, y: killer.y });
}

/** Lives a leak costs: an Elemental 3, a creep 1 (3 during boss Waves), doubled for bulky. */
export function leakLives(creep: Creep, bossWaves: boolean): number {
  const spec = creepSpec(creep.spec);
  if (spec?.elemental) return LEAK_LIVES.elemental;
  const base = bossWaves ? LEAK_LIVES.boss : LEAK_LIVES.creep;
  return spec?.trait === 'bulky' ? base * 2 : base;
}

/** The creep with this id if it is still alive. */
export function liveCreep(state: GameState, id: number): Creep | null {
  if (id === 0) return null;
  const c = findCreep(state, id);
  return c && c.hp > 0 ? c : null;
}
