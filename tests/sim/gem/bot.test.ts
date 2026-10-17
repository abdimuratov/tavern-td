import { describe, expect, it } from 'vitest';
import { playRun } from './bot';

describe('a headless bot', () => {
  it('plays a full Gem Run on Normal past Wave 10, finishing by Wave 50', () => {
    const r = playRun(1, 'normal');
    console.log(
      `Gem bot (seed 1, Normal): ${r.phase} at Wave ${r.wave}, score ${r.record.score}, route ${r.routeLength} cells, `
      + `${r.towers} structures; step mean ${(r.meanStepMs * 1000).toFixed(1)} µs, max ${r.maxStepMs.toFixed(2)} ms over ${r.steps} steps`,
    );
    expect(r.rejected).toEqual([]);
    expect(['won', 'lost']).toContain(r.phase);
    expect(r.wave).toBeGreaterThan(10);
    expect(r.wave).toBeLessThanOrEqual(50);
    expect(r.record.wave).toBe(r.wave);
    expect(r.record.score).toBeGreaterThan(0);
    // ADR-0002's budget is 4 ms a tick on an iPhone; a Gem Wave is far lighter.
    expect(r.meanStepMs).toBeLessThan(1);
  });
});
