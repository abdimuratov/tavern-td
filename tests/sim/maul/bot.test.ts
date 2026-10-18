import { describe, expect, it } from 'vitest';
import { RACES } from '../../../src/content/maul';
import { playRun } from './bot';

// Whole Runs take a moment on CI's runners, past vitest's 5 s default.
const BOT_TIMEOUT = 60_000;

describe('a headless Maul bot', () => {
  it('meets PLAN §4\'s targets on seed 1: wins Easy, reaches Wave 40 on Normal and wins some, never wins Insane', { timeout: BOT_TIMEOUT }, () => {
    const lines: string[] = [];
    let normalWins = 0;
    for (const race of RACES) {
      const easy = playRun(1, 'easy', { race });
      const normal = playRun(1, 'normal', { race });
      const insane = playRun(1, 'insane', { race });
      lines.push(`${race}: Easy ${easy.won ? 'won' : `lost on ${easy.wave}`} (${easy.lives} lives), `
        + `Normal ${normal.won ? 'won' : `lost on ${normal.wave}`} (${normal.lives} lives, ${normal.towers} towers, route ${normal.routeLength}), `
        + `Insane lost on ${insane.wave}; step mean ${(normal.meanStepMs * 1000).toFixed(1)} µs`);
      for (const r of [easy, normal, insane]) expect(r.rejected, race).toEqual([]);
      expect(easy.won, race).toBe(true);
      expect(normal.wave, race).toBe(40);
      if (normal.won) normalWins++;
      expect(insane.won, race).toBe(false);
      expect(insane.wave, race).toBeGreaterThanOrEqual(5);
      // ADR-0002's budget is 4 ms a tick on an iPhone.
      expect(normal.meanStepMs).toBeLessThan(1);
    }
    expect(normalWins).toBeGreaterThanOrEqual(1);
    expect(normalWins).toBeLessThanOrEqual(3);
    console.log(lines.join('\n'));
  });
});
