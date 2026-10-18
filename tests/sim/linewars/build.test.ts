import { describe, expect, it } from 'vitest';
import { MAUL_TOWERS } from '../../../src/content/maul';
import { CELL, linewars } from '../../../src/sim';
import { at, buildAt, col, creepIn, modeEvents, newRun, ofType, reasons, run, runTo, runUntil, send, towerOf } from './helpers';

describe('building', () => {
  it('builds each Side\'s Wall and two Tier 1 in its own Field at their whole price, charging only that Side', () => {
    const s = newRun({ gold: 500 });
    buildAt(s, 0, 'bulwark', col(0, 0), 4);
    buildAt(s, 0, 'ballista', col(0, 4), 4);
    buildAt(s, 0, 'mortar', col(0, 8), 4);
    const events = send(s, { type: 'lw.build', side: 1, spec: 'rime_wall', col: col(1, 0), row: 4 });
    expect(modeEvents(events, 'lw.built')[0]!.data).toMatchObject({ side: 1, spec: 'rime_wall', cost: 10 });
    // Only Side 0's gold is the core's, so only its changes are announced.
    expect(ofType(events, 'goldChanged')).toEqual([]);
    buildAt(s, 1, 'frost_spire', col(1, 4), 4);
    buildAt(s, 1, 'chill_totem', col(1, 8), 4);
    expect(s.mode.sides.map((x) => x.gold)).toEqual([500 - 10 - 50 - 60, 500 - 10 - 50 - 60]);
    expect(s.gold).toBe(s.mode.sides[0].gold);
    expect(linewars.buildOptions(s, 0).map((o) => [o.spec, o.cost])).toEqual([['bulwark', 10], ['ballista', 50], ['mortar', 60]]);
    expect(linewars.buildOptions(s, 1).map((o) => o.spec)).toEqual(['rime_wall', 'frost_spire', 'chill_totem']);
    expect(s.towers.map((t) => linewars.towerSide(s, t))).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('refuses the Rival\'s Field, the Divide, the strips, off the Map, another Race, an upgrade-only tower, and short gold', () => {
    const s = newRun({ gold: 55 });
    const events = send(s,
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(1, 4), row: 6 },
      { type: 'lw.build', side: 1, spec: 'rime_wall', col: col(0, 4), row: 6 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: 20, row: 6 },
      { type: 'lw.build', side: 1, spec: 'rime_wall', col: col(1, 15), row: 6 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 4), row: 0 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 4), row: 29 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: 43, row: 6 },
      { type: 'lw.build', side: 0, spec: 'frost_spire', col: col(0, 4), row: 6 },
      { type: 'lw.build', side: 0, spec: 'heavy_ballista', col: col(0, 4), row: 6 },
      { type: 'lw.build', side: 0, spec: 'mortar', col: col(0, 4), row: 6 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 4) },
      { type: 'lw.build', side: 2, spec: 'bulwark', col: col(0, 4), row: 6 },
    );
    expect(reasons(events)).toEqual([
      'that\'s the Rival\'s Field', 'that\'s the Rival\'s Field',
      'can\'t build on the creeps\' road or rock', 'can\'t build on the creeps\' road or rock',
      'can\'t build on the creeps\' road or rock', 'can\'t build on the creeps\' road or rock',
      'off the Map', 'the Rimeborn aren\'t your Race', 'made by upgrading a tower', 'needs 60 gold',
      'build needs spec, col and row', 'no such Side',
    ]);
    expect(s.towers).toHaveLength(0);
    expect(linewars.buildSpot(s, 0, col(1, 4), 6).error).toBe('that\'s the Rival\'s Field');
    expect(linewars.buildSpot(s, 0, col(0, 4), 6)).toMatchObject({ error: null });
  });

  it('refuses a spot on another tower or a creep, and any Block, in either Field', () => {
    const s = newRun({ gold: 1000 });
    // Seven Walls across row 10 leave the east end open; the eighth would seal the Field.
    for (let c = 0; c < 14; c += 2) buildAt(s, 0, 'bulwark', col(0, c), 10);
    const p = at(col(0, 6), 20);
    creepIn(s, 0, 'brute', p.x, p.y);
    const events = send(s,
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 2), row: 10 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 6), row: 20 },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 14), row: 10 },
    );
    expect(reasons(events)).toEqual(['another tower is there', 'a creep is in the way', 'that would block the path']);
    expect(linewars.buildSpot(s, 0, col(0, 14), 10).error).toBe('that would block the path');
    // The other Field is untouched by it: the same row there is open.
    for (let c = 0; c < 14; c += 2) buildAt(s, 1, 'rime_wall', col(1, c), 10);
    expect(reasons(send(s, { type: 'lw.build', side: 1, spec: 'rime_wall', col: col(1, 14), row: 10 }))).toEqual(['that would block the path']);
  });

  it('refuses a logged command for a Side the AI plays, and every command once the Run is over', () => {
    const s = newRun({ drivers: ['human', 'ai'] });
    const events = send(s,
      { type: 'lw.build', side: 1, spec: 'rime_wall', col: col(1, 0), row: 4 },
      { type: 'lw.send', side: 1, send: 'snowlings' },
      { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 0), row: 4 },
    );
    expect(reasons(events)).toEqual(['the Rival\'s AI plays that Side', 'the Rival\'s AI plays that Side']);
    s.phase = 'lost';
    expect(reasons(send(s, { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 4), row: 4 }))).toEqual(['the Run is over']);
  });
});

describe('upgrades', () => {
  it('turn a Wall into either line, climb a Tier, fork at Tier 3, and charge the Side that owns it', () => {
    const s = newRun({ gold: 2000 });
    const t = buildAt(s, 0, 'bulwark', col(0, 4), 6);
    expect(linewars.towerActions(s, 0, t.id)!.upgrades.map((u) => [u.to, u.price])).toEqual([['ballista', 40], ['mortar', 50]]);
    for (const to of ['mortar', 'siege_mortar', 'bombard']) {
      expect(reasons(send(s, { type: 'lw.upgrade', side: 0, tower: t.id, to }))).toEqual([]);
    }
    expect(towerOf(s, t.id).spec).toBe('bombard');
    expect(s.mode.sides[0].gold).toBe(2000 - MAUL_TOWERS['bombard']!.maul.total);
    expect(s.mode.sides[1].gold).toBe(2000);
    expect(s.mode.towers[String(t.id)]).toBe(MAUL_TOWERS['bombard']!.maul.total);
    expect(linewars.towerActions(s, 0, t.id)!.upgrades).toEqual([]);
    // The Rival sees it read-only.
    expect(linewars.towerActions(s, 1, t.id)).toMatchObject({ side: 0, mine: false, upgrades: [], sellValue: 0 });
  });

  it('refuse the other Side\'s tower, a jump, a sideways step and short gold, and never move the maze', () => {
    const s = newRun({ gold: 100 });
    const mine = buildAt(s, 0, 'ballista', col(0, 4), 6);
    const theirs = buildAt(s, 1, 'frost_spire', col(1, 4), 6);
    const version = s.pathVersion;
    const events = send(s,
      { type: 'lw.upgrade', side: 0, tower: theirs.id, to: 'frost_lance' },
      { type: 'lw.upgrade', side: 0, tower: mine.id, to: 'skypiercer' },
      { type: 'lw.upgrade', side: 0, tower: mine.id, to: 'mortar' },
      { type: 'lw.upgrade', side: 0, tower: mine.id, to: 'heavy_ballista' },
      { type: 'lw.upgrade', side: 0, tower: 999, to: 'heavy_ballista' },
      { type: 'lw.upgrade', side: 0, tower: mine.id },
    );
    expect(reasons(events)).toEqual([
      'that tower isn\'t yours', 'Ballista can\'t become that', 'Ballista can\'t become that', 'needs 85 gold', 'no such tower',
      'upgrade needs the tower to become',
    ]);
    send(s, { type: 'lw.upgrade', side: 1, tower: theirs.id, to: 'frost_lance' });
    expect(s.pathVersion).toBe(version);
  });
});

describe('selling', () => {
  it('returns everything until 0:20, before any Send can unlock, then 75% rounded down, to the Side that sells', () => {
    const s = newRun({ gold: 500 });
    const a = buildAt(s, 0, 'ballista', col(0, 4), 6);
    const b = buildAt(s, 0, 'mortar', col(0, 8), 6);
    const c = buildAt(s, 1, 'chill_totem', col(1, 4), 6);
    expect(linewars.towerActions(s, 0, a.id)).toMatchObject({ sellValue: 50, fullRefund: true });
    let events = send(s, { type: 'lw.sell', side: 0, tower: a.id });
    expect(modeEvents(events, 'lw.sold')[0]!.data).toMatchObject({ side: 0, gold: 50, full: true });
    expect(s.mode.sides[0].gold).toBe(500 - 60);
    runTo(s, 20 * 30);
    expect(linewars.lwSellValue(s, b)).toBe(45);
    events = send(s,
      { type: 'lw.sell', side: 1, tower: b.id },
      { type: 'lw.sell', side: 0, tower: b.id },
      { type: 'lw.sell', side: 0, tower: b.id },
      { type: 'lw.sell', side: 1, tower: c.id },
    );
    expect(reasons(events)).toEqual(['that tower isn\'t yours', 'no such tower']);
    expect(modeEvents(events, 'lw.sold').map((e) => e.data)).toEqual([
      { side: 0, tower: b.id, gold: 45, full: false }, { side: 1, tower: c.id, gold: 45, full: false },
    ]);
    // Plus the income ticks at 0:10 and 0:20.
    expect(s.mode.sides.map((x) => x.gold)).toEqual([500 - 60 + 45 + 20, 500 - 60 + 45 + 20]);
    expect(s.mode.towers).toEqual({});
  });
});

describe('Juggling', () => {
  it('is allowed: a build that turns the Rival\'s creeps around is reported for the Side that built, and so is the sale that lets them back', () => {
    const s = newRun({ gold: 1000 });
    // A Wall line across row 10 from the Field's west edge, open at its east end.
    const west = buildAt(s, 0, 'bulwark', col(0, 0), 10);
    for (let c = 2; c < 14; c += 2) buildAt(s, 0, 'bulwark', col(0, c), 10);
    const start = at(col(0, 6), 3);
    const lead = creepIn(s, 0, 'brute', start.x, start.y, { speed: 200 });
    runUntil(s, () => lead.x > col(0, 12) * CELL && lead.y > 8 * CELL);
    // Opening the west end changes nothing for it: the east gap is still nearer.
    send(s, { type: 'lw.sell', side: 0, tower: west.id });
    // Closing the east gap sends it back along the line to the west.
    let events = send(s, { type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 14), row: 10 });
    expect(reasons(events)).toEqual([]);
    const closed = modeEvents(events, 'lw.juggle');
    expect(closed).toHaveLength(1);
    expect(closed[0]!.data).toMatchObject({ side: 0 });
    expect((closed[0]!.data as { turned: number }).turned).toBe(1);
    run(s, 15);
    const east = s.towers.find((t) => t.cell === 10 * s.map.cols + col(0, 14))!;
    events = send(s, { type: 'lw.sell', side: 0, tower: east.id });
    expect(modeEvents(events, 'lw.juggle')).toHaveLength(1);
    expect(s.mode.sides[0]).toMatchObject({ juggles: 2, turned: 2 });
    expect(s.mode.sides[1]).toMatchObject({ juggles: 0, turned: 0 });
    expect(linewars.lwStatus(s).sides[0].juggles).toBe(2);
  });
});
