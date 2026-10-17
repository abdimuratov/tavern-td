// The dev sandbox: a playable Run of the core's `test` Game Mode until Gem
// lands. It is the app's only boot target for now and is loaded through a
// dynamic import, so the main menu can replace it without the test mode
// shipping in the main bundle. Add `?stress` to the URL for 300 creeps
// against 80 towers, and `?fps` for a frame-rate readout.

import { signal } from '@preact/signals';
import { footprintAt } from '../render/footprint';
import { DEFAULT_LOOK } from '../render/look';
import { cellCol, cellRow, type Command, type Json, type MapSpec, type RunOptions, type WaveSpec } from '../sim';
import { TEST_TOWERS } from '../sim/testing';
import type { ModeUi, UiAction } from '../ui/mode-ui';
import type { PlayTarget } from './game';

/** Spawn on the left, checkpoints top and bottom, the exit on the right, so the route crosses the middle twice. */
export const SANDBOX_MAP: MapSpec = {
  id: 'sandbox',
  cols: 20,
  rows: 12,
  terrain: [
    '.........,,.........',
    '.........,,.........',
    '....#...............',
    '....#........#......',
    '....................',
    ',,................,,',
    ',,................,,',
    '....................',
    '......#.......#.....',
    '..............#.....',
    '.........,,.........',
    '.........,,.........',
  ],
  spawn: [0, 5],
  waypoints: [
    [[9, 0], [10, 0], [9, 1], [10, 1]],
    [[9, 10], [10, 10], [9, 11], [10, 11]],
    [[18, 5], [19, 5], [18, 6], [19, 6]],
  ],
};

export const SANDBOX_WAVES: readonly WaveSpec[] = [
  { groups: [{ creep: 'grunt', count: 8, interval: 0.9 }] },
  { groups: [{ creep: 'grunt', count: 10, interval: 0.7 }, { creep: 'troll', count: 2, interval: 1.5, delay: 4 }] },
  { groups: [{ creep: 'bat', count: 8, interval: 0.7 }] },
  { groups: [{ creep: 'troll', count: 8, interval: 0.8 }], hpMult: 1.2 },
  { groups: [{ creep: 'brute', count: 6, interval: 1.2 }] },
  { groups: [{ creep: 'grunt', count: 20, interval: 0.35 }], hpMult: 1.5 },
  { groups: [{ creep: 'bat', count: 12, interval: 0.5 }], hpMult: 1.5 },
  { groups: [{ creep: 'brute', count: 8, interval: 1 }, { creep: 'troll', count: 8, interval: 0.8, delay: 3 }], hpMult: 1.6 },
  { groups: [{ creep: 'grunt', count: 30, interval: 0.25 }], hpMult: 2 },
  { groups: [{ creep: 'brute', count: 1, interval: 0, hp: 4000 }, { creep: 'grunt', count: 10, interval: 0.4, delay: 1 }] },
  { groups: [{ creep: 'bat', count: 16, interval: 0.4 }, { creep: 'grunt', count: 16, interval: 0.4, delay: 2 }], hpMult: 2.4 },
  { groups: [{ creep: 'brute', count: 1, interval: 0, hp: 9000 }, { creep: 'brute', count: 6, interval: 1, delay: 2 }], hpMult: 3 },
];

/** WC3-style letters: the tower's initial where it is free, otherwise another letter of its name. S is Sell, P is pause. */
const KEYS: Readonly<Record<string, string>> = {
  arrow: 'a', dart: 'd', flak: 'f', cannon: 'c', frost: 'r', venom: 'v', sniper: 'n',
  hydra: 'h', breaker: 'b', stunner: 't', banner: 'e', totem: 'o', rock: 'k',
};

const picked = signal<string | null>('arrow');

function cost(spec: string): number {
  return TEST_TOWERS[spec]?.cost ?? 0;
}

/** The test mode's UI: a build menu of every tower, placement by footprint, and Sell for half the cost. */
export const SANDBOX_UI: ModeUi = {
  modeId: 'test',
  placement(view, p) {
    const spec = picked.value;
    if (!spec) return null;
    const s = view.state;
    const cells = footprintAt(s.map, p, TEST_TOWERS[spec]?.footprint ?? 1);
    if (!cells) return null;
    const cell = cells[0]!;
    const price = cost(spec);
    return {
      cells,
      spec,
      command: { type: 'place', spec, col: cellCol(s.map, cell), row: cellRow(s.map, cell) },
      error: s.gold < price ? 'not enough gold' : null,
      label: `${TEST_TOWERS[spec]!.name} · ${price} gold`,
    };
  },
  actions(view) {
    const gold = view.state.gold;
    return Object.entries(TEST_TOWERS).map(([id, t]): UiAction => ({
      id,
      label: t.name,
      detail: String(t.cost ?? 0),
      ...(KEYS[id] ? { key: KEYS[id] } : {}),
      active: picked.value === id,
      dim: gold < (t.cost ?? 0),
      swatch: DEFAULT_LOOK.tower(id, t).color,
      run: () => {
        picked.value = picked.value === id ? null : id;
        view.refresh();
      },
    }));
  },
  towerActions(view, tower) {
    const refund = Math.floor(cost(tower.spec) / 2);
    return [{
      id: 'sell', label: 'Sell', detail: `+${refund}`, key: 's', tone: 'danger',
      run: () => {
        view.send({ type: 'sell', tower: tower.id });
        view.select(0);
      },
    }];
  },
  cancel() {
    picked.value = null;
  },
};

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

const PLAY: PlayTarget = {
  ui: SANDBOX_UI,
  runOptions: (): RunOptions => ({
    mode: 'test',
    seed: randomSeed(),
    difficulty: 'normal',
    map: SANDBOX_MAP,
    options: { gold: 400, lives: 20, waves: SANDBOX_WAVES as unknown as Json },
  }),
};

const STRESS_COLS = 40;
const STRESS_ROWS = 24;
const ATTACKERS = ['arrow', 'cannon', 'frost', 'venom', 'sniper', 'hydra', 'breaker', 'stunner', 'dart', 'flak'];

/** The PLAN's performance budget as a Run: 300 creeps that never die walking past 80 towers. */
function stressMap(): MapSpec {
  const grid = Array.from({ length: STRESS_ROWS }, () => Array.from({ length: STRESS_COLS }, () => '.'));
  const rows = [0, 4, 8, 12, 16, 20];
  const waypoints = rows.map((row, i) => {
    const col = i % 2 === 0 ? STRESS_COLS - 1 : 0;
    return [[col, row], [col, row + 1]] as [number, number][];
  });
  for (const [c, r] of [[0, 0], ...waypoints.flat()] as [number, number][]) grid[r]![c] = ',';
  return { id: 'stress', cols: STRESS_COLS, rows: STRESS_ROWS, terrain: grid.map((r) => r.join('')), spawn: [0, 0], waypoints };
}

const STRESS: PlayTarget = {
  ui: SANDBOX_UI,
  runOptions: (): RunOptions => ({
    mode: 'test',
    seed: randomSeed(),
    difficulty: 'normal',
    map: stressMap(),
    options: { gold: 1_000_000, lives: 20, leak: 'restart', waves: [{ groups: [{ creep: 'brute', count: 300, interval: 0.15, hp: 1e9 }] }] },
  }),
  opening(): Command[] {
    const out: Command[] = [];
    for (let row = 2, k = 0; row < STRESS_ROWS && k < 80; row += 3) {
      for (let col = 2; col < STRESS_COLS - 1 && k < 80; col += 4, k++) {
        out.push({ type: 'place', spec: ATTACKERS[k % ATTACKERS.length]!, col, row });
      }
    }
    out.push({ type: 'startWave' });
    return out;
  },
};

export function sandboxTarget(search: string): PlayTarget {
  return new URLSearchParams(search).has('stress') ? STRESS : PLAY;
}
