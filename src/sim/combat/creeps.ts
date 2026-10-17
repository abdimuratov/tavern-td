import { DEFAULT_DIFFICULTY_HP, TICK_RATE } from '../core/constants';
import type { SimEvent } from '../core/events';
import type { GameModeRules, LeakOutcome, Sim } from '../core/mode';
import type { Creep, Difficulty, GameState } from '../core/state';
import { loseLives } from '../economy';
import { getMode } from '../modes/registry';
import { flow, type Flow } from '../path/flow';
import { cellAt, mapData, type MapData } from '../path/grid';
import { creepLine, moveOnRoute, placeOnRoute, routeCount } from '../path/route';
import { creepMods, speedFactor, tickCreepStatuses } from './mods';
import { tickDown } from './status';

export interface SpawnOptions {
  /** Wave number it counts toward; 0 (the default) for none. */
  readonly wave?: number;
  /** Defaults to the spec's HP scaled by the Difficulty. */
  readonly hp?: number;
  /** World units per second; defaults to the spec's. */
  readonly speed?: number;
  readonly bounty?: number;
  /** Index of the Map's route it takes (and whose air line it flies); 0 by default. */
  readonly route?: number;
}

/** Puts a creep on the spawn cell, or at the start of its route or air line. The Wave runner uses this; Game Modes can too (summons, splits). */
export function spawnCreep(state: GameState, spec: string, opts: SpawnOptions, events: SimEvent[]): Creep {
  const rules = getMode(state.modeId);
  if (!Object.hasOwn(rules.creeps, spec)) throw new Error(`Game Mode ${rules.id} has no creep ${spec}`);
  const cs = rules.creeps[spec]!;
  const md = mapData(state.map);
  const hp = opts.hp ?? Math.max(1, Math.round(cs.hp * difficultyHp(rules, state.difficulty)));
  const wave = opts.wave ?? 0;
  const creep: Creep = {
    id: state.nextId++, spec, wave, x: md.spawnX, y: md.spawnY, hp, maxHp: hp,
    speed: (opts.speed ?? cs.speed) / TICK_RATE, bounty: opts.bounty ?? cs.bounty,
    air: cs.flying, seg: 0, status: [],
  };
  const route = opts.route ?? 0;
  if (state.map.routes !== undefined) {
    if (!Number.isInteger(route) || route < 0 || route >= state.map.routes.length) throw new Error(`Map ${state.map.id} has no route ${route}`);
    creep.route = route;
  }
  // On a fixed route, ground creeps start at its first point, and flyers at its air line's.
  if (creepLine(state.map, creep)) placeOnRoute(state, creep, 0);
  state.creeps.push(creep);
  events.push({ type: 'spawn', creep: creep.id, spec, wave, x: creep.x, y: creep.y });
  rules.onSpawn?.(state, creep, events);
  return creep;
}

export function difficultyHp(rules: GameModeRules, difficulty: Difficulty): number {
  return (rules.difficultyHp ?? DEFAULT_DIFFICULTY_HP)[difficulty];
}

/**
 * Regen, statuses, then movement. Ground creeps walk their fixed route, or
 * steer for the centre of the flow field's next cell from the cell they are
 * in, so they round corners smoothly and re-route the moment the maze changes.
 * Air creeps follow their route's air line, or fly straight between waypoint
 * centres. Dead or departed creeps stay in the list (hp 0) until the end of
 * the tick, so lookups by id stay valid throughout.
 */
export function runCreeps(sim: Sim): void {
  const { state, rules } = sim;
  const creeps = state.creeps;
  if (creeps.length === 0) return;
  const md = mapData(state.map);
  const routed = routeCount(state.map) > 0;
  let fl: Flow | null = null;
  const n = creeps.length;
  for (let i = 0; i < n; i++) {
    const c = creeps[i]!;
    if (c.hp <= 0) continue;
    const spec = rules.creeps[c.spec];
    if (spec?.regen && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + spec.regen / TICK_RATE);
    tickCreepStatuses(sim, c);
    if (c.hp > 0) {
      const mods = creepMods(c);
      let dist = c.speed * speedFactor(mods);
      // A minimum speed floors slows, never the creep's own base speed.
      if (spec?.minSpeed !== undefined && !mods.stunned) dist = Math.max(dist, Math.min(c.speed, spec.minSpeed / TICK_RATE));
      const line = routed ? creepLine(state.map, c) : null;
      const arrived = line ? moveOnRoute(line, c, dist) : c.air ? moveAir(c, dist, md) : moveGround(c, dist, md, (fl ??= flow(state)));
      if (arrived) leak(sim, c, md, line !== null, spec?.leakCost ?? 1);
    }
    tickDown(c.status);
  }
}

/** Moves a ground creep up to `dist`; true when it reached the exit. */
function moveGround(c: Creep, dist: number, md: MapData, fl: Flow): boolean {
  const last = md.regions.length;
  let cell = cellAt(md, c.x, c.y);
  // A tick covers well under a cell at WC3 speeds; the cap only guards against bad content.
  for (let guard = 0; guard < 16 && cell >= 0; guard++) {
    while (md.inRegion[c.seg]![cell] === 1) {
      c.seg++;
      if (c.seg >= last) return true;
    }
    if (dist <= 0) return false;
    const next = fl.next[c.seg]![cell]!;
    if (next < 0) return false;
    const dx = md.cx[next]! - c.x;
    const dy = md.cy[next]! - c.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= dist) {
      c.x = md.cx[next]!;
      c.y = md.cy[next]!;
      dist -= d;
      cell = next;
    } else {
      const k = dist / d;
      c.x += dx * k;
      c.y += dy * k;
      dist = 0;
      cell = cellAt(md, c.x, c.y);
    }
  }
  return false;
}

/** Moves an air creep up to `dist` along the waypoint centres; true when it reached the exit's centre. */
function moveAir(c: Creep, dist: number, md: MapData): boolean {
  const last = md.regions.length;
  for (let guard = 0; guard < 16 && dist > 0; guard++) {
    const target = md.centres[c.seg]!;
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > dist) {
      const k = dist / d;
      c.x += dx * k;
      c.y += dy * k;
      return false;
    }
    c.x = target.x;
    c.y = target.y;
    dist -= d;
    c.seg++;
    if (c.seg >= last) return true;
  }
  return false;
}

function leak(sim: Sim, c: Creep, md: MapData, onLine: boolean, leakCost: number): void {
  const { state, rules, events } = sim;
  const outcome: LeakOutcome = rules.onLeak ? rules.onLeak(state, c, events) : { lives: leakCost, then: 'remove' };
  const restart = outcome.then === 'restart';
  events.push({ type: 'leak', creep: c.id, lives: outcome.lives, restart });
  loseLives(state, outcome.lives, events);
  if (restart && onLine) {
    placeOnRoute(sim.state, c, 0);
  } else if (restart) {
    c.x = md.spawnX;
    c.y = md.spawnY;
    c.seg = 0;
  } else {
    c.hp = 0;
  }
}

/** Drops creeps that died or left the Map this tick. Order is kept, so the list stays sorted by id. */
export function removeGoneCreeps(state: GameState): void {
  const creeps = state.creeps;
  let w = 0;
  for (let i = 0; i < creeps.length; i++) {
    const c = creeps[i]!;
    if (c.hp > 0) creeps[w++] = c;
  }
  creeps.length = w;
}
