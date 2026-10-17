import { addTower, removeTower } from '../combat/towers';
import { WC3_DAMAGE_TABLE } from '../combat/damage';
import { findTower } from '../combat/targeting';
import { hasSpec, intArg, reject, stringArg, type Command } from '../core/commands';
import type { SimEvent } from '../core/events';
import type { GameModeRules } from '../core/mode';
import type { CreepSpec, MapSpec, TowerSpec, WaveSpec } from '../core/specs';
import type { GameState } from '../core/state';
import { canAfford, earnGold, spendGold } from '../economy';
import { placementError } from '../path/block';
import { cellOf, setMap } from '../path/grid';

// A small Game Mode that exercises the whole core: tests, the replay fixture and
// the WebKit-vs-Node hash check run on it. Not a mode players see.

export interface TestModeState {
  /** What a leaked creep does. `restart` keeps creeps on the Map for the performance test. */
  leak: 'remove' | 'restart';
  /** Waves from the run options, or null for TEST_WAVES. */
  waves: WaveSpec[] | null;
}

export type PlaceCommand = { readonly type: 'place'; readonly spec: string; readonly col: number; readonly row: number };
export type SellCommand = { readonly type: 'sell'; readonly tower: number };

/** Spawn top-left, checkpoint top-right, checkpoint bottom-left, exit bottom-right: a Z with a rock in the middle. */
export const TEST_MAP: MapSpec = {
  id: 'test-z',
  cols: 12,
  rows: 9,
  terrain: [
    ',,........,,',
    ',,........,,',
    '............',
    '....##......',
    '....##......',
    '............',
    '............',
    ',,........,,',
    ',,........,,',
  ],
  spawn: [0, 0],
  waypoints: [
    [[10, 0], [11, 0], [10, 1], [11, 1]],
    [[0, 7], [1, 7], [0, 8], [1, 8]],
    [[10, 7], [11, 7], [10, 8], [11, 8]],
  ],
};

const attack = (a: Partial<NonNullable<TowerSpec['attack']>>): NonNullable<TowerSpec['attack']> => ({
  damage: [10, 10], cooldown: 1, range: 300, attackType: 'normal', targets: 'both', projectileSpeed: 0, ...a,
});

export const TEST_TOWERS: Readonly<Record<string, TowerSpec>> = {
  arrow: { name: 'Arrow', cost: 10, attack: attack({ damage: [8, 12], attackType: 'pierce', projectileSpeed: 900 }) },
  dart: { name: 'Dart', cost: 5, attack: attack({}) },
  flak: { name: 'Flak', cost: 15, attack: attack({ damage: [12, 16], cooldown: 0.8, range: 400, attackType: 'pierce', targets: 'air', projectileSpeed: 1200 }) },
  cannon: {
    name: 'Cannon', cost: 25,
    attack: attack({ damage: [20, 20], cooldown: 2, range: 350, attackType: 'siege', targets: 'ground', projectileSpeed: 700,
      effects: [{ kind: 'splash', bands: [[60, 1], [120, 0.5], [180, 0.25]] }] }),
  },
  frost: { name: 'Frost', cost: 20, attack: attack({ damage: [4, 4], attackType: 'magic', targets: 'ground', effects: [{ kind: 'slow', amount: 0.5, duration: 2 }] }) },
  venom: { name: 'Venom', cost: 20, attack: attack({ damage: [2, 2], cooldown: 1.5, effects: [{ kind: 'poison', dps: 15, duration: 3 }] }) },
  sniper: { name: 'Sniper', cost: 20, attack: attack({ damage: [15, 25], cooldown: 2, range: 500, attackType: 'pierce', projectileSpeed: 1500, effects: [{ kind: 'crit', chance: 0.25, multiplier: 3 }] }) },
  hydra: { name: 'Hydra', cost: 25, attack: attack({ damage: [6, 6], attackType: 'magic', effects: [{ kind: 'multishot', count: 3 }] }) },
  breaker: { name: 'Breaker', cost: 15, attack: attack({ damage: [3, 3], effects: [{ kind: 'armor', amount: 4, duration: 3 }] }) },
  stunner: { name: 'Stunner', cost: 20, attack: attack({ damage: [5, 5], effects: [{ kind: 'stun', chance: 0.2, duration: 1 }] }) },
  banner: {
    name: 'Banner', cost: 30,
    auras: [{ kind: 'attackSpeed', to: 'towers', radius: 200, value: 0.5 }, { kind: 'damage', to: 'towers', radius: 200, value: 0.25 }],
  },
  totem: {
    name: 'Totem', cost: 30,
    auras: [{ kind: 'armor', to: 'creeps', radius: 250, value: 3 }, { kind: 'slow', to: 'creeps', radius: 250, value: 0.2, targets: 'ground' }],
  },
  rock: { name: 'Rock' },
};

export const TEST_CREEPS: Readonly<Record<string, CreepSpec>> = {
  grunt: { name: 'Grunt', hp: 80, armor: 0, armorType: 'medium', speed: 270, flying: false, bounty: 2 },
  brute: { name: 'Brute', hp: 260, armor: 4, armorType: 'heavy', speed: 220, flying: false, bounty: 6, leakCost: 2 },
  bat: { name: 'Bat', hp: 60, armor: 0, armorType: 'light', speed: 320, flying: true, bounty: 3 },
  troll: { name: 'Troll', hp: 120, armor: 1, armorType: 'medium', speed: 250, flying: false, bounty: 4, regen: 4 },
};

export const TEST_WAVES: readonly WaveSpec[] = [
  { groups: [{ creep: 'grunt', count: 6, interval: 1 }] },
  { groups: [{ creep: 'bat', count: 5, interval: 0.8 }] },
  { groups: [{ creep: 'grunt', count: 6, interval: 0.7 }, { creep: 'troll', count: 3, interval: 1.5, delay: 2 }], hpMult: 1.2 },
  { groups: [{ creep: 'brute', count: 4, interval: 1.2 }, { creep: 'bat', count: 3, interval: 1, delay: 3 }], bountyMult: 2 },
];

type State = GameState<TestModeState>;

function place(state: State, command: Command, events: SimEvent[]): void {
  const spec = stringArg(command, 'spec');
  const col = intArg(command, 'col');
  const row = intArg(command, 'row');
  if (spec === null || col === null || row === null) return reject(events, command, 'place needs spec, col and row');
  if (!hasSpec(TEST_TOWERS, spec)) return reject(events, command, `no tower ${spec}`);
  const cost = TEST_TOWERS[spec]!.cost ?? 0;
  if (!canAfford(state, cost)) return reject(events, command, 'not enough gold');
  const cell = cellOf(state.map, col, row);
  const error = placementError(state, [cell]);
  if (error) return reject(events, command, error);
  spendGold(state, cost, events);
  addTower(state, spec, cell, events);
}

function sell(state: State, command: Command, events: SimEvent[]): void {
  const id = intArg(command, 'tower');
  const tower = id === null ? undefined : findTower(state, id);
  if (!tower) return reject(events, command, 'no such tower');
  const refund = Math.floor((TEST_TOWERS[tower.spec]?.cost ?? 0) / 2);
  removeTower(state, tower.id, events);
  earnGold(state, refund, events);
}

export const TEST_MODE: GameModeRules<TestModeState> = {
  id: 'test',
  towers: TEST_TOWERS,
  creeps: TEST_CREEPS,
  damageTable: WC3_DAMAGE_TABLE,
  waves: TEST_WAVES,
  waveFor: (index, state) => (state.mode.waves ?? TEST_WAVES)[index],
  setup(state, opts) {
    setMap(state, typeof opts.map === 'object' ? opts.map : TEST_MAP);
    const o = opts.options ?? {};
    const waves = Array.isArray(o['waves']) ? (o['waves'] as unknown as WaveSpec[]) : null;
    state.gold = typeof o['gold'] === 'number' ? o['gold'] : 200;
    state.lives = typeof o['lives'] === 'number' ? o['lives'] : 10;
    state.mode = { leak: o['leak'] === 'restart' ? 'restart' : 'remove', waves };
    state.wave.total = (waves ?? TEST_WAVES).length;
  },
  handleCommand(state, command, events) {
    if (command.type === 'place') place(state, command, events);
    else if (command.type === 'sell') sell(state, command, events);
    else return false;
    return true;
  },
  onWaveEnd(state, wave, events) {
    earnGold(state, 5 + wave, events);
  },
  onLeak: (state, creep) => ({ lives: TEST_CREEPS[creep.spec]?.leakCost ?? 1, then: state.mode.leak }),
};
