import { expect, it } from 'vitest';
import { AI_PROFILES, LW_SENDS, fieldSpawns } from '../../../src/content/linewars';
import { TICK_RATE, linewars, snapshot, spawnCreep } from '../../../src/sim';
import { mean, steadyTicks } from '../helpers';
import { newRun, runTo } from './helpers';

// PLAN §2's budget: a tick in 4 ms or less on a phone, about 3× slower than a
// dev Mac; CI's runners are 2–3× slower than the Mac. Line Wars' heaviest
// ticks are the AI's thinks (ADR-0003): an Insane Rival thinking twice a
// second with up to four actions, against the competent AI on your Side. Two
// minutes of one Run: 4:10–5:10, while both Fields are mazed and a think can
// build several Walls, and 14:40–15:40, Sudden Death's salvos with both Fields
// topped up to the cap of 40 slow, unkillable creeps each.

/** In ms: a tick on average; the worst think, the first after loading the state (every cache cold) and the worst other tick. Each the least of three plays. */
const MEAN_BUDGET = 0.25;
const THINK_BUDGET = 2.5;
const COLD_THINK_BUDGET = 4;
const OTHER_BUDGET = 1;

const EVERY = [AI_PROFILES.competent.think * TICK_RATE, AI_PROFILES.insane.think * TICK_RATE] as const;
const thinks = (tick: number): boolean => tick % EVERY[0] === 0 || (tick - Math.floor(EVERY[1] / 2)) % EVERY[1] === 0;
/** A loaded state's first second: each AI builds its Field maps, routes and towers' reach from nothing. */
const WARM_UP = TICK_RATE;

it('steps both Fields and both AIs\' thinking within the budget, mazing and in Sudden Death', { timeout: 30_000 }, () => {
  const s = newRun({ drivers: ['ai', 'ai'], difficulty: 'insane', seed: 2, race: 'rimeborn', rivalRace: 'mirefolk' });
  const all: number[] = [];
  const think: number[] = [];
  const cold: number[] = [];
  const other: number[] = [];
  const lines: string[] = [];
  for (const [at, topUp] of [[250, false], [880, true]] as const) {
    runTo(s, at * TICK_RATE);
    if (topUp) {
      for (const side of [0, 1] as const) {
        s.mode.sides[side].lives = 1000;
        const [first, count] = fieldSpawns(side);
        for (let i = 0; s.creeps.filter((c) => linewars.creepField(c) === side).length < 40; i++) {
          spawnCreep(s, LW_SENDS[i % 2 === 0 ? 'brawler' : 'harpies'].creep, { wave: 0, spawn: first + (i % count), hp: 1e9, speed: 40 }, []);
        }
      }
    }
    const from = s.tick;
    const { times, state } = steadyTicks(snapshot(s), 60 * TICK_RATE, 3);
    times.forEach((ms, i) => (!thinks(from + i) ? other : i < WARM_UP ? cold : think).push(ms));
    all.push(...times);
    lines.push(`${at} s: ${state.towers.length} towers, ${state.creeps.length} creeps at the end`);
    expect(linewars.lwState(state).result).toBe('playing');
  }
  console.log(`linewars: ${(mean(all) * 1000).toFixed(1)} µs mean; think ${(mean(think) * 1000).toFixed(1)} µs mean, ${Math.max(...think).toFixed(3)} ms worst, `
    + `first after loading ${Math.max(...cold).toFixed(3)} ms; other ticks ${Math.max(...other).toFixed(3)} ms worst; ${lines.join('; ')}`);
  expect(think.length + cold.length).toBe(2 * 60 * 3);
  expect(mean(all)).toBeLessThan(MEAN_BUDGET);
  expect(Math.max(...think)).toBeLessThan(THINK_BUDGET);
  expect(Math.max(...cold)).toBeLessThan(COLD_THINK_BUDGET);
  expect(Math.max(...other)).toBeLessThan(OTHER_BUDGET);
});
