import { describe, expect, it } from 'vitest';
import { LAST_TICK, playLw } from './bots';

// Whole Runs take a moment on CI's runners, past vitest's 5 s default.
const BOT_TIMEOUT = 60_000;

// A small sample of whole Runs (docs/line-wars-design.md §13), so balance can't
// quietly regress; `pnpm balance linewars` plays the full matrix.
describe('the Line Wars bots', () => {
  it('play whole Runs: the competent bot beats Easy, Turtle and Rusher lose to Normal, and nothing outlasts 15:50', { timeout: BOT_TIMEOUT }, () => {
    const easy = playLw(1, 'easy');
    const normal = playLw(1, 'normal');
    const turtle = playLw(1, 'normal', { bot: 'turtle' });
    const rusher = playLw(1, 'normal', { bot: 'rusher' });
    const lines: string[] = [];
    for (const [name, r] of [['competent v easy', easy], ['competent v normal', normal], ['turtle v normal', turtle], ['rusher v normal', rusher]] as const) {
      lines.push(`${name}: ${r.result} by ${r.why} at ${(r.seconds / 60).toFixed(1)} min, lives ${r.lives.join('/')}, `
        + `income at 10 min ${r.income[1]!.join('/')}, tick ${(r.meanStepMs * 1000).toFixed(1)} µs`);
      expect(r.aiRefused, name).toEqual([]);
      expect(r.botRefused, name).toEqual([]);
      expect(r.ticks, name).toBeLessThanOrEqual(LAST_TICK + 1);
      // PLAN §2's budget is 4 ms a tick on a phone; Node runs far under it.
      expect(r.meanStepMs, name).toBeLessThan(0.2);
    }
    expect(easy.won).toBe(true);
    expect(turtle.won).toBe(false);
    expect(rusher.won).toBe(false);
    console.log(lines.join('\n'));
  });
});
