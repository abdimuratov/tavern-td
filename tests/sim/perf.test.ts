import { expect, it } from 'vitest';
import { cellOf, createRun, step, type Command, type MapSpec } from '../../src/sim';
import { ofType, openMap } from './helpers';

// PLAN §2 budget: one tick in 4 ms or less with 300 creeps and 80 towers on an
// iPhone. Node on a dev machine or CI runner should sit far below that.

const COLS = 48;
const ROWS = 32;
/** Checkpoints on alternate edges, so the route sweeps back and forth past every tower. */
const MAP: MapSpec = openMap(COLS, ROWS, [0, 0],
  [0, 4, 8, 12, 16, 20, 24, 28].map((row, i) => (i % 2 === 0 ? [[COLS - 1, row], [COLS - 1, row + 1]] : [[0, row], [0, row + 1]])));
const ATTACKERS = ['arrow', 'cannon', 'frost', 'venom', 'sniper', 'hydra', 'breaker', 'stunner', 'dart', 'cannon'];

it('steps 300 creeps against 80 attacking towers within the budget', () => {
  const s = createRun({
    mode: 'test', seed: 7, difficulty: 'normal', map: MAP,
    options: { gold: 1_000_000, leak: 'restart', waves: [{ groups: [{ creep: 'brute', count: 300, interval: 0.3, hp: 1e9 }] }] },
  });
  const build: Command[] = [];
  // Isolated cells on a 4-cell lattice can't Block anything.
  for (let row = 2, k = 0; row < ROWS; row += 4) {
    for (let col = 4; col <= 40; col += 4, k++) build.push({ type: 'place', spec: ATTACKERS[k % ATTACKERS.length]!, col, row });
  }
  for (const [col, row] of [[10, 4], [22, 12], [34, 20], [14, 24], [30, 28], [42, 8]] as const) {
    build.push({ type: 'place', spec: col % 4 === 2 ? 'banner' : 'totem', col, row });
  }
  const placed = ofType(step(s, [...build, { type: 'startWave' }]), 'placed');
  expect(placed.filter((e) => e.spec !== 'banner' && e.spec !== 'totem')).toHaveLength(80);
  expect(s.grid[cellOf(MAP, 4, 2)]).not.toBe(0);

  while (s.creeps.length < 300) step(s, []);
  for (let i = 0; i < 30; i++) step(s, []);

  const TICKS = 300;
  let fires = 0;
  const shooters: number[] = [];
  const start = performance.now();
  for (let i = 0; i < TICKS; i++) {
    const shots = ofType(step(s, []), 'fire');
    fires += shots.length;
    for (const e of shots) shooters.push(e.tower);
  }
  const mean = (performance.now() - start) / TICKS;
  console.log(`sim step: ${mean.toFixed(3)} ms mean over ${TICKS} ticks, ${s.creeps.length} creeps, ${s.towers.length} towers, ${fires} shots`);

  expect(s.creeps).toHaveLength(300);
  expect(new Set(shooters).size).toBeGreaterThanOrEqual(60);
  expect(mean).toBeLessThan(4);
});
