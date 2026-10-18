import { describe, expect, it } from 'vitest';
import { original, type Difficulty } from '../../../src/sim';
import { hit, modeEvents, newRun, ofType, reasons, run, runUntil, send } from './helpers';

describe('Threat and its curves', () => {
  it('sets a Ghoul\'s HP to 20 × 1.10^(T−1): 20 at Threat 1, 122 at 20, 422 at 33', () => {
    expect(original.ghoulHp(1)).toBe(20);
    expect(Math.round(original.ghoulHp(20))).toBe(122);
    expect(Math.round(original.ghoulHp(33))).toBe(422);
  });

  it('pools 10 × (1 + ⌊T/4⌋) of bounty per Wave and pays 20 + 4T when it is cleared', () => {
    expect([1, 3, 4, 12, 20].map(original.bountyPool)).toEqual([10, 10, 20, 40, 60]);
    expect([1, 12, 33].map(original.waveBonus)).toEqual([24, 68, 152]);
  });

  it('pays ⌊0.4 × seconds left × (1 + T/10)⌋ for an early call: at most 13 at Threat 1 and 36 at Threat 20', () => {
    expect(original.earlyCallGold(1, 30)).toBe(13);
    expect(original.earlyCallGold(20, 30)).toBe(36);
    expect(original.earlyCallGold(5, 10)).toBe(6);
    expect(original.earlyCallGold(5, 0)).toBe(0);
  });

  it('gives Wave w the Stage\'s first Threat plus w − 1, and its creeps HP by it and the Difficulty', () => {
    const s = newRun();
    expect(original.wavePreview(s, 1)).toMatchObject({ threat: 1, ghoulHp: 20, bonus: 24 });
    expect(original.wavePreview(s, 12)!.threat).toBe(12);
    s.mode.threat = 6;
    expect(original.wavePreview(s, 3)!.threat).toBe(8);
    const hp = (d: Difficulty): number => {
      const r = newRun({ difficulty: d });
      send(r, { type: 'original.sendNow' });
      return r.creeps[0]!.maxHp;
    };
    expect((['easy', 'normal', 'hard', 'insane'] as const).map(hp)).toEqual([15, 20, 26, 32]);
  });

  it('splits the pool by each creep\'s share of the Wave\'s HP', () => {
    const filler = { groups: [{ creep: 'ghoul', count: 1 }] };
    const s = newRun({ waves: [filler, filler, filler, filler, filler, { groups: [{ creep: 'ghoul', count: 6 }, { creep: 'hound', count: 6 }] }] });
    // Wave 6: 6 Ghouls and 6 Hounds (0.7×) at Threat 6, a pool of 20.
    const groups = original.waveSpec(s, 5)!.groups;
    expect(groups.map((g) => [g.creep, g.count, g.bounty])).toEqual([['ghoul', 6, 1.96], ['hound', 6, 1.37]]);
    const total = groups.reduce((sum, g) => sum + g.count * g.bounty!, 0);
    expect(total).toBeCloseTo(20, 1);
  });

  it('pays bounty in whole gold, carrying the fractions over', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'ghoul', count: 3 }, { creep: 'hound', count: 3, at: 0 }] }] });
    send(s, { type: 'original.sendNow' });
    run(s, 30 * 3);
    const gold = s.gold;
    const paid = s.creeps.map((c) => ofType(hit(s, c, 1000, 'pierce'), 'kill')[0]!.bounty);
    // 10 gold over 5.1 Ghouls' worth: 1.96 a Ghoul and 1.37 a Hound.
    expect(paid.reduce((a, b) => a + b, 0)).toBe(9);
    expect(s.gold).toBe(gold + 9);
    expect(s.mode.carry).toBe(99);
  });
});

describe('Waves, Breaks and the early call', () => {
  it('waits for Send now before Wave 1, which pays nothing', () => {
    const s = newRun();
    run(s, 30 * 60);
    expect(s.wave.number).toBe(0);
    expect(original.originalStatus(s).step).toBe('ready');
    const events = send(s, { type: 'original.sendNow' });
    expect(ofType(events, 'waveStart')).toEqual([{ type: 'waveStart', wave: 1 }]);
    expect(modeEvents(events, 'original.earlyCall')).toEqual([]);
    expect(s.gold).toBe(250);
  });

  it('starts the 30 s Break at the Wave\'s last spawn, so Waves overlap, and then sends the next on its own', () => {
    const tens = { groups: [{ creep: 'ghoul', count: 10 }] };
    const s = newRun({ waves: [tens, tens, tens] });
    send(s, { type: 'original.sendNow' });
    expect(reasons(send(s, { type: 'original.sendNow' }))).toEqual(['the Wave is still arriving']);
    const events = runUntil(s, () => s.mode.breakUntil >= 0);
    // Wave 1's tenth Ghoul spawns 9 s after the first.
    expect(ofType(events, 'spawn')).toHaveLength(9);
    expect(s.tick).toBe(1 + 9 * 30);
    expect(modeEvents(events, 'original.break')[0]!.data).toEqual({ wave: 2, ticks: 900, until: s.tick - 1 + 900 });
    expect(original.originalStatus(s)).toMatchObject({ step: 'break', break: { wave: 2, totalTicks: 900 } });
    const next = runUntil(s, () => s.wave.number === 2);
    expect(ofType(next, 'waveStart')).toEqual([{ type: 'waveStart', wave: 2 }]);
    // Nothing guards the road, so Wave 1's Ghouls are still walking it.
    expect(s.creeps.some((c) => c.wave === 1)).toBe(true);
    expect(s.wave.active.map((w) => w.number)).toEqual([1, 2]);
  });

  it('pays early-call gold for the seconds of Break skipped, at the called Wave\'s Threat', () => {
    const s = newRun();
    send(s, { type: 'original.sendNow' });
    runUntil(s, () => s.mode.breakUntil >= 0);
    run(s, 30 * 5 - 1);
    // 25 s of the 30 left, and Wave 2 is at Threat 2.
    expect(original.originalStatus(s).break!.ticksLeft).toBe(25 * 30);
    expect(original.originalStatus(s).earlyCall).toBe(12);
    const gold = s.gold;
    const events = send(s, { type: 'original.sendNow' });
    expect(modeEvents(events, 'original.earlyCall')[0]!.data).toEqual({ wave: 2, gold: 12 });
    expect(s.gold).toBe(gold + 12);
    expect(s.mode.earlyGold).toBe(12);
    expect(s.mode.breakUntil).toBe(-1);
  });

  it('lets the core\'s startWave call early too', () => {
    const s = newRun();
    send(s, { type: 'startWave' });
    runUntil(s, () => s.mode.breakUntil >= 0);
    const events = send(s, { type: 'startWave' });
    expect(modeEvents(events, 'original.earlyCall')[0]!.data).toMatchObject({ wave: 2, gold: 14 });
  });

  it('pays the end-of-Wave bonus once every creep of the Wave is dead or leaked', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'ghoul', count: 2 }] }, { groups: [{ creep: 'ghoul', count: 1 }] }] });
    send(s, { type: 'original.sendNow' });
    run(s, 31);
    const [a, b] = s.creeps;
    hit(s, a!, 100, 'pierce');
    let events = run(s, 1);
    expect(modeEvents(events, 'original.cleared')).toEqual([]);
    const gold = s.gold;
    hit(s, b!, 100, 'pierce');
    events = run(s, 1);
    expect(modeEvents(events, 'original.cleared')[0]!.data).toEqual({ wave: 1, bonus: 24 });
    expect(s.gold).toBe(gold + 5 + 24);
    expect(s.mode.completed).toBe(1);
  });

  it('refuses Send now once every Wave is out', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'ghoul', count: 1 }] }] });
    send(s, { type: 'original.sendNow' });
    expect(s.mode.breakUntil).toBe(-1);
    expect(reasons(send(s, { type: 'original.sendNow' }))).toEqual(['no Wave left to send']);
  });
});

describe('lives and Stars', () => {
  function winWith(lives: number): ReturnType<typeof original.originalResult> {
    const s = newRun({ waves: [{ groups: [{ creep: 'ghoul', count: 1 }] }, { groups: [{ creep: 'ghoul', count: 1 }] }] });
    expect(s.lives).toBe(20);
    s.lives = lives;
    send(s, { type: 'original.sendNow' });
    run(s, 2);
    hit(s, s.creeps[0]!, 100, 'pierce');
    send(s, { type: 'original.sendNow' });
    run(s, 2);
    hit(s, s.creeps[0]!, 100, 'pierce');
    const events = run(s, 1);
    expect(ofType(events, 'won')).toHaveLength(1);
    return original.originalResult(s);
  }

  it('wins when the last Wave is cleared, with 3 Stars for 18+ lives, 2 for 6+, 1 otherwise', () => {
    expect([20, 18, 17, 6, 5, 1].map((l) => winWith(l).stars)).toEqual([3, 3, 2, 2, 1, 1]);
    expect(winWith(20)).toMatchObject({ won: true, difficulty: 'normal', lives: 20, stage: 1 });
    expect(winWith(20).seconds).toBeGreaterThan(0);
  });
});
