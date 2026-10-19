import { expect, it } from 'vitest';
import { STAGES } from '../../../src/content/original';
import { placeOnRoute, snapshot, spawnCreep, step } from '../../../src/sim';
import { mean, steadyTicks } from '../helpers';
import { newRun, placeTower, setLevel } from './helpers';

// PLAN §2's budget: a tick in 4 ms or less on a phone, about 3× slower than a
// dev Mac; CI's runners are 2–3× slower than the Mac. The Original's busiest
// Waves bring 30–80 creeps against at most 14 towers, so this doubles that:
// Three Gates with every Build Spot holding a Specialisation at Tower Level 10
// (Perks, auras, beams, clouds, bounces and freezes all at work) and 150
// creeps of every kind but the bosses walking its three routes and air lines.

/** A tick on average, and the worst, each the least of three plays, in ms. */
const MEAN_BUDGET = 0.4;
const WORST_BUDGET = 2;

const TOP = ['ranger_lodge', 'thunder_mortar', 'blizzard_spire', 'arcane_lance', 'plague_cauldron', 'war_totem', 'deadeye_perch',
  'flak_battery', 'rime_lance', 'prism_tower', 'widows_fang', 'storm_totem'];
const CREEPS = ['ghoul', 'hound', 'crawler', 'bloodbat', 'revenant', 'cultist', 'flesh_golem', 'bloater', 'shieldbearer', 'gargoyle'];

it('steps 150 creeps against 14 Level 10 Specialisations on Three Gates within the budget', () => {
  const stage = STAGES.find((s) => s.name === 'Three Gates')!;
  const s = newRun({ stage: stage.number });
  // Leaks cost lives and nothing else here; the Run must not end mid-measure.
  s.lives = 1_000_000;
  stage.map.buildSpots!.forEach((_, spot) => setLevel(s, placeTower(s, spot, TOP[spot % TOP.length]!), 10));
  const routes = stage.map.routes!.length;
  for (let i = 0; i < 150; i++) {
    const c = spawnCreep(s, CREEPS[i % CREEPS.length]!, { wave: 0, route: i % routes, hp: 1e9 }, []);
    placeOnRoute(s, c, (i * 97) % 1400);
  }
  // One tick first on each copy builds the Map's caches, as a running game already has them.
  const { times, state } = steadyTicks(snapshot(s), 300, 3, { prepare: (copy) => void step(copy, []) });
  console.log(`original: ${(mean(times) * 1000).toFixed(1)} µs mean, ${Math.max(...times).toFixed(3)} ms worst over 300 ticks; `
    + `${state.towers.length} towers, ${state.creeps.length} creeps at the end`);
  expect(state.towers).toHaveLength(14);
  expect(state.creeps.length).toBeGreaterThanOrEqual(100);
  expect(state.phase).not.toBe('lost');
  expect(mean(times)).toBeLessThan(MEAN_BUDGET);
  expect(Math.max(...times)).toBeLessThan(WORST_BUDGET);
});
