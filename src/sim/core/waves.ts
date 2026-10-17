import { difficultyHp, removeGoneCreeps, spawnCreep } from '../combat/creeps';
import { getMode, waveProblems } from '../modes/registry';
import { routeCount } from '../path/route';
import { TICK_RATE } from './constants';
import type { SimEvent } from './events';
import type { Sim } from './mode';
import type { ActiveWave, GameState, SpawnGroup } from './state';

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
  }
  if (problems.length > 0) throw new Error(`Game Mode ${rules.id}: ${problems.join('; ')}`);

  const hpScale = difficultyHp(rules, state.difficulty) * (spec.hpMult ?? 1);
  const groups: SpawnGroup[] = spec.groups.map((g) => {
    const cs = rules.creeps[g.creep]!;
    const group: SpawnGroup = {
      creep: g.creep,
      count: g.count,
      spawned: 0,
      start: state.tick + (g.delay ?? 0) * TICK_RATE,
      interval: g.interval * TICK_RATE,
      hp: Math.max(1, Math.round((g.hp ?? spec.hp ?? cs.hp) * hpScale)),
      speed: cs.speed * (spec.speedMult ?? 1),
      bounty: (g.bounty ?? cs.bounty) * (spec.bountyMult ?? 1),
    };
    // Only groups that name a route carry one, so Runs on one-route Maps serialize as before.
    if (g.route !== undefined) group.route = g.route;
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
        const opts = { wave: wave.number, hp: g.hp, speed: g.speed, bounty: g.bounty };
        spawnCreep(state, g.creep, g.route === undefined ? opts : { ...opts, route: g.route }, events);
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
