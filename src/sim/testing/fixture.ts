import type { Replay } from '../core/replay';

/**
 * A fixed Run of the `test` Game Mode touching every core system: ground and
 * air Waves, mazing and re-routing, a sale mid-Wave, rejected commands, every
 * built-in effect kind and both aura sorts. Node and WebKit must reach the
 * same replayHash on it.
 */
export const FIXTURE_REPLAY: Replay = {
  mode: 'test',
  seed: 20261017,
  difficulty: 'hard',
  options: { gold: 400, lives: 20 },
  until: 2400,
  log: [
    { tick: 0, command: { type: 'place', spec: 'arrow', col: 4, row: 1 } },
    { tick: 0, command: { type: 'place', spec: 'frost', col: 7, row: 1 } },
    { tick: 0, command: { type: 'place', spec: 'cannon', col: 5, row: 6 } },
    { tick: 0, command: { type: 'place', spec: 'totem', col: 6, row: 2 } },
    { tick: 0, command: { type: 'place', spec: 'banner', col: 4, row: 2 } },
    { tick: 0, command: { type: 'startWave' } },
    { tick: 2, command: { type: 'place', spec: 'arrow', col: 0, row: 0 } },
    { tick: 60, command: { type: 'place', spec: 'venom', col: 8, row: 6 } },
    { tick: 90, command: { type: 'place', spec: 'breaker', col: 2, row: 6 } },
    { tick: 100, command: { type: 'startWave' } },
    { tick: 400, command: { type: 'place', spec: 'flak', col: 9, row: 4 } },
    { tick: 400, command: { type: 'place', spec: 'sniper', col: 6, row: 7 } },
    { tick: 401, command: { type: 'startWave' } },
    { tick: 500, command: { type: 'sell', tower: 1 } },
    { tick: 800, command: { type: 'place', spec: 'hydra', col: 8, row: 2 } },
    { tick: 800, command: { type: 'place', spec: 'stunner', col: 3, row: 7 } },
    { tick: 801, command: { type: 'startWave' } },
    { tick: 1500, command: { type: 'place', spec: 'rock', col: 5, row: 0 } },
    { tick: 1500, command: { type: 'place', spec: 'dart', col: 9, row: 7 } },
    { tick: 1501, command: { type: 'startWave' } },
  ],
};
