import type { Replay } from '../core/replay';

/**
 * A fixed Element Run (Full, All Pick, Hard) touching the mode's systems: the
 * free first Element and an Elemental, builds, upgrades and a sale, refused
 * commands, send now, splash, bounces, Traits (undead, time lapse), Leaks that
 * restart the lap and pause interest. Node and WebKit must reach the same
 * replayHash on it (e2e/determinism.spec.ts can add it beside FIXTURE_REPLAY).
 */
export const ELEMENT_FIXTURE_REPLAY: Replay = {
  mode: 'element',
  seed: 20261017,
  difficulty: 'hard',
  options: { picks: 'allPick', length: 'full' },
  until: 9000,
  log: [
    { tick: 0, command: { type: 'element.summon', element: 'water' } },
    { tick: 0, command: { type: 'element.build', spec: 'water_tower', col: 17, row: 6 } },
    { tick: 0, command: { type: 'element.build', spec: 'basic_arrow_tower', col: 19, row: 6 } },
    { tick: 1, command: { type: 'element.sendNow' } },
    { tick: 2, command: { type: 'element.build', spec: 'basic_cannon_tower', col: 1, row: 31 } },
    { tick: 900, command: { type: 'element.build', spec: 'basic_cannon_tower', col: 21, row: 6 } },
    { tick: 3000, command: { type: 'element.upgrade', tower: 1, to: 'focused_water_tower' } },
    { tick: 4200, command: { type: 'element.upgrade', tower: 81, to: 'water_cannon_tower' } },
    { tick: 4500, command: { type: 'element.upgrade', tower: 1, to: 'hydro_tower' } },
    { tick: 5400, command: { type: 'element.sendNow' } },
    { tick: 6000, command: { type: 'element.sell', tower: 81 } },
    { tick: 6001, command: { type: 'element.build', spec: 'water_tower', col: 17, row: 8 } },
    { tick: 6002, command: { type: 'element.build', spec: 'basic_arrow_tower', col: 19, row: 6 } },
    { tick: 6300, command: { type: 'element.buyEssence' } },
    { tick: 7200, command: { type: 'element.summon', element: 'light' } },
    { tick: 7500, command: { type: 'startWave' } },
    { tick: 7800, command: { type: 'element.sell', tower: 1 } },
    { tick: 7800, command: { type: 'element.sell', tower: 402 } },
  ],
};
