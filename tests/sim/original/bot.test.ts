import { describe, expect, it } from 'vitest';
import { playStage } from './bot';

// Whole Runs take a moment on CI's runners, past vitest's 5 s default.
const BOT_TIMEOUT = 30_000;

describe('a headless Original bot', () => {
  it('clears Stage 1 on Normal with the Campaign\'s opening towers, waiting out the Breaks or calling early', { timeout: BOT_TIMEOUT }, () => {
    const lines: string[] = [];
    for (const greedy of [false, true]) {
      for (const seed of [1, 2]) {
        const r = playStage(seed, 'normal', { cleared: 0, greedy });
        lines.push(`greedy ${greedy} seed ${seed}: ${r.phase}, ${r.completed} cleared, ${r.lives} lives, ${r.stars} Stars, `
          + `${r.towers} towers at Levels ${r.levels.join(' ')}, early-call gold ${r.earlyGold}; step mean ${(r.meanStepMs * 1000).toFixed(1)} µs`);
        expect(r.rejected).toEqual([]);
        expect(r.won).toBe(true);
        expect(r.completed).toBe(12);
        expect(r.stars).toBeGreaterThanOrEqual(2);
        // ADR-0002's budget is 4 ms a tick on an iPhone.
        expect(r.meanStepMs).toBeLessThan(1);
        if (greedy) expect(r.earlyGold).toBeGreaterThan(0);
      }
    }
    console.log(lines.join('\n'));
  });

  it('is pushed harder on Insane, as PLAN §4 wants', { timeout: BOT_TIMEOUT }, () => {
    const easy = playStage(1, 'easy', { cleared: 0 });
    const insane = playStage(1, 'insane', { cleared: 0 });
    expect(easy.won).toBe(true);
    expect(insane.lives).toBeLessThan(easy.lives);
  });
});
