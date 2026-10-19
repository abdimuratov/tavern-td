import { expect, it } from 'vitest';
import { STAGES } from '../../../src/content/original';
import { original, placeOnRoute, routePolyline, snapshot, spawnCreep, step } from '../../../src/sim';
import { mean, steadyTicks } from '../helpers';
import { newRun, placeTower, setLevel } from './helpers';

// PLAN §2's budget: a tick in 4 ms or less on a phone, about 3× slower than a
// dev Mac; CI's runners are 2–3× slower than the Mac. The Original's busiest
// Waves bring 30–80 creeps, and free placement lets gold alone limit the
// towers, which a late Stage buys 20–30 of. So this goes past both: Three
// Gates with 40 towers beside its roads, each a Specialisation at Tower Level
// 10 (Perks, auras, beams, clouds, bounces and freezes all at work), and 150
// creeps of every kind but the bosses walking its three routes and air lines.

/** A tick on average, and the worst, each the least of three plays, in ms: Element's, as the towers are nearly three times Build Spots' 14. */
const MEAN_BUDGET = 1;
const WORST_BUDGET = 4;

const TOP = ['ranger_lodge', 'thunder_mortar', 'blizzard_spire', 'arcane_lance', 'plague_cauldron', 'war_totem', 'deadeye_perch',
  'flak_battery', 'rime_lance', 'prism_tower', 'widows_fang', 'storm_totem'];
const CREEPS = ['ghoul', 'hound', 'crawler', 'bloodbat', 'revenant', 'cultist', 'flesh_golem', 'bloater', 'shieldbearer', 'gargoyle'];

/** The road within `range` of the centre of the 2 × 2 at (col, row), in samples 16 apart over every route. */
function roadNear(s: ReturnType<typeof newRun>, col: number, row: number, range: number): number {
  let n = 0;
  for (let r = 0; r < s.map.routes!.length; r++) {
    const line = routePolyline(s, r);
    for (let i = 1; i < line.length; i++) {
      const [a, b] = [line[i - 1]!, line[i]!];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 8; d < len; d += 16) {
        const x = a.x + ((b.x - a.x) * d) / len - (col + 1) * 64;
        const y = a.y + ((b.y - a.y) * d) / len - (row + 1) * 64;
        if (x * x + y * y <= range * range) n++;
      }
    }
  }
  return n;
}

it('steps 150 creeps against 40 Level 10 Specialisations on Three Gates within the budget', () => {
  const stage = STAGES.find((s) => s.name === 'Three Gates')!;
  const s = newRun({ stage: stage.number });
  // Leaks cost lives and nothing else here; the Run must not end mid-measure.
  s.lives = 1_000_000;
  // Free 2 × 2s that see plenty of road, row by row, until 40 stand.
  for (let row = 0; row < s.map.rows && s.towers.length < 40; row++) {
    for (let col = 0; col < s.map.cols && s.towers.length < 40; col++) {
      if (original.placeError(s, col, row) !== null || roadNear(s, col, row, 320) < 28) continue;
      setLevel(s, placeTower(s, [col, row], TOP[s.towers.length % TOP.length]!), 10);
    }
  }
  const routes = stage.map.routes!.length;
  for (let i = 0; i < 150; i++) {
    const c = spawnCreep(s, CREEPS[i % CREEPS.length]!, { wave: 0, route: i % routes, hp: 1e9 }, []);
    placeOnRoute(s, c, (i * 97) % 1400);
  }
  // One tick first on each copy builds the Map's caches, as a running game already has them.
  const { times, state } = steadyTicks(snapshot(s), 300, 3, { prepare: (copy) => void step(copy, []) });
  console.log(`original: ${(mean(times) * 1000).toFixed(1)} µs mean, ${Math.max(...times).toFixed(3)} ms worst over 300 ticks; `
    + `${state.towers.length} towers, ${state.creeps.length} creeps at the end`);
  expect(state.towers).toHaveLength(40);
  expect(state.creeps.length).toBeGreaterThanOrEqual(100);
  expect(state.phase).not.toBe('lost');
  expect(mean(times)).toBeLessThan(MEAN_BUDGET);
  expect(Math.max(...times)).toBeLessThan(WORST_BUDGET);
});
