import { describe, expect, it } from 'vitest';
import { SCORE } from '../../../src/content/linewars';
import { TICK_RATE, linewars } from '../../../src/sim';
import { playLw } from './bots';

// lwRecord from either Side (docs/versus-design.md §8): Side 0's score is the
// one the sim keeps, and Side 1's follows the same formula from its tallies.

/** §14 by hand: 100 a life stolen, plus bounty, plus a win's 1,000, 5 a second left before 20:00 and 20 a life left. */
function byHand(state: linewars.LwGameState, side: 0 | 1): number {
  const ms = state.mode;
  const s = ms.sides[side];
  const won = ms.result === (side === 0 ? 'side0' : 'side1');
  const left = Math.max(0, Math.floor((SCORE.clock * TICK_RATE - ms.endTick) / TICK_RATE));
  return SCORE.perSteal * s.stolen + s.bounty + (won ? SCORE.win + SCORE.perSecond * left + SCORE.perLife * s.lives : 0);
}

describe('lwRecord for either Side', () => {
  it('matches the sim\'s score for Side 0, and gives Side 1 its own by the same formula', { timeout: 30_000 }, () => {
    const runs = [
      playLw(1, 'easy'), // Side 0 (the competent bot) wins
      playLw(1, 'normal', { bot: 'turtle' }), // Side 1 (the AI) wins
      playLw(2, 'normal', { bot: 'greedy', maxTicks: 5 * 60 * TICK_RATE }), // still running
    ];
    const results = runs.map((r) => r.state.mode.result);
    expect(results).toEqual(expect.arrayContaining(['side0', 'side1', 'playing']));
    for (const { state } of runs) {
      const ms = state.mode;
      expect(linewars.lwScore(state, 0)).toBe(ms.score);
      expect(byHand(state, 0)).toBe(ms.score);
      expect(linewars.lwRecord(state)).toEqual(linewars.lwRecord(state, 0));
      expect(linewars.lwRecord(state, 0).score).toBe(ms.score);
      const r1 = linewars.lwRecord(state, 1);
      expect(r1.score).toBe(byHand(state, 1));
      expect(r1.wave).toBe(ms.sides[1].stolen);
      expect(r1.won).toBe(ms.result === 'side1');
      expect(r1.draw).toBe(ms.result === 'draw');
      expect(r1.races).toEqual([ms.sides[1].race, ms.sides[0].race]);
      expect(r1.seconds).toBe(linewars.lwRecord(state, 0).seconds);
    }
    const side1Won = runs[1]!.state;
    expect(linewars.lwRecord(side1Won, 1).score).toBeGreaterThan(SCORE.win);
  });
});
