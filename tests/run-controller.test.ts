import { describe, expect, it, vi } from 'vitest';
import { createRunController, MAX_FRAME_MS, TICK_MS, type RunControllerOptions } from '../src/app/controller';
import { hashState, replay, type GameState, type RunOptions, type SimEvent } from '../src/sim';
import '../src/sim/testing';

const OPTIONS: RunOptions = {
  mode: 'test', seed: 42, difficulty: 'normal',
  options: { gold: 500, lives: 20, waves: [{ groups: [{ creep: 'grunt', count: 3, interval: 0.5 }] }] },
};

/** A controller whose frames the test drives by hand. */
function setup(extra: Partial<RunControllerOptions> = {}) {
  const c = createRunController({ runOptions: () => OPTIONS, requestFrame: () => 0, cancelFrame: () => {}, ...extra });
  let now = 0;
  c.frame(now);
  const frames = (n: number, ms: number): void => {
    for (let i = 0; i < n; i++) c.frame((now += ms));
  };
  return { c, frames };
}

describe('run controller', () => {
  it('steps at 30 Hz whatever the display rate', () => {
    const at60 = setup();
    at60.frames(60, 1000 / 60);
    expect(at60.c.state.tick).toBe(30);
    const at120 = setup();
    at120.frames(120, 1000 / 120);
    expect(at120.c.state.tick).toBe(30);
  });

  it('runs two or three ticks per tick interval at 2× and 3×', () => {
    for (const speed of [2, 3] as const) {
      const { c, frames } = setup();
      c.setSpeed(speed);
      frames(60, 1000 / 60);
      expect(c.state.tick).toBe(30 * speed);
    }
  });

  it('caps the catch-up after a long frame instead of fast-forwarding', () => {
    const { c, frames } = setup();
    c.setSpeed(3);
    frames(1, 10_000);
    expect(c.state.tick).toBeLessThanOrEqual(Math.ceil((MAX_FRAME_MS * 3) / TICK_MS));
  });

  it('stops stepping while paused, but still applies commands sent meanwhile', () => {
    const { c, frames } = setup();
    frames(10, 1000 / 60);
    const tick = c.state.tick;
    c.setPaused(true);
    frames(30, 1000 / 60);
    expect(c.state.tick).toBe(tick);
    c.send({ type: 'place', spec: 'arrow', col: 5, row: 5 });
    frames(1, 1000 / 60);
    expect(c.state.tick).toBe(tick + 1);
    expect(c.state.towers).toHaveLength(1);
    frames(30, 1000 / 60);
    expect(c.state.tick).toBe(tick + 1);
  });

  it('smooths between ticks: alpha is the share of a tick since the last one', () => {
    const { c, frames } = setup();
    frames(1, TICK_MS * 1.25);
    expect(c.state.tick).toBe(1);
    expect(c.alpha).toBeCloseTo(0.25);
  });

  it('logs commands with their tick, and the log replays the Run exactly', () => {
    const { c, frames } = setup();
    frames(5, 1000 / 60);
    c.send({ type: 'place', spec: 'arrow', col: 4, row: 2 });
    c.send({ type: 'startWave' });
    frames(200, 1000 / 60);
    c.send({ type: 'sell', tower: c.state.towers[0]!.id });
    frames(100, 1000 / 60);
    expect(c.log.map((e) => e.command.type)).toEqual(['place', 'startWave', 'sell']);
    const r = c.replay();
    expect(hashState(replay(r, r.until!))).toBe(hashState(c.state));
  });

  it('hands every tick and its events to listeners, then the frame', () => {
    const { c, frames } = setup();
    const seen: string[] = [];
    c.onStep((_s: GameState, events: readonly SimEvent[]) => seen.push(`step:${events.map((e) => e.type).join(',')}`));
    c.onFrame(() => seen.push('frame'));
    c.send({ type: 'startWave' });
    frames(1, TICK_MS * 2);
    expect(seen[0]).toMatch(/^step:waveStart/);
    expect(seen.at(-1)).toBe('frame');
    expect(seen.filter((s) => s.startsWith('step'))).toHaveLength(2);
  });

  it('autosaves at each Wave end and on background, and forgets the save when the Run ends', async () => {
    const autosave = vi.fn();
    const clearSave = vi.fn();
    const { c, frames } = setup({ autosave, clearSave });
    c.send({ type: 'place', spec: 'arrow', col: 5, row: 1 });
    c.send({ type: 'place', spec: 'arrow', col: 5, row: 7 });
    c.send({ type: 'startWave' });
    while (c.state.phase === 'wave' || c.state.tick < 2) frames(1, TICK_MS);
    await Promise.resolve();
    // The only Wave ending ends the Run, so nothing is left to Continue.
    expect(c.state.phase === 'won' || c.state.phase === 'lost').toBe(true);
    expect(autosave).not.toHaveBeenCalled();
    expect(clearSave).toHaveBeenCalledTimes(1);

    const two = setup({
      autosave, clearSave,
      runOptions: () => ({ ...OPTIONS, options: { gold: 500, lives: 20 } }),
    });
    two.c.send({ type: 'startWave' });
    two.frames(1, TICK_MS);
    while (two.c.state.phase === 'wave') two.frames(1, TICK_MS);
    expect(autosave).toHaveBeenLastCalledWith(two.c.state, 'waveEnd');
    two.c.background();
    expect(two.c.paused).toBe(true);
    expect(autosave).toHaveBeenLastCalledWith(two.c.state, 'background');
  });

  it('restarts into a fresh Run and tells listeners', () => {
    const { c, frames } = setup();
    const runs: GameState[] = [];
    c.onRun((s) => runs.push(s));
    frames(30, TICK_MS);
    c.restart();
    expect(runs).toHaveLength(2);
    expect(c.state.tick).toBe(0);
    expect(c.log).toHaveLength(0);
  });
});
