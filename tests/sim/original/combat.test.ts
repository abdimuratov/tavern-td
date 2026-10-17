import { describe, expect, it } from 'vitest';
import { armorMultiplier, original } from '../../../src/sim';
import {
  creepAt, creepOnRoute, hit, modeEvents, newRun, ofType, placeTower, run, send, towerAtPoint, type OriginalRun,
} from './helpers';

/** Damage a creep took from one hit of 100. */
function took(s: OriginalRun, spec: string, type: 'pierce' | 'siege' | 'magic' | 'poison', from: string | null = null, wave = 0): number {
  const c = creepOnRoute(s, spec, 100, 10_000);
  if (wave > 0) c.wave = wave;
  hit(s, c, 100, type, 0, from);
  return 10_000 - c.hp;
}

describe('damage types against armor types', () => {
  it('follows the §4 table: armor cuts physical hits, wards cut magic, Poison goes through', () => {
    const s = newRun();
    expect([took(s, 'revenant', 'pierce'), took(s, 'revenant', 'siege'), took(s, 'revenant', 'magic'), took(s, 'revenant', 'poison')])
      .toEqual([50, 75, 100, 100]);
    expect([took(s, 'cultist', 'pierce'), took(s, 'cultist', 'magic'), took(s, 'cultist', 'poison')]).toEqual([100, 50, 100]);
    expect([took(s, 'gravelord', 'pierce'), took(s, 'gravelord', 'siege'), took(s, 'gravelord', 'magic'), took(s, 'gravelord', 'poison')])
      .toEqual([70, 85, 70, 100]);
    expect(took(s, 'ghoul', 'pierce')).toBe(100);
  });

  it('lets the Deadeye Perch treat Armored as Unarmored, but not Boss', () => {
    const s = newRun();
    expect(took(s, 'revenant', 'pierce', 'deadeye_perch')).toBe(100);
    expect(took(s, 'gargoyle', 'pierce', 'deadeye_perch')).toBe(100);
    expect(took(s, 'revenant', 'pierce', 'marksman_tower')).toBe(50);
    expect(took(s, 'gravelord', 'pierce', 'deadeye_perch')).toBe(70);
  });

  it('raises Armored to 70% from Pierce with Bodkin Points, and Warded to 70% from Magic with Spellbreaker', () => {
    const s = newRun({ talents: ['fletching', 'bodkin-points', 'focus', 'spellbreaker'] });
    expect(took(s, 'revenant', 'pierce')).toBe(70);
    expect(took(s, 'cultist', 'magic')).toBe(70);
    expect(took(s, 'revenant', 'siege')).toBe(75);
  });

  it('adds Eagle Feathers to Arrows against flyers only', () => {
    const s = newRun({ talents: ['long-draw', 'quick-nock', 'eagle-feathers'] });
    expect(took(s, 'bloodbat', 'pierce', 'arrow_tower')).toBe(125);
    expect(took(s, 'ghoul', 'pierce', 'arrow_tower')).toBe(100);
    expect(took(s, 'bloodbat', 'magic', 'mage_tower')).toBe(100);
  });
});

describe('numeric armor', () => {
  it('is 0 on every creep, and War Totem\'s −4 aura raises hits by about 22% but not poison', () => {
    const s = newRun();
    expect(armorMultiplier(-4)).toBeCloseTo(1.2193, 4);
    placeTower(s, 1, 'war_totem');
    // The top road right under Spot 1 (1536, 320).
    const c = creepOnRoute(s, 'ghoul', 1536, 10_000);
    run(s, 1);
    hit(s, c, 100, 'siege');
    expect(10_000 - c.hp).toBeCloseTo(100 * armorMultiplier(-4), 9);
    const far = creepOnRoute(s, 'ghoul', 100, 10_000);
    run(s, 1);
    hit(s, far, 100, 'siege');
    expect(far.hp).toBe(9900);
  });

  it('takes −2 armor from Shrapnel hits for 3 s', () => {
    const s = newRun({ talents: ['black-powder', 'shrapnel'] });
    const cannon = towerAtPoint(s, 'cannon_tower', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1536, 10_000);
    run(s, 30);
    expect(c.status.find((x) => x.key === original.KEY.shrapnel)?.value).toBe(2);
    const before = c.hp;
    hit(s, c, 100, 'pierce');
    expect(before - c.hp).toBeCloseTo(100 * armorMultiplier(-2), 9);
    expect(cannon.kills).toBe(0);
  });
});

describe('Shields', () => {
  it('block 10% of a Ghoul\'s HP at the Wave\'s Threat from every hit: 12 at Threat 20', () => {
    const s = newRun();
    const low = creepOnRoute(s, 'shieldbearer', 100, 1000);
    expect(s.mode.creeps[String(low.id)]!.shield).toBe(2);
    expect(original.ghoulHp(20)).toBeCloseTo(122.3, 1);
    const twenty = newRun({ waves: [{ groups: [{ creep: 'shieldbearer', count: 1 }] }] });
    twenty.mode.threat = 20;
    send(twenty, { type: 'original.sendNow' });
    const sb = twenty.creeps[0]!;
    expect(sb.maxHp).toBe(Math.round(2 * original.ghoulHp(20)));
    expect(twenty.mode.creeps[String(sb.id)]!.shield).toBe(12);
    hit(twenty, sb, 30, 'pierce');
    expect(sb.maxHp - sb.hp).toBe(18);
    const events = hit(twenty, sb, 10, 'pierce');
    expect(sb.maxHp - sb.hp).toBe(18);
    // A blocked hit still shows, at 0.
    expect(ofType(events, 'hit')[0]!.damage).toBe(0);
  });

  it('let poison over time through untouched', () => {
    const s = newRun();
    const c = creepOnRoute(s, 'shieldbearer', 100, 1000);
    c.status.push({ kind: original.STATUS.poison, key: original.KEY.poison, value: 30, ticks: 30, src: 0 });
    run(s, 30);
    expect(1000 - c.hp).toBeCloseTo(30, 6);
  });

  it('count a beam as one hit a second', () => {
    const s = newRun();
    const c = creepOnRoute(s, 'shieldbearer', 1536, 100_000);
    towerAtPoint(s, 'arcane_lance', 1536, 320);
    run(s, 30);
    // 10 ticks of 4 × ramp, less 0.2 of the 2 Shield each.
    const dealt = 100_000 - c.hp;
    expect(dealt).toBeGreaterThan(40);
    expect(dealt).toBeLessThan(44.5);
  });
});

describe('targeting modes', () => {
  function lineUp(s: OriginalRun): { first: number; last: number; close: number; strong: number } {
    // Along the top road under Spot 1 (1536, 320); the 1700 one has turned the corner.
    const a = creepOnRoute(s, 'ghoul', 1400, 50);
    const b = creepOnRoute(s, 'ghoul', 1500, 80);
    const c = creepOnRoute(s, 'ghoul', 1600, 300);
    const d = creepOnRoute(s, 'ghoul', 1700, 60);
    return { first: d.id, last: a.id, close: b.id, strong: c.id };
  }

  it('aims at First, Last, Strong or Close', () => {
    const s = newRun();
    const want = lineUp(s);
    const t = placeTower(s, 1, 'arrow_tower');
    for (const mode of ['first', 'last', 'strong', 'close'] as const) {
      s.mode.towers[String(t.id)]!.targeting = mode;
      expect(original.pickTarget(s, t, 320)?.id, mode).toBe(want[mode]);
    }
  });

  it('starts at First, and Deadeye and Storm Totem at Strong', () => {
    const s = newRun();
    expect(s.mode.towers[String(placeTower(s, 0, 'arrow_tower').id)]!.targeting).toBe('first');
    expect(s.mode.towers[String(placeTower(s, 1, 'deadeye_perch').id)]!.targeting).toBe('strong');
    expect(s.mode.towers[String(placeTower(s, 2, 'storm_totem').id)]!.targeting).toBe('strong');
  });

  it('fires the first arrow at the creep its targeting picks', () => {
    const s = newRun();
    const want = lineUp(s);
    const t = placeTower(s, 1, 'arrow_tower');
    const events = send(s, { type: 'original.target', tower: t.id, targeting: 'strong' });
    expect(ofType(events, 'fire')[0]!.target).toBe(want.strong);
  });

  it('keeps a Thunder Mortar from firing within 160', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'thunder_mortar', 1536, 320);
    const near = creepOnRoute(s, 'ghoul', 1536, 100);
    expect(original.pickTarget(s, t, 640)).toBeNull();
    const far = creepOnRoute(s, 'ghoul', 1100, 100);
    expect(original.pickTarget(s, t, 640)?.id).toBe(far.id);
    expect(near.hp).toBe(100);
  });

  it('keeps Cannons off flyers, and lets Flak and Arrows hit them', () => {
    const s = newRun();
    const bat = creepAt(s, 'bloodbat', 1536, 200, 100);
    expect(original.pickTarget(s, towerAtPoint(s, 'bombard', 1536, 320), 304)).toBeNull();
    expect(original.pickTarget(s, towerAtPoint(s, 'flak_battery', 1536, 320), 384)?.id).toBe(bat.id);
    expect(original.pickTarget(s, towerAtPoint(s, 'arrow_tower', 1536, 320), 320)?.id).toBe(bat.id);
    expect(original.pickTarget(s, towerAtPoint(s, 'venom_dart', 1536, 320), 320)).toBeNull();
  });

  it('lets Poison towers hit flyers with Plague Wind', () => {
    const s = newRun({ talents: ['potency', 'contagion', 'antivenom', 'plague-wind'] });
    const bat = creepAt(s, 'bloodbat', 1536, 200, 100);
    expect(original.pickTarget(s, towerAtPoint(s, 'venom_dart', 1536, 320), 320)?.id).toBe(bat.id);
  });
});

describe('poison', () => {
  it('prefers creeps that aren\'t poisoned yet, so one tower keeps several poisoned', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'venom_dart', 1536, 320);
    const ahead = creepOnRoute(s, 'ghoul', 1600, 10_000);
    const behind = creepOnRoute(s, 'ghoul', 1400, 10_000);
    expect(original.pickTarget(s, t, 320)?.id).toBe(ahead.id);
    ahead.status.push({ kind: original.STATUS.poison, key: original.KEY.poison, value: 1, ticks: 300, src: 0 });
    expect(original.pickTarget(s, t, 320)?.id).toBe(behind.id);
    run(s, 90);
    expect(original.isPoisoned(ahead) && original.isPoisoned(behind)).toBe(true);
  });

  it('refreshes rather than stacks, so the strongest poison counts', () => {
    const s = newRun();
    const c = creepOnRoute(s, 'ghoul', 1536, 10_000);
    towerAtPoint(s, 'venom_spire', 1536, 320);
    towerAtPoint(s, 'venom_spire', 1536, 330);
    run(s, 15);
    const poisons = c.status.filter((x) => x.key === original.KEY.poison);
    expect(poisons.length).toBeGreaterThanOrEqual(1);
    const before = c.hp;
    run(s, 30);
    // Two hits of 7 a second and one poison of 11, not two.
    expect(before - c.hp).toBeCloseTo(2 * 7 + 11, 0);
  });

  it('stacks on Widow\'s Fang: one 4 s stack a hit, up to 5, on the one creep it sticks to', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'widows_fang', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1500, 100_000);
    run(s, 2);
    expect(t.target).toBe(c.id);
    const other = creepOnRoute(s, 'ghoul', 1600, 100_000);
    run(s, 30 * 4);
    expect(t.target).toBe(c.id);
    expect(original.stackCount(c)).toBe(5);
    expect(original.stackCount(other)).toBe(0);
    const before = c.hp;
    run(s, 30);
    // Five stacks of 8 a second, plus about 1.25 hits of 10.
    expect(before - c.hp).toBeGreaterThan(40 + 10);
    expect(before - c.hp).toBeLessThan(40 + 25);
  });

  it('lobs a Plague Cauldron cloud that poisons everything inside for 3 s', () => {
    const s = newRun();
    towerAtPoint(s, 'plague_cauldron', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1536, 10_000);
    const near = creepOnRoute(s, 'ghoul', 1600, 10_000);
    const far = creepOnRoute(s, 'ghoul', 1100, 10_000);
    const events = run(s, 20);
    const cloud = modeEvents(events, 'original.cloud')[0]!;
    expect(cloud.data).toMatchObject({ radius: 112, ticks: 90 });
    expect(s.mode.clouds).toHaveLength(1);
    expect(c.status.find((x) => x.key === original.KEY.poison)?.value).toBe(16);
    expect(original.isPoisoned(near)).toBe(true);
    expect(original.isPoisoned(far)).toBe(false);
    run(s, 90);
    expect(s.mode.clouds.length).toBeLessThanOrEqual(1);
    expect(s.mode.clouds.every((x) => x.until > s.tick)).toBe(true);
  });
});

describe('Arcane', () => {
  it('ramps the Arcane Lance\'s beam +25% a second on one creep, to ×3, and resets it on a new one', () => {
    const s = newRun();
    towerAtPoint(s, 'arcane_lance', 1536, 320);
    const c = creepOnRoute(s, 'ghoul', 1536, 100_000);
    run(s, 30);
    expect(100_000 - c.hp).toBeCloseTo(4 * (10 + 0.025 * 45), 6);
    run(s, 30 * 8);
    const before = c.hp;
    run(s, 30);
    expect(before - c.hp).toBeCloseTo(120, 6);
    c.hp = 0;
    const next = creepOnRoute(s, 'ghoul', 1500, 100_000);
    const hits = ofType(run(s, 30), 'hit').filter((e) => e.creep === next.id);
    expect(hits.slice(0, 3).map((e) => e.damage)).toEqual([4, 4.1, 4.2]);
  });

  it('bounces the Prism Tower\'s bolt on to 3 more creeps, −25% each jump', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'prism_tower', 1280, 320);
    const creeps = [1300, 1200, 1100, 1000, 900].map((d) => creepOnRoute(s, 'ghoul', d, 10_000));
    const hits = ofType(run(s, 30), 'hit').filter((e) => e.tower === t.id);
    expect(hits.slice(0, 4).map((e) => e.damage)).toEqual([60, 45, 33.75, 25.3125]);
    expect(hits.slice(0, 4).map((e) => e.creep)).toEqual(creeps.slice(0, 4).map((c) => c.id));
    expect(creeps[4]!.hp).toBe(10_000);
  });
});

describe('Frost', () => {
  it('slows, the strongest slow counting, and bosses at half strength', () => {
    const s = newRun();
    towerAtPoint(s, 'glacier_spire', 1536, 320);
    const ghoul = creepOnRoute(s, 'ghoul', 1536, 10_000);
    run(s, 15);
    expect(ghoul.status.find((x) => x.key === original.KEY.slow)?.value).toBe(0.4);
    ghoul.hp = 0;
    const boss = creepOnRoute(s, 'gravelord', 1536, 100_000);
    run(s, 45);
    expect(boss.status.find((x) => x.key === original.KEY.slow)?.value).toBe(0.2);
  });

  it('freezes a share of Rime Lance hits for 1 s, never a boss', () => {
    const s = newRun({ seed: 7 });
    towerAtPoint(s, 'rime_lance', 1536, 320);
    const ghoul = creepOnRoute(s, 'ghoul', 1536, 1_000_000);
    let frozen = 0;
    for (let i = 0; i < 30 * 20; i++) {
      run(s, 1);
      if (ghoul.status.some((x) => x.key === original.KEY.freeze)) frozen++;
    }
    expect(frozen).toBeGreaterThan(0);
    ghoul.hp = 0;
    const boss = creepOnRoute(s, 'riftlord', 1536, 10_000_000);
    for (let i = 0; i < 30 * 20; i++) {
      run(s, 1);
      expect(boss.status.some((x) => x.key === original.KEY.freeze)).toBe(false);
    }
  });

  it('hits every creep in range with the Blizzard Spire, whose aura slows them 45%', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'blizzard_spire', 1536, 320);
    const inside = [1450, 1536, 1620].map((d) => creepOnRoute(s, 'ghoul', d, 1000));
    const outside = creepOnRoute(s, 'ghoul', 1000, 1000);
    const hits = ofType(run(s, 2), 'hit').filter((e) => e.tower === t.id);
    expect(hits.map((e) => e.creep).sort()).toEqual(inside.map((c) => c.id).sort());
    expect(hits.every((e) => e.damage === 14)).toBe(true);
    for (const c of inside) expect(c.status.find((x) => x.key === original.KEY.slow)?.value).toBe(0.45);
    expect(outside.status).toEqual([]);
  });

  it('makes slowed creeps take +10% from Pierce and Siege with Brittle', () => {
    const s = newRun({ talents: ['deep-chill', 'brittle'] });
    const c = creepOnRoute(s, 'ghoul', 100, 10_000);
    c.status.push({ kind: original.STATUS.speed, key: original.KEY.slow, value: 0.2, ticks: 60, src: 0 });
    hit(s, c, 100, 'pierce');
    expect(10_000 - c.hp).toBeCloseTo(110, 9);
    hit(s, c, 100, 'magic');
    expect(10_000 - c.hp).toBeCloseTo(210, 9);
  });
});

describe('Cannon', () => {
  it('splashes full damage within 48 of the impact and half within 112', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'bombard', 1300, 320);
    const target = creepOnRoute(s, 'ghoul', 1400, 1000);
    const full = creepOnRoute(s, 'ghoul', 1360, 1000);
    const half = creepOnRoute(s, 'ghoul', 1300, 1000);
    const none = creepOnRoute(s, 'ghoul', 1200, 1000);
    s.mode.towers[String(t.id)]!.targeting = 'first';
    run(s, 30);
    expect([1000 - target.hp, 1000 - full.hp, 1000 - half.hp, 1000 - none.hp]).toEqual([22, 22, 11, 0]);
  });
});

describe('multishot and lightning', () => {
  it('fires a Ranger Lodge\'s 3 arrows at 3 creeps', () => {
    const s = newRun();
    const t = towerAtPoint(s, 'ranger_lodge', 1536, 320);
    const creeps = [1400, 1500, 1600, 1700].map((d) => creepOnRoute(s, 'ghoul', d, 1000));
    const fired = ofType(run(s, 1), 'fire').filter((e) => e.tower === t.id);
    expect(fired.map((e) => e.target)).toEqual([creeps[3]!.id, creeps[2]!.id, creeps[1]!.id]);
  });

  it('strikes the Strongest creep within 320, air included, with the Storm Totem', () => {
    const s = newRun();
    // A Bloodbat 1,700 along the air line, and a Ghoul on the middle road below it.
    const bat = creepOnRoute(s, 'bloodbat', 1700, 500);
    creepOnRoute(s, 'ghoul', 2176, 100);
    const t = towerAtPoint(s, 'storm_totem', 1536, 700);
    expect(Math.hypot(bat.x - t.x, bat.y - t.y)).toBeLessThan(320);
    const hits = ofType(run(s, 1), 'hit').filter((e) => e.tower === t.id);
    expect(hits).toEqual([{ type: 'hit', creep: bat.id, tower: t.id, damage: 60, kind: 'attack' }]);
  });
});
