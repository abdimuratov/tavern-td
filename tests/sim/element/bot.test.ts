import { describe, expect, it } from 'vitest';
import { playRun } from './bot';

describe('a headless Element bot', () => {
  it('plays All Pick on Normal, Full and Express, over a few seeds', () => {
    const lines: string[] = [];
    for (const length of ['express', 'full'] as const) {
      for (const seed of [1, 2, 3]) {
        const r = playRun(seed, 'normal', { length });
        lines.push(`${length} seed ${seed}: ${r.phase}, cleared ${r.completed} (won ${r.won}), score ${r.record.score}, `
          + `${r.towers} towers, levels ${JSON.stringify(r.levels)}; step mean ${(r.meanStepMs * 1000).toFixed(1)} µs, max ${r.maxStepMs.toFixed(2)} ms over ${r.steps}`);
        expect(r.rejected).toEqual([]);
        expect(['won', 'lost']).toContain(r.phase);
        expect(r.record.wave).toBe(r.completed);
        expect(r.record.score).toBeGreaterThan(0);
        // A simple Light/Water/Earth bot; it should get well into either length.
        expect(r.completed).toBeGreaterThanOrEqual(length === 'full' ? 30 : 15);
        // ADR-0002's budget is 4 ms a tick on an iPhone.
        expect(r.meanStepMs).toBeLessThan(1);
      }
    }
    console.log(lines.join('\n'));
  });
});
