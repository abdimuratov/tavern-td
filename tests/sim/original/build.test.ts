import { describe, expect, it } from 'vitest';
import { original } from '../../../src/sim';
import { buildOn, modeEvents, newRun, ofType, reasons, run, runUntil, send } from './helpers';

describe('building and Tiers', () => {
  it('builds a family\'s Tier 1 tower for its price, at once', () => {
    const s = newRun({ cleared: 0 });
    expect(s.gold).toBe(250);
    const t = buildOn(s, 0, 'arrow_tower');
    expect(s.gold).toBe(180);
    expect(s.mode.towers[String(t.id)]).toMatchObject({ spent: 70, level: 1, xp: 0, targeting: 'first' });
    expect(t.cd).toBe(0);
    expect(reasons(send(s, { type: 'original.build', spot: 1, spec: 'longbow_tower' }))).toEqual(['made by upgrading a tower']);
    expect(reasons(send(s, { type: 'original.build', spot: 1, spec: 'nope' }))).toEqual(['no such tower']);
  });

  it('opens families, Tier 3 and Specialisations as the Campaign unlocks them', () => {
    const fresh = newRun({ cleared: 0 });
    expect(original.spotInfo(fresh, 0).options.map((o) => o.family)).toEqual(['arrow', 'cannon']);
    expect(reasons(send(fresh, { type: 'original.build', spot: 0, spec: 'frost_tower' }))).toEqual(['the frost family isn\'t unlocked yet']);
    const t = buildOn(fresh, 0, 'arrow_tower');
    send(fresh, { type: 'original.upgrade', tower: t.id, to: 'longbow_tower' });
    expect(t.spec).toBe('longbow_tower');
    expect(reasons(send(fresh, { type: 'original.upgrade', tower: t.id, to: 'marksman_tower' }))).toEqual(['Tier 3 unlocks after Stage 2']);

    const mid = newRun({ cleared: 4 });
    expect(original.spotInfo(mid, 0).options.map((o) => o.family)).toEqual(['arrow', 'cannon', 'frost', 'arcane', 'poison']);
    mid.gold = 5000;
    const m = buildOn(mid, 0, 'arrow_tower');
    for (const to of ['longbow_tower', 'marksman_tower']) send(mid, { type: 'original.upgrade', tower: m.id, to });
    expect(m.spec).toBe('marksman_tower');
    expect(reasons(send(mid, { type: 'original.upgrade', tower: m.id, to: 'ranger_lodge' }))).toEqual(['Specialisations unlock after Stage 5']);

    const all = newRun({ cleared: 6 });
    expect(original.spotInfo(all, 0).options.map((o) => o.family)).toEqual(['arrow', 'cannon', 'frost', 'arcane', 'poison', 'totem']);
  });

  it('climbs Tiers 1–3, picks one of two Specialisations, and stops there', () => {
    const s = newRun();
    s.gold = 5000;
    const t = buildOn(s, 0, 'cannon_tower');
    const events = run(s, 1, [
      { type: 'original.upgrade', tower: t.id, to: 'bombard' },
      { type: 'original.upgrade', tower: t.id, to: 'great_bombard' },
    ]);
    expect(ofType(events, 'changed').map((e) => e.spec)).toEqual(['bombard', 'great_bombard']);
    expect(original.towerActions(s, t.id)!.upgrades.map((u) => u.to)).toEqual(['thunder_mortar', 'flak_battery']);
    expect(reasons(send(s, { type: 'original.upgrade', tower: t.id, to: 'ranger_lodge' }))).toEqual(['Great Bombard can\'t become that']);
    send(s, { type: 'original.upgrade', tower: t.id, to: 'flak_battery' });
    expect(t.spec).toBe('flak_battery');
    expect(s.mode.towers[String(t.id)]!.spent).toBe(740);
    expect(s.gold).toBe(5000 - 740);
    expect(reasons(send(s, { type: 'original.upgrade', tower: t.id, to: 'thunder_mortar' }))).toEqual(['a Specialisation is final']);
  });

  it('keeps XP, Tower Level and a chosen targeting through upgrades; a Deadeye that kept the default aims at Strong', () => {
    const s = newRun();
    s.gold = 5000;
    const a = buildOn(s, 0, 'arrow_tower');
    const b = buildOn(s, 1, 'arrow_tower');
    s.mode.towers[String(a.id)]!.xp = 30;
    s.mode.towers[String(a.id)]!.level = 3;
    send(s, { type: 'original.target', tower: b.id, targeting: 'close' });
    for (const t of [a, b]) {
      for (const to of ['longbow_tower', 'marksman_tower', 'deadeye_perch']) send(s, { type: 'original.upgrade', tower: t.id, to });
    }
    expect(s.mode.towers[String(a.id)]).toMatchObject({ xp: 30, level: 3, targeting: 'strong' });
    expect(s.mode.towers[String(b.id)]!.targeting).toBe('close');
  });

  it('refuses what the gold can\'t pay for', () => {
    const s = newRun();
    s.gold = 60;
    expect(reasons(send(s, { type: 'original.build', spot: 0, spec: 'arrow_tower' }))).toEqual(['needs 70 gold']);
    s.gold = 100;
    const t = buildOn(s, 0, 'arrow_tower');
    expect(reasons(send(s, { type: 'original.upgrade', tower: t.id, to: 'longbow_tower' }))).toEqual(['needs 110 gold']);
  });

  it('takes Woodcutters, Apprentices and Cheap Carving off prices', () => {
    const s = newRun({ talents: ['fletching', 'quick-nock', 'woodcutters', 'focus', 'mana-flow', 'apprentices', 'wide-circle', 'cheap-carving'] });
    expect(original.priceOf(s, 'arrow_tower')).toBe(63);
    expect(original.priceOf(s, 'longbow_tower')).toBe(99);
    expect(original.priceOf(s, 'mage_tower')).toBe(90);
    expect(original.priceOf(s, 'drum_totem')).toBe(77);
    expect(original.priceOf(s, 'cannon_tower')).toBe(90);
    const t = buildOn(s, 0, 'arrow_tower');
    expect(s.gold).toBe(250 - 63);
    expect(s.mode.towers[String(t.id)]!.spent).toBe(63);
  });
});

describe('selling', () => {
  it('refunds everything spent before Wave 1, since the opening counts as a Break', () => {
    const s = newRun();
    const t = buildOn(s, 0, 'arrow_tower');
    send(s, { type: 'original.upgrade', tower: t.id, to: 'longbow_tower' });
    expect(original.sellValue(s, t)).toBe(180);
    const events = send(s, { type: 'original.sell', tower: t.id });
    expect(s.gold).toBe(250);
    expect(ofType(events, 'removed')).toHaveLength(1);
    expect(modeEvents(events, 'original.sold')[0]!.data).toEqual({ tower: t.id, gold: 180 });
    expect(s.grid.every((id) => id === 0)).toBe(true);
  });

  it('refunds 70% of what was spent before the current Break began and all of what was spent since', () => {
    const s = newRun();
    const t = buildOn(s, 0, 'arrow_tower');
    send(s, { type: 'original.sendNow' });
    // Wave 1's last Ghoul spawns 9 s in, and the Break begins.
    const events = runUntil(s, () => s.mode.breakUntil >= 0);
    expect(modeEvents(events, 'original.break')).toHaveLength(1);
    expect(original.sellValue(s, t)).toBe(49);
    send(s, { type: 'original.upgrade', tower: t.id, to: 'longbow_tower' });
    expect(original.sellValue(s, t)).toBe(110 + 49);
    // The next Break makes the upgrade old gold too.
    runUntil(s, () => s.mode.breakAfter === 2, 30 * 120);
    expect(original.sellValue(s, t)).toBe(Math.floor(180 * 0.7));
  });

  it('sells Cannons for 85% with Salvage', () => {
    const s = newRun({ talents: ['black-powder', 'shrapnel', 'salvage'] });
    const t = buildOn(s, 0, 'cannon_tower');
    send(s, { type: 'original.sendNow' });
    runUntil(s, () => s.mode.breakUntil >= 0);
    expect(original.sellValue(s, t)).toBe(Math.floor(90 * 0.85));
  });

  it('refuses a tower that isn\'t there', () => {
    const s = newRun();
    expect(reasons(send(s, { type: 'original.sell', tower: 99 }))).toEqual(['no such tower']);
  });
});

describe('the targeting command', () => {
  it('sets First, Last, Strong or Close, free at any time, but not on a Totem', () => {
    const s = newRun();
    s.gold = 5000;
    const t = buildOn(s, 0, 'arrow_tower');
    const totem = buildOn(s, 1, 'drum_totem');
    for (const targeting of ['last', 'strong', 'close', 'first']) {
      const events = send(s, { type: 'original.target', tower: t.id, targeting });
      expect(reasons(events)).toEqual([]);
      expect(s.mode.towers[String(t.id)]!.targeting).toBe(targeting);
    }
    expect(s.gold).toBe(5000 - 70 - 90);
    expect(reasons(send(s, { type: 'original.target', tower: t.id, targeting: 'weakest' }))).toEqual(['targeting is first, last, strong or close']);
    expect(reasons(send(s, { type: 'original.target', tower: totem.id, targeting: 'first' }))).toEqual(['a Totem doesn\'t attack']);
  });
});
