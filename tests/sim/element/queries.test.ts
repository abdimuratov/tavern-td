import { describe, expect, it } from 'vitest';
import { element, snapshot } from '../../../src/sim';
import { playRun } from './bot';
import { PLOT_SPOTS, newElementRun, placeTower, run, send } from './helpers';

describe('Element queries', () => {
  it('never change the state', () => {
    const { state } = playRun(4, 'normal', { maxWaves: 12 });
    send(state, { type: 'element.sendNow' });
    run(state, 400);
    placeTower(state, 'windstorm_tower', ...PLOT_SPOTS[30]!);
    run(state, 200);
    expect(state.phase).toBe('wave');
    const before = snapshot(state);
    element.elementStatus(state);
    element.buildOptions(state);
    element.summonOptions(state);
    element.routePolyline(state);
    element.elementRecord(state);
    for (let col = -1; col < 57; col += 3) for (let row = -1; row < 41; row += 3) element.buildSpot(state, col, row);
    for (const t of state.towers) {
      element.towerInfo(state, t.id);
      element.towerActions(state, t.id);
    }
    element.towerInfo(state, 99_999);
    element.towerActions(state, -1);
    for (let i = -1; i <= state.wave.total; i += 7) element.wavePreview(state, i);
    expect(snapshot(state)).toBe(before);
  });

  it('report the Run, the next Waves and the Record', () => {
    const s = newElementRun({ length: 'express', difficulty: 'hard' });
    const status = element.elementStatus(s);
    expect(status).toMatchObject({
      step: 'break', gold: 600, lives: 50, lumber: 2, essence: 0, length: 'express', picks: 'allPick', difficulty: 'hard',
      fixedWaves: 30, wave: 0, completed: 0, bossWave: 0, sendNowBlocked: null, upcomingDraws: [],
    });
    expect(status.interest).toEqual({ rate: 0.02, periodSeconds: 15, nextTick: null, secondsLeft: null, paused: false, stopped: false });
    expect(element.wavePreview(s, 1)).toEqual({
      wave: 2, name: 'Wrapped One', element: 'composite', traits: ['vengeance'], count: 30, hp: 336, bounty: 6, boss: false,
      breakBefore: 5, lumber: false, essence: false,
    });
    expect(element.wavePreview(s, 30)).toBeNull();
    const full = newElementRun();
    expect(element.wavePreview(full, 27)).toMatchObject({ name: 'Fat Otter', traits: ['bulky'], count: 15, hp: 9932, bounty: 36 });
    expect(element.wavePreview(full, 55)).toMatchObject({ wave: 56, boss: true, count: 26, hp: 499298, bounty: 0, breakBefore: 60 });
    expect(element.elementRecord(full)).toEqual({ wave: 0, reached: 0, won: false, score: 0, clearSeconds: null });
    const t = placeTower(full, 'ice_tower', 17, 6);
    expect(element.towerInfo(full, t.id)).toMatchObject({
      name: 'Frost Lens', kind: 'dual', family: 'ice', level: 1, elements: ['water', 'light'], damageElement: 'light',
      damage: 800, cooldown: 1.5, range: 900, splash: { full: 100, half: 200 }, target: 'closest', abilities: ['ministun'],
      built: true, copyUntil: null,
    });
    expect(element.summonOptions(full).elements.map((o) => o.element)).toEqual(['water', 'fire', 'nature', 'earth', 'light', 'dark']);
  });

  it('score a clean Wave as the port does, and the Express clear with net worth and speed', () => {
    const s = newElementRun({ length: 'express' });
    send(s, { type: 'element.sendNow' });
    run(s, 16);
    for (const c of s.creeps) c.hp = 0;
    while (s.phase === 'wave') {
      run(s, 1);
      for (const c of s.creeps) c.hp = 0;
    }
    // ⌈(1 + 20) × 30 × 1.3⌉ for a clean Wave 1.
    expect(element.elementRecord(s).score).toBe(Math.ceil(21 * 30 * 1.3));
  });
});
