import { describe, expect, it } from 'vitest';
import { gem, routeCells } from '../../../src/sim';
import {
  OPEN_SPOTS, draftWith, finishWave, modeEvents, newGemRun, ofType, placeFive, reasons, send, skipRound, spotsFor, towerAtId,
} from './helpers';

describe('Gem Quality', () => {
  it('costs 20, then 50, … and shifts the Draft odds', () => {
    const s = newGemRun(5);
    expect(gem.gemStatus(s)).toMatchObject({ quality: 0, nextQualityCost: 20, odds: [1, 0, 0, 0, 0, 0] });
    expect(reasons(send(s, { type: 'gem.buyQuality' }))).toEqual(['not enough gold']);
    s.gold = 70;
    send(s, { type: 'gem.buyQuality' });
    send(s, { type: 'gem.buyQuality' });
    expect(s.gold).toBe(0);
    expect(gem.gemStatus(s)).toMatchObject({ quality: 2, nextQualityCost: 80, odds: [0.6, 0.3, 0.1, 0, 0, 0] });
    s.mode.quality = 8;
    expect(gem.gemStatus(s).nextQualityCost).toBeNull();
    expect(reasons(send(s, { type: 'gem.buyQuality' }))).toEqual(['Gem Quality is at its highest']);
    // Gem Quality 8 never rolls Chipped.
    placeFive(s, spotsFor(0));
    for (const id of s.mode.draft) expect(towerAtId(s, id).spec.endsWith('-chipped')).toBe(false);
  });
});

describe('swap', () => {
  it('spends all builder mana; Draft gems and Rocks swap between Waves, towers during one', () => {
    const s = newGemRun(5);
    const first = skipRound(s, 0);
    const ids = draftWith(s, 1, []);
    const rock = s.towers.find((t) => t.spec === 'rock')!;
    expect(gem.gemStatus(s).swapMana).toBe(10);
    // The kept gem from round 1 is frozen now.
    expect(reasons(send(s, { type: 'gem.swap', a: first, b: ids[0]! }))).toEqual(['towers are frozen between Waves']);
    const a = towerAtId(s, ids[0]!);
    const [ac, ax, ay] = [a.cell, a.x, a.y];
    const [rc, rx, ry] = [rock.cell, rock.x, rock.y];
    const route = routeCells(s);
    const events = send(s, { type: 'gem.swap', a: a.id, b: rock.id });
    expect(reasons(events)).toEqual([]);
    expect(modeEvents(events, 'gem.swapped')).toHaveLength(1);
    expect([a.cell, a.x, a.y]).toEqual([rc, rx, ry]);
    expect([rock.cell, rock.x, rock.y]).toEqual([ac, ax, ay]);
    for (const c of a.cells) expect(s.grid[c]).toBe(a.id);
    for (const c of rock.cells) expect(s.grid[c]).toBe(rock.id);
    expect(routeCells(s)).toEqual(route);
    expect(gem.gemStatus(s)).toMatchObject({ swapMana: 0, wavesUntilSwap: 10 });
    expect(reasons(send(s, { type: 'gem.swap', a: ids[1]!, b: ids[2]! }))).toEqual(['not enough mana: one swap per 10 Waves']);
    // One mana per Wave cleared.
    send(s, { type: 'gem.keep', tower: ids[3]! });
    s.lives = 99;
    finishWave(s);
    expect(s.mode.mana).toBe(1);
  });

  it('swaps towers during a Wave', () => {
    const s = newGemRun(5);
    const first = skipRound(s, 0);
    const ids = draftWith(s, 1, []);
    send(s, { type: 'gem.keep', tower: ids[0]! });
    expect(s.phase).toBe('wave');
    const before = towerAtId(s, first).cell;
    expect(reasons(send(s, { type: 'gem.swap', a: first, b: ids[0]! }))).toEqual([]);
    expect(towerAtId(s, ids[0]!).cell).toBe(before);
    expect(reasons(send(s, { type: 'gem.swap', a: first, b: first }))).toEqual(['pick two different structures']);
  });
});

describe('Rocks', () => {
  it('can be removed for free mid-Wave, one after another, which opens the maze', () => {
    const s = newGemRun(5);
    const ids = draftWith(s, 0, []);
    send(s, { type: 'gem.keep', tower: ids[0]! });
    expect(s.phase).toBe('wave');
    const gold = s.gold;
    const version = s.pathVersion;
    expect(gem.towerActions(s, ids[1]!).removeRock).toMatchObject({ blocked: null });
    const events = send(s, { type: 'gem.removeRock', tower: ids[1]! });
    expect(ofType(events, 'removed').map((e) => e.tower)).toEqual([ids[1]]);
    expect(s.gold).toBe(gold);
    expect(s.pathVersion).toBe(version + 1);
    // Each Rock carries its own cooldown and goes at once, so another can go on the next tick, or the same one.
    expect(reasons(send(s, { type: 'gem.removeRock', tower: ids[2]! }, { type: 'gem.removeRock', tower: ids[3]! }))).toEqual([]);
    expect(reasons(send(s, { type: 'gem.removeRock', tower: ids[3]! }))).toEqual(['not a Rock']);
    expect(reasons(send(s, { type: 'gem.removeRock', tower: ids[0]! }))).toEqual(['not a Rock']);
  });
});

describe('leaks', () => {
  it('cost only the bounty before Wave 10', () => {
    const s = newGemRun(5);
    // An air-only Amethyst can't touch Wave 1.
    const ids = draftWith(s, 0, ['amethyst-chipped']);
    expect(gem.gemStatus(s).leaksFree).toBe(true);
    send(s, { type: 'gem.keep', tower: ids[0]! });
    const events = finishWave(s);
    expect(ofType(events, 'leak')).toHaveLength(10);
    expect(ofType(events, 'leak').every((e) => e.lives === 0)).toBe(true);
    expect(s.phase).toBe('build');
    expect(s.lives).toBe(1);
    // No bounty, but the Wave's 5 + 2 × 1 gold.
    expect(s.gold).toBe(10 + 7);
  });

  it('end the Run from Wave 10 on', () => {
    const s = newGemRun(5);
    s.wave.number = 9;
    expect(gem.gemStatus(s)).toMatchObject({ leaksFree: false, nextWave: 10, fatalLeakWave: 10 });
    const ids = draftWith(s, 0, ['amethyst-chipped']);
    send(s, { type: 'gem.keep', tower: ids[0]! });
    expect(s.wave.number).toBe(10);
    const events = finishWave(s);
    expect(ofType(events, 'leak')).toHaveLength(1);
    expect(ofType(events, 'lost')).toHaveLength(1);
    expect(s.phase).toBe('lost');
    expect(gem.gemRecord(s)).toMatchObject({ wave: 10, won: false, clearSeconds: null });
  });
});

describe('Extra Chance', () => {
  it('unlocks at Gem Quality 8 and is set, switched or cleared before the first Draft gem', () => {
    const s = newGemRun(5);
    expect(reasons(send(s, { type: 'gem.extraChance', target: 'ruby' }))).toEqual(['Extra Chance unlocks at Gem Quality 8']);
    s.mode.quality = 8;
    s.gold = 300;
    send(s, { type: 'gem.extraChance', target: 'ruby' });
    expect(s.gold).toBe(125);
    expect(gem.gemStatus(s).extraChance).toMatchObject({ unlocked: true, target: 'ruby', bonus: 0, paid: 175, canChange: true });
    send(s, { type: 'gem.extraChance', target: 'hold-slate' });
    expect(s.gold).toBe(175);
    expect(reasons(send(s, { type: 'gem.extraChance', target: 'gold' }))).toEqual(['pick a gem type or a base slate']);
    send(s, { type: 'gem.extraChance', target: '' });
    expect(s.gold).toBe(300);
    send(s, { type: 'gem.extraChance', target: 'ruby' });
    send(s, { type: 'gem.placeDraft', col: 14, row: 40 });
    expect(reasons(send(s, { type: 'gem.extraChance', target: '' }))).toEqual(['set Extra Chance before the first Draft gem']);
  });

  it('at full bonus turns every Draft gem into the target type, Chipped or Perfect', () => {
    const s = newGemRun(5);
    s.mode.quality = 8;
    s.gold = 175;
    // Last round targeted Perfects at bonus 9, so this one starts at the cap of 10.
    s.mode.extra.previous = 'emerald';
    s.mode.extra.previousBonus = 9;
    send(s, { type: 'gem.extraChance', target: 'ruby' });
    expect(s.mode.extra.bonus).toBe(10);
    const events = placeFive(s, spotsFor(0));
    const specs = s.mode.draft.map((id) => towerAtId(s, id).spec);
    expect(specs.every((x) => x === 'ruby-perfect' || x === 'ruby-chipped')).toBe(true);
    expect(specs).toContain('ruby-perfect');
    expect(modeEvents(events, 'gem.drafted').some((e) => (e.data as { extraChanced: boolean }).extraChanced)).toBe(true);
    // A hit at a bonus above 3 carries bonus − 4 to the next round; the target clears.
    expect(s.mode.extra).toMatchObject({ target: '', bonus: 0, previous: 'ruby', previousBonus: 6, rolls: [] });
  });

  it('with a lucky slate roll hands out both slates of the pair', () => {
    const s = newGemRun(5);
    s.mode.quality = 8;
    s.gold = 125;
    s.mode.extra.previous = 'air-slate';
    s.mode.extra.previousBonus = 10;
    send(s, { type: 'gem.extraChance', target: 'hold-slate' });
    placeFive(s, spotsFor(0));
    const choices = gem.draftChoices(s);
    expect(choices.some((c) => c.slate === 'hold-slate')).toBe(true);
    expect(choices.some((c) => c.comboSlate === 'ancient-slate')).toBe(true);
  });
});

describe('Records', () => {
  it('score the damage dealt on the last Wave reached', () => {
    const s = newGemRun(5);
    // Beside checkpoint 5–6's lane.
    placeFive(s, OPEN_SPOTS);
    const ids = [...s.mode.draft];
    towerAtId(s, ids[4]!).spec = 'ruby-flawless';
    send(s, { type: 'gem.keep', tower: ids[4]! });
    expect(gem.gemRecord(s)).toMatchObject({ wave: 1, score: 0, won: false });
    finishWave(s);
    // Wave 1 is ten 10-HP creeps.
    expect(gem.gemRecord(s)).toEqual({ wave: 1, won: false, score: 100, clearSeconds: null });
    expect(s.gold).toBe(10 + 10 + 7);
  });
});

describe('queries', () => {
  it('never change the state', () => {
    const s = newGemRun(5);
    skipRound(s, 0);
    placeFive(s, spotsFor(1));
    const before = JSON.stringify(s);
    gem.gemStatus(s);
    gem.draftChoices(s);
    gem.draftHighlights(s);
    gem.draftSpot(s, 40, 40);
    gem.extraChanceQuote(s, 'ruby');
    gem.gemRecord(s);
    for (const t of s.towers) {
      gem.towerActions(s, t.id);
      gem.towerInfo(s, t.id);
      gem.slateMoveError(s, t, 40, 40);
    }
    expect(JSON.stringify(s)).toBe(before);
  });
});
