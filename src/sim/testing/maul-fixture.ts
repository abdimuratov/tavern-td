import type { Replay } from '../core/replay';

/**
 * A fixed Maul Run (Mirefolk, Hard) with Waves of its own: Brawlers, Harpies, a
 * Warlord with Trolls, Golems and Hollows from both gates. It touches Walls and
 * a Wall line that closes and opens mid-Wave (a juggle), every fork of both
 * lines, venom that stacks across towers, spores that eat armor, the Rot
 * Bloom's aura, refused builds (a Block, a creep in the way, gold), full and
 * 75% sales, Send now, Breaks, Troll regen, a boss and leaks. Node and WebKit
 * must reach the same replayHash on it (e2e/determinism.spec.ts).
 */
export const MAUL_FIXTURE_REPLAY: Replay = {
  mode: 'maul',
  seed: 20261018,
  difficulty: 'hard',
  options: {
    race: 'mirefolk',
    gold: 2200,
    waves: [
      { creep: 'raider' },
      { creep: 'harpy' },
      { creep: 'warlord', escort: { creep: 'troll', count: 3 } },
      { creep: 'golem' },
      { creep: 'wraith' },
    ],
  },
  until: 9000,
  log: [
    // A Wall line across the lower field below the Ford, open at its east end.
    ...[1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41].map((col) => (
      { tick: 0, command: { type: 'maul.build', spec: 'bramble', col, row: 16 } }
    )),
    { tick: 0, command: { type: 'maul.build', spec: 'bramble', col: 40, row: 22 } },
    { tick: 0, command: { type: 'maul.build', spec: 'dart_tower', col: 20, row: 14 } },
    { tick: 0, command: { type: 'maul.build', spec: 'dart_tower', col: 26, row: 14 } },
    { tick: 0, command: { type: 'maul.build', spec: 'spore_pod', col: 22, row: 18 } },
    { tick: 0, command: { type: 'maul.build', spec: 'spore_pod', col: 28, row: 13 } },
    { tick: 0, command: { type: 'maul.upgrade', tower: 23, to: 'viper_tower' } },
    { tick: 0, command: { type: 'maul.upgrade', tower: 23, to: 'asp_spire' } },
    { tick: 0, command: { type: 'maul.upgrade', tower: 24, to: 'viper_tower' } },
    { tick: 0, command: { type: 'maul.upgrade', tower: 24, to: 'spitter' } },
    { tick: 0, command: { type: 'maul.upgrade', tower: 25, to: 'plague_pod' } },
    { tick: 0, command: { type: 'maul.upgrade', tower: 25, to: 'blight_pod' } },
    // Refused: a fork that isn't its own, a build on the Ford, closing the line's last gap (a Block), and a second Race too soon.
    { tick: 1, command: { type: 'maul.upgrade', tower: 26, to: 'asp_spire' } },
    { tick: 1, command: { type: 'maul.build', spec: 'bramble', col: 23, row: 12 } },
    { tick: 1, command: { type: 'maul.build', spec: 'bramble', col: 43, row: 16 } },
    { tick: 1, command: { type: 'maul.build', spec: 'bramble', col: 45, row: 16 } },
    { tick: 1, command: { type: 'maul.addRace', race: 'rimeborn' } },
    // Sold in the Break before Wave 1: a full refund.
    { tick: 2, command: { type: 'maul.sell', tower: 22 } },
    { tick: 3, command: { type: 'maul.sendNow' } },
    { tick: 900, command: { type: 'maul.upgrade', tower: 26, to: 'plague_pod' } },
    { tick: 900, command: { type: 'maul.upgrade', tower: 26, to: 'rot_bloom' } },
    { tick: 1500, command: { type: 'maul.sendNow' } },
    { tick: 3000, command: { type: 'startWave' } },
    // Selling the best towers lets the last Wave through to the line and on to the exit.
    { tick: 3600, command: { type: 'maul.sell', tower: 23 } },
    { tick: 3600, command: { type: 'maul.sell', tower: 24 } },
    { tick: 3600, command: { type: 'maul.sell', tower: 25 } },
    { tick: 3600, command: { type: 'maul.sell', tower: 26 } },
    { tick: 3601, command: { type: 'maul.build', spec: 'dart_tower', col: 34, row: 14 } },
    // Mid-Wave: open the line's west end, turning back the Hollows heading east, then close it again.
    { tick: 4500, command: { type: 'maul.sell', tower: 1 } },
    { tick: 4560, command: { type: 'maul.build', spec: 'bramble', col: 1, row: 16 } },
    { tick: 6000, command: { type: 'maul.sendNow' } },
    { tick: 7500, command: { type: 'maul.sendNow' } },
  ],
};
