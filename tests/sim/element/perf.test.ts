import { expect, it } from 'vitest';
import { ELEMENT_MAP } from '../../../src/content/element';
import { step } from '../../../src/sim';
import { creepOnRoute, newElementRun, placeTower } from './helpers';

// PLAN §2 budget: a tick in 4 ms or less with 300 creeps and 80 towers on an
// iPhone. Element's area abilities and stacking DoTs are the heavy part.

const FAMILIES = [
  'poison_tower_3', 'flame_tower_3', 'roots_tower_3', 'erosion_tower_3', 'flamethrower_tower_3', 'periodic_tower',
  'electricity_tower_3', 'nova_tower_3', 'vapor_tower_3', 'windstorm_tower_3', 'jinx_tower_3', 'flooding_tower_3',
  'hail_tower_3', 'quake_tower_3', 'muck_tower_3', 'tidal_tower_3', 'water_tower', 'dark_tower', 'earth_tower', 'enchantment_tower_3',
];

it('steps 300 creeps against 80 Element towers within the budget', () => {
  const s = newElementRun();
  const t = ELEMENT_MAP.terrain;
  const spots: [number, number][] = [];
  const used = new Set<string>();
  for (let row = 0; row + 1 < 40; row += 2) {
    for (let col = 0; col + 1 < 56; col += 2) {
      if ([t[row]![col], t[row]![col + 1], t[row + 1]![col], t[row + 1]![col + 1]].every((ch) => ch === '.')) spots.push([col, row]);
    }
  }
  for (let i = 0; i < 80; i++) {
    const [col, row] = spots[i % spots.length]!;
    if (used.has(`${col},${row}`)) continue;
    used.add(`${col},${row}`);
    placeTower(s, FAMILIES[i % FAMILIES.length]!, col, row);
  }
  for (let i = 0; i < 300; i++) {
    const c = creepOnRoute(s, `full-${1 + (i % 50)}`, (i * 47) % 14000, 1e12);
    c.speed = 10;
  }
  for (let i = 0; i < 60; i++) step(s, []);
  const TICKS = 300;
  const start = performance.now();
  let max = 0;
  for (let i = 0; i < TICKS; i++) {
    const t0 = performance.now();
    step(s, []);
    max = Math.max(max, performance.now() - t0);
  }
  const mean = (performance.now() - start) / TICKS;
  console.log(`element step: ${mean.toFixed(3)} ms mean, ${max.toFixed(2)} ms max over ${TICKS} ticks; ${s.creeps.length} creeps, ${s.towers.length} towers, ${s.mode.timers.length} timers`);
  expect(s.creeps.length).toBe(300);
  expect(mean).toBeLessThan(4);
});
