import { describe, expect, it } from 'vitest';
import { AI_PROFILES, FIELD_COLS, ROW_WALLS, SEND_IDS } from '../../../src/content/linewars';
import { MAUL_TOWERS, RACE_SPECS } from '../../../src/content/maul';
import { DIFFICULTIES, TICK_RATE, linewars, restore, snapshot, step, type SimEvent } from '../../../src/sim';
import { LAST_TICK, playLw } from './bots';
import { col, modeEvents, newRun, reasons, run, runTo, send } from './helpers';

describe('the Rival\'s AI', () => {
  it('never issues a command the handler refuses, over whole Runs on every Difficulty, and builds, upgrades and sends', () => {
    for (const d of DIFFICULTIES) {
      const r = playLw(2, d);
      expect(r.aiRefused, d).toEqual([]);
      expect(r.ticks, d).toBeLessThanOrEqual(LAST_TICK + 1);
      expect(r.result, d).not.toBe('playing');
      for (const side of [0, 1] as const) {
        const s = r.state.mode.sides[side];
        const towers = r.state.towers.filter((t) => linewars.towerSide(r.state, t) === side);
        expect(towers.length, `${d} side ${side}`).toBeGreaterThan(20);
        expect(towers.some((t) => MAUL_TOWERS[t.spec]!.maul.tier >= 2), `${d} side ${side}`).toBe(true);
        expect(s.sent, `${d} side ${side}`).toBeGreaterThan(5);
        expect(r.aiCommands[side], `${d} side ${side}`).toBeGreaterThan(50);
      }
    }
  });

  it('refuses a logged command for a Side it plays, on both Sides when it plays both', () => {
    const s = newRun({ drivers: ['ai', 'ai'] });
    runTo(s, 700);
    expect(reasons(send(s,
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 0), row: 20 },
      { type: 'lw.send', side: 1, send: 'snowlings' },
    ))).toEqual(['the Rival\'s AI plays that Side', 'the Rival\'s AI plays that Side']);
  });

  it('runs not at all when both Sides are people, ready for versus', () => {
    const s = newRun({ drivers: ['human', 'human'] });
    const events = run(s, 3 * 60 * TICK_RATE);
    expect(s.mode.ai).toEqual([null, null]);
    expect(modeEvents(events, 'lw.ai')).toEqual([]);
    expect(s.towers).toEqual([]);
    expect(s.mode.sides.map((x) => x.sent)).toEqual([0, 0]);
  });

  it('acts only through ordinary commands, each answered by `lw.ai` with the Side and the command', () => {
    const s = newRun({ drivers: ['human', 'ai'], rivalRace: 'runecasters' });
    const events = run(s, 20 * TICK_RATE);
    const ai = modeEvents(events, 'lw.ai').map((e) => e.data as { side: number; command: { type: string; side: number; spec?: string; to?: string } });
    expect(ai.every((a) => a.side === 1 && a.command.side === 1)).toBe(true);
    // The opening: its blueprint's first Wall, upgraded at once to the Glyph (the Runecasters'), then Walls.
    const [wall, , glyph] = RACE_SPECS.runecasters.builds;
    expect(ai[0]!.command).toMatchObject({ type: 'lw.build', spec: wall });
    expect(ai[1]!.command).toMatchObject({ type: 'lw.upgrade', to: glyph });
    expect(ai.slice(2).every((a) => a.command.type === 'lw.build' && a.command.spec === wall)).toBe(true);
    // Every tower it stands is in its own Field, and it spent only its own gold.
    const theirs = s.towers.filter((t) => linewars.towerSide(s, t) === 1);
    expect(theirs.length).toBe(ai.filter((a) => a.command.type === 'lw.build').length);
    expect(s.towers.every((t) => linewars.towerSide(s, t) === 1)).toBe(true);
    expect(s.mode.sides[0].gold).toBe(150 + 10);
    // Its think ticks: Side 1 thinks half an interval after Side 0 would.
    const interval = AI_PROFILES.normal.think * TICK_RATE;
    const ticksOf = new Set<number>();
    const s2 = newRun({ drivers: ['ai', 'ai'] });
    for (let i = 0; i < 1200; i++) {
      const tick = s2.tick;
      for (const e of step(s2, [])) if (e.type === 'mode' && e.name === 'lw.ai') ticksOf.add(((e.data as { side: number }).side * 1000) + (tick % interval));
    }
    expect([...ticksOf].sort((a, b) => a - b)).toEqual([0, 1000 + interval / 2]);
  });

  it('reads nothing of your gold or Stock: changing them changes none of its moves', () => {
    const play = (tamper: boolean): string[] => {
      // You build nothing, so plenty of lives keep the Run going.
      const s = newRun({ drivers: ['human', 'ai'], difficulty: 'hard', seed: 4, lives: 1000 });
      runTo(s, 2 * 60 * TICK_RATE);
      if (tamper) {
        s.mode.sides[0].gold = 99999;
        s.gold = 99999;
        for (const id of SEND_IDS) s.mode.sides[0].stock[id] = 7;
      }
      const events: SimEvent[] = run(s, 6 * 60 * TICK_RATE);
      return modeEvents(events, 'lw.ai').map((e) => JSON.stringify(e.data));
    };
    const honest = play(false);
    expect(honest.length).toBeGreaterThan(30);
    expect(play(true)).toEqual(honest);
  });

  it('draws its variations from its own RNG stream, never the Run\'s', () => {
    const easy = newRun({ drivers: ['ai', 'ai'], skills: ['easy', 'easy'], seed: 9 });
    // Named Races draw nothing at setup, so the Run's RNG is untouched however the AIs drew their maze flips and skips.
    expect(easy.rng.s).toBe(9);
    const [a, b] = easy.mode.ai;
    expect(a!.rng).not.toBe(easy.rng);
    expect(a!.rng.s).not.toBe(b!.rng.s);
    // Easy skips a quarter of its six rows' Walls; Normal builds the whole blueprint.
    expect(a!.skip.length).toBeGreaterThan(0);
    expect(a!.skip.every((i) => i < AI_PROFILES.easy.rows * ROW_WALLS)).toBe(true);
    expect(newRun({ drivers: ['ai', 'ai'], seed: 9 }).mode.ai[1]!.skip).toEqual([]);
  });

  it('keeps its memory plain JSON, so a save resumes it mid-thought', () => {
    const s = newRun({ drivers: ['ai', 'ai'], difficulty: 'hard', seed: 5 });
    runTo(s, 9 * 60 * TICK_RATE + 7);
    const restored = restore(snapshot(s)) as typeof s;
    expect(restored.mode.ai).toEqual(s.mode.ai);
    const a = run(s, 600).filter((e) => e.type === 'mode' && e.name === 'lw.ai');
    const b = run(restored, 600).filter((e) => e.type === 'mode' && e.name === 'lw.ai');
    expect(b).toEqual(a);
    // Its towers stay in its own Field.
    for (const t of s.towers) {
      const side = linewars.towerSide(s, t);
      const c = t.cell % s.map.cols;
      expect(c >= FIELD_COLS[side as 0 | 1][0] && c <= FIELD_COLS[side as 0 | 1][1]).toBe(true);
    }
  });
});
