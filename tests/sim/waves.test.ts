import { describe, expect, it } from 'vitest';
import { step, TICK_RATE, type WaveSpec } from '../../src/sim';
import { newRun, ofType, run, runUntil, towerAt } from './helpers';

const waves = (...list: WaveSpec[]) => ({ waves: list as unknown as never });

describe('Waves', () => {
  it('spawn each group on its interval after its delay', () => {
    const s = newRun({ options: waves({ groups: [{ creep: 'grunt', count: 3, interval: 1 }, { creep: 'bat', count: 2, interval: 0.5, delay: 2 }] }) });
    const spawns: [number, string][] = [];
    for (let i = 0; i < 100; i++) {
      const tick = s.tick;
      for (const e of ofType(step(s, i === 0 ? [{ type: 'startWave' }] : []), 'spawn')) spawns.push([tick, e.spec]);
    }
    expect(spawns).toEqual([[0, 'grunt'], [30, 'grunt'], [60, 'grunt'], [60, 'bat'], [75, 'bat']]);
  });

  it('scale creep HP by Difficulty and the Wave', () => {
    const hp = (difficulty: 'easy' | 'normal' | 'insane', wave: WaveSpec) => {
      const s = newRun({ difficulty, options: waves(wave) });
      run(s, 1, [{ type: 'startWave' }]);
      return s.creeps[0]!.maxHp;
    };
    const grunt = { creep: 'grunt', count: 1, interval: 0 };
    expect(hp('normal', { groups: [grunt] })).toBe(80);
    expect(hp('easy', { groups: [grunt] })).toBe(60);
    expect(hp('insane', { groups: [grunt] })).toBe(128);
    expect(hp('normal', { groups: [grunt], hpMult: 1.5 })).toBe(120);
    expect(hp('insane', { groups: [{ ...grunt, hp: 50 }], hp: 999 })).toBe(80);
    expect(hp('normal', { groups: [grunt], hp: 300 })).toBe(300);
  });

  it('end when every creep is dead or gone, then return to building', () => {
    const s = newRun({ options: waves({ groups: [{ creep: 'grunt', count: 2, interval: 0.5 }] }, { groups: [{ creep: 'grunt', count: 1, interval: 0 }] }) });
    for (const [c, r] of [[3, 1], [6, 1], [9, 2], [5, 5]] as const) towerAt(s, 'cannon', c, r);
    run(s, 1, [{ type: 'startWave' }]);
    expect(s.phase).toBe('wave');
    const events = runUntil(s, (ev) => ev.some((e) => e.type === 'waveEnd'));
    expect(ofType(events, 'kill').length + ofType(events, 'leak').length).toBe(2);
    expect(s.phase).toBe('build');
    expect(s.creeps).toEqual([]);
    // The test mode pays 5 + Wave number at the end of each Wave.
    expect(ofType(events, 'goldChanged').at(-1)?.delta).toBe(6);
  });

  it('refuse startWave during a Wave unless the Game Mode allows overlapping', () => {
    const s = newRun();
    const events = run(s, 2, [{ type: 'startWave' }, { type: 'startWave' }]);
    expect(ofType(events, 'waveStart')).toHaveLength(1);
    expect(ofType(events, 'rejected').map((e) => e.reason)).toEqual(['a Wave is still running']);
  });

  it('win when the last Wave ends', () => {
    const s = newRun({ options: waves({ groups: [{ creep: 'bat', count: 1, interval: 0 }] }, { groups: [{ creep: 'grunt', count: 1, interval: 0 }] }) });
    run(s, 1, [{ type: 'startWave' }]);
    runUntil(s, (ev) => ev.some((e) => e.type === 'waveEnd'));
    expect(s.phase).toBe('build');
    run(s, 1, [{ type: 'startWave' }]);
    const events = runUntil(s, (ev) => ev.some((e) => e.type === 'won'));
    expect(ofType(events, 'waveEnd')).toEqual([{ type: 'waveEnd', wave: 2 }]);
    expect(s.phase).toBe('won');
    const after = run(s, 1, [{ type: 'startWave' }]);
    expect(ofType(after, 'rejected')[0]?.reason).toBe('the Run is over');
  });

  it('lose when lives reach zero, and stop simulating', () => {
    const s = newRun({ options: { lives: 2, ...waves({ groups: [{ creep: 'brute', count: 2, interval: 0.2 }] }) } });
    run(s, 1, [{ type: 'startWave' }]);
    const events = runUntil(s, (ev) => ev.some((e) => e.type === 'lost'));
    expect(ofType(events, 'leak')[0]?.lives).toBe(2);
    expect(s.lives).toBeLessThanOrEqual(0);
    expect(s.phase).toBe('lost');
    const frozen = JSON.stringify({ ...s, tick: 0 });
    run(s, 30);
    expect(JSON.stringify({ ...s, tick: 0 })).toBe(frozen);
  });
});

describe('commands', () => {
  it('reject malformed, unknown and unaffordable commands without throwing', () => {
    const s = newRun({ options: { gold: 12 } });
    const events = run(s, 1, [
      { type: 'dance' },
      { type: 'place', spec: 'arrow', col: '3', row: 2 },
      { type: 'place', spec: 'constructor', col: 3, row: 2 },
      { type: 'place', spec: 'cannon', col: 3, row: 2 },
      { type: 'sell', tower: 999 },
      null as never,
      { type: 'place', spec: 'arrow', col: 3, row: 2 },
      { type: 'place', spec: 'arrow', col: 4, row: 2 },
    ]);
    expect(ofType(events, 'rejected').map((e) => e.reason)).toEqual([
      'unknown command', 'place needs spec, col and row', 'no tower constructor', 'not enough gold', 'no such tower',
      'malformed command', 'not enough gold',
    ]);
    expect(ofType(events, 'placed')).toHaveLength(1);
    expect(s.gold).toBe(2);
  });

  it('sell frees the cell and refunds half', () => {
    const s = newRun();
    const [placed] = ofType(run(s, 1, [{ type: 'place', spec: 'cannon', col: 3, row: 2 }]), 'placed');
    const events = run(s, 1, [{ type: 'sell', tower: placed!.tower }]);
    expect(ofType(events, 'removed')).toEqual([{ type: 'removed', tower: placed!.tower, spec: 'cannon', cell: placed!.cell }]);
    expect(s.grid[placed!.cell]).toBe(0);
    expect(s.gold).toBe(200 - 25 + 12);
  });

  it('count ticks', () => {
    const s = newRun();
    run(s, TICK_RATE);
    expect(s.tick).toBe(TICK_RATE);
  });
});
