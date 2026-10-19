import { describe, expect, it } from 'vitest';
import { createRunController, MAX_FRAME_MS, TICK_MS, type TickSource } from '../../src/app/controller';
import { hashState, replay, type Command, type GameState, type RunOptions } from '../../src/sim';
import '../../src/sim/testing';

// The controller's tick-source seam (docs/versus-design.md §8), with a source
// the test steers by hand. Without a source, tests/run-controller.test.ts
// covers today's loop unchanged.

const OPTIONS: RunOptions = { mode: 'test', seed: 42, difficulty: 'normal', options: { gold: 500, lives: 20, waves: [] } };

/** Lets ticks below `open` step, applying what was submitted on the next one; `paceOf` sets pace(). */
function source(): TickSource & { open: number; paceOf: number; submitted: Command[]; stepped: (s: GameState) => void; seen: number[] } {
  const s = {
    open: 0,
    paceOf: 1,
    submitted: [] as Command[],
    seen: [] as number[],
    submit(c: Command) {
      s.submitted.push(c);
    },
    take(tick: number) {
      if (tick >= s.open) return null;
      const out = s.submitted;
      s.submitted = [];
      return out;
    },
    stepped(state: GameState) {
      s.seen.push(state.tick);
    },
    pace: () => s.paceOf,
  };
  return s;
}

function setup(ticks: TickSource) {
  const c = createRunController({ runOptions: () => OPTIONS, ticks, requestFrame: () => 0, cancelFrame: () => {} });
  let now = 0;
  c.frame(now);
  return { c, frames: (n: number, ms = 1000 / 60) => { for (let i = 0; i < n; i++) c.frame((now += ms)); } };
}

describe('the controller with a tick source', () => {
  it('sends commands to the source, ignores speed and pause, and logs what the source gave with its tick', () => {
    const src = source();
    const { c, frames } = setup(src);
    src.open = 1000;
    c.setSpeed(3);
    c.setPaused(true);
    expect(c.paused).toBe(false);
    frames(60);
    expect(c.state.tick).toBe(30);
    c.send({ type: 'place', spec: 'arrow', col: 5, row: 5 });
    expect(src.submitted).toHaveLength(1);
    frames(2);
    expect(c.state.towers).toHaveLength(1);
    expect(c.log).toEqual([{ tick: 30, command: { type: 'place', spec: 'arrow', col: 5, row: 5 } }]);
    expect(src.seen.at(-1)).toBe(c.state.tick);
    expect(hashState(replay(c.replay(), c.state.tick))).toBe(hashState(c.state));
  });

  it('holds on a null take without banking the time, then steps at 1× again', () => {
    const src = source();
    const { c, frames } = setup(src);
    src.open = 10;
    frames(120);
    expect(c.state.tick).toBe(10);
    src.open = 1000;
    frames(1);
    expect(c.state.tick).toBe(11);
    frames(59);
    expect(c.state.tick).toBeGreaterThanOrEqual(39);
    expect(c.state.tick).toBeLessThanOrEqual(41);
  });

  it('paces up to 2× while the source says it is behind, and no faster after a long frame', () => {
    const src = source();
    const { c, frames } = setup(src);
    src.open = 100_000;
    src.paceOf = 2;
    frames(60);
    expect(c.state.tick).toBe(60);
    src.paceOf = 5;
    frames(1, 10_000);
    expect(c.state.tick - 60).toBeLessThanOrEqual(Math.ceil((MAX_FRAME_MS * 2) / TICK_MS));
  });

  it('adopts a state in place, replacing the log when given one, and tells onRun listeners', () => {
    const src = source();
    const { c, frames } = setup(src);
    src.open = 1000;
    const runs: GameState[] = [];
    c.onRun((s) => runs.push(s));
    frames(30);
    const other = JSON.parse(JSON.stringify(c.state)) as GameState;
    other.gold += 1;
    c.adopt(other);
    expect(c.state).toBe(other);
    expect(runs.at(-1)).toBe(other);
    const log = [{ tick: 3, command: { type: 'startWave' } as Command }];
    c.adopt(JSON.parse(JSON.stringify(other)) as GameState, log);
    expect(c.log).toEqual(log);
    expect(runs).toHaveLength(3);
  });
});
