import { describe, expect, it } from 'vitest';
import {
  CHALLENGES, FAMILIES, MAP_COLS, MAP_ROWS, MILL_ROAD, ROW_COST, STAGES, challengeById, challengeOfStage, stageByNumber,
} from '../../../src/content/original';
import {
  advance, createRun, hashState, original, replay, replayHash, restore, snapshot, spawnCreep,
  type Command, type GameState, type Replay, type ReplayEntry,
} from '../../../src/sim';
import { challengeSetup, talentsFor } from '../../../tools/balance/jobs';
import { playStage } from './bot';
import { FORMER_SPOTS, KEPT_SPOTS } from './former-spots';
import { asSpotSave, buildAt, buildOn, cellOfPlace, modeEvents, newRun, placeTower, reasons, run, runUntil, send } from './helpers';

// Challenges (docs/original-design.md §16): a Stage played again under its
// own rule. Each modifier is checked on the Challenge that uses it.

const status = original.originalStatus;

/** Steps until Wave `wave`'s last creep has spawned and its Break is running. */
function toBreak(s: GameState, wave = 1): void {
  if (s.wave.number < wave) send(s, { type: 'original.sendNow' });
  runUntil(s, () => status(s).step === 'break');
}

describe('the Challenge table', () => {
  it('gives every Stage one Challenge, each paying 1 Star once', () => {
    expect(CHALLENGES.map((c) => c.stage)).toEqual(STAGES.map((s) => s.number));
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    expect(CHALLENGES.every((c) => c.stars === 1)).toBe(true);
    expect(challengeById('short-rope')).toBe(challengeOfStage(3));
  });

  it('brings the Campaign to 48 Stars, exactly what all six Talent trees cost', () => {
    expect(original.maxStageStars()).toBe(36);
    expect(original.maxChallengeStars()).toBe(12);
    expect(original.maxStars()).toBe(FAMILIES.length * ROW_COST.reduce((a, b) => a + b, 0));
  });

  it('keeps each rule to one line and one or two modifiers, naming only what exists', () => {
    for (const c of CHALLENGES) {
      expect(c.rule.length, c.id).toBeLessThanOrEqual(80);
      const count = Object.keys(c.modifiers).length;
      expect(count, c.id).toBeGreaterThanOrEqual(1);
      expect(count, c.id).toBeLessThanOrEqual(2);
      for (const [col, row, w, h] of c.modifiers.burnt?.rects ?? []) {
        expect(col >= 0 && row >= 0 && col + w <= MAP_COLS && row + h <= MAP_ROWS, c.id).toBe(true);
      }
      if (c.modifiers.maxTowers !== undefined) expect(Number.isInteger(c.modifiers.maxTowers) && c.modifiers.maxTowers > 0, c.id).toBe(true);
      for (const f of c.modifiers.families ?? []) expect(FAMILIES, c.id).toContain(f);
    }
  });
});

describe('a Challenge as a Run setting', () => {
  it('plays its own Stage on Normal, with that Stage finished by default', () => {
    const s = createRun({ mode: 'original', seed: 1, difficulty: 'normal', options: { challenge: 'short-rope' } }) as original.OriginalGameState;
    expect(s.mode).toMatchObject({ stage: 3, challenge: 'short-rope', cleared: 3 });
    expect(status(s).challenge).toBe('short-rope');
    expect(original.runChallenge(s)).toBe(challengeOfStage(3));
  });

  it('refuses an unknown Challenge, another Stage\'s, and any Difficulty but Normal', () => {
    const start = (options: Record<string, unknown>, difficulty: 'normal' | 'hard' = 'normal') =>
      () => createRun({ mode: 'original', seed: 1, difficulty, options: options as never });
    expect(start({ challenge: 'nope' })).toThrow(/no Challenge nope/);
    expect(start({ stage: 2, challenge: 'short-rope' })).toThrow(/played on Stage 3, not 2/);
    expect(start({ challenge: 'short-rope' }, 'hard')).toThrow(/plays on normal/);
    expect(start({ challenge: 7 })).toThrow(/Challenge id/);
    expect(start({ stage: 3, challenge: null })).not.toThrow();
  });

  it('leaves a Stage\'s own Run without the key, so it serializes and hashes as before Challenges', () => {
    const s = newRun({ stage: 3 });
    expect(Object.hasOwn(s.mode, 'challenge')).toBe(false);
    expect(snapshot(s)).not.toContain('challenge');
    expect(status(s).challenge).toBeNull();
    expect(original.runModifiers(s)).toEqual({});
  });
});

describe('the modifiers', () => {
  it('families: only the Challenge\'s families build, and the ring offers only them', () => {
    const s = newRun({ challenge: 'cold-water', cleared: 2, gold: 1000 });
    expect(original.placeInfo(s, ...cellOfPlace(s, 2)).options.map((o) => o.family)).toEqual(['cannon', 'frost']);
    expect(status(s).unlocks.families).toEqual(['cannon', 'frost']);
    expect(reasons(send(s, buildAt(s, 2, 'arrow_tower')))).toEqual(['no arrow towers in this Challenge']);
    // What the Campaign hasn't opened still says so.
    expect(reasons(send(s, buildAt(s, 2, 'mage_tower')))).toEqual(['the arcane family isn\'t unlocked yet']);
    expect(buildOn(s, 2, 'frost_tower').spec).toBe('frost_tower');
    // A family the rule allows but the Campaign hasn't opened stays shut: Stone Wings early on has no Totem.
    const w = newRun({ challenge: 'stone-wings', cleared: 5 });
    expect(status(w).unlocks.families).toEqual(['cannon', 'frost', 'arcane', 'poison']);
  });

  it('burnt: Burnt ground paints over Open ground only and joins the Map\'s Scenery, in the Ghost\'s words', () => {
    const stage = stageByNumber(1)!.map;
    const s = newRun({ challenge: 'burnt-mill', gold: 5000 });
    const open = (m: typeof stage): number => m.terrain.join('').split('').filter((ch) => ch === '.').length;
    expect(open(s.map)).toBe(168);
    expect(open(newRun({ challenge: 'glass-slope' }).map)).toBe(241);
    expect(s.map.scenery!.map((p) => [p.kind, p.name, p.at])).toEqual([
      ['building', 'the mill', 'on the mill'], ['water', 'the millpond', 'in the millpond'], ['burnt', 'Lower bend burnt', 'on burnt ground'],
    ]);
    // The lower bend's ground is burnt; its road stays road, and the pond keeps its words.
    expect(reasons(send(s, buildAt(s, 4, 'arrow_tower')))).toEqual(['on burnt ground']);
    expect(reasons(send(s, buildAt(s, [0, 5], 'arrow_tower')))).toEqual(['on burnt ground']);
    expect(s.map.terrain[14]).toBe(stage.terrain[14]!.replace(/\./g, '#'));
    expect(reasons(send(s, buildAt(s, [18, 11], 'arrow_tower')))).toEqual(['in the millpond']);
    expect(buildOn(s, 3, 'arrow_tower').spec).toBe('arrow_tower');
    expect(buildOn(s, [5, 5], 'arrow_tower').spec).toBe('arrow_tower');
    const glass = newRun({ challenge: 'glass-slope' });
    expect(reasons(send(glass, buildAt(glass, 4, 'arrow_tower')))).toEqual(['on the glass']);
    expect(buildOn(glass, 8, 'arrow_tower').spec).toBe('arrow_tower');
    // The Map is built once per Challenge, and the Stage's own is untouched.
    expect(newRun({ challenge: 'burnt-mill' }).map).toBe(s.map);
    expect(newRun({ stage: 1 }).map).toBe(MILL_ROAD.map);
    expect(stage.scenery).toHaveLength(2);
  });

  it('maxTowers: the Tower cap refuses a build after the ground, before the gold, and selling frees room', () => {
    const s = newRun({ challenge: 'burnt-mill', gold: 5000 });
    const towers = [0, 1, 2, 3].map((spot) => buildOn(s, spot, 'arrow_tower'));
    const cap = '4 towers stand: the most in this Challenge';
    expect(reasons(send(s, buildAt(s, [5, 5], 'arrow_tower')))).toEqual([cap]);
    expect(original.placeInfo(s, 5, 5)).toMatchObject({ error: cap });
    expect(original.placeInfo(s, 5, 5).options.every((o) => o.blocked === cap)).toBe(true);
    // The ground's reasons first, then the cap, then the family and the gold.
    expect(reasons(send(s, buildAt(s, [0, 2], 'arrow_tower')))).toEqual(['on the road']);
    expect(reasons(send(s, buildAt(s, [0, 12], 'arrow_tower')))).toEqual(['on burnt ground']);
    expect(reasons(send(s, buildAt(s, 0, 'arrow_tower')))).toEqual(['a tower stands there']);
    s.gold = 0;
    expect(reasons(send(s, buildAt(s, [5, 5], 'longbow_tower')))).toEqual([cap]);
    s.gold = 5000;
    send(s, { type: 'original.sell', tower: towers[1]!.id });
    expect(buildOn(s, [5, 5], 'cannon_tower').spec).toBe('cannon_tower');
    expect(reasons(send(s, buildAt(s, 1, 'arrow_tower')))).toEqual([cap]);
    // Towers past the cap (an older save's) stay standing; only new builds wait.
    placeTower(s, [7, 4], 'arrow_tower');
    run(s, 30);
    expect(s.towers).toHaveLength(5);
    expect(original.capError(newRun({ stage: 1 }))).toBeNull();
    const glass = newRun({ challenge: 'glass-slope', gold: 5000 });
    for (const spot of KEPT_SPOTS['glass-slope']!) buildOn(glass, spot, 'arrow_tower');
    expect(reasons(send(glass, buildAt(glass, [27, 13], 'arrow_tower')))).toEqual(['8 towers stand: the most in this Challenge']);
  });

  it('lives and gold: the Run starts with the Challenge\'s, and test gold still wins', () => {
    expect(newRun({ challenge: 'last-stand' }).lives).toBe(13);
    expect(newRun({ challenge: 'wardbreakers' }).lives).toBe(15);
    const supply = newRun({ challenge: 'short-supply' });
    expect([supply.gold, supply.lives]).toEqual([450, 20]);
    expect(newRun({ challenge: 'old-rites' }).gold).toBe(350);
    expect(newRun({ challenge: 'old-rites', gold: 5000 }).gold).toBe(5000);
  });

  it('hp: creeps, the wave preview and Shields all scale with it', () => {
    const host = newRun({ challenge: 'gravelords-host' });
    const plain = newRun({ stage: 4 });
    for (const s of [host, plain]) send(s, { type: 'original.sendNow' });
    expect(host.creeps[0]!.maxHp).toBe(Math.round(original.ghoulHp(4) * 1.15));
    expect(plain.creeps[0]!.maxHp).toBe(Math.round(original.ghoulHp(4)));
    expect(original.wavePreview(host, 1)!.ghoulHp).toBe(Math.round(original.ghoulHp(4) * 1.15));
    // Wave 2 is 15 Crawlers, then 4 Ghouls.
    expect(original.wavePreview(host, 2)!.groups[1]!.hp).toBe(Math.round(original.ghoulHp(5) * 1.15));
    // Stone Wings: 10% more, Shields included. A Shieldbearer of Wave 18 is at Threat 29.
    const shield = (s: GameState): number => {
      const c = spawnCreep(s, 'shieldbearer', { wave: 18, route: 0 }, []);
      return (s.mode as original.OriginalState).creeps[String(c.id)]!.shield;
    };
    expect(shield(newRun({ challenge: 'stone-wings' }))).toBe(Math.round(0.1 * original.ghoulHp(29) * 1.1));
    expect(shield(newRun({ stage: 10 }))).toBe(Math.round(0.1 * original.ghoulHp(29)));
  });

  it('noEarlyCall: Send now still ends the Break, but pays nothing', () => {
    const s = newRun({ challenge: 'short-supply' });
    toBreak(s);
    expect(status(s).earlyCall).toBe(0);
    const gold = s.gold;
    const events = send(s, { type: 'original.sendNow' });
    expect(s.wave.number).toBe(2);
    expect(modeEvents(events, 'original.earlyCall')[0]!.data).toEqual({ wave: 2, gold: 0 });
    expect(s.gold).toBe(gold);
    expect(s.mode.earlyGold).toBe(0);
    const plain = newRun({ stage: 8 });
    toBreak(plain);
    expect(status(plain).earlyCall).toBeGreaterThan(0);
  });

  it('breakSeconds: the Break before the next Wave is that long', () => {
    const s = newRun({ challenge: 'no-rest' });
    toBreak(s);
    expect(status(s).break!.totalTicks).toBe(8 * 30);
    const hordes = newRun({ challenge: 'three-hordes' });
    toBreak(hordes);
    expect(status(hordes).break!.totalTicks).toBe(18 * 30);
    const plain = newRun({ stage: 7 });
    toBreak(plain);
    expect(status(plain).break!.totalTicks).toBe(30 * 30);
  });

  it('maxTier: towers stop at Tier 2 though the Campaign has opened Tier 3', () => {
    const s = newRun({ challenge: 'short-rope', gold: 5000 });
    const t = buildOn(s, 0, 'arrow_tower');
    send(s, { type: 'original.upgrade', tower: t.id, to: 'longbow_tower' });
    expect(t.spec).toBe('longbow_tower');
    expect(original.towerActions(s, t.id)!.upgrades[0]!.blocked).toBe('no Tier 3 in this Challenge');
    expect(reasons(send(s, { type: 'original.upgrade', tower: t.id, to: 'marksman_tower' }))).toEqual(['no Tier 3 in this Challenge']);
    expect(status(s).unlocks.maxTier).toBe(2);
  });

  it('noSpecialisations: a Tier 3 tower can\'t take a Specialisation', () => {
    const s = newRun({ challenge: 'old-rites', gold: 5000 });
    const t = placeTower(s, 0, 'marksman_tower');
    expect(reasons(send(s, { type: 'original.upgrade', tower: t.id, to: 'deadeye_perch' }))).toEqual(['no Specialisations in this Challenge']);
    expect(status(s).unlocks.specialisations).toBe(false);
    expect(status(newRun({ stage: 6, cleared: 6 })).unlocks.specialisations).toBe(true);
  });
});

describe('how a Challenge ends', () => {
  it('pays its Stars for any win, whatever the lives, and nothing for a loss', () => {
    const s = newRun({ challenge: 'last-stand' });
    expect(status(s).stars).toBe(1);
    s.phase = 'won';
    s.lives = 2;
    expect(original.originalResult(s)).toMatchObject({ won: true, stars: 1, stage: 12, challenge: 'last-stand' });
    s.phase = 'lost';
    expect(original.originalResult(s)).toMatchObject({ won: false, stars: 0, challenge: 'last-stand' });
    expect(status(s).stars).toBe(0);
    const plain = newRun({ stage: 12 });
    plain.phase = 'won';
    plain.lives = 19;
    expect(original.originalResult(plain)).toMatchObject({ stars: 3, challenge: null });
  });

  it('keeps a Challenge Record by its fastest win; a loss changes nothing and the Stars come once', () => {
    const won = (seconds: number) => ({ won: true, stars: 1, difficulty: 'normal' as const, seconds });
    const lost = { won: false, stars: 0, difficulty: 'normal' as const, seconds: null };
    expect(original.mergeChallengeRecord(null, lost)).toBeNull();
    let r = original.mergeChallengeRecord(null, won(600));
    expect(r).toEqual({ fastest: 600 });
    expect(original.challengeStarsGained(null, won(600), 1)).toBe(1);
    expect(original.challengeStarsGained(r, won(500), 1)).toBe(0);
    expect(original.challengeStarsGained(null, lost, 1)).toBe(0);
    r = original.mergeChallengeRecord(r, won(700));
    expect(r).toEqual({ fastest: 600 });
    r = original.mergeChallengeRecord(r, won(550));
    expect(r).toEqual({ fastest: 550 });
    expect(original.mergeChallengeRecord(r, lost)).toBe(r);
  });
});

/** A whole bot Run of The Burnt Mill (seed 3 wins it), as a replay. */
function burntMill(): { replay: Replay; final: GameState } {
  const log: ReplayEntry[] = [];
  const setup = challengeSetup(1)!;
  const talents = talentsFor({ stage: 1, strategy: 'balanced', challenge: true });
  const r = playStage(3, 'normal', { stage: 1, ...setup, strategy: 'balanced', style: 3, talents, record: log });
  return {
    replay: { mode: 'original', seed: 3, difficulty: 'normal', options: { stage: 1, challenge: setup.challenge, cleared: 1, talents }, log, until: r.state.tick },
    final: r.state,
  };
}

describe('a Challenge Run is fully determined by its settings', () => {
  const { replay: fixture, final } = burntMill();

  it('replays to the same hash, and a save restored mid-Run plays on identically', () => {
    expect(final.phase).toBe('won');
    expect(replayHash(fixture)).toBe(hashState(final));
    const until = fixture.until!;
    for (const cut of [Math.floor(until / 3), Math.floor((until * 2) / 3)]) {
      const restored = restore(snapshot(replay(fixture, cut)));
      expect((restored.mode as original.OriginalState).challenge).toBe('burnt-mill');
      expect(restored.map).toEqual(original.challengeMap(challengeById('burnt-mill')!));
      while (restored.tick < until) advance(restored, 1, fixture.log.filter((e) => e.tick === restored.tick).map((e) => e.command as Command));
      expect(hashState(restored)).toBe(hashState(final));
    }
  });

  it('loads a save from before Challenges as the Stage\'s own Run', () => {
    // A Stage's save has no `challenge`, exactly as every save written before Challenges.
    const old = newRun({ stage: 1, cleared: 0 });
    send(old, { type: 'original.sendNow' });
    const loaded = restore(snapshot(old)) as original.OriginalGameState;
    expect(original.runChallenge(loaded)).toBeNull();
    expect(status(loaded)).toMatchObject({ challenge: null, lives: 20 });
    expect(loaded.map).toEqual(MILL_ROAD.map);
    toBreak(loaded);
    expect(status(loaded).break!.totalTicks).toBe(30 * 30);
  });
});

/** Plays both on for `ticks` and says whether they stay the same Run. */
function sameRun(a: GameState, b: GameState, ticks: number): boolean {
  for (let i = 0; i < ticks; i++) {
    advance(a, 1, []);
    advance(b, 1, []);
  }
  return hashState(a) === hashState(b);
}

const NO_FIT = 'This saved Run\'s towers don\'t fit the Stage\'s Map any more, so it can\'t be loaded.';

describe('older saves made on Build Spots', () => {
  it('loads a Stage\'s save onto its current Map, every tower on its cells, and plays on as a Run there would', () => {
    const s = newRun({ stage: 1, cleared: 0, gold: 1000 });
    for (const spot of [0, 4, 7]) buildOn(s, spot, spot === 4 ? 'cannon_tower' : 'arrow_tower');
    send(s, { type: 'original.sendNow' });
    run(s, 400);
    const old = asSpotSave(s, FORMER_SPOTS['mill-road']!);
    expect(original.upgradeSave(old)).toBeNull();
    expect(old.map).toBe(MILL_ROAD.map);
    expect(old.towers.map((t) => [t.spec, t.cells])).toEqual(s.towers.map((t) => [t.spec, t.cells]));
    expect(old.mode).toEqual(s.mode);
    // A save made since keeps the Map it carries.
    const fresh = restore(snapshot(s));
    expect(original.upgradeSave(fresh)).toBeNull();
    expect(fresh.map).toEqual(MILL_ROAD.map);
    s.pathVersion++;
    expect(sameRun(old, s, 900)).toBe(true);
    expect(old.creeps.length + (old.mode as original.OriginalState).completed).toBeGreaterThan(0);
  });

  it('loads an old Burnt Mill save onto the Challenge\'s Map, under its Tower cap', () => {
    const s = newRun({ challenge: 'burnt-mill', gold: 1000 });
    for (const spot of KEPT_SPOTS['burnt-mill']!) buildOn(s, spot, 'arrow_tower');
    send(s, { type: 'original.sendNow' });
    run(s, 300);
    const kept = KEPT_SPOTS['burnt-mill']!.map((i) => FORMER_SPOTS['mill-road']![i]!);
    const old = asSpotSave(s, kept);
    expect(original.upgradeSave(old)).toBeNull();
    expect(old.map).toBe(original.challengeMap(challengeById('burnt-mill')!));
    expect(old.towers).toHaveLength(4);
    expect(reasons(send(old, buildAt(old, [5, 5], 'arrow_tower')))).toEqual(['4 towers stand: the most in this Challenge']);
    send(s, buildAt(s, [5, 5], 'arrow_tower'));
    s.pathVersion++;
    expect(sameRun(old, s, 600)).toBe(true);
  });

  it('refuses a save with a tower where Scenery now stands, on a Map of its own, or whose grid disagrees', () => {
    const s = newRun({ stage: 1, gold: 1000 });
    placeTower(s, [13, 4], 'arrow_tower');
    expect(original.upgradeSave(asSpotSave(s, [...FORMER_SPOTS['mill-road']!, [13, 4]]))).toBe(NO_FIT);
    const custom = newRun({ map: { ...MILL_ROAD.map, id: 'my-map' } });
    expect(original.upgradeSave(asSpotSave(custom, FORMER_SPOTS['mill-road']!))).toBe(NO_FIT);
    const grid = newRun({ stage: 1 });
    buildOn(grid, 0, 'arrow_tower');
    const broken = asSpotSave(grid, FORMER_SPOTS['mill-road']!);
    broken.grid[broken.towers[0]!.cells[3]!] = 0;
    expect(original.upgradeSave(broken)).toBe(NO_FIT);
    const lost = asSpotSave(newRun({ stage: 1 }), FORMER_SPOTS['mill-road']!);
    (lost.mode as { stage: number }).stage = 99;
    expect(original.upgradeSave(lost)).toBe(NO_FIT);
  });
});
