import { expect, it } from 'vitest';
import { MAUL_TOWERS, RACE_SPECS } from '../../../src/content/maul';
import { cellOf, placementError, snapshot, spawnCreep, step, type Command, type GameState } from '../../../src/sim';
import { mean, steadyTicks } from '../helpers';
import { mazeBlueprint } from './bot';
import { newRun, placeTower } from './helpers';

// PLAN §2's budget: a tick in 4 ms or less on a phone, about 3× slower than a
// dev Mac; CI's runners are 2–3× slower than the Mac. A late Maul Wave brings
// up to 40 creeps into a maze of about 70 towers; this takes 80 Tier 3 towers
// of all four Races on the bot's maze and the field around it, 150 creeps of
// every kind but the bosses streaming in from both gates, and a Wall built
// mid-Wave (the Block check, Juggle check and flow fields built again).

/** A tick on average, and the worst (the build), each the least of three plays, in ms. */
const MEAN_BUDGET = 0.5;
const WORST_BUDGET = 2.5;

const TIER3 = Object.entries(MAUL_TOWERS).filter(([, t]) => t.maul.tier === 3).map(([id]) => id);
const CREEPS = ['raider', 'snowling', 'frost_wolf', 'brute', 'golem', 'troll', 'wraith', 'harpy'];

function footprint(s: GameState, col: number, row: number): number[] {
  return [cellOf(s.map, col, row), cellOf(s.map, col + 1, row), cellOf(s.map, col, row + 1), cellOf(s.map, col + 1, row + 1)];
}

it('steps 150 creeps through a maze of 80 Tier 3 towers, with a Wall built mid-Wave, within the budget', () => {
  const s = newRun({ race: 'ironclad', gold: 100_000 });
  s.lives = 1_000_000;
  const spots = [...mazeBlueprint()];
  for (let row = 3; row < s.map.rows - 1; row += 4) for (let col = 1; col < s.map.cols - 1; col += 3) spots.push([col, row]);
  for (const [col, row] of spots) {
    if (s.towers.length >= 80) break;
    if (placementError(s, footprint(s, col, row)) === null) placeTower(s, TIER3[s.towers.length % TIER3.length]!, col, row);
  }
  for (let i = 0; i < 300; i++) {
    if (i % 2 === 0) spawnCreep(s, CREEPS[(i / 2) % CREEPS.length]!, { wave: 0, spawn: (i / 2) % 2, hp: 1e9 }, []);
    step(s, []);
  }
  const wall = RACE_SPECS.ironclad.builds[0];
  const free = spots.find(([col, row]) => placementError(s, footprint(s, col, row)) === null)!;
  const build: Command = { type: 'maul.build', spec: wall, col: free[0], row: free[1] };
  let first = -1;
  const { times, state } = steadyTicks(snapshot(s), 300, 3, {
    prepare: (copy) => {
      step(copy, []);
      first = copy.tick;
    },
    commands: (copy) => (copy.tick === first ? [build] : []),
  });
  console.log(`maul: ${(mean(times) * 1000).toFixed(1)} µs mean, build tick ${times[0]!.toFixed(3)} ms, worst ${Math.max(...times).toFixed(3)} ms; `
    + `${state.towers.length} towers, ${state.creeps.length} creeps`);
  expect(state.towers.length).toBe(81);
  expect(state.creeps.length).toBe(150);
  expect(MAUL_TOWERS[state.towers[state.towers.length - 1]!.spec]!.maul.tier).toBe(0);
  expect(mean(times)).toBeLessThan(MEAN_BUDGET);
  expect(Math.max(...times)).toBeLessThan(WORST_BUDGET);
});
