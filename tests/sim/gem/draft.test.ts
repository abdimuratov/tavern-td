import { describe, expect, it } from 'vitest';
import { createRun, gem, routeCells, type MapSpec } from '../../../src/sim';
import {
  draftWith, finishWave, modeEvents, newGemRun, ofType, placeFive, reasons, send, spotsFor, towerAtId, type GemRun,
} from './helpers';

/** A 12 × 4 corridor: one Draft gem across the top half and one across the bottom half seal it. */
const CORRIDOR: MapSpec = {
  id: 'corridor',
  cols: 12,
  rows: 4,
  terrain: [',...........', ',..........,', ',..........,', '............'],
  spawn: [0, 1],
  waypoints: [[[11, 1], [11, 2]]],
};

describe('the Draft', () => {
  it('places five gems, refuses a sixth, and then offers the choices', () => {
    const s = newGemRun(3);
    expect(gem.gemStatus(s).step).toBe('draft');
    const events = placeFive(s, spotsFor(0));
    expect(reasons(events)).toEqual([]);
    expect(modeEvents(events, 'gem.drafted')).toHaveLength(5);
    expect(modeEvents(events, 'gem.draftReady')).toHaveLength(1);
    expect(s.mode.draft).toHaveLength(5);
    for (const id of s.mode.draft) {
      const t = towerAtId(s, id);
      expect(t.cells).toHaveLength(4);
      expect(t.spec.endsWith('-chipped')).toBe(true); // Gem Quality 0
    }
    expect(gem.gemStatus(s).step).toBe('choose');
    expect(gem.draftChoices(s)).toHaveLength(5);
    expect(reasons(send(s, { type: 'gem.placeDraft', col: 30, row: 50 }))).toEqual(['the Draft is full']);
  });

  it('covers 2 × 2 cells snapped to the 64-unit grid, so gems can sit half a gem apart', () => {
    const s = newGemRun(3);
    send(s, { type: 'gem.placeDraft', col: 10, row: 40 }, { type: 'gem.placeDraft', col: 11, row: 42 });
    const [a, b] = s.mode.draft.map((id) => towerAtId(s, id));
    expect([a!.x, a!.y]).toEqual([11 * 64, 41 * 64]);
    expect([b!.x, b!.y]).toEqual([12 * 64, 43 * 64]);
    expect(reasons(send(s, { type: 'gem.placeDraft', col: 11, row: 41 }))).toEqual(['occupied']);
    expect(reasons(send(s, { type: 'gem.placeDraft', col: 36, row: 11 }))).toEqual(['unbuildable']);
    expect(reasons(send(s, { type: 'gem.placeDraft', col: 94, row: 40 }))).toEqual(['out of bounds']);
  });

  it('refuses a Draft gem that would Block the creeps', () => {
    const s = createRun({ mode: 'gem', seed: 1, difficulty: 'normal', map: CORRIDOR }) as GemRun;
    const events = send(s, { type: 'gem.placeDraft', col: 5, row: 0 }, { type: 'gem.placeDraft', col: 5, row: 2 }, { type: 'gem.placeDraft', col: 9, row: 2 });
    expect(reasons(events)).toEqual(['blocks the path']);
    expect(s.mode.draft).toHaveLength(2);
    // Corner to corner seals too: creeps never squeeze between two footprints.
    expect(gem.draftSpot(s, 7, 2).error).toBe('blocks the path');
    expect(gem.draftSpot(s, 5, 2).error).toBe('blocks the path');
  });

  it('keeps one gem; the other four become Rocks where they stood and the Wave starts at once', () => {
    const s = newGemRun(3);
    placeFive(s, spotsFor(0));
    const [kept, ...rest] = s.mode.draft;
    const keptSpec = towerAtId(s, kept!).spec;
    const cells = rest.map((id) => towerAtId(s, id).cells);
    const events = send(s, { type: 'gem.keep', tower: kept! });
    expect(reasons(events)).toEqual([]);
    expect(towerAtId(s, kept!).spec).toBe(keptSpec);
    rest.forEach((id, i) => {
      expect(towerAtId(s, id).spec).toBe('rock');
      expect(towerAtId(s, id).cells).toEqual(cells[i]);
    });
    expect(ofType(events, 'waveStart')).toEqual([{ type: 'waveStart', wave: 1 }]);
    expect(s.phase).toBe('wave');
    expect(s.mode.draft).toEqual([]);
    finishWave(s);
    // Rocks stay, and the next build phase starts a new Draft.
    expect(s.phase).toBe('build');
    expect(s.towers.filter((t) => t.spec === 'rock')).toHaveLength(4);
    expect(gem.gemStatus(s)).toMatchObject({ step: 'draft', placed: 0, nextWave: 2 });
    expect(reasons(placeFive(s, spotsFor(1)))).toEqual([]);
  });

  it('starts Waves only by choosing from a full Draft', () => {
    const s = newGemRun(3);
    expect(reasons(send(s, { type: 'startWave' }))).toEqual(['keep a gem from your Draft to start the Wave']);
    send(s, { type: 'gem.placeDraft', col: 10, row: 40 });
    const id = s.mode.draft[0]!;
    expect(reasons(send(s, { type: 'gem.keep', tower: id }))).toEqual(['place all five Draft gems first']);
    placeFive(s, spotsFor(1));
    expect(reasons(send(s, { type: 'gem.keep', tower: 9999 }))).toEqual(['pick one of this round\'s Draft gems']);
    expect(reasons(send(s, { type: 'gem.placeDraft' }))).toEqual(['placeDraft needs col and row']);
    expect(reasons(send(s, { type: 'gem.nonsense' }))).toEqual(['unknown command']);
    expect(s.phase).toBe('build');
  });
});

describe('merging', () => {
  it('×2 gives +1 quality in place of the clicked gem', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['ruby-chipped', 'ruby-chipped', 'opal-chipped', 'topaz-chipped', 'sapphire-chipped']);
    expect(gem.draftChoices(s)[1]!.merge).toEqual({ 2: 'ruby-flawed', 3: null, 4: null });
    send(s, { type: 'gem.merge', tower: ids[1]!, count: 2 });
    expect(towerAtId(s, ids[1]!).spec).toBe('ruby-flawed');
    expect(ids.filter((id) => id !== ids[1]).map((id) => towerAtId(s, id).spec)).toEqual(['rock', 'rock', 'rock', 'rock']);
    expect(s.phase).toBe('wave');
  });

  it('×3 needs exactly three and gives +2; ×4 needs four and gives +2 too', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['opal-flawed', 'opal-flawed', 'opal-flawed', 'opal-flawed', 'ruby-chipped']);
    expect(reasons(send(s, { type: 'gem.merge', tower: ids[0]!, count: 3 }))).toEqual(['merging ×3 needs exactly 3 identical Draft gems']);
    expect(reasons(send(s, { type: 'gem.merge', tower: ids[4]!, count: 2 }))).toEqual(['merging ×2 needs 2 identical Draft gems']);
    expect(reasons(send(s, { type: 'gem.merge', tower: ids[0]!, count: 5 }))).toEqual(['merge count must be 2, 3 or 4']);
    send(s, { type: 'gem.merge', tower: ids[2]!, count: 4 });
    expect(towerAtId(s, ids[2]!).spec).toBe('opal-flawless');
  });

  it('above Great makes the Stone of Bryvx', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['diamond-perfect', 'diamond-perfect', 'diamond-perfect', 'ruby-chipped', 'opal-chipped']);
    expect(gem.mergeResult(s, towerAtId(s, ids[0]!), 2)).toBe('diamond-great');
    send(s, { type: 'gem.merge', tower: ids[0]!, count: 3 });
    expect(towerAtId(s, ids[0]!).spec).toBe('stone-of-bryvx');
  });

  it('downgrades any non-Chipped Draft gem by one quality', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['ruby-chipped', 'emerald-flawless', 'opal-chipped', 'topaz-chipped', 'sapphire-chipped']);
    expect(reasons(send(s, { type: 'gem.downgrade', tower: ids[0]! }))).toEqual(['a Chipped gem can\'t be downgraded']);
    send(s, { type: 'gem.downgrade', tower: ids[1]! });
    expect(towerAtId(s, ids[1]!).spec).toBe('emerald-normal');
  });
});

describe('Recipes', () => {
  it('fuse in one hit when the Draft holds every part: any of the five becomes the special', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['diamond-chipped', 'ruby-chipped', 'sapphire-chipped', 'topaz-chipped', 'opal-chipped']);
    expect(gem.draftChoices(s).map((c) => c.recipe)).toEqual(Array(5).fill('silver'));
    expect(gem.draftHighlights(s).recipe).toEqual(ids);
    send(s, { type: 'gem.combineRecipe', tower: ids[1]! });
    expect(towerAtId(s, ids[1]!).spec).toBe('silver');
    expect(s.towers.filter((t) => t.spec === 'rock')).toHaveLength(4);
    expect(s.phase).toBe('wave');
  });

  it('refuse a Draft without one', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['diamond-chipped', 'ruby-chipped', 'ruby-chipped', 'topaz-chipped', 'opal-chipped']);
    expect(reasons(send(s, { type: 'gem.combineRecipe', tower: ids[0]! }))).toEqual(['this Draft holds no Recipe']);
  });

  it('complete with gems already on the field, during a Wave, summing the parts\' kills', () => {
    const s = newGemRun(3);
    const diamond = draftWith(s, 0, ['diamond-chipped'])[0]!;
    send(s, { type: 'gem.keep', tower: diamond });
    finishWave(s);
    towerAtId(s, diamond).kills = 7;
    const sapphire = draftWith(s, 1, ['sapphire-chipped'])[0]!;
    send(s, { type: 'gem.keep', tower: sapphire });
    finishWave(s);
    towerAtId(s, sapphire).kills = 5;
    const topaz = draftWith(s, 2, ['topaz-chipped'])[0]!;
    const events = send(s, { type: 'gem.keep', tower: topaz });
    // Keeping the last part gives the new gem Combine Special.
    expect(modeEvents(events, 'gem.recipeReady').map((e) => e.data)).toEqual([{ tower: topaz, spec: 'silver' }]);
    expect(gem.towerActions(s, topaz).combineRecipe).toMatchObject({ to: 'silver', blocked: null });
    towerAtId(s, topaz).kills = 3;
    expect(reasons(send(s, { type: 'gem.combineRecipe', tower: diamond }))).toEqual(['no Recipe to complete']);
    send(s, { type: 'gem.combineRecipe', tower: topaz });
    expect(towerAtId(s, topaz).spec).toBe('silver');
    expect(towerAtId(s, topaz).kills).toBe(15);
    expect(towerAtId(s, diamond).spec).toBe('rock');
    expect(towerAtId(s, sapphire).spec).toBe('rock');
  });

  it('can\'t be fused between Waves: towers are frozen then', () => {
    const s = newGemRun(3);
    for (const [round, spec] of [[0, 'aquamarine-chipped'], [1, 'emerald-chipped'], [2, 'opal-chipped']] as const) {
      const id = draftWith(s, round, [spec])[0]!;
      send(s, { type: 'gem.keep', tower: id });
      s.lives = 99;
      finishWave(s);
    }
    const opal = s.towers.find((t) => t.spec === 'opal-chipped')!;
    expect(gem.towerActions(s, opal.id).combineRecipe?.blocked).toBe('towers are frozen between Waves');
    expect(reasons(send(s, { type: 'gem.combineRecipe', tower: opal.id }))).toEqual(['towers are frozen between Waves']);
  });
});

describe('special upgrades', () => {
  it('cost the next tier\'s gold, happen during a Wave, and pause the tower for the 1 s build', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['diamond-chipped', 'sapphire-chipped', 'topaz-chipped', 'ruby-chipped', 'opal-chipped']);
    send(s, { type: 'gem.combineRecipe', tower: ids[0]! });
    s.gold = 30;
    expect(gem.towerActions(s, ids[0]!).upgrade).toMatchObject({ to: 'sterling-silver', cost: 25, blocked: null });
    const events = send(s, { type: 'gem.upgradeSpecial', tower: ids[0]! });
    expect(reasons(events)).toEqual([]);
    expect(towerAtId(s, ids[0]!).spec).toBe('sterling-silver');
    expect(towerAtId(s, ids[0]!).cd).toBeGreaterThan(25);
    expect(s.gold).toBe(5);
    expect(reasons(send(s, { type: 'gem.upgradeSpecial', tower: ids[0]! }))).toEqual(['not enough gold']);
    s.gold = 500;
    finishWave(s);
    expect(reasons(send(s, { type: 'gem.upgradeSpecial', tower: ids[0]! }))).toEqual(['towers are frozen between Waves']);
    expect(reasons(send(s, { type: 'gem.upgradeSpecial', tower: ids[1]! }))).toEqual(['nothing to upgrade']);
  });
});

describe('slates', () => {
  it('keep a Normal gem as its slate when a listed Flawed gem is in the Draft; creeps walk over it', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['topaz-normal', 'amethyst-flawed', 'ruby-chipped', 'opal-chipped', 'diamond-chipped']);
    expect(gem.draftChoices(s).map((c) => c.slate)).toEqual(['hold-slate', null, null, null, null]);
    expect(reasons(send(s, { type: 'gem.keepSlate', tower: ids[2]! }))).toEqual(['this Draft can\'t make a slate from that gem']);
    const version = s.pathVersion;
    send(s, { type: 'gem.keepSlate', tower: ids[0]! });
    const slate = towerAtId(s, ids[0]!);
    expect(slate.spec).toBe('hold-slate');
    expect(s.pathVersion).toBeGreaterThan(version);
    // It still holds its build cells, but no Rock: the route may cross it.
    expect(gem.draftSpot(s, 0, 0).error).not.toBeNull();
    for (const c of slate.cells) expect(s.grid[c]).toBe(slate.id);
    expect(reasons(send(s, { type: 'gem.swap', a: ids[0]!, b: ids[1]! }))).toEqual(['slates can\'t be swapped']);
  });

  it('combine into the combination slate when the Draft makes both of a pair', () => {
    const s = newGemRun(3);
    const ids = draftWith(s, 0, ['topaz-normal', 'amethyst-flawed', 'amethyst-normal', 'emerald-flawed', 'diamond-chipped']);
    expect(gem.draftChoices(s).map((c) => c.comboSlate)).toEqual(['ancient-slate', null, 'ancient-slate', null, null]);
    send(s, { type: 'gem.combineSlate', tower: ids[2]! });
    expect(towerAtId(s, ids[2]!).spec).toBe('ancient-slate');
  });

  it('let creeps walk across them', () => {
    const s = newGemRun(3);
    const before = routeCells(s);
    // A slate right on the route between checkpoints 5 and 6.
    const ids = draftWith(s, 0, ['topaz-normal', 'amethyst-flawed', 'ruby-chipped', 'opal-chipped', 'diamond-chipped']);
    const slate = towerAtId(s, ids[0]!);
    const target = s.map.cols * 30 + 52;
    for (const c of slate.cells) s.grid[c] = 0;
    slate.cell = target;
    slate.cells = [target, target + 1, target + s.map.cols, target + s.map.cols + 1];
    for (const c of slate.cells) s.grid[c] = slate.id;
    s.pathVersion++;
    send(s, { type: 'gem.keepSlate', tower: slate.id });
    expect(routeCells(s)).toEqual(before);
  });
});
