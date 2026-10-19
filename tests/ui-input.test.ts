import { describe, expect, it } from 'vitest';
import { defaultCue } from '../src/app/feedback';
import { cellsBox, footprintAt, towerCells } from '../src/render/footprint';
import { CELL, createRun, step, type MapSpec, type Tower } from '../src/sim';
import { TEST_MAP } from '../src/sim/testing';
import { createHotkeys, keyName } from '../src/ui/hotkeys';
import { defaultWavePreview, upcomingWaves, type ModeUi, type RunView } from '../src/ui/mode-ui';

const key = (code: string, k = code, extra: object = {}) => ({ code, key: k, ...extra });

describe('hotkeys', () => {
  it('names letters and digits by physical key, so any keyboard layout works', () => {
    expect(keyName(key('KeyA', 'ф'))).toBe('a');
    expect(keyName(key('Digit2', '2'))).toBe('2');
    expect(keyName(key('Numpad3', '3'))).toBe('3');
    expect(keyName(key('Space', ' '))).toBe('space');
    expect(keyName(key('Escape', 'Escape'))).toBe('escape');
  });

  it('runs the latest binding of a key, and the earlier one again once it is unbound', () => {
    const hk = createHotkeys();
    const ran: string[] = [];
    hk.bind('p', 'Pause', () => ran.push('pause'));
    const off = hk.bind('p', 'Mode action', () => ran.push('mode'));
    expect(hk.handle(key('KeyP', 'p'))).toBe(true);
    off();
    hk.handle(key('KeyP', 'p'));
    expect(ran).toEqual(['mode', 'pause']);
    expect(hk.list()).toEqual([{ key: 'p', label: 'Pause' }]);
  });

  it('leaves alone repeats, shortcuts with modifiers and typing in a field', () => {
    const hk = createHotkeys();
    let n = 0;
    hk.bind('r', 'Frost', () => n++);
    expect(hk.handle(key('KeyR', 'r', { repeat: true }))).toBe(false);
    expect(hk.handle(key('KeyR', 'r', { metaKey: true }))).toBe(false);
    expect(hk.handle(key('KeyR', 'r', { target: { tagName: 'INPUT' } as unknown as EventTarget }))).toBe(false);
    expect(hk.handle(key('KeyX', 'x'))).toBe(false);
    expect(n).toBe(0);
  });
});

describe('footprints', () => {
  const map: MapSpec = { ...TEST_MAP };
  const at = (col: number, row: number) => ({ x: col * CELL, y: row * CELL });

  it('centres an odd footprint on the cell under the pointer', () => {
    expect(footprintAt(map, at(4.7, 2.2), 1)).toEqual([2 * 12 + 4]);
    expect(cellsBox(map, footprintAt(map, at(5.5, 5.5), 3)!)).toEqual({ col: 4, row: 4, w: 3, h: 3 });
  });

  it('centres an even footprint on the nearest grid corner', () => {
    // 4.7 is nearest the corner at 5, so a 2×2 covers columns 4 and 5.
    expect(cellsBox(map, footprintAt(map, at(4.7, 2.2), 2)!)).toEqual({ col: 4, row: 1, w: 2, h: 2 });
    expect(cellsBox(map, footprintAt(map, at(4.2, 2.6), 2)!)).toEqual({ col: 3, row: 2, w: 2, h: 2 });
  });

  it('stays on the Map near an edge, and is null off it', () => {
    expect(cellsBox(map, footprintAt(map, at(0.1, 0.1), 2)!)).toEqual({ col: 0, row: 0, w: 2, h: 2 });
    expect(cellsBox(map, footprintAt(map, at(11.9, 8.9), 2)!)).toEqual({ col: 10, row: 7, w: 2, h: 2 });
    expect(footprintAt(map, at(-0.5, 3), 1)).toBeNull();
    expect(footprintAt(map, at(3, 9.2), 1)).toBeNull();
  });

  it("reads a tower's cells, falling back to its anchor", () => {
    expect(towerCells({ cell: 7 } as Tower)).toEqual([7]);
    expect(towerCells({ cell: 7, cells: [7, 8, 19, 20] } as Tower)).toEqual([7, 8, 19, 20]);
  });
});

describe('wave preview', () => {
  const state = createRun({
    mode: 'test', seed: 1, difficulty: 'normal',
    options: {
      waves: [
        { groups: [{ creep: 'grunt', count: 6, interval: 1 }] },
        { groups: [{ creep: 'bat', count: 5, interval: 1 }, { creep: 'brute', count: 1, interval: 0 }] },
        { groups: [{ creep: 'troll', count: 3, interval: 1 }] },
        { groups: [{ creep: 'grunt', count: 2, interval: 1 }] },
      ],
    },
  });
  const view: RunView = { state, side: 0, send: () => {}, refresh: () => {}, select: () => {}, say: () => {} };
  const ui: ModeUi = { modeId: 'test' };

  it('names each group with its count and air and boss tags', () => {
    expect(defaultWavePreview(state, 1)).toEqual({
      number: 2,
      groups: [
        { creep: 'bat', name: 'Bat', count: 5, air: true, boss: false },
        { creep: 'brute', name: 'Brute', count: 1, air: false, boss: true },
      ],
    });
    expect(defaultWavePreview(state, 4)).toBeNull();
  });

  it('lists the Waves after the latest one started', () => {
    expect(upcomingWaves(ui, view, 3).map((w) => w.number)).toEqual([1, 2, 3]);
    step(state, [{ type: 'startWave' }]);
    expect(upcomingWaves(ui, view, 3).map((w) => w.number)).toEqual([2, 3, 4]);
    expect(upcomingWaves({ ...ui, wavePreview: () => null }, view, 3)).toEqual([]);
  });
});

describe('event cues', () => {
  const state = createRun({ mode: 'test', seed: 1, difficulty: 'normal' });

  it('maps events to sounds and Android haptics', () => {
    expect(defaultCue({ type: 'kill', creep: 1, tower: 2, bounty: 1, x: 0, y: 0 }, state)).toEqual({ sound: 'kill', haptic: null });
    expect(defaultCue({ type: 'leak', creep: 1, lives: 1, restart: false }, state)).toEqual({ sound: 'leak', haptic: 'leak' });
    expect(defaultCue({ type: 'rejected', command: { type: 'startWave' }, reason: 'x' }, state)).toEqual({ sound: 'error', haptic: 'error' });
    expect(defaultCue({ type: 'placed', tower: 1, spec: 'arrow', cell: 0 }, state)).toEqual({ sound: 'place', haptic: 'confirm' });
    expect(defaultCue({ type: 'placed', tower: 1, spec: 'rock', cell: 0 }, state).sound).toBe('rock');
    expect(defaultCue({ type: 'fire', tower: 1, target: 2, projectile: 0 }, state).sound).toBe('shoot');
    expect(defaultCue({ type: 'won' }, state).sound).toBe('win');
    expect(defaultCue({ type: 'goldChanged', gold: 1, delta: 1 }, state)).toEqual({ sound: null, haptic: null });
  });
});
