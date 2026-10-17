import { afterEach, describe, expect, it } from 'vitest';
import { ELEMENT_TOWERS, ELEMENTS, type ElementTowerSpec } from '../src/content/element';
import { CELL, element, getMode, type CreepSpec, type GameState } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { ELEMENT_UI, spotAt, validElementSave } from '../src/ui/modes/element';
import { ELEMENT_LOOK, TRAIT_MARK } from '../src/ui/modes/element/look';
import { building } from '../src/ui/modes/element/picks';
import { abilityLines, addedElement, specOf } from '../src/ui/modes/element/text';
import { buildAt, newElementRun, send, setLevels, skipWave } from './sim/element/helpers';

function viewOf(state: GameState): RunView {
  return { state, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
}

/** The world point a 2×2 footprint with top-left (col, row) centres on. */
const corner = (col: number, row: number) => ({ x: (col + 1) * CELL, y: (row + 1) * CELL });

afterEach(() => {
  ELEMENT_UI.cancel!(viewOf(newElementRun()));
});

describe('Element play screen', () => {
  it('ghosts the chosen tower on a plot, and says why it can not go on the Lane or without its Element', () => {
    const state = newElementRun();
    const view = viewOf(state);
    expect(ELEMENT_UI.placement!(view, corner(17, 18))).toBeNull();
    building.value = 'basic_arrow_tower';
    const ok = ELEMENT_UI.placement!(view, corner(17, 18))!;
    expect(ok.command).toEqual({ type: 'element.build', spec: 'basic_arrow_tower', col: 17, row: 18 });
    expect(ok.cells).toHaveLength(4);
    expect(ok.error).toBeNull();
    expect(ok.label).toBe('Arrow · 100 gold');
    expect(ok.route).toBe(false);
    // The Lane along the top (rows 1–2) is no plot.
    expect(ELEMENT_UI.placement!(view, corner(20, 1))!.error).toBe('towers go beside the lane, on raised ground');
    building.value = 'water_tower';
    expect(ELEMENT_UI.placement!(view, corner(17, 18))!.error).toBe('needs Water 1');
  });

  it('snaps the ghost onto a narrow plot instead of hanging it off the edge', () => {
    const state = newElementRun();
    // The plot at columns 17–20 is four cells wide; a pointer on its rightmost cell, near the cliff.
    const p = { x: 20 * CELL + CELL * 0.9, y: 19 * CELL + CELL * 0.8 };
    const spot = spotAt(state, p)!;
    expect(spot.error).toBeNull();
    expect([spot.col, spot.row]).toEqual([19, 19]);
    // Off the Map there is no ghost at all.
    expect(spotAt(state, { x: -5, y: 10 })).toBeNull();
  });

  it('marks towers while they build, and stops once they are built', () => {
    const state = newElementRun();
    const t = buildAt(state, 'basic_cannon_tower', 17, 18);
    expect(ELEMENT_UI.marks!(state)).toEqual([{ tower: t.id, color: expect.any(Number), style: 'brackets', pulse: true }]);
    for (let i = 0; i < 40; i++) send(state);
    expect(ELEMENT_UI.marks!(state)).toEqual([]);
  });

  it('reads the Wave as n of 55, then counts boss Waves', () => {
    const state = newElementRun();
    expect(ELEMENT_UI.waveLabel!(viewOf(state))).toEqual({ label: 'Wave', value: '0/55' });
    const express = newElementRun({ length: 'express' });
    skipWave(express);
    expect(ELEMENT_UI.waveLabel!(viewOf(express))).toEqual({ label: 'Wave', value: '1/30' });
    state.wave.number = 57;
    expect(ELEMENT_UI.waveLabel!(viewOf(state))).toEqual({ label: 'Boss Wave', value: '2' });
  });

  it('previews Waves with our creep names, their Element, Traits and a boss tag', () => {
    const view = viewOf(newElementRun());
    const w4 = ELEMENT_UI.wavePreview!(view, 3)!;
    expect(w4.number).toBe(4);
    expect(w4.groups[0]).toMatchObject({ name: 'Toadstool', count: 30, boss: false, traits: ['Undead'], swatch: expect.any(Number) });
    expect(w4.groups[0]!.about).toContain('Nature');
    const boss = ELEMENT_UI.wavePreview!(view, 55)!;
    expect(boss.groups[0]).toMatchObject({ name: 'The Endless', boss: true, tag: 'Boss 1', traits: [] });
    expect(ELEMENT_UI.wavePreview!(viewOf(newElementRun({ length: 'express' })), 30)).toBeNull();
  });

  it('keys Records by Length and keeps the Run choices for Play again', () => {
    const state = newElementRun({ length: 'express', picks: 'allRandom' });
    const choices = ELEMENT_UI.optionsOf!(state);
    expect(choices).toEqual({ picks: 'allRandom', length: 'express' });
    expect(ELEMENT_UI.recordBoard!(choices)).toBe('express');
    expect(ELEMENT_UI.optionsText!(choices)).toBe('Express · All Random');
    expect(ELEMENT_UI.optionsText!({ picks: 'allPick', length: 'full' })).toBe('Full');
    expect(ELEMENT_UI.recordBoard!({ picks: 'allPick', length: 'full' })).toBe('full');
    expect(ELEMENT_UI.recordBoards!.find((b) => b.id === 'full')!.wave!(58)).toBe('Boss 3');
  });

  it('turns a finished Run into a Record and end text', () => {
    const lost = newElementRun({ length: 'express' });
    skipWave(lost);
    skipWave(lost);
    lost.phase = 'lost';
    expect(ELEMENT_UI.result!(lost)).toMatchObject({ wave: 2, won: false });
    expect(ELEMENT_UI.endText!(lost)).toEqual({ won: false, summary: 'The Run ended on Wave 2 of 30', wave: '2' });
    // Full is won once Wave 55 is cleared, though the boss Waves go on until the lives run out.
    const full = newElementRun();
    full.mode.completed = 56;
    full.wave.number = 57;
    full.phase = 'lost';
    expect(ELEMENT_UI.result!(full)).toMatchObject({ wave: 57, won: true });
    expect(ELEMENT_UI.endText!(full)).toMatchObject({ won: true, wave: 'Boss 2' });
  });

  it('accepts its own saves and refuses damaged ones', () => {
    const state = newElementRun({ picks: 'allRandom' });
    buildAt(state, 'basic_arrow_tower', 17, 18);
    send(state, { type: 'element.sendNow' });
    for (let i = 0; i < 200; i++) send(state);
    const copy = (): GameState => JSON.parse(JSON.stringify(state)) as GameState;
    expect(validElementSave(copy())).toBe(true);
    const bad = (patch: (m: Record<string, unknown>) => void): boolean => {
      const s = copy();
      patch(s.mode as Record<string, unknown>);
      return validElementSave(s);
    };
    expect(bad((m) => { m.picks = 'somePick'; })).toBe(false);
    expect(bad((m) => { m.length = 'short'; })).toBe(false);
    expect(bad((m) => { (m.levels as Record<string, number>).water = 4; })).toBe(false);
    expect(bad((m) => { m.draws = [{ after: 5, pick: 'void', done: false }]; })).toBe(false);
    expect(bad((m) => { m.timers = [{ kind: 'meteor', at: 3 }]; })).toBe(false);
    expect(bad((m) => { delete m.interest; })).toBe(false);
    expect(validElementSave({ ...copy(), mode: null })).toBe(false);
  });
});

describe('Element look', () => {
  it('rings each tower in the colours of the Elements it is made of', () => {
    const look = ELEMENT_LOOK;
    for (const [id, spec] of Object.entries(ELEMENT_TOWERS)) {
      const l = look.tower(id, spec);
      const info = spec.element;
      if (info.kind === 'single' || info.kind === 'dual' || info.kind === 'triple') {
        expect(l.ring, id).toHaveLength(info.elements.length);
        expect(l.pips, id).toBe(info.level);
      }
    }
    expect(look.tower('periodic_tower', ELEMENT_TOWERS['periodic_tower']!).ring).toHaveLength(6);
    expect(look.tower('pure_fire_tower', ELEMENT_TOWERS['pure_fire_tower']!).halo).toBeDefined();
    // Shot specs have no Element block, and still get a look.
    const rules = getMode('element');
    for (const id of Object.keys(rules.towers).filter((k) => k.startsWith('shot:'))) {
      expect(look.tower(id, rules.towers[id]!).plate, id).toBe(false);
    }
  });

  it('colours creeps by Element and marks each Trait but bulky', () => {
    const creeps = getMode('element').creeps as Readonly<Record<string, CreepSpec & { trait: string | null; elemental?: unknown }>>;
    for (const [id, spec] of Object.entries(creeps)) {
      const l = ELEMENT_LOOK.creep(id, spec);
      if (spec.elemental) expect(l.shape, id).toBe('star');
      else if (spec.trait && spec.trait !== 'bulky') expect(l.mark, id).toBe(TRAIT_MARK[spec.trait as keyof typeof TRAIT_MARK]);
      else expect(l.mark, id).toBeUndefined();
    }
  });

  it('shows an undead creep lying dead, and Windstorm tornadoes', () => {
    const state = newElementRun();
    expect(ELEMENT_LOOK.extras!(state)).toEqual([]);
    state.mode.tornadoes.push({ tower: 1, x: 100, y: 200, target: 0, damage: 1, radius: 450, speed: 200, slow: 0.12, level: 1, born: 0, end: 99 });
    expect(ELEMENT_LOOK.extras!(state).map((x) => x.glyph)).toEqual(['glow', 'swirl']);
    const creep = { status: [{ kind: element.STATUS.dead, key: element.DEAD, value: 1, ticks: 9, src: 0 }] } as never;
    expect(ELEMENT_LOOK.creepStatus!(creep)).toMatchObject({ alpha: expect.any(Number), scale: expect.any(Number) });
    expect(ELEMENT_LOOK.creepStatus!({ status: [] } as never)).toBeNull();
  });
});

describe('Element words', () => {
  it('describes every tower without holes in the numbers', () => {
    for (const [id, spec] of Object.entries(ELEMENT_TOWERS)) {
      for (const line of abilityLines(spec)) expect(line, id).not.toMatch(/undefined|NaN|\[object/);
    }
    expect(abilityLines(specOf('ice_tower')!)).toEqual(['Stuns the target for 0.15 s']);
  });

  it('names the Element a branch upgrade adds, and none for a level up', () => {
    const water = specOf('water_tower') as ElementTowerSpec;
    expect(addedElement(water, specOf('ice_tower')!)).toBe('light');
    expect(addedElement(water, specOf('focused_water_tower')!)).toBeNull();
    expect(addedElement(specOf('basic_arrow_tower')!, specOf('dark_arrow_tower')!)).toBe('dark');
  });

  it('offers every Element a build button once it has a level', () => {
    const state = newElementRun();
    setLevels(state, Object.fromEntries(ELEMENTS.map((e) => [e, 1])));
    const blocked = element.buildOptions(state).filter((o) => o.blocked !== null).map((o) => [o.spec, o.blocked]);
    expect(blocked).toEqual([['periodic_tower', 'needs a Pure Essence']]);
  });
});
