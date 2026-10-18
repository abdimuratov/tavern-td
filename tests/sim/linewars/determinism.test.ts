import { describe, expect, it } from 'vitest';
import {
  createRun, hashState, linewars, replay, replayHash, restore, snapshot, step,
  type Command, type GameState, type Replay, type ReplayEntry, type SimEvent,
} from '../../../src/sim';
import { LINEWARS_FIXTURE_REPLAY } from '../../../src/sim/testing';
import { playLw } from './bots';
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

/** Eight minutes of the Flyer bot (your Side, through the log) against the Rival's AI on Hard, as a replay. */
function scripted(): { replay: Replay; final: GameState } {
  const log: ReplayEntry[] = [];
  const result = playLw(7, 'hard', { bot: 'flyer', race: 'runecasters', rivalRace: 'rimeborn', record: log, maxTicks: 30 * 60 * 8 });
  return {
    replay: { mode: 'linewars', seed: 7, difficulty: 'hard', options: { race: 'runecasters', rivalRace: 'rimeborn' }, log, until: result.state.tick },
    final: result.state,
  };
}

function playOn(state: GameState, r: Replay, until: number, events: SimEvent[] = []): SimEvent[] {
  while (state.tick < until) events.push(...step(state, r.log.filter((e) => e.tick === state.tick).map((e) => e.command as Command)));
  return events;
}

/** Every command the AI applied, in order, with its tick. */
function aiCommands(events: readonly SimEvent[], ticks: readonly number[]): string[] {
  return events.flatMap((e, i) => (e.type === 'mode' && e.name === 'lw.ai' ? [`${ticks[i]} ${JSON.stringify(e.data)}`] : []));
}

function playCollecting(r: Replay, until: number): { state: GameState; events: SimEvent[]; ticks: number[] } {
  const state = createRun(r);
  const events: SimEvent[] = [];
  const ticks: number[] = [];
  while (state.tick < until) {
    const tick = state.tick;
    for (const e of step(state, r.log.filter((x) => x.tick === tick).map((x) => x.command as Command))) {
      events.push(e);
      ticks.push(tick);
    }
  }
  return { state, events, ticks };
}

describe('Line Wars determinism', () => {
  const { replay: fixture, final } = scripted();
  const until = fixture.until!;

  it('replays a Run to the same hash, and a different seed to another', () => {
    expect(fixture.log.length).toBeGreaterThanOrEqual(30);
    const kinds = new Set(fixture.log.map((e) => e.command.type));
    expect([...kinds]).toEqual(expect.arrayContaining(['lw.build', 'lw.upgrade', 'lw.send']));
    expect(replayHash(fixture)).toBe(hashState(final));
    expect(replayHash(fixture)).toBe(replayHash(fixture));
    expect(replayHash({ ...fixture, seed: fixture.seed + 1 })).not.toBe(hashState(final));
    expectPlainJson(final);
  });

  it('regenerates every AI command from the seed and your commands alone', () => {
    const a = playCollecting(fixture, until);
    const b = playCollecting(fixture, until);
    const first = aiCommands(a.events, a.ticks);
    expect(first.length).toBeGreaterThan(50);
    expect(aiCommands(b.events, b.ticks)).toEqual(first);
    // None of them is in the log, and every one was applied.
    expect(fixture.log.every((e) => (e.command as { side?: number }).side === 0)).toBe(true);
    expect(ofType(a.events, 'rejected').filter((e) => (e.command as { side?: number }).side === 1)).toEqual([]);
    const types = new Set(modeEvents(a.events, 'lw.ai').map((e) => (e.data as { command: { type: string } }).command.type));
    expect([...types].sort()).toEqual(['lw.build', 'lw.send', 'lw.upgrade']);
  });

  it('continues identically from a JSON snapshot, the AI\'s memory and its RNG stream included', () => {
    const straight = replay(fixture, until);
    // Cuts between and on the AI's think ticks (Side 1 on Hard thinks on ticks 7, 22, 37, …).
    const cuts = [Math.floor(until / 5), Math.floor(until / 3) + 7, Math.floor(until / 2) + 3, Math.floor((until * 3) / 4), until - 100];
    for (const cut of cuts) {
      const first = replay(fixture, cut);
      const json = snapshot(first);
      const restored = restore(json);
      expect(snapshot(restored)).toBe(json);
      expect(restored.mode).toEqual(first.mode);
      playOn(restored, fixture, until);
      expect(hashState(restored)).toBe(hashState(straight));
    }
  });

  it('keeps the state plain JSON through a Run of two AIs', () => {
    const s = createRun({ mode: 'linewars', seed: 3, difficulty: 'normal', options: { drivers: ['ai', 'ai'] } });
    for (let i = 0; i < 30 * 60 * 6; i++) {
      step(s, []);
      if (i % 911 === 0) expectPlainJson(s);
    }
    expectPlainJson(s);
  });

  it('has a fixed replay fixture for the WebKit check that touches the mode\'s systems', () => {
    const r = LINEWARS_FIXTURE_REPLAY;
    const { state: s, events } = playCollecting(r, r.until!);
    expect(hashState(s)).toBe(replayHash(r));
    expect(ofType(events, 'rejected').map((e) => e.reason)).toEqual([
      'that\'s the Rival\'s Field', 'that would block the path', 'Snowlings unlocks at 0:20', 'Ballista can\'t become that',
      'the Rival\'s AI plays that Side',
    ]);
    const ai = modeEvents(events, 'lw.ai').map((e) => (e.data as { command: { type: string } }).command.type);
    for (const type of ['lw.build', 'lw.upgrade', 'lw.send']) expect(ai.filter((t) => t === type).length, type).toBeGreaterThanOrEqual(3);
    expect(modeEvents(events, 'lw.sold').map((e) => (e.data as { full: boolean }).full)).toEqual([true, false]);
    const leaks = modeEvents(events, 'lw.leak').map((e) => (e.data as { from: number }).from);
    expect(leaks.length).toBeGreaterThanOrEqual(5);
    const ms = (s as linewars.LwGameState).mode;
    expect(ms.sides[0].lives).toBe(30 - ms.sides[1].stolen);
    expect(modeEvents(events, 'lw.unlock').length).toBeGreaterThanOrEqual(6);
    expect(modeEvents(events, 'lw.checkpoint')).toHaveLength(4);
    expect(ofType(events, 'kill').length).toBeGreaterThanOrEqual(10);
    expect(s.phase).toBe('build');
    expectPlainJson(s);
  });
});
