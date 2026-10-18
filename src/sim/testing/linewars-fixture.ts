import type { Replay } from '../core/replay';

/**
 * A fixed Line Wars Run (Ironclad against a Mirefolk Rival on Hard, 400
 * gold each), five minutes long. You build a short maze, upgrade it, sell a
 * Wall during the free-sale opening and a Mortar after it, and send
 * Snowlings, Brawlers, a Sleet Hound and Trolls. Refused: the Rival's Field, a
 * Block, a Send still locked, a jump up the tree, and a logged command for the
 * Side the AI plays. The AI builds its blueprint, upgrades to venom Dart
 * Towers and sends at you, and its creeps leak through. The log holds your
 * commands only: the replay regenerates every AI command. Node and WebKit must
 * reach the same replayHash on it (e2e/determinism.spec.ts).
 */
export const LINEWARS_FIXTURE_REPLAY: Replay = {
  mode: 'linewars',
  seed: 20261018,
  difficulty: 'hard',
  options: { race: 'ironclad', rivalRace: 'mirefolk', gold: 400 },
  until: 9000,
  log: [
    // A Wall line across row 10, open at the east end, three Ballistas and a Mortar about it.
    ...[28, 30, 32, 34, 36, 38, 40].map((col) => ({ tick: 0, command: { type: 'lw.build', side: 0, spec: 'bulwark', col, row: 10 } })),
    { tick: 0, command: { type: 'lw.build', side: 0, spec: 'ballista', col: 34, row: 13 } },
    { tick: 0, command: { type: 'lw.build', side: 0, spec: 'mortar', col: 38, row: 16 } },
    { tick: 0, command: { type: 'lw.build', side: 0, spec: 'bulwark', col: 30, row: 20 } },
    { tick: 0, command: { type: 'lw.build', side: 0, spec: 'ballista', col: 30, row: 7 } },
    { tick: 0, command: { type: 'lw.build', side: 0, spec: 'ballista', col: 40, row: 24 } },
    // Refused: the Rival's Field, sealing the line's gap (a Block), a locked Send, a jump, and the AI's Side.
    { tick: 1, command: { type: 'lw.build', side: 0, spec: 'bulwark', col: 4, row: 6 } },
    { tick: 1, command: { type: 'lw.build', side: 0, spec: 'bulwark', col: 42, row: 10 } },
    { tick: 1, command: { type: 'lw.send', side: 0, send: 'snowlings' } },
    { tick: 1, command: { type: 'lw.upgrade', side: 0, tower: 8, to: 'skypiercer' } },
    { tick: 1, command: { type: 'lw.send', side: 1, send: 'snowlings' } },
    // Sold in the opening: a full refund.
    { tick: 2, command: { type: 'lw.sell', side: 0, tower: 10 } },
    { tick: 601, command: { type: 'lw.send', side: 0, send: 'snowlings' } },
    { tick: 900, command: { type: 'lw.upgrade', side: 0, tower: 1, to: 'ballista' } },
    { tick: 1201, command: { type: 'lw.send', side: 0, send: 'brawler' } },
    { tick: 1500, command: { type: 'lw.send', side: 0, send: 'snowlings' } },
    { tick: 2401, command: { type: 'lw.send', side: 0, send: 'sleet_hound' } },
    { tick: 3601, command: { type: 'lw.send', side: 0, send: 'troll' } },
    { tick: 4200, command: { type: 'lw.send', side: 0, send: 'brawler' } },
    { tick: 4200, command: { type: 'lw.send', side: 0, send: 'snowlings' } },
    // After 0:20 a sale returns 75%.
    { tick: 5000, command: { type: 'lw.sell', side: 0, tower: 9 } },
    { tick: 5400, command: { type: 'lw.upgrade', side: 0, tower: 2, to: 'mortar' } },
    { tick: 6000, command: { type: 'lw.send', side: 0, send: 'brawler' } },
    { tick: 6600, command: { type: 'lw.upgrade', side: 0, tower: 8, to: 'heavy_ballista' } },
    { tick: 7200, command: { type: 'lw.send', side: 0, send: 'troll' } },
    { tick: 8400, command: { type: 'lw.send', side: 0, send: 'snowlings' } },
  ],
};
