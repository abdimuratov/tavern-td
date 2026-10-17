import { describe, expect, it } from 'vitest';
import { createRun, original, towerMods } from '../../../src/sim';
import { creepOnRoute, hit, modeEvents, newRun, ofType, placeTower, run, towerAtPoint } from './helpers';

describe('the unlock table', () => {
  it('opens one new tool per Stage until every family is out', () => {
    const at = (n: number) => original.unlocksFor(n);
    expect(at(0)).toEqual({ families: ['arrow', 'cannon'], maxTier: 2, specialisations: false, talents: false });
    expect(at(1)).toEqual({ families: ['arrow', 'cannon', 'frost'], maxTier: 2, specialisations: false, talents: true });
    expect(at(2).maxTier).toBe(3);
    expect(at(3).families).toContain('arcane');
    expect(at(4).families).toContain('poison');
    expect(at(5).specialisations).toBe(true);
    expect(at(6).families).toEqual(['arrow', 'cannon', 'frost', 'arcane', 'poison', 'totem']);
    expect(at(12)).toEqual(at(6));
  });

  it('defaults a Run\'s unlocks to having finished the Stage before', () => {
    const s = createRun({ mode: 'original', seed: 1, difficulty: 'normal', options: { stage: 1 } }) as original.OriginalGameState;
    expect(s.mode.cleared).toBe(0);
    expect(original.originalStatus(s).unlocks.families).toEqual(['arrow', 'cannon']);
  });
});

describe('Stars', () => {
  it('scores 3 for 18 or more lives, 2 for 6 or more, 1 otherwise, and pays only improvements', () => {
    expect([20, 18, 17, 6, 5, 1].map(original.starsFor)).toEqual([3, 3, 2, 2, 1, 1]);
    expect(original.starsGained(0, 2)).toBe(2);
    expect(original.starsGained(2, 3)).toBe(1);
    expect(original.starsGained(3, 1)).toBe(0);
    expect(original.maxStars()).toBe(36);
  });

  it('keeps each Stage\'s best Stars, hardest Difficulty won and fastest win', () => {
    let r = original.mergeStageRecord(null, { won: true, stars: 2, difficulty: 'normal', seconds: 500 });
    expect(r).toEqual({ stars: 2, hardest: 'normal', fastest: 500 });
    r = original.mergeStageRecord(r, { won: true, stars: 1, difficulty: 'hard', seconds: 600 });
    expect(r).toEqual({ stars: 2, hardest: 'hard', fastest: 500 });
    r = original.mergeStageRecord(r, { won: false, stars: 0, difficulty: 'insane', seconds: null });
    expect(r).toEqual({ stars: 2, hardest: 'hard', fastest: 500 });
    r = original.mergeStageRecord(r, { won: true, stars: 3, difficulty: 'easy', seconds: 450 });
    expect(r).toEqual({ stars: 3, hardest: 'hard', fastest: 450 });
  });
});

describe('Talents', () => {
  const open = original.unlocksFor(6);

  it('costs 1, 2, 2 and 3 Stars by row, bought in order, one per row', () => {
    expect([1, 2, 3, 4].map(original.talentCost)).toEqual([1, 2, 2, 3]);
    let held: string[] = [];
    expect(original.talentError(held, 'quick-nock', 10, open)).toBe('needs row 1 first');
    held = original.buyTalent(held, 'fletching', 10, open);
    expect(original.talentError(held, 'long-draw', 10, open)).toBe('one Talent per row');
    expect(original.talentError(held, 'fletching', 10, open)).toBe('already held');
    held = original.buyTalent(held, 'bodkin-points', 10, open);
    held = original.buyTalent(held, 'eagle-feathers', 10, open);
    expect(original.starsSpent(held)).toBe(5);
    expect(original.talentError(held, 'hawkeye', 7, open)).toBe('needs 3 Stars');
    held = original.buyTalent(held, 'hawkeye', 8, open);
    expect(original.starsSpent(held)).toBe(8);
    expect(original.resetTalents()).toEqual([]);
  });

  it('opens a family\'s tree with the family, and buying after Stage 1', () => {
    expect(original.talentError([], 'fletching', 3, original.unlocksFor(0))).toBe('Talents open after Stage 1');
    expect(original.talentError([], 'focus', 3, original.unlocksFor(2))).toBe('the arcane tree isn\'t open yet');
    expect(original.talentError([], 'focus', 3, original.unlocksFor(3))).toBeNull();
    expect(original.talentError([], 'nope', 3, open)).toBe('no such Talent');
  });

  it('refuses a Run with Talents no player could hold', () => {
    const start = (talents: unknown[]) => () => createRun({ mode: 'original', seed: 1, difficulty: 'normal', options: { stage: 1, talents: talents as never } });
    expect(start(['fletching', 'quick-nock'])).not.toThrow();
    expect(start(['quick-nock'])).toThrow(/row 2 needs row 1/);
    expect(start(['fletching', 'long-draw'])).toThrow(/two Talents from row 1/);
    expect(start(['fletching', 'fletching'])).toThrow(/held twice/);
    expect(start(['made-up'])).toThrow(/no Talent made-up/);
    expect(() => createRun({ mode: 'original', seed: 1, difficulty: 'normal', options: { stage: 13 } })).toThrow(/no Stage 13/);
  });

  it('applies family numbers at Run start: damage, range and attack speed', () => {
    const s = newRun({ talents: ['fletching', 'quick-nock', 'far-sight', 'mana-flow'] });
    const arrow = placeTower(s, 0, 'arrow_tower');
    const mage = placeTower(s, 1, 'mage_tower');
    expect(original.towerBonus(s, arrow)).toEqual({ damage: 0.1, attackSpeed: 0.12, range: 0 });
    expect(original.towerBonus(s, mage)).toEqual({ damage: 0, attackSpeed: 0.12, range: 32 });
    const none = newRun();
    expect(original.towerBonus(none, placeTower(none, 0, 'arrow_tower'))).toEqual({ damage: 0, attackSpeed: 0, range: 0 });
  });

  it('Hawkeye makes every Arrow tower crit 10% of the time, and the Deadeye 30%', () => {
    const s = newRun({ seed: 5, talents: ['fletching', 'quick-nock', 'woodcutters', 'hawkeye'] });
    const t = towerAtPoint(s, 'arrow_tower', 1536, 320);
    creepOnRoute(s, 'ghoul', 1536, 1_000_000);
    const kinds = ofType(run(s, 30 * 120), 'hit').filter((e) => e.tower === t.id).map((e) => e.kind);
    const crits = kinds.filter((k) => k === 'crit').length / kinds.length;
    expect(crits).toBeGreaterThan(0.04);
    expect(crits).toBeLessThan(0.18);
  });

  it('Ice Harvest adds a gold to Frost kills', () => {
    const s = newRun({ talents: ['deep-chill', 'brittle', 'ice-harvest'] });
    const frost = placeTower(s, 1, 'frost_tower');
    const arrow = placeTower(s, 0, 'arrow_tower');
    const gold = s.gold;
    hit(s, creepOnRoute(s, 'ghoul', 100, 1), 10, 'magic', frost.id);
    hit(s, creepOnRoute(s, 'ghoul', 100, 1), 10, 'pierce', arrow.id);
    expect(s.gold).toBe(gold + 1);
  });

  it('Deep Chill and Hard Frost lengthen and strengthen Frost\'s slows', () => {
    const s = newRun({ talents: ['deep-chill', 'cold-reach', 'hard-frost'] });
    towerAtPoint(s, 'frost_tower', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1536, 100_000);
    run(s, 15);
    const slow = c.status.find((x) => x.key === original.KEY.slow)!;
    expect(slow.value).toBeCloseTo(0.3, 9);
    expect(slow.ticks).toBeGreaterThan(2 * 30);
  });

  it('Shatter: a creep that dies slowed by Frost deals 15% of its max HP as Magic within 96', () => {
    const s = newRun({ talents: ['deep-chill', 'brittle', 'ice-harvest', 'shatter'] });
    const frost = placeTower(s, 1, 'frost_tower');
    const dying = creepOnRoute(s, 'ghoul', 500, 200);
    const near = creepOnRoute(s, 'ghoul', 560, 1000);
    const far = creepOnRoute(s, 'ghoul', 700, 1000);
    dying.status.push({ kind: original.STATUS.speed, key: original.KEY.slow, value: 0.25, ticks: 60, src: frost.id });
    const events = hit(s, dying, 1000, 'pierce');
    expect(modeEvents(events, 'original.shatter')).toHaveLength(1);
    expect(1000 - near.hp).toBe(30);
    expect(far.hp).toBe(1000);
  });

  it('Contagion passes a dying creep\'s poison on; Lingering and Potency lengthen and strengthen it', () => {
    const s = newRun({ talents: ['potency', 'contagion'] });
    const dying = creepOnRoute(s, 'ghoul', 500, 10);
    const near = creepOnRoute(s, 'ghoul', 580, 1000);
    dying.status.push({ kind: original.STATUS.poison, key: original.KEY.poison, value: 9, ticks: 50, src: 0 });
    hit(s, dying, 100, 'pierce');
    expect(near.status.find((x) => x.key === original.KEY.poison)).toMatchObject({ value: 9, ticks: 50 });

    const l = newRun({ talents: ['lingering'] });
    towerAtPoint(l, 'venom_dart', 1536, 320);
    const c = creepOnRoute(l, 'ghoul', 1536, 100_000);
    run(l, 25);
    expect(c.status.find((x) => x.key === original.KEY.poison)!.ticks).toBeGreaterThan(3 * 30);
    const p = newRun({ talents: ['potency'] });
    towerAtPoint(p, 'venom_dart', 1536, 320);
    const d = creepOnRoute(p, 'ghoul', 1536, 100_000);
    run(p, 25);
    expect(d.status.find((x) => x.key === original.KEY.poison)!.value).toBeCloseTo(2.5 * 1.15, 9);
  });

  it('Thick Venom slows poisoned creeps 10%', () => {
    const s = newRun({ talents: ['potency', 'corrode', 'thick-venom'] });
    towerAtPoint(s, 'venom_dart', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1536, 100_000);
    run(s, 25);
    expect(c.status.find((x) => x.key === original.KEY.slow)?.value).toBe(0.1);
  });

  it('Echo fires a second bolt at another creep on a share of Arcane attacks', () => {
    const s = newRun({ seed: 9, talents: ['focus', 'spellbreaker', 'echo'] });
    const t = towerAtPoint(s, 'mage_tower', 1536, 320);
    creepOnRoute(s, 'ghoul', 1536, 1_000_000);
    creepOnRoute(s, 'ghoul', 1450, 1_000_000);
    const fired = ofType(run(s, 30 * 60), 'fire').filter((e) => e.tower === t.id);
    const attacks = Math.ceil((30 * 60) / (1.7 * 30));
    expect(fired.length).toBeGreaterThan(attacks);
    expect(fired.length).toBeLessThan(attacks * 1.4);
  });

  it('Leyline adds 10% damage per other Arcane tower within 192, up to 30%', () => {
    const s = newRun({ talents: ['focus', 'spellbreaker', 'echo', 'leyline'] });
    const t = towerAtPoint(s, 'mage_tower', 1000, 1000);
    expect(original.towerBonus(s, t)!.damage).toBeCloseTo(0.1, 9);
    for (const [x, y] of [[1100, 1000], [1000, 1100], [900, 1000], [1000, 900]]) towerAtPoint(s, 'mage_tower', x!, y!);
    towerAtPoint(s, 'mage_tower', 1300, 1000);
    expect(original.towerBonus(s, t)!.damage).toBeCloseTo(0.4, 9);
  });

  it('Drumbeat, Rally and Hex strengthen Totem auras', () => {
    const s = newRun({ talents: ['drumbeat', 'spirit-link', 'rally'] });
    placeTower(s, 0, 'drum_totem');
    const arrow = placeTower(s, 1, 'arrow_tower');
    run(s, 1);
    expect(towerMods(arrow).attackSpeed).toBeCloseTo(0.2, 9);
    expect(towerMods(arrow).range).toBeCloseTo(320 * 0.08, 9);
    const h = newRun({ talents: ['wide-circle', 'spirit-link', 'hex'] });
    placeTower(h, 1, 'drum_totem');
    const c = creepOnRoute(h, 'ghoul', 1536, 10_000);
    run(h, 1);
    hit(h, c, 100, 'magic');
    expect(10_000 - c.hp).toBeCloseTo(108, 9);
  });
});
