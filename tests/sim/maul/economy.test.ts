import { describe, expect, it } from 'vitest';
import { BREAK_SECONDS, FIRST_BREAK_SECONDS, START_GOLD, START_LIVES } from '../../../src/content/maul';
import { killCreep, maul, TICK_RATE } from '../../../src/sim';
import { buildAt, field, modeEvents, newRun, ofType, placeTower, reasons, run, runUntil, send } from './helpers';

const sim = (state: maul.MaulGameState) => ({ state, rules: maul.MAUL_RULES as never, events: [] });

describe('the curves', () => {
  it('follow PLAN §4 as tuned: HP × 1.12 a Wave, a bounty pool of 20 × (1 + ⌊w/4⌋), a bonus of 20 + 4w', () => {
    expect(maul.raiderHp(1)).toBe(8);
    expect(maul.raiderHp(11)).toBeCloseTo(8 * 1.12 ** 10, 9);
    expect([1, 3, 4, 20, 40].map(maul.bountyPool)).toEqual([20, 20, 40, 120, 220]);
    expect([1, 10, 40].map(maul.waveBonus)).toEqual([24, 60, 180]);
  });

  it('pay interest of 4% of unspent gold, capped at the Wave\'s bonus', () => {
    expect(maul.interestOn(200, 1)).toBe(8);
    expect(maul.interestOn(599, 1)).toBe(23);
    expect(maul.interestOn(5000, 1)).toBe(24);
    expect(maul.interestOn(-5, 1)).toBe(0);
  });
});

describe('a Run', () => {
  it('starts with 300 gold and 20 lives, and sends Wave 1 after a 60 s Break', () => {
    const s = newRun();
    expect([s.gold, s.lives, s.wave.total]).toEqual([START_GOLD, START_LIVES, 40]);
    expect(maul.maulStatus(s)).toMatchObject({ step: 'ready', break: { wave: 1, ticksLeft: FIRST_BREAK_SECONDS * TICK_RATE } });
    run(s, FIRST_BREAK_SECONDS * TICK_RATE);
    expect(s.wave.number).toBe(0);
    run(s, 1);
    expect(s.wave.number).toBe(1);
    expect(maul.maulStatus(s).step).toBe('wave');
  });

  it('pays the Wave\'s whole bounty pool across its kills, whatever the Difficulty', () => {
    for (const difficulty of ['easy', 'insane'] as const) {
      const s = newRun({ map: field(), difficulty, waves: [{ creep: 'raider' }, { creep: 'raider' }] });
      send(s, { type: 'maul.sendNow' });
      let paid = 0;
      runUntil(s, () => {
        for (const c of s.creeps) {
          if (c.hp <= 0) continue;
          const before = s.gold;
          killCreep(sim(s), c, 0);
          paid += s.gold - before;
        }
        return s.mode.completed >= 1;
      });
      // The kills pay the pool, 20, in whole gold; the clear adds the bonus and interest on top.
      expect(paid).toBe(20);
    }
  });

  it('pays the bonus and interest once a Wave is cleared, then starts a 30 s Break: Waves never overlap', () => {
    const s = newRun({ map: field(48, 12), gold: 500, waves: [{ creep: 'brute' }, { creep: 'brute' }, { creep: 'brute' }] });
    // No towers: every creep leaks, so give the Run lives to spare.
    s.lives = 1000;
    send(s, { type: 'maul.sendNow' });
    const events = runUntil(s, () => s.mode.completed >= 1);
    expect(s.wave.number).toBe(1);
    const cleared = modeEvents(events, 'maul.cleared')[0]!.data as { bonus: number; interest: number };
    expect(cleared.bonus).toBe(24);
    expect(cleared.interest).toBe(Math.min(24, Math.floor(0.04 * (s.gold - 24 - cleared.interest))));
    expect(s.mode.interest).toBe(cleared.interest);
    expect(modeEvents(events, 'maul.break')[0]!.data).toMatchObject({ wave: 2, ticks: BREAK_SECONDS * TICK_RATE });
    expect(s.phase).toBe('build');
  });

  it('sends the next Wave by itself when the Break runs out, or at once on Send now, which pays nothing', () => {
    const s = newRun({ map: field(48, 12), waves: [{ creep: 'raider' }, { creep: 'raider' }, { creep: 'raider' }] });
    s.lives = 1000;
    send(s, { type: 'maul.sendNow' });
    expect(reasons(send(s, { type: 'maul.sendNow' }))).toEqual(['a Wave is still running']);
    runUntil(s, () => s.phase === 'build');
    const due = s.mode.breakUntil;
    expect(due - s.tick).toBe(BREAK_SECONDS * TICK_RATE - 1);
    runUntil(s, () => s.wave.number === 2);
    expect(s.tick - 1).toBe(due);
    runUntil(s, () => s.phase === 'build');
    const gold = s.gold;
    const events = send(s, { type: 'startWave' });
    expect(ofType(events, 'waveStart')).toHaveLength(1);
    expect(s.gold).toBe(gold);
    runUntil(s, () => s.phase !== 'wave');
    expect(maul.sendNowError(s)).toBe('the Run is over');
  });

  it('costs lives for each leak, five for a boss, and is lost at zero', () => {
    const s = newRun({ map: field(), waves: [{ creep: 'warlord' }, { creep: 'raider' }, { creep: 'raider' }] });
    send(s, { type: 'maul.sendNow' });
    runUntil(s, () => s.mode.leaks >= 2);
    // Two gates on the real Map; a test field has one, so both bosses leave from it.
    expect(s.lives).toBe(START_LIVES - 10);
    s.lives = 1;
    runUntil(s, () => s.phase === 'lost', 30 * 180);
    expect(s.phase).toBe('lost');
    expect(maul.maulRecord(s)).toMatchObject({ won: false, wave: 2 });
  });

  it('is lost at once if the last Wave\'s boss gets through, however many lives are left', () => {
    const s = newRun({ map: field(), waves: [{ creep: 'raider' }, { creep: 'warlord' }] });
    s.lives = 1000;
    send(s, { type: 'maul.sendNow' });
    runUntil(s, () => s.phase === 'build');
    s.lives = 20;
    send(s, { type: 'maul.sendNow' });
    const events = runUntil(s, () => s.phase !== 'wave', 30 * 120);
    expect(s.phase).toBe('lost');
    expect(ofType(events, 'leak')[0]!.lives).toBe(20);
  });

  it('is won once the last Wave is cleared, scoring kills by Wave and 100 a life left', () => {
    const s = newRun({ map: field(), gold: 2000, waves: [{ creep: 'snowling' }] });
    for (const row of [0, 4, 8]) placeTower(s, 'nova_circle', 6, row);
    for (const row of [0, 4, 8]) placeTower(s, 'nova_circle', 12, row);
    s.mode.races = ['runecasters'];
    buildAt(s, 'glyph', 18, 2);
    send(s, { type: 'maul.sendNow' });
    runUntil(s, () => s.phase === 'won', 30 * 120);
    const r = maul.maulRecord(s);
    expect(r.won).toBe(true);
    expect(r.score).toBe(s.mode.kills + s.lives * 100);
    expect(r.seconds).toBeGreaterThan(0);
  });
});
