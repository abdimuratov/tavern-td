import { describe, expect, it } from 'vitest';
import {
  advance, hashState, replay, replayHash, restore, snapshot, type Command, type GameState, type Replay, type ReplayEntry,
} from '../../../src/sim';
import { playRun } from './bot';

/** Every value is a finite number, string, boolean, null, array or plain object. */
function expectPlainJson(value: unknown, path = 'state'): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} is ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => expectPlainJson(v, `${path}[${i}]`));
  } else if (typeof value === 'object' && value !== null) {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${path} is not a plain object`);
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) throw new Error(`${path}.${k} is undefined`);
      expectPlainJson(v, `${path}.${k}`);
    }
  } else if (!['string', 'boolean'].includes(typeof value) && value !== null) {
    throw new Error(`${path} is a ${typeof value}`);
  }
}

/** A scripted Gem Run: the bot's first ten minutes, recorded as a replay log. */
function scripted(): { replay: Replay; final: GameState } {
  const log: ReplayEntry[] = [];
  const result = playRun(77, 'normal', 30 * 60 * 10, { record: log });
  return { replay: { mode: 'gem', seed: 77, difficulty: 'normal', log, until: result.state.tick }, final: result.state };
}

/**
 * The same log with more of Gem's commands spliced in mid-Wave: a swap, Rock
 * removals, and commands that are refused. The replay is then the truth.
 */
function spliced(r: Replay): Replay {
  const at = r.log[Math.floor(r.log.length / 2)]!.tick + 90;
  const extra: ReplayEntry[] = [
    { tick: at, command: { type: 'gem.swap', a: 3, b: 7 } },
    { tick: at, command: { type: 'gem.removeRock', tower: 2 } },
    { tick: at + 1, command: { type: 'gem.removeRock', tower: 4 } },
    { tick: at + 70, command: { type: 'gem.removeRock', tower: 4 } },
    { tick: at + 70, command: { type: 'startWave' } },
    { tick: at + 71, command: { type: 'gem.merge', tower: 1, count: 9 } },
  ];
  const log = [...r.log, ...extra].sort((a, b) => a.tick - b.tick);
  return { ...r, log };
}

function playOn(state: GameState, r: Replay, until: number): void {
  while (state.tick < until) {
    const now = r.log.filter((e) => e.tick === state.tick).map((e) => e.command as Command);
    advance(state, 1, now);
  }
}

describe('Gem determinism', () => {
  const { replay: fixture, final } = scripted();
  const until = fixture.until!;

  it('replays a scripted Run to the same hash, and a different seed to another', () => {
    expect(fixture.log.length).toBeGreaterThan(50);
    expect(final.wave.number).toBeGreaterThanOrEqual(5);
    const kinds = new Set(fixture.log.map((e) => e.command.type));
    expect([...kinds]).toEqual(expect.arrayContaining(['gem.placeDraft', 'gem.buyQuality']));
    expect(replayHash(fixture)).toBe(hashState(final));
    expect(replayHash(fixture)).toBe(replayHash(fixture));
    expect(replayHash({ ...fixture, seed: fixture.seed + 1 })).not.toBe(hashState(final));
    expectPlainJson(final);
  });

  it('continues identically from a JSON snapshot, mid-Wave and between Waves', () => {
    const r = spliced(fixture);
    const straight = replay(r, until);
    expect(hashState(replay(r, until))).toBe(hashState(straight));
    expect(hashState(straight)).not.toBe(hashState(final));
    const cuts = [Math.floor(until / 3), Math.floor(until / 2), r.log[Math.floor(r.log.length / 2)]!.tick + 91, until - 200];
    const phases = new Set<string>();
    for (const cut of cuts) {
      const first = replay(r, cut);
      phases.add(first.phase);
      const restored = restore(snapshot(first));
      expect(snapshot(restored)).toBe(snapshot(first));
      playOn(restored, r, until);
      expect(hashState(restored)).toBe(hashState(straight));
    }
    expect(phases.has('wave')).toBe(true);
  });
});
