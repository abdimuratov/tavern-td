import { difficultyHp, removeGoneCreeps, spawnCreep } from '../combat/creeps';
import { getMode, waveProblems } from '../modes/registry';
import { spawnCount } from '../path/grid';
import { routeCount } from '../path/route';
import { TICK_RATE } from './constants';
import type { SimEvent } from './events';
import type { GameModeRules, Sim } from './mode';
import type { WaveGroup, WaveSpec } from './specs';
import type { ActiveWave, Difficulty, GameState, SpawnGroup } from './state';

/** What each creep of a Wave group spawns with. */
export interface WaveGroupNumbers {
  readonly hp: number;
  /** World units per second. */
  readonly speed: number;
  readonly bounty: number;
}

/**
 * The HP, speed and bounty each creep of group `g` of Wave `spec` spawns with
 * at `difficulty`: its own HP (else the Wave's, else the creep's) × the mode's
 * Difficulty factor × the Wave's hpMult, rounded and at least 1; the creep's
 * speed × speedMult; its bounty × bountyMult. startNextWave uses it, and the
 * Waves tab reads the same numbers.
 */
export function waveGroupNumbers(rules: GameModeRules, spec: WaveSpec, g: WaveGroup, difficulty: Difficulty): WaveGroupNumbers {
  const cs = rules.creeps[g.creep]!;
  const hpScale = difficultyHp(rules, difficulty) * (spec.hpMult ?? 1);
  return {
    hp: Math.max(1, Math.round((g.hp ?? spec.hp ?? cs.hp) * hpScale)),
    speed: cs.speed * (spec.speedMult ?? 1),
    bounty: (g.bounty ?? cs.bounty) * (spec.bountyMult ?? 1),
  };
}

/**
 * Starts the next Wave, or returns why it can't. The startWave command uses
 * this; a Game Mode that starts Waves itself (Gem after the Draft, timed Waves) calls it too.
 */
export function startNextWave(state: GameState, events: SimEvent[]): string | null {
  const rules = getMode(state.modeId);
  if (state.phase === 'won' || state.phase === 'lost') return 'the Run is over';
  if (state.phase === 'wave' && !rules.overlapWaves) return 'a Wave is still running';
  const index = state.wave.number;
  if (index >= state.wave.total) return 'no Waves left';
  const refused = rules.canStartWave?.(state) ?? null;
  if (refused !== null) return refused;
  const spec = rules.waveFor ? rules.waveFor(index, state) : rules.waves?.[index];
  if (!spec) return 'no such Wave';
  const problems = waveProblems(rules, spec, `Wave ${index + 1}`);
  const routes = routeCount(state.map);
  for (const g of spec.groups) {
    if (g.route !== undefined && g.route >= Math.max(1, routes)) problems.push(`Wave ${index + 1}: Map ${state.map.id} has no route ${g.route}`);
    if (g.spawn !== undefined && g.spawn >= spawnCount(state.map)) problems.push(`Wave ${index + 1}: Map ${state.map.id} has no spawn ${g.spawn}`);
  }
  if (problems.length > 0) throw new Error(`Game Mode ${rules.id}: ${problems.join('; ')}`);

  const groups: SpawnGroup[] = spec.groups.map((g) => {
    const { hp, speed, bounty } = waveGroupNumbers(rules, spec, g, state.difficulty);
    const group: SpawnGroup = {
      creep: g.creep,
      count: g.count,
      spawned: 0,
      start: state.tick + (g.delay ?? 0) * TICK_RATE,
      interval: g.interval * TICK_RATE,
      hp,
      speed,
      bounty,
    };
    // Only groups that name a route carry one, so Runs on one-route Maps serialize as before.
    if (g.route !== undefined) group.route = g.route;
    if (g.spawn !== undefined) group.spawn = g.spawn;
    return group;
  });
  const number = index + 1;
  state.wave.number = number;
  state.wave.active.push({ number, groups });
  state.phase = 'wave';
  events.push({ type: 'waveStart', wave: number });
  rules.onWaveStart?.(state, number, events);
  return null;
}

/** Spawns whatever is due this tick. */
export function runWaves(sim: Sim): void {
  const { state, events } = sim;
  for (const wave of state.wave.active) {
    for (const g of wave.groups) {
      while (g.spawned < g.count && Math.round(g.start + g.spawned * g.interval) <= state.tick) {
        g.spawned++;
        spawnCreep(state, g.creep, {
          wave: wave.number, hp: g.hp, speed: g.speed, bounty: g.bounty,
          ...(g.route === undefined ? {} : { route: g.route }),
          ...(g.spawn === undefined ? {} : { spawn: g.spawn }),
        }, events);
      }
    }
  }
}

function waveDone(state: GameState, wave: ActiveWave): boolean {
  return wave.groups.every((g) => g.spawned >= g.count) && !state.creeps.some((c) => c.wave === wave.number);
}

/** Clears the dead, ends finished Waves, then settles the phase: lost, won, or back to building. */
export function endTick(sim: Sim): void {
  const { state, rules, events } = sim;
  removeGoneCreeps(state);
  const active = state.wave.active;
  if (active.length > 0) {
    const ended: number[] = [];
    let w = 0;
    for (const wave of active) {
      if (waveDone(state, wave)) ended.push(wave.number);
      else active[w++] = wave;
    }
    active.length = w;
    for (const number of ended) {
      events.push({ type: 'waveEnd', wave: number });
      rules.onWaveEnd?.(state, number, events);
    }
  }
  if (state.lives <= 0) {
    state.phase = 'lost';
    events.push({ type: 'lost' });
    return;
  }
  if (state.phase === 'wave' && state.wave.active.length === 0) {
    if (state.wave.number >= state.wave.total) {
      state.phase = 'won';
      events.push({ type: 'won' });
    } else {
      state.phase = 'build';
    }
  }
}
