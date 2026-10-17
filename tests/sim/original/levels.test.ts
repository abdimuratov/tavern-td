import { describe, expect, it } from 'vitest';
import { original, towerMods } from '../../../src/sim';
import {
  buildOn, creepOnRoute, hit, modeEvents, newRun, ofType, placeTower, run, setLevel, towerAtPoint, type OriginalRun,
} from './helpers';

function ts(s: OriginalRun, id: number) {
  return s.mode.towers[String(id)]!;
}

describe('XP and Tower Levels', () => {
  it('gives a kill\'s XP to its tower, an Assist of half to towers that hit it in the last 3 s, and Totems half of kills in their aura', () => {
    const s = newRun();
    const killer = placeTower(s, 1, 'arrow_tower');
    const helper = placeTower(s, 3, 'arrow_tower');
    const late = placeTower(s, 2, 'arrow_tower');
    const totem = placeTower(s, 0, 'drum_totem');
    const c = creepOnRoute(s, 'ghoul', 100, 50);
    hit(s, c, 1, 'pierce', late.id);
    run(s, 30 * 3 + 1);
    hit(s, c, 1, 'pierce', helper.id);
    const events = hit(s, c, 100, 'pierce', killer.id);
    expect(ofType(events, 'kill')[0]!.tower).toBe(killer.id);
    expect(killer.kills).toBe(1);
    expect(ts(s, killer.id).xp).toBe(2);
    expect(ts(s, helper.id).xp).toBe(1);
    expect(ts(s, late.id).xp).toBe(0);
    // Spot 0 (1280, 320) to Spot 1 (1536, 320) is 256: in the Drum Totem's reach.
    expect(ts(s, totem.id).xp).toBe(1);
  });

  it('credits a poison kill to the tower whose poison it was', () => {
    const s = newRun();
    const t = placeTower(s, 1, 'venom_dart');
    const c = creepOnRoute(s, 'ghoul', 100, 1);
    c.status.push({ kind: original.STATUS.poison, key: original.KEY.poison, value: 30, ticks: 30, src: t.id });
    const events = run(s, 2);
    expect(ofType(events, 'kill')[0]!.tower).toBe(t.id);
    expect(ts(s, t.id).xp).toBe(2);
  });

  it('climbs Levels 1–10 at 8, 20, 36 … 216 XP, raising damage 3% a Level and telling the UI', () => {
    expect([0, 7.9, 8, 20, 56, 215, 216, 999].map(original.levelFor)).toEqual([1, 1, 2, 3, 5, 9, 10, 10]);
    const s = newRun();
    const t = placeTower(s, 1, 'arrow_tower');
    const events: ReturnType<typeof run> = [];
    for (let i = 0; i < 28; i++) {
      const c = creepOnRoute(s, 'ghoul', 100, 1);
      events.push(...hit(s, c, 10, 'pierce', t.id));
    }
    expect(ts(s, t.id)).toMatchObject({ xp: 56, level: 5 });
    const ups = modeEvents(events, 'original.levelUp').map((e) => e.data);
    expect(ups.map((d) => (d as { level: number }).level)).toEqual([2, 3, 4, 5]);
    expect(ups[3]).toEqual({ tower: t.id, level: 5, perks: [5] });
    expect(original.towerBonus(s, t)!.damage).toBeCloseTo(0.12, 9);
    setLevel(s, t, 10);
    expect(original.towerBonus(s, t)!.damage).toBeCloseTo(0.27, 9);
  });

  it('keeps XP through upgrades and loses it on a sale', () => {
    const s = newRun();
    s.gold = 1000;
    const t = buildOn(s, 1, 'arrow_tower');
    ts(s, t.id).xp = 40;
    ts(s, t.id).level = 4;
    run(s, 1, [{ type: 'original.upgrade', tower: t.id, to: 'longbow_tower' }]);
    expect(ts(s, t.id)).toMatchObject({ xp: 40, level: 4 });
    run(s, 1, [{ type: 'original.sell', tower: t.id }]);
    const again = buildOn(s, 1, 'arrow_tower');
    expect(ts(s, again.id)).toMatchObject({ xp: 0, level: 1 });
  });

  it('adds a point per Level to a Totem\'s auras instead of damage', () => {
    const s = newRun();
    const totem = placeTower(s, 0, 'drum_totem');
    const arrow = placeTower(s, 1, 'arrow_tower');
    setLevel(s, totem, 3);
    run(s, 1);
    expect(towerMods(arrow).attackSpeed).toBeCloseTo(0.17, 9);
    expect(original.towerBonus(s, totem)).toBeNull();
  });

  it('gives 25% more XP in a Totem\'s aura with Spirit Link, and builds Totems at Level 5 with Elder Spirits', () => {
    const s = newRun({ talents: ['wide-circle', 'spirit-link', 'hex', 'elder-spirits'] });
    s.gold = 1000;
    const totem = buildOn(s, 0, 'drum_totem');
    expect(ts(s, totem.id)).toMatchObject({ level: 5, xp: 56 });
    expect(original.auraRadius(s, totem)).toBeCloseTo(256 * (1 + 0.15 + 0.2), 9);
    const arrow = placeTower(s, 1, 'arrow_tower');
    hit(s, creepOnRoute(s, 'ghoul', 100, 1), 10, 'pierce', arrow.id);
    expect(ts(s, arrow.id).xp).toBe(2.5);
  });
});

describe('Perks', () => {
  it('Keen Eye (Arrow, 5): +15% range', () => {
    const s = newRun();
    const t = placeTower(s, 1, 'arrow_tower');
    expect(original.attackRange(s, t)).toBe(320);
    setLevel(s, t, 5);
    expect(original.attackRange(s, t)).toBeCloseTo(368, 9);
  });

  it('Heartseeker (Arrow, 10): every 4th arrow crits ×2.5', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'arrow_tower', 1536, 320);
    setLevel(s, t, 10);
    creepOnRoute(s, 'ghoul', 1536, 100_000);
    const hits = ofType(run(s, 30 * 8), 'hit').filter((e) => e.tower === t.id).slice(0, 8);
    const base = 6 * 1.27;
    expect(hits.map((e) => e.kind)).toEqual(['attack', 'attack', 'attack', 'crit', 'attack', 'attack', 'attack', 'crit']);
    expect(hits[3]!.damage).toBeCloseTo(base * 2.5, 9);
    expect(hits[0]!.damage).toBeCloseTo(base, 9);
  });

  it('Wide Blast (Cannon, 5): +25% splash radius', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'cannon_tower', 1300, 320);
    const target = creepOnRoute(s, 'ghoul', 1400, 1000);
    const edge = creepOnRoute(s, 'ghoul', 1270, 1000);
    run(s, 30);
    expect(1000 - edge.hp).toBe(0);
    setLevel(s, t, 5);
    const before = target.hp;
    run(s, 60);
    expect(before - target.hp).toBeGreaterThan(0);
    expect(1000 - edge.hp).toBeGreaterThan(0);
  });

  it('Double Charge (Cannon, 10): every 3rd shot fires a second shell at another creep', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'cannon_tower', 1536, 320);
    setLevel(s, t, 10);
    creepOnRoute(s, 'ghoul', 1500, 100_000);
    creepOnRoute(s, 'ghoul', 1300, 100_000);
    const fired = ofType(run(s, 30 * 5), 'fire').filter((e) => e.tower === t.id);
    // Shots 1, 2, 3 (+1), at 1.8 s apart.
    expect(fired).toHaveLength(4);
    expect(new Set(fired.slice(2).map((e) => e.target)).size).toBe(2);
  });

  it('Frost Nova (Frost, 5): every 10 s, slows every creep in range 60% for 1.5 s', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'frost_tower', 1536, 320);
    setLevel(s, t, 5);
    const a = creepOnRoute(s, 'ghoul', 1500, 100_000);
    const b = creepOnRoute(s, 'ghoul', 1400, 100_000);
    const events = run(s, 2);
    expect(modeEvents(events, 'original.frostNova')).toHaveLength(1);
    for (const c of [a, b]) expect(c.status.find((x) => x.key === original.KEY.slow)?.value).toBe(0.6);
    expect(modeEvents(run(s, 30 * 9), 'original.frostNova')).toHaveLength(0);
    expect(modeEvents(run(s, 30 * 2), 'original.frostNova')).toHaveLength(1);
  });

  it('Deep Freeze (Frost, 10): 10% of hits freeze for 1 s', () => {
    const s = newRun({ seed: 11 });
    const t = towerAtPoint(s, 'frost_tower', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1500, 1_000_000);
    run(s, 30 * 30);
    expect(c.status.some((x) => x.key === original.KEY.freeze)).toBe(false);
    setLevel(s, t, 10);
    let frozen = false;
    for (let i = 0; i < 30 * 60 && !frozen; i++) {
      run(s, 1);
      frozen = c.status.some((x) => x.key === original.KEY.freeze);
    }
    expect(frozen).toBe(true);
  });

  it('Surge (Arcane, 5): every 5th attack deals double', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'mage_tower', 1536, 320);
    setLevel(s, t, 5);
    creepOnRoute(s, 'ghoul', 1536, 100_000);
    const hits = ofType(run(s, 30 * 9), 'hit').filter((e) => e.tower === t.id).map((e) => e.damage);
    const base = 17 * 1.12;
    expect(hits.slice(0, 5).map((d) => Math.round((d / base) * 100) / 100)).toEqual([1, 1, 1, 1, 2]);
  });

  it('Arc (Arcane, 10): every hit jumps to one more creep for 50%', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'mage_tower', 1536, 320);
    setLevel(s, t, 10);
    const a = creepOnRoute(s, 'ghoul', 1536, 100_000);
    const b = creepOnRoute(s, 'ghoul', 1450, 100_000);
    const hits = ofType(run(s, 30), 'hit').filter((e) => e.tower === t.id);
    expect(hits.map((e) => e.creep)).toEqual([a.id, b.id]);
    expect(hits[1]!.damage).toBeCloseTo(hits[0]!.damage / 2, 9);
  });

  it('Spores (Poison, 5): each hit also poisons the nearest other creep within 128', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'venom_dart', 1536, 320);
    const a = creepOnRoute(s, 'ghoul', 1536, 100_000);
    const b = creepOnRoute(s, 'ghoul', 1450, 100_000);
    const far = creepOnRoute(s, 'ghoul', 1300, 100_000);
    setLevel(s, t, 5);
    run(s, 25);
    expect(original.isPoisoned(a) && original.isPoisoned(b)).toBe(true);
    expect(original.isPoisoned(far)).toBe(false);
  });

  it('Virulence (Poison, 10): +40% poison damage', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'venom_dart', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1536, 100_000);
    setLevel(s, t, 10);
    run(s, 25);
    expect(c.status.find((x) => x.key === original.KEY.poison)?.value).toBeCloseTo(2.5 * 1.27 * 1.4, 9);
  });

  it('Wider Circle (Totem, 5): +20% aura radius', () => {
    const s = newRun();
    const t = placeTower(s, 0, 'drum_totem');
    expect(original.auraRadius(s, t)).toBe(256);
    setLevel(s, t, 5);
    expect(original.auraRadius(s, t)).toBeCloseTo(307.2, 9);
  });

  it('War Drums (Totem, 10): every 15 s, towers in its aura get +50% attack speed for 4 s', () => {
    const s = newRun();
    const totem = placeTower(s, 0, 'drum_totem');
    const arrow = placeTower(s, 1, 'arrow_tower');
    setLevel(s, totem, 10);
    creepOnRoute(s, 'ghoul', 100, 100_000);
    const events = run(s, 1);
    expect(modeEvents(events, 'original.warDrums')).toHaveLength(1);
    expect(arrow.status.find((x) => x.key === original.KEY.drums)?.value).toBe(0.5);
    run(s, 30 * 4);
    expect(arrow.status.some((x) => x.key === original.KEY.drums)).toBe(false);
    expect(modeEvents(run(s, 30 * 11), 'original.warDrums')).toHaveLength(1);
  });
});
