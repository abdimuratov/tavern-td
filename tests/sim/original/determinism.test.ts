import { describe, expect, it } from 'vitest';
import {
  advance, createRun, hashState, replay, replayHash, restore, snapshot, step,
  type Command, type GameState, type Replay, type ReplayEntry, type SimEvent,
} from '../../../src/sim';
import { ORIGINAL_FIXTURE_REPLAY } from '../../../src/sim/testing';
import { playStage } from './bot';
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

const TALENTS = ['fletching', 'quick-nock', 'woodcutters', 'hawkeye', 'deep-chill', 'brittle', 'focus', 'mana-flow', 'echo'];

/** The bot's whole Stage 1 on Easy with every family open, calling Waves early, as a replay log. */
function scripted(): { replay: Replay; final: GameState } {
  const log: ReplayEntry[] = [];
  const families = ['arrow', 'frost', 'cannon', 'arcane', 'poison', 'totem'] as const;
  const result = playStage(31, 'easy', { record: log, cleared: 12, families, talents: TALENTS, greedy: true });
  return {
    replay: { mode: 'original', seed: 31, difficulty: 'easy', options: { stage: 1, talents: TALENTS, cleared: 12 }, log, until: result.state.tick },
    final: result.state,
  };
}

function playOn(state: GameState, r: Replay, until: number): void {
  while (state.tick < until) advance(state, 1, r.log.filter((e) => e.tick === state.tick).map((e) => e.command as Command));
}

describe('Original determinism', () => {
  const { replay: fixture, final } = scripted();
  const until = fixture.until!;

  it('replays a bot Run to the same hash, and a different seed to another', () => {
    expect(final.phase).toBe('won');
    expect(fixture.log.length).toBeGreaterThanOrEqual(15);
    const kinds = new Set(fixture.log.map((e) => e.command.type));
    expect([...kinds]).toEqual(expect.arrayContaining(['original.build', 'original.upgrade', 'original.sendNow']));
    expect(replayHash(fixture)).toBe(hashState(final));
    expect(replayHash(fixture)).toBe(replayHash(fixture));
    expect(replayHash({ ...fixture, seed: fixture.seed + 1 })).not.toBe(hashState(final));
    expectPlainJson(final);
  });

  it('continues identically from a JSON snapshot, mid-Wave and in a Break', () => {
    const straight = replay(fixture, until);
    const cuts = [Math.floor(until / 5), Math.floor(until / 3), Math.floor(until / 2), Math.floor((until * 4) / 5), until - 50];
    const moments = new Set<string>();
    for (const cut of cuts) {
      const first = replay(fixture, cut);
      moments.add(first.phase);
      if ((first.mode as { breakUntil: number }).breakUntil >= 0) moments.add('break');
      const json = snapshot(first);
      const restored = restore(json);
      expect(snapshot(restored)).toBe(json);
      playOn(restored, fixture, until);
      expect(hashState(restored)).toBe(hashState(straight));
    }
    expect(moments.has('wave')).toBe(true);
    expect(moments.has('break')).toBe(true);
  });

  it('plays the same at any batching, so game speed can\'t change the outcome', () => {
    const one = createRun(fixture);
    playOn(one, fixture, 3000);
    const batched = createRun(fixture);
    while (batched.tick < 3000) {
      const next = fixture.log.find((e) => e.tick > batched.tick)?.tick ?? 3000;
      const n = Math.min(3, 3000 - batched.tick, next - batched.tick);
      advance(batched, n, fixture.log.filter((e) => e.tick === batched.tick).map((e) => e.command));
    }
    expect(hashState(batched)).toBe(hashState(one));
  });

  it('has a fixed replay fixture for the WebKit check that touches the mode\'s systems', () => {
    const r = ORIGINAL_FIXTURE_REPLAY;
    const s = createRun(r);
    const events: SimEvent[] = [];
    const statuses = new Set<string>();
    while (s.tick < r.until!) {
      events.push(...step(s, r.log.filter((e) => e.tick === s.tick).map((e) => e.command)));
      for (const c of s.creeps) for (const st of c.status) statuses.add(st.key);
      if (s.tick % 499 === 0) expectPlainJson(s);
    }
    expect(hashState(s)).toBe(replayHash(r));
    expect(ofType(events, 'waveStart')).toHaveLength(6);
    expect(ofType(events, 'rejected').length).toBeGreaterThanOrEqual(3);
    expect(ofType(events, 'changed').length).toBeGreaterThanOrEqual(12);
    expect(ofType(events, 'removed').length).toBeGreaterThanOrEqual(3);
    expect(ofType(events, 'leak').length).toBeGreaterThanOrEqual(1);
    expect(ofType(events, 'hit').some((e) => e.kind === 'crit')).toBe(true);
    for (const name of ['original.earlyCall', 'original.split', 'original.brood', 'original.enrage', 'original.levelUp']) {
      expect(modeEvents(events, name).length, name).toBeGreaterThan(0);
    }
    expect([...statuses]).toEqual(expect.arrayContaining(['original:poison', 'original:slow', 'original:war', 'original:enrage']));
    expect(s.phase).toBe('lost');
    expectPlainJson(s);
  });
});
