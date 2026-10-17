import { describe, expect, it } from 'vitest';
import { original } from '../../../src/sim';
import { creepOnRoute, hit, modeEvents, newRun, ofType, run, runUntil, send, towerAtPoint, type OriginalRun } from './helpers';

function bossWave(s: OriginalRun, creep: string): void {
  s.mode.waves = [{ groups: [{ creep, count: 1 }] }];
  s.wave.total = 1;
  send(s, { type: 'original.sendNow' });
}

describe('the Bloater', () => {
  it('bursts into 2 Crawlers where it dies, which pay no bounty but still count toward the Wave', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'bloater', count: 1 }] }] });
    send(s, { type: 'original.sendNow' });
    const bloater = s.creeps[0]!;
    run(s, 60);
    const dist = bloater.dist!;
    const gold = s.gold;
    const events = hit(s, bloater, 1000, 'pierce');
    expect(ofType(events, 'kill')[0]!.bounty).toBe(Math.round(original.bountyPool(1)));
    expect(s.gold).toBe(gold + 10);
    const split = modeEvents(events, 'original.split')[0]!;
    const crawlers = s.creeps.filter((c) => c.spec === 'crawler');
    expect(crawlers).toHaveLength(2);
    expect((split.data as { into: number[] }).into).toEqual(crawlers.map((c) => c.id));
    for (const c of crawlers) {
      expect(c.wave).toBe(1);
      expect(c.dist!).toBeLessThanOrEqual(dist);
      expect(c.dist!).toBeGreaterThan(dist - 30);
      expect(c.maxHp).toBe(8);
      expect(s.mode.creeps[String(c.id)]!.dropped).toBe(true);
    }
    for (const c of crawlers) hit(s, c, 100, 'pierce');
    expect(s.gold).toBe(gold + 10);
    const end = run(s, 1);
    expect(ofType(end, 'waveEnd')).toEqual([{ type: 'waveEnd', wave: 1 }]);
  });
});

describe('regeneration', () => {
  it('heals a Flesh Golem 3% of its max HP a second, but not while poisoned with Antivenom', () => {
    const s = newRun();
    const golem = creepOnRoute(s, 'flesh_golem', 100, 1000);
    golem.hp = 500;
    run(s, 30);
    expect(golem.hp).toBeCloseTo(530, 6);
    const anti = newRun({ talents: ['lingering', 'corrode', 'antivenom'] });
    const g = creepOnRoute(anti, 'flesh_golem', 100, 1000);
    g.hp = 500;
    g.status.push({ kind: original.STATUS.poison, key: original.KEY.poison, value: 0.001, ticks: 60, src: 0 });
    run(anti, 30);
    expect(g.hp).toBeCloseTo(500, 1);
  });

  it('lowers armor on poisoned creeps by 2 with Corrode', () => {
    const s = newRun({ talents: ['lingering', 'corrode'] });
    const c = creepOnRoute(s, 'ghoul', 100, 10_000);
    c.status.push({ kind: original.STATUS.poison, key: original.KEY.poison, value: 0.001, ticks: 60, src: 0 });
    hit(s, c, 100, 'pierce');
    expect(10_000 - c.hp).toBeCloseTo(100 * (2 - 0.94 * 0.94), 6);
  });
});

describe('bosses', () => {
  it('enrage the Gravelord at half HP: +50% speed for 4 s, once', () => {
    const s = newRun();
    bossWave(s, 'gravelord');
    const g = s.creeps[0]!;
    expect(g.maxHp).toBe(400);
    run(s, 30);
    const step0 = g.dist!;
    run(s, 30);
    expect(g.dist! - step0).toBeCloseTo(100, 6);
    const events = hit(s, g, 210, 'poison');
    expect(modeEvents(events, 'original.enrage')).toHaveLength(1);
    const before = g.dist!;
    run(s, 30);
    expect(g.dist! - before).toBeCloseTo(150, 6);
    run(s, 90);
    const later = g.dist!;
    run(s, 30);
    expect(g.dist! - later).toBeCloseTo(100, 6);
    expect(modeEvents(hit(s, g, 10, 'poison'), 'original.enrage')).toHaveLength(0);
  });

  it('take slows at half strength and ignore stuns and freezes', () => {
    const s = newRun({ seed: 3, talents: ['black-powder', 'shrapnel', 'salvage', 'concussion'] });
    towerAtPoint(s, 'great_bombard', 1536, 320);
    const boss = creepOnRoute(s, 'gravelord', 1536, 1_000_000);
    const ghoul = creepOnRoute(s, 'ghoul', 1530, 1_000_000);
    let stunned = 0;
    for (let i = 0; i < 30 * 60; i++) {
      run(s, 1);
      if (ghoul.status.some((x) => x.key === original.KEY.stun)) stunned++;
      expect(boss.status.some((x) => x.key === original.KEY.stun || x.key === original.KEY.freeze)).toBe(false);
    }
    expect(stunned).toBeGreaterThan(0);
    // Frost's 40% slow is 20% on a boss.
    towerAtPoint(s, 'glacier_spire', 1536, 320);
    run(s, 40);
    expect(boss.status.find((x) => x.key === original.KEY.slow)?.value).toBe(0.2);
  });

  it('lets the Plague Mother regain 1% a second and drop 3 Crawlers behind her every 6 s', () => {
    const s = newRun();
    bossWave(s, 'plague_mother');
    const m = s.creeps[0]!;
    expect(m.maxHp).toBe(600);
    m.hp = 300;
    run(s, 30);
    expect(m.hp).toBeCloseTo(306, 6);
    const events = runUntil(s, () => s.creeps.some((c) => c.spec === 'crawler'));
    expect(s.tick).toBe(1 + 6 * 30);
    const brood = modeEvents(events, 'original.brood');
    expect(brood).toHaveLength(1);
    const crawlers = s.creeps.filter((c) => c.spec === 'crawler');
    expect(crawlers).toHaveLength(3);
    for (const c of crawlers) {
      expect(c.dist!).toBeLessThanOrEqual(m.dist!);
      expect(s.mode.creeps[String(c.id)]!.dropped).toBe(true);
    }
    expect(modeEvents(run(s, 30 * 6), 'original.brood')).toHaveLength(1);
  });

  it('shields the Riftlord four times as strongly for 4 s and calls 4 Hounds at 75%, 50% and 25% HP', () => {
    const s = newRun();
    bossWave(s, 'riftlord');
    const r = s.creeps[0]!;
    expect(r.maxHp).toBe(1000);
    run(s, 30);
    let events = hit(s, r, 260, 'poison');
    const rift = modeEvents(events, 'original.rift');
    expect(rift).toHaveLength(1);
    expect(rift[0]!.data).toMatchObject({ phase: 1, shield: 8 });
    expect(s.creeps.filter((c) => c.spec === 'hound')).toHaveLength(4);
    // The Shield blocks 8 of every hit for 4 s; poison over time ignores it.
    const before = r.hp;
    hit(s, r, 20, 'poison');
    expect(before - r.hp).toBe(12);
    run(s, 30 * 4);
    const after = r.hp;
    hit(s, r, 20, 'poison');
    expect(after - r.hp).toBe(20);
    // One big hit crosses both remaining thresholds.
    events = hit(s, r, 600, 'poison');
    expect(modeEvents(events, 'original.rift').map((e) => (e.data as { phase: number }).phase)).toEqual([2, 3]);
    expect(s.creeps.filter((c) => c.spec === 'hound')).toHaveLength(12);
  });
});

describe('leaks', () => {
  it('cost a creep\'s lives and take it off the Map; 0 lives loses the Run', () => {
    const s = newRun({ waves: [{ groups: [{ creep: 'revenant', count: 1 }] }, { groups: [{ creep: 'riftlord', count: 1 }] }] });
    send(s, { type: 'original.sendNow' });
    const rev = s.creeps[0]!;
    rev.dist = 5370;
    const events = run(s, 2);
    expect(ofType(events, 'leak')).toEqual([{ type: 'leak', creep: rev.id, lives: 2, restart: false }]);
    expect(s.lives).toBe(18);
    expect(s.creeps).toHaveLength(0);
    expect(s.mode.leaks).toBe(1);
    expect(s.mode.creeps).toEqual({});
    s.mode.breakUntil = s.tick;
    run(s, 1);
    const boss = s.creeps[0]!;
    boss.dist = 5375;
    const end = run(s, 2);
    expect(ofType(end, 'lost')).toHaveLength(1);
    expect(s.phase).toBe('lost');
    expect(original.originalResult(s)).toMatchObject({ won: false, stars: 0 });
  });
});
