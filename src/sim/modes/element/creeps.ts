import { applyStatus } from '../../combat/status';
import { findCreep } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import { nextInt } from '../../core/rng';
import type { Creep, GameState } from '../../core/state';
import { HASTE, SHIELD, STATUS, deal, napalmBlast, rise } from './combat';
import { creepSpec, creepState, elState, modeEvent, peekCreep, roundHalfUp, type ElementCreepState } from './state';

// Creep Traits (docs/research/element-td-rules.md §6), run every tick before
// creeps move: fast bursts, mechanical shields, regen, time-lapse samples,
// undead rising, and the marks towers leave (napalm fuses, Jinx, frostbite).

const SECOND = TICK_RATE;
/** Time lapse keeps samples every 0.1 s, back a little over its 5 s rewind. */
const LAPSE_EVERY = 3;
const LAPSE_KEEP = 5 * SECOND + LAPSE_EVERY;

/** Status kinds a mechanical shield purges: slows, stuns, acid and Faerie Fire. */
const PURGED: ReadonlySet<string> = new Set([STATUS.slow, STATUS.stun, STATUS.acid, STATUS.faerie]);

/** A new creep's trait bookkeeping (onSpawn). */
export function initCreep(state: GameState, creep: Creep): ElementCreepState {
  const cs = creepState(state, creep);
  const trait = creepSpec(creep.spec)?.trait;
  // mechanical.lua: the first shield comes a random 1–6 whole seconds in.
  if (trait === 'mechanical') cs.mech = state.tick + nextInt(state.rng, 1, 6) * SECOND;
  if (trait === 'time_lapse') cs.lapse.push([state.tick, creep.dist ?? 0, creep.hp]);
  return cs;
}

export function runCreepTraits(sim: Sim): void {
  const { state } = sim;
  const tick = state.tick;
  for (const c of state.creeps) {
    if (c.hp <= 0) continue;
    const cs = peekCreep(state, c);
    if (!cs) continue;
    if (cs.dead >= 0) {
      if (tick >= cs.dead) rise(sim, c, cs);
      continue;
    }
    const spec = creepSpec(c.spec);
    const age = tick - cs.born;
    switch (spec?.trait) {
      case 'fast':
        // assumed (reference §6): 1 s at 750 every 3 s, the first at 3 s.
        if (age >= 3 * SECOND && (age - 3 * SECOND) % (3 * SECOND) === 0) applyStatus(c.status, STATUS.haste, HASTE, 1, SECOND, 0);
        break;
      case 'mechanical':
        if (cs.mech >= 0 && tick >= cs.mech && (tick - cs.mech) % (8 * SECOND) === 0) shield(sim, c);
        break;
      case 'regen':
        regen(c, cs, age, spec.boss === true);
        break;
      case 'time_lapse':
        if (!cs.lapsed && age % LAPSE_EVERY === 0) {
          cs.lapse.push([tick, c.dist ?? 0, c.hp]);
          while (cs.lapse.length > 0 && cs.lapse[0]![0] < tick - LAPSE_KEEP) cs.lapse.shift();
        }
        break;
    }
    marks(sim, c, cs);
  }
}

/**
 * Mechanical: purge debuffs, then 2 s immune to attacks and area damage (mechanical.lua).
 * assumed: hits already in flight still land, as DamageEntity ignores immunity.
 */
function shield(sim: Sim, c: Creep): void {
  let w = 0;
  for (const s of c.status) if (!PURGED.has(s.kind)) c.status[w++] = s;
  c.status.length = w;
  // Datadriven DoTs are purged too; napalm, Jinx and frostbite stay (assumed).
  for (const t of elState(sim.state).timers) if ((t.kind === 'dot' || t.kind === 'sunburn') && t.creep === c.id) t.creep = 0;
  applyStatus(c.status, STATUS.shield, SHIELD, 1, 2 * SECOND, 0);
  modeEvent(sim.events, 'element.shield', { creep: c.id });
}

/**
 * Regen: below max HP, 1.25% of max every 0.5 s (a boss: 0.25% every 0.1 s,
 * rounded), until it has restored its max HP in all; checked before each
 * heal, so it can overshoot by one (regen.lua, boss.lua). HP stays whole.
 */
function regen(c: Creep, cs: ElementCreepState, age: number, boss: boolean): void {
  const period = boss ? 3 : 15;
  if (age <= 0 || age % period !== 0 || cs.healed > c.maxHp || c.hp >= c.maxHp) return;
  const amount = boss ? roundHalfUp(c.maxHp * 0.025 * 0.1) : c.maxHp * 0.025 * 0.5;
  // assumed: HP stays whole, as every other HP change in the port (SetCreepHealth floors).
  c.hp = Math.min(c.maxHp, Math.floor(c.hp + amount));
  cs.healed += amount;
}

/** Napalm fuses, Jinx ticks and frostbite returning. */
function marks(sim: Sim, c: Creep, cs: ElementCreepState): void {
  const tick = sim.state.tick;
  if (cs.napalmUntil >= 0 && tick >= cs.napalmUntil) napalmBlast(sim, c, cs);
  const jinx = cs.jinx;
  if (jinx && tick >= jinx.next && c.hp > 0) {
    // JinxTower.lua: a share of all HP lost since it was marked, as dark damage (no Fire Up).
    const lost = jinx.hp - c.hp;
    jinx.left--;
    jinx.next += Math.round(2.5 * SECOND);
    if (jinx.left <= 0) cs.jinx = null;
    if (lost > 0) deal(sim, c, roundHalfUp((lost * jinx.pct) / 100), jinx.by, 'dark', 'dot');
  }
  const frost = cs.frost;
  if (frost && tick >= frost.until && c.hp > 0) {
    c.hp = Math.min(c.maxHp, c.hp + frost.amount);
    cs.frost = null;
  }
}

/** Drops the state of creeps no longer on the Map. */
export function pruneCreeps(state: GameState): void {
  const creeps = elState(state).creeps;
  for (const key of Object.keys(creeps)) {
    const c = findCreep(state, Number(key));
    if (!c || c.hp <= 0) delete creeps[key];
  }
}
