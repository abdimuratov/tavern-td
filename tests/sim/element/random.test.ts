import { describe, expect, it } from 'vitest';
import { createRng, element } from '../../../src/sim';
import { modeEvents, newElementRun, ofType, skipWave } from './helpers';

/** The port's draw limits (random.lua), checked over a whole order. */
function checkOrder(draws: readonly element.ElementDraw[], length: 'full' | 'express'): void {
  const used: Record<string, number> = { water: 0, fire: 0, earth: 0, nature: 0, dark: 0, light: 0, pure: 0 };
  const limits = length === 'full' ? { l2: 10, l3: 30, noNew: 45 } : { l2: 3, l3: 12, noNew: Infinity };
  for (const d of draws) {
    const u = used[d.pick]!;
    if (d.pick === 'pure' && u < 2) {
      const values = Object.values(used);
      expect(values.some((v) => v === 3) || values.every((v) => v !== 0), 'pure needs a level 3 or all at 1').toBe(true);
    } else {
      expect(u).toBeLessThan(3);
      if (u === 1) expect(d.after).toBeGreaterThanOrEqual(limits.l2);
      if (u === 2) expect(d.after).toBeGreaterThanOrEqual(limits.l3);
      if (u === 0) expect(d.after).toBeLessThan(limits.noNew);
    }
    used[d.pick] = u + 1;
  }
}

describe('All Random', () => {
  it('draws the whole order from the seeded RNG at setup, one per starting Lumber and per Lumber Wave', () => {
    const a = newElementRun({ picks: 'allRandom', seed: 5 });
    const b = newElementRun({ picks: 'allRandom', seed: 5 });
    expect(a.mode.draws).toEqual(b.mode.draws);
    expect(a.mode.draws.map((d) => d.after)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    const orders = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const length of ['full', 'express'] as const) {
        const draws = element.drawOrder(createRng(seed), length);
        checkOrder(draws, length);
        orders.add(JSON.stringify(draws));
      }
    }
    expect(orders.size).toBeGreaterThan(300);
    const express = newElementRun({ picks: 'allRandom', length: 'express', seed: 5 });
    expect(express.mode.draws.map((d) => d.after)).toEqual([0, 0, 3, 6, 9, 12, 15, 18, 21, 24, 27]);
  });

  it('spends the starting Lumber at once and shows the draws still to come', () => {
    const s = newElementRun({ picks: 'allRandom', seed: 3 });
    const first = s.mode.draws[0]!;
    expect(first.done).toBe(true);
    expect(first.pick).not.toBe('pure');
    expect(s.mode.levels[first.pick as 'fire']).toBe(1);
    expect(s.mode.lumber).toBe(0);
    expect(element.elementStatus(s).upcomingDraws).toEqual(s.mode.draws.slice(1).map((d) => ({ after: d.after, pick: d.pick })));
  });

  it('turns each Lumber Wave\'s draw into an Elemental to kill (Full) or a Pure Essence', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = newElementRun({ picks: 'allRandom', seed });
      for (let w = 1; w <= 4; w++) skipWave(s);
      const draw = s.mode.draws[1]!;
      const events = skipWave(s);
      expect(draw.done).toBe(true);
      expect(s.mode.lumber).toBe(0);
      if (draw.pick === 'pure') {
        expect(s.mode.essence).toBe(1);
      } else {
        const spawn = ofType(events, 'spawn').find((e) => e.spec.startsWith('elemental-'));
        expect(spawn?.spec).toBe(`elemental-${draw.pick}-${s.mode.levels[draw.pick] + 1}`);
        return;
      }
    }
    throw new Error('no Element drawn after Wave 5 in 40 seeds');
  });

  it('raises Express draws at once', () => {
    const s = newElementRun({ picks: 'allRandom', length: 'express', seed: 11 });
    const levels = Object.values(s.mode.levels).reduce((a, b) => a + b, 0);
    expect(levels).toBe(2);
    for (let w = 1; w <= 3; w++) skipWave(s);
    const draw = s.mode.draws[2]!;
    expect(draw.done).toBe(true);
    if (draw.pick !== 'pure') expect(Object.values(s.mode.levels).reduce((a, b) => a + b, 0)).toBe(3);
    expect(modeEvents(skipWave(s), 'element.lumber')).toEqual([]);
  });
});
