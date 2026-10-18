import { describe, expect, it } from 'vitest';
import { MAUL_TOWERS } from '../../../src/content/maul';
import { maul } from '../../../src/sim';
import { buildAt, creepAt, field, modeEvents, newRun, ofType, reasons, run, runUntil, send, towerOf } from './helpers';

describe('building', () => {
  it('builds the Race\'s Wall and both lines\' Tier 1 from nothing, at their whole price', () => {
    const s = newRun({ map: field(), gold: 500 });
    const wall = buildAt(s, 'bulwark', 4, 0);
    const ballista = buildAt(s, 'ballista', 8, 0);
    const mortar = buildAt(s, 'mortar', 12, 0);
    expect(s.gold).toBe(500 - 10 - 50 - 60);
    expect(maul.buildOptions(s).map((o) => [o.spec, o.cost])).toEqual([['bulwark', 10], ['ballista', 50], ['mortar', 60]]);
    expect(wall.cells).toHaveLength(4);
    expect([ballista.spec, mortar.spec]).toEqual(['ballista', 'mortar']);
    expect(s.mode.towers[String(mortar.id)]).toEqual({ paid: 60, fresh: 60 });
  });

  it('refuses what the Race can\'t build, what only an upgrade makes, and what it can\'t pay for', () => {
    const s = newRun({ map: field(), gold: 55 });
    const events = send(s,
      { type: 'maul.build', spec: 'frost_spire', col: 4, row: 0 },
      { type: 'maul.build', spec: 'heavy_ballista', col: 4, row: 0 },
      { type: 'maul.build', spec: 'mortar', col: 4, row: 0 },
      { type: 'maul.build', spec: 'nothing', col: 4, row: 0 },
      { type: 'maul.build', spec: 'ballista', col: 4 },
    );
    expect(reasons(events)).toEqual([
      'the Rimeborn aren\'t in this Run', 'made by upgrading a tower', 'needs 60 gold', 'no such tower', 'build needs spec, col and row',
    ]);
    expect(s.towers).toHaveLength(0);
  });

  it('refuses a spot off the Map, on the road, on another tower, on a creep, or one that Blocks', () => {
    const s = newRun({ map: field(), gold: 1000 });
    buildAt(s, 'bulwark', 4, 2);
    // A wall from the top edge down to row 9 leaves rows 10–11 open, so closing them would Block.
    for (const row of [0, 2, 4, 6, 8]) buildAt(s, 'bulwark', 10, row);
    creepAt(s, 'raider', 6.5 * 64, 8.5 * 64);
    const events = send(s,
      { type: 'maul.build', spec: 'bulwark', col: 23, row: 3 },
      { type: 'maul.build', spec: 'bulwark', col: 0, row: 4 },
      { type: 'maul.build', spec: 'bulwark', col: 5, row: 3 },
      { type: 'maul.build', spec: 'bulwark', col: 6, row: 8 },
      { type: 'maul.build', spec: 'bulwark', col: 10, row: 10 },
    );
    expect(reasons(events)).toEqual([
      'off the Map', 'can\'t build on the creeps\' road or rock', 'another tower is there', 'a creep is in the way', 'that would block the path',
    ]);
    expect(maul.buildSpot(s, 10, 10).error).toBe('that would block the path');
    expect(maul.buildSpot(s, 14, 10)).toEqual({ cells: [254, 255, 278, 279], error: null });
  });
});

describe('upgrades', () => {
  it('turn a Wall into either line, climb a Tier, and fork at Tier 3', () => {
    const s = newRun({ map: field(), gold: 2000 });
    const t = buildAt(s, 'bulwark', 4, 2);
    const forks = maul.towerActions(s, t.id)!.upgrades.map((u) => [u.to, u.price]);
    expect(forks).toEqual([['ballista', 40], ['mortar', 50]]);
    send(s, { type: 'maul.upgrade', tower: t.id, to: 'mortar' });
    send(s, { type: 'maul.upgrade', tower: t.id, to: 'siege_mortar' });
    expect(maul.towerActions(s, t.id)!.upgrades.map((u) => u.to)).toEqual(['thunder_mortar', 'bombard']);
    const events = send(s, { type: 'maul.upgrade', tower: t.id, to: 'bombard' });
    expect(modeEvents(events, 'maul.upgraded')[0]!.data).toEqual({ tower: t.id, from: 'siege_mortar', to: 'bombard', cost: 220 });
    expect(towerOf(s, t.id).spec).toBe('bombard');
    expect(s.gold).toBe(2000 - MAUL_TOWERS['bombard']!.maul.total);
    expect(maul.towerActions(s, t.id)!.upgrades).toEqual([]);
  });

  it('refuse a jump, a sideways step, and an upgrade it can\'t pay for, and never move the maze', () => {
    const s = newRun({ map: field(), gold: 100 });
    const t = buildAt(s, 'ballista', 4, 2);
    const version = s.pathVersion;
    const events = send(s,
      { type: 'maul.upgrade', tower: t.id, to: 'skypiercer' },
      { type: 'maul.upgrade', tower: t.id, to: 'mortar' },
      { type: 'maul.upgrade', tower: t.id, to: 'heavy_ballista' },
      { type: 'maul.upgrade', tower: 999, to: 'heavy_ballista' },
    );
    expect(reasons(events)).toEqual(['Ballista can\'t become that', 'Ballista can\'t become that', 'needs 85 gold', 'no such tower']);
    s.gold = 85;
    send(s, { type: 'maul.upgrade', tower: t.id, to: 'heavy_ballista' });
    expect(s.pathVersion).toBe(version);
  });
});

describe('selling', () => {
  it('returns everything spent during the current Break, and 75% of the rest', () => {
    const s = newRun({ map: field(), gold: 1000, waves: [{ creep: 'raider' }, { creep: 'raider' }] });
    const a = buildAt(s, 'ballista', 4, 2);
    const b = buildAt(s, 'ballista', 4, 6);
    send(s, { type: 'maul.upgrade', tower: b.id, to: 'heavy_ballista' });
    expect(maul.towerActions(s, a.id)).toMatchObject({ sellValue: 50, fullRefund: true });
    let events = send(s, { type: 'maul.sell', tower: a.id });
    expect(modeEvents(events, 'maul.sold')[0]!.data).toEqual({ tower: a.id, gold: 50, full: true });
    send(s, { type: 'maul.sendNow' });
    // 135 paid before Wave 1: 75% of it, rounded down.
    expect(maul.towerActions(s, b.id)).toMatchObject({ sellValue: 101, fullRefund: false });
    // Mid-Wave, a new tower is 75% at once, so Juggling always costs something.
    const c = buildAt(s, 'bulwark', 12, 2);
    expect(maul.towerActions(s, c.id)!.sellValue).toBe(7);
    // In the Break after the clear, new spending comes back in full again.
    runUntil(s, () => s.mode.completed === 1);
    expect(s.mode.refundOpen).toBe(true);
    send(s, { type: 'maul.upgrade', tower: c.id, to: 'ballista' });
    expect(maul.towerActions(s, c.id)!.sellValue).toBe(Math.floor(40 + 0.75 * 10));
    events = send(s, { type: 'maul.sell', tower: 777 });
    expect(reasons(events)).toEqual(['no such tower']);
  });
});

describe('a second Race', () => {
  it('can join once Wave 15 is cleared, adding its towers to the build menu and to every Wall\'s upgrades', () => {
    const s = newRun({ map: field(), gold: 1000 });
    const wall = buildAt(s, 'bulwark', 4, 2);
    expect(reasons(send(s, { type: 'maul.addRace', race: 'mirefolk' }))).toEqual(['a second Race joins once Wave 15 is cleared']);
    expect(maul.maulStatus(s).raceChoices).toEqual([]);
    s.mode.completed = 15;
    expect(maul.maulStatus(s).raceChoices).toEqual(['rimeborn', 'mirefolk', 'runecasters']);
    const events = send(s,
      { type: 'maul.addRace', race: 'ironclad' },
      { type: 'maul.addRace', race: 'goblins' },
      { type: 'maul.addRace', race: 'mirefolk' },
      { type: 'maul.addRace', race: 'rimeborn' },
    );
    expect(reasons(events)).toEqual(['the Ironclad are already here', 'no such Race', 'the Run already has two Races']);
    expect(modeEvents(events, 'maul.raceAdded')[0]!.data).toEqual({ race: 'mirefolk' });
    expect(maul.buildOptions(s).map((o) => o.spec)).toEqual(['bulwark', 'ballista', 'mortar', 'dart_tower', 'spore_pod']);
    expect(maul.towerActions(s, wall.id)!.upgrades.map((u) => u.to)).toEqual(['ballista', 'mortar', 'dart_tower', 'spore_pod']);
    send(s, { type: 'maul.upgrade', tower: wall.id, to: 'spore_pod' });
    expect(towerOf(s, wall.id).spec).toBe('spore_pod');
    expect(buildAt(s, 'bramble', 8, 2).spec).toBe('bramble');
  });
});

describe('Juggling', () => {
  it('is allowed: a mid-Wave build that turns creeps around is reported, and so is the sale that lets them back', () => {
    // A wall down column 12 from the top edge leaves a gap at the bottom, and the creeps make for it.
    const s = newRun({ map: field(), gold: 1000, waves: [{ creep: 'brute' }] });
    const top = buildAt(s, 'bulwark', 12, 0);
    for (const row of [2, 4, 6, 8]) buildAt(s, 'bulwark', 12, row);
    send(s, { type: 'maul.sendNow' });
    const lead = (): { x: number; y: number } => s.creeps[0]!;
    runUntil(s, () => s.creeps.length > 0 && lead().x > 9.5 * 64 && lead().y > 8.5 * 64);
    // Opening the top first changes nothing for the leader: the bottom gap is still nearer.
    send(s, { type: 'maul.sell', tower: top.id });
    // Closing the bottom gap now sends it back up the wall to the top.
    let events = send(s, { type: 'maul.build', spec: 'bulwark', col: 12, row: 10 });
    expect(reasons(events)).toEqual([]);
    const closed = modeEvents(events, 'maul.juggle');
    expect(closed).toHaveLength(1);
    expect((closed[0]!.data as { turned: number }).turned).toBeGreaterThanOrEqual(1);
    run(s, 15);
    // Selling the new block reopens the bottom, and whoever turned back near it turns round again.
    const bottom = s.towers.find((t) => t.cell === 10 * 24 + 12)!;
    events = send(s, { type: 'maul.sell', tower: bottom.id });
    expect(modeEvents(events, 'maul.juggle')).toHaveLength(1);
    expect(s.mode.juggles).toBe(2);
    expect(maul.maulStatus(s).turned).toBe(s.mode.turned);
    expect(s.mode.turned).toBeGreaterThanOrEqual(2);
  });

  it('never lets a build strand a creep or seal the way out, mid-Wave included', () => {
    const s = newRun({ map: field(), gold: 1000, waves: [{ creep: 'brute' }] });
    for (const row of [0, 2, 4, 6, 8]) buildAt(s, 'bulwark', 12, row);
    send(s, { type: 'maul.sendNow' });
    run(s, 30);
    expect(reasons(send(s, { type: 'maul.build', spec: 'bulwark', col: 12, row: 10 }))).toEqual(['that would block the path']);
    expect(ofType(run(s, 1), 'rejected')).toEqual([]);
  });
});
