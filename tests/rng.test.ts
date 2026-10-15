import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, nextU32 } from '../src/sim/core/rng';

describe('seeded RNG', () => {
  it('replays the same sequence from the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => nextU32(a));
    const seqB = Array.from({ length: 100 }, () => nextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it('is pinned to known values, so a change to the algorithm is caught', () => {
    const rng = createRng(1);
    expect([nextU32(rng), nextU32(rng), nextU32(rng)]).toEqual([2693262067, 11749833, 2265367787]);
  });

  it('continues identically after a JSON snapshot and restore', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10; i++) nextU32(rng);
    const restored = JSON.parse(JSON.stringify(rng)) as typeof rng;
    expect(nextU32(restored)).toBe(nextU32(rng));
  });

  it('keeps floats in [0, 1) and ints within bounds', () => {
    const rng = createRng(3);
    for (let i = 0; i < 10_000; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(rng, -2, 5);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});
