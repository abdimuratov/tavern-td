import { describe, expect, it } from 'vitest';
import {
  advance, createRun, hashState, replay, replayHash, restore, snapshot, step,
  type Command, type GameState, type Replay, type SimEvent,
} from '../../src/sim';
import { FIXTURE_REPLAY } from '../../src/sim/testing';
import { ofType } from './helpers';

const UNTIL = FIXTURE_REPLAY.until!;

function commandsAt(r: Replay, tick: number): Command[] {
  return r.log.filter((e) => e.tick === tick).map((e) => e.command);
}

/** Plays the rest of a replay from wherever `state` is, `batch` ticks per call where no command falls inside a batch. */
function playOn(state: GameState, r: Replay, until: number, batch = 1): SimEvent[] {
  const events: SimEvent[] = [];
  while (state.tick < until) {
    const nextCommand = r.log.find((e) => e.tick > state.tick)?.tick ?? until;
    const n = Math.min(batch, until - state.tick, nextCommand - state.tick);
    events.push(...advance(state, n, commandsAt(r, state.tick)));
  }
  return events;
}

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

describe('determinism', () => {
  it('the same seed and command log give the same hash after several Waves', () => {
    const a = replay(FIXTURE_REPLAY, UNTIL);
    const b = replay(FIXTURE_REPLAY, UNTIL);
    expect(a.wave.number).toBe(4);
    expect(hashState(a)).toBe(hashState(b));
    expect(replayHash(FIXTURE_REPLAY)).toBe(hashState(a));
    expect(replayHash({ ...FIXTURE_REPLAY, seed: FIXTURE_REPLAY.seed + 1 })).not.toBe(hashState(a));
  });

  it('the fixture exercises the whole core', () => {
    const s = createRun(FIXTURE_REPLAY);
    const statuses = new Set<string>();
    const events: SimEvent[] = [];
    while (s.tick < UNTIL) {
      events.push(...step(s, commandsAt(FIXTURE_REPLAY, s.tick)));
      for (const c of s.creeps) for (const st of c.status) statuses.add(st.key);
    }
    expect(s.phase).toBe('won');
    expect(ofType(events, 'waveStart')).toHaveLength(4);
    expect(ofType(events, 'rejected').length).toBeGreaterThanOrEqual(2);
    expect(ofType(events, 'removed')).toHaveLength(1);
    expect(ofType(events, 'kill').length).toBeGreaterThan(0);
    expect(ofType(events, 'leak').length).toBeGreaterThan(0);
    const kinds = new Set(ofType(events, 'hit').map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['attack', 'crit', 'splash']);
    expect([...statuses].sort()).toEqual(expect.arrayContaining(['armor', 'aura:armor', 'aura:slow', 'poison', 'slow', 'stun']));
    expect(new Set(s.creeps.map((c) => c.air)).size).toBeLessThanOrEqual(1);
    expect(ofType(events, 'spawn').some((e) => e.spec === 'bat')).toBe(true);
  });

  it('a Run snapshotted mid-Wave, JSON-restored and continued matches the uninterrupted one', () => {
    const straight = hashState(replay(FIXTURE_REPLAY, UNTIL));
    for (const cut of [37, 450, 1000, 1700]) {
      const first = replay(FIXTURE_REPLAY, cut);
      expect(first.phase).toBe('wave');
      const json = snapshot(first);
      const restored = restore(json);
      expect(snapshot(restored)).toBe(json);
      playOn(restored, FIXTURE_REPLAY, UNTIL);
      expect(hashState(restored)).toBe(straight);
    }
  });

  it('one tick per step equals any batching, so game speed cannot change the outcome', () => {
    const one = createRun(FIXTURE_REPLAY);
    const reference = JSON.stringify(playOn(one, FIXTURE_REPLAY, UNTIL, 1));
    for (const batch of [2, 3, 7]) {
      const s = createRun(FIXTURE_REPLAY);
      expect(JSON.stringify(playOn(s, FIXTURE_REPLAY, UNTIL, batch))).toBe(reference);
      expect(hashState(s)).toBe(hashState(one));
    }
  });

  it('keeps the state plain JSON throughout: no NaN, Infinity, undefined or class instances', () => {
    const s = createRun(FIXTURE_REPLAY);
    while (s.tick < UNTIL) {
      step(s, commandsAt(FIXTURE_REPLAY, s.tick));
      if (s.tick % 97 === 0) expectPlainJson(s);
    }
    expectPlainJson(s);
  });

  it('refuses a snapshot it cannot read', () => {
    expect(() => restore('{"v":0}')).toThrow();
    expect(() => restore('null')).toThrow();
    expect(() => restore(JSON.stringify({ v: 1 }))).toThrow();
  });
});
