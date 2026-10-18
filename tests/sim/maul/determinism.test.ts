import { describe, expect, it } from 'vitest';
import {
  advance, createRun, hashState, replay, replayHash, restore, snapshot, step,
  type Command, type GameState, type Replay, type ReplayEntry, type SimEvent,
} from '../../../src/sim';
import { MAUL_FIXTURE_REPLAY } from '../../../src/sim/testing';
import { playRun } from './bot';
import { modeEvents, ofType } from './helpers';

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

/** The bot's first ten minutes of a Runecasters Run on Hard, recorded as a replay log. */
function scripted(): { replay: Replay; final: GameState } {
  const log: ReplayEntry[] = [];
  const result = playRun(77, 'hard', { race: 'runecasters', record: log, maxTicks: 30 * 60 * 10 });
  return { replay: { mode: 'maul', seed: 77, difficulty: 'hard', options: { race: 'runecasters' }, log, until: result.state.tick }, final: result.state };
}

function playOn(state: GameState, r: Replay, until: number): void {
  while (state.tick < until) advance(state, 1, r.log.filter((e) => e.tick === state.tick).map((e) => e.command as Command));
}

describe('Maul determinism', () => {
  const { replay: fixture, final } = scripted();
  const until = fixture.until!;

  it('replays a bot Run to the same hash, and a different seed to another', () => {
    expect(fixture.log.length).toBeGreaterThanOrEqual(30);
    expect(final.wave.number).toBeGreaterThanOrEqual(8);
    const kinds = new Set(fixture.log.map((e) => e.command.type));
    expect([...kinds]).toEqual(expect.arrayContaining(['maul.build', 'maul.upgrade', 'maul.sendNow']));
    expect(replayHash(fixture)).toBe(hashState(final));
    expect(replayHash(fixture)).toBe(replayHash(fixture));
    expect(replayHash({ ...fixture, seed: fixture.seed + 1 })).not.toBe(hashState(final));
    expectPlainJson(final);
  });

  it('continues identically from a JSON snapshot, mid-Wave and between Waves', () => {
    const straight = replay(fixture, until);
    const cuts = [Math.floor(until / 5), Math.floor(until / 3), Math.floor(until / 2), Math.floor((until * 3) / 4), until - 100];
    const phases = new Set<string>();
    for (const cut of cuts) {
      const first = replay(fixture, cut);
      phases.add(first.phase);
      const json = snapshot(first);
      const restored = restore(json);
      expect(snapshot(restored)).toBe(json);
      playOn(restored, fixture, until);
      expect(hashState(restored)).toBe(hashState(straight));
    }
    expect(phases.has('wave')).toBe(true);
  });

  it('keeps the state plain JSON through Waves from both gates', () => {
    const s = createRun({ mode: 'maul', seed: 3, difficulty: 'normal', options: { race: 'mirefolk' } });
    for (let i = 0; i < 30 * 60 * 2; i++) {
      step(s, []);
      if (i % 307 === 0) expectPlainJson(s);
    }
    expectPlainJson(s);
  });

  it('has a fixed replay fixture for the WebKit check that touches the mode\'s systems', () => {
    const s = createRun(MAUL_FIXTURE_REPLAY);
    const events: SimEvent[] = [];
    const keys = new Set<string>();
    while (s.tick < MAUL_FIXTURE_REPLAY.until!) {
      events.push(...step(s, MAUL_FIXTURE_REPLAY.log.filter((e) => e.tick === s.tick).map((e) => e.command)));
      for (const c of s.creeps) for (const st of c.status) keys.add(st.key.replace(/:\d+$/, ':n'));
    }
    expect(hashState(s)).toBe(replayHash(MAUL_FIXTURE_REPLAY));
    expect(ofType(events, 'waveStart')).toHaveLength(5);
    expect(ofType(events, 'rejected').length).toBeGreaterThanOrEqual(6);
    expect(ofType(events, 'removed').length).toBeGreaterThanOrEqual(5);
    expect(ofType(events, 'changed').length).toBeGreaterThanOrEqual(7);
    expect(ofType(events, 'leak').length).toBeGreaterThanOrEqual(1);
    expect(modeEvents(events, 'maul.juggle').length).toBeGreaterThanOrEqual(1);
    expect(modeEvents(events, 'maul.cleared')).toHaveLength(5);
    expect([...keys]).toEqual(expect.arrayContaining(['maul:venom:n', 'maul:spore', 'maul:blight', 'maul:rot']));
    expect(s.phase).toBe('won');
    expectPlainJson(s);
  });
});
