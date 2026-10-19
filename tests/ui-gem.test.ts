import { describe, expect, it } from 'vitest';
import { CELL, gem } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { GEM_UI } from '../src/ui/modes/gem';
import { abilities, specOf, statLine } from '../src/ui/modes/gem/text';
import { draftWith, finishWave, newGemRun, OPEN_SPOTS, send } from './sim/gem/helpers';

function viewOf(state: ReturnType<typeof newGemRun>): RunView {
  return { state, side: 0, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

/** The world point a 2×2 footprint with top-left (col, row) centres on. */
const corner = (col: number, row: number) => ({ x: (col + 1) * CELL, y: (row + 1) * CELL });

describe('Gem play screen', () => {
  it('ghosts a Draft gem on the 2×2 spot under the pointer, with the reason when it cannot go there', () => {
    const state = newGemRun();
    const view = viewOf(state);
    const [col, row] = OPEN_SPOTS[0]!;
    const p = GEM_UI.placement!(view, corner(col, row))!;
    expect(p.command).toEqual({ type: 'gem.placeDraft', col, row });
    expect(p.cells).toHaveLength(4);
    expect(p.error).toBeNull();
    expect(p.checked).toBe(true);
    expect(p.label).toBe('Place gem 1 of 5');
    // The spawn lane is walkable but unbuildable.
    expect(GEM_UI.placement!(view, corner(10, 11))!.error).toBe('unbuildable');
  });

  it('marks the Draft until the choice, and stops placing once five gems are down', () => {
    const state = newGemRun(5);
    const view = viewOf(state);
    for (const [col, row] of OPEN_SPOTS.slice(0, 5)) send(state, { type: 'gem.placeDraft', col, row });
    expect(GEM_UI.placement!(view, corner(40, 40))).toBeNull();
    const marks = GEM_UI.marks!(state);
    expect(marks.filter((m) => m.style === 'brackets').map((m) => m.tower)).toEqual(state.mode.draft);
    const hl = gem.draftHighlights(state);
    const pulsing = marks.filter((m) => m.pulse).map((m) => m.tower).sort();
    expect(pulsing).toEqual([...new Set([...hl.merge, ...hl.recipe, ...hl.slate])].sort());
    send(state, { type: 'gem.keep', tower: state.towers[0]!.id });
    expect(GEM_UI.marks!(state).filter((m) => m.style === 'brackets')).toEqual([]);
  });

  it('pulses a field Recipe that is ready, until it is fused', () => {
    const s = newGemRun(3);
    for (const [round, spec] of [[0, 'diamond-chipped'], [1, 'sapphire-chipped']] as const) {
      send(s, { type: 'gem.keep', tower: draftWith(s, round, [spec])[0]! });
      finishWave(s);
    }
    const topaz = draftWith(s, 2, ['topaz-chipped'])[0]!;
    send(s, { type: 'gem.keep', tower: topaz });
    expect(GEM_UI.marks!(s)).toEqual([{ tower: topaz, color: expect.any(Number), style: 'ring', pulse: true }]);
    send(s, { type: 'gem.combineRecipe', tower: topaz });
    expect(GEM_UI.marks!(s)).toEqual([]);
  });

  it('previews Waves with our creep names, air tags and the Damage Test', () => {
    const view = viewOf(newGemRun());
    expect(GEM_UI.wavePreview!(view, 0)!.groups[0]).toMatchObject({ name: 'Cellar Rat', count: 10, air: false, boss: false });
    expect(GEM_UI.wavePreview!(view, 3)!.groups[0]!.air).toBe(true);
    const last = GEM_UI.wavePreview!(view, 49)!;
    expect(last.groups.at(-1)).toMatchObject({ boss: true, tag: 'Damage Test', count: 1 });
  });

  it('turns a finished Run into a Record entry', () => {
    const state = newGemRun();
    expect(GEM_UI.result!(state)).toEqual({ wave: 0, score: 0, won: false, seconds: 0 });
  });
});

describe('Gem words', () => {
  it('sums up a gem on one line: damage, speed, range, then its main ability', () => {
    expect(statLine('ruby-chipped')).toBe('8–9 · 1/s · 800 · Splash');
    expect(statLine('amethyst-chipped')).toBe('10–15 · 1.25/s · 1,000 · Air only');
    expect(statLine('star-ruby')).toBe('Burn 30/s · 265');
    expect(statLine('uranium-238')).toBe('Burn 200/s · 500 · Aura');
  });

  it('describes every special and slate ability in words', () => {
    for (const id of Object.keys(gem.GEM_TOWERS)) {
      const spec = specOf(id)!;
      const count = (spec.attack?.effects?.length ?? 0) + (spec.auras?.length ?? 0) + (spec.gem.barrage ? 1 : 0) + (spec.gem.burn ? 1 : 0);
      // Splash and frost on the same artillery are separate lines, so at least as many lines as parts.
      expect(abilities(spec).length, id).toBeGreaterThanOrEqual(count);
      for (const a of abilities(spec)) expect(a.text, id).not.toMatch(/undefined|NaN|gem\./);
    }
  });
});
