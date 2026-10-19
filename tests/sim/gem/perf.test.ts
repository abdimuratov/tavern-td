import { expect, it } from 'vitest';
import { allRouteCells, replay, snapshot, type Command, type GameState, type ReplayEntry } from '../../../src/sim';
import { mean, steadyTicks } from '../helpers';
import { playRun } from './bot';

// PLAN §2's budget: a tick in 4 ms or less on a phone, about 3× slower than a
// dev Mac. CI's runners are 2–3× slower than the Mac, so these budgets sit
// several times above the Mac's numbers. Gem's heaviest work is building the
// flow fields again after the maze changes: all 8 regions of the 95 × 71 Map,
// once per Draft gem placed (the board's route line asks at once) or at the
// next creep step. It takes about 0.8 ms on the Mac (2.5 ms on a phone), once
// per change rather than every tick, so its budget leaves a runner room. Times
// are the least of several tries, so a GC pause on a busy runner doesn't count.

/** Building the flow fields and tracing the route, and a Wave tick on average, in ms. */
const REBUILD_BUDGET = 4;
const WAVE_BUDGET = 0.15;

it('builds the flow fields of the bot\'s Wave 10 maze and steps its Wave within the budget', { timeout: 30_000 }, () => {
  const log: ReplayEntry[] = [];
  playRun(1, 'normal', 15_600, { record: log });
  const keep = log.find((e) => e.command.type === 'gem.keep' && e.tick >= 15_000)!;
  const r = { mode: 'gem', seed: 1, difficulty: 'normal' as const, log };
  const before = replay(r, keep.tick);
  allRouteCells(before);
  let rebuild = Infinity;
  for (let i = 0; i < 8; i++) {
    before.pathVersion++;
    const t0 = performance.now();
    allRouteCells(before);
    rebuild = Math.min(rebuild, performance.now() - t0);
  }
  const at = (s: GameState): readonly Command[] => log.filter((e) => e.tick === s.tick).map((e) => e.command as Command);
  // The keep, then 300 ticks of Wave 10; a running game already holds the maze's flow fields.
  const { times, state } = steadyTicks(snapshot(before), 301, 3, { prepare: (s) => void allRouteCells(s), commands: at });
  const wave = times.slice(1);
  console.log(`gem: flow fields ${rebuild.toFixed(3)} ms, keep tick ${times[0]!.toFixed(3)} ms, Wave tick ${(mean(wave) * 1000).toFixed(1)} µs mean, `
    + `${Math.max(...wave).toFixed(3)} ms worst; ${state.towers.length} structures, ${state.creeps.length} creeps`);
  expect(state.phase).toBe('wave');
  expect(state.creeps.length).toBeGreaterThan(0);
  expect(rebuild).toBeLessThan(REBUILD_BUDGET);
  expect(Math.max(...times)).toBeLessThan(REBUILD_BUDGET);
  expect(mean(wave)).toBeLessThan(WAVE_BUDGET);
});
