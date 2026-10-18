import { describe, expect, it } from 'vitest';
import { LW_SENDS, SCORE, START_LIVES, SUDDEN_DEATH_AT } from '../../../src/content/linewars';
import { TICK_RATE, linewars } from '../../../src/sim';
import { LAST_TICK } from './bots';
import { at, col, creepIn, modeEvents, newRun, ofType, purse, reasons, run, runTo, send, type LwRun, type Side } from './helpers';

const SD = SUDDEN_DEATH_AT * TICK_RATE;

/** A creep of `spec` one step from `field`'s exit, walking. */
function aboutToLeak(s: LwRun, field: Side, spec: string): number {
  const p = at(col(field, 7), 30);
  return creepIn(s, field, spec, p.x, p.y + 20, { speed: 300 }).id;
}

describe('Leaks', () => {
  it('move the creep\'s steal from the defender to the sender, once, and remove it', () => {
    const s = newRun();
    s.mode.sides[1].live = 1;
    const id = aboutToLeak(s, 0, 'raider');
    const events = run(s, 10);
    expect(modeEvents(events, 'lw.leak').map((e) => e.data)).toEqual([{ creep: id, send: 'brawler', from: 0, to: 1, lives: 1 }]);
    // The core's lives never move: Line Wars moves them itself.
    expect(ofType(events, 'leak')).toEqual([{ type: 'leak', creep: id, lives: 0, restart: false }]);
    expect(ofType(events, 'livesChanged')).toEqual([]);
    expect(s.creeps.some((c) => c.id === id)).toBe(false);
    expect(purse(s).lives).toEqual([START_LIVES - 1, START_LIVES + 1]);
    expect(purse(s).live).toEqual([0, 0]);
    expect(s.mode.sides.map((x) => [x.stolen, x.leaked, x.lost])).toEqual([[0, 1, 1], [1, 0, 0]]);
    expect(s.lives).toBe(1);
    expect(s.mode.score).toBe(0);
  });

  it('steal 2 for a Warlord and 3 for a Mammoth, and score 100 a life for your own', () => {
    const s = newRun();
    aboutToLeak(s, 1, 'warlord');
    aboutToLeak(s, 1, 'mammoth');
    const events = run(s, 10);
    expect(modeEvents(events, 'lw.leak').map((e) => (e.data as { lives: number }).lives)).toEqual([LW_SENDS.warlord.steals, LW_SENDS.mammoth.steals]);
    expect(purse(s).lives).toEqual([START_LIVES + 5, START_LIVES - 5]);
    expect(s.mode.score).toBe(5 * SCORE.perSteal);
    expect(linewars.lwRecord(s).wave).toBe(5);
  });

  it('never take more than the defender has, and end the Run the tick a Side is out', () => {
    const s = newRun();
    s.mode.sides[0].lives = 1;
    aboutToLeak(s, 0, 'mammoth');
    aboutToLeak(s, 0, 'raider');
    const events = run(s, 10);
    // The Mammoth would steal 3 but there is one life to take; the Brawler behind it, the same tick, changes nothing.
    expect(modeEvents(events, 'lw.leak').map((e) => (e.data as { lives: number }).lives)).toEqual([1]);
    expect(purse(s).lives).toEqual([0, START_LIVES + 1]);
    expect(modeEvents(events, 'lw.end').map((e) => e.data)).toEqual([{ result: 'side1', why: 'lives', tick: s.mode.endTick }]);
    expect(ofType(events, 'lost')).toHaveLength(1);
    expect([s.phase, s.mode.result, s.mode.why]).toEqual(['lost', 'side1', 'lives']);
    expect(reasons(send(s, { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 0), row: 4 }))).toEqual(['the Run is over']);
  });

  it('that win it for you score 1,000, 5 a second left before 20:00, and 20 a life left', () => {
    const s = newRun();
    s.mode.sides[1].lives = 2;
    runTo(s, 600);
    aboutToLeak(s, 1, 'warlord');
    const events = run(s, 10);
    expect(ofType(events, 'won')).toHaveLength(1);
    expect(s.phase).toBe('won');
    const left = Math.floor((SCORE.clock * TICK_RATE - s.mode.endTick) / TICK_RATE);
    expect(s.mode.score).toBe(2 * SCORE.perSteal + SCORE.win + SCORE.perSecond * left + SCORE.perLife * (START_LIVES + 2));
    expect(linewars.lwRecord(s)).toMatchObject({ wave: 2, won: true, draw: false, seconds: s.mode.endTick / TICK_RATE });
  });
});

describe('Sudden Death', () => {
  it('starts at 15:00: each income tick pays, then drains a life from each Side', () => {
    const s = newRun();
    runTo(s, SD);
    let events = run(s, 1);
    expect(modeEvents(events, 'lw.sudden')).toHaveLength(1);
    expect(modeEvents(events, 'lw.income')).toHaveLength(1);
    expect(modeEvents(events, 'lw.drain').map((e) => e.data)).toEqual([{ lives: [START_LIVES - 1, START_LIVES - 1] }]);
    expect(linewars.lwStatus(s)).toMatchObject({ sudden: true, suddenIn: 0 });
    events = run(s, 10 * TICK_RATE);
    expect(modeEvents(events, 'lw.drain')).toHaveLength(1);
    expect(purse(s).lives).toEqual([START_LIVES - 2, START_LIVES - 2]);
  });

  it('ends a drain that empties one Side with the other\'s win', () => {
    const s = newRun();
    runTo(s, SD);
    s.mode.sides[1].lives = 1;
    const events = run(s, 1);
    expect([s.phase, s.mode.result, s.mode.why]).toEqual(['won', 'side0', 'drain']);
    expect(modeEvents(events, 'lw.end')).toHaveLength(1);
  });

  it('gives a drain that empties both Sides at once to the higher income, and calls equal incomes a draw', () => {
    const higher = newRun();
    runTo(higher, SD);
    higher.mode.sides[0].lives = 1;
    higher.mode.sides[1].lives = 1;
    higher.mode.sides[1].income = 40;
    run(higher, 1);
    expect([higher.phase, higher.mode.result, higher.mode.why]).toEqual(['lost', 'side1', 'income']);
    const even = newRun();
    runTo(even, SD);
    even.mode.sides[0].lives = 1;
    even.mode.sides[1].lives = 1;
    const events = run(even, 1);
    // A draw is phase `lost`, with result `draw`.
    expect([even.phase, even.mode.result, even.mode.why]).toEqual(['lost', 'draw', 'draw']);
    expect(ofType(events, 'lost')).toHaveLength(1);
    expect(linewars.lwRecord(even)).toMatchObject({ won: false, draw: true });
  });

  it('ends every Run by 19:50: two Sides that never build or send are both out on the 30th drain', () => {
    const s = newRun();
    let checkpoints = 0;
    let last = -1;
    while (s.phase === 'build') {
      const events = run(s, 1);
      checkpoints += modeEvents(events, 'lw.checkpoint').length;
      if (s.phase === 'build') last = s.tick;
    }
    expect(s.mode.endTick).toBe(LAST_TICK);
    expect(LAST_TICK).toBe((19 * 60 + 50) * TICK_RATE);
    expect(last).toBe(LAST_TICK);
    expect([s.mode.result, s.mode.why, ...purse(s).lives]).toEqual(['draw', 'draw', 0, 0]);
    // An autosave checkpoint every minute.
    expect(checkpoints).toBe(Math.floor(LAST_TICK / (60 * TICK_RATE)));
  });
});
