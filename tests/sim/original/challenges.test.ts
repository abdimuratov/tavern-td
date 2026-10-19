import { describe, expect, it } from 'vitest';
import {
  CHALLENGES, FAMILIES, ROW_COST, STAGES, challengeById, challengeOfStage, stageByNumber,
} from '../../../src/content/original';
import {
  advance, createRun, hashState, original, replay, replayHash, restore, snapshot, spawnCreep,
  type Command, type GameState, type Replay, type ReplayEntry,
} from '../../../src/sim';
import { challengeSetup, talentsFor } from '../../../tools/balance/jobs';
import { playStage } from './bot';
import { buildOn, modeEvents, newRun, placeTower, reasons, runUntil, send } from './helpers';

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
      const spots = stageByNumber(c.stage)!.map.buildSpots!.length;
      for (const i of c.modifiers.spots ?? []) expect(i, c.id).toBeLessThan(spots);
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
    expect(original.spotInfo(s, 2).options.map((o) => o.family)).toEqual(['cannon', 'frost']);
    expect(status(s).unlocks.families).toEqual(['cannon', 'frost']);
    expect(reasons(send(s, { type: 'original.build', spot: 2, spec: 'arrow_tower' }))).toEqual(['no arrow towers in this Challenge']);
    // What the Campaign hasn't opened still says so.
    expect(reasons(send(s, { type: 'original.build', spot: 2, spec: 'mage_tower' }))).toEqual(['the arcane family isn\'t unlocked yet']);
    expect(buildOn(s, 2, 'frost_tower').spec).toBe('frost_tower');
    // A family the rule allows but the Campaign hasn't opened stays shut: Stone Wings early on has no Totem.
    const w = newRun({ challenge: 'stone-wings', cleared: 5 });
    expect(status(w).unlocks.families).toEqual(['cannon', 'frost', 'arcane', 'poison']);
  });

  it('spots: the Map keeps only the Challenge\'s Build Spots, and the others turn back to ground', () => {
    const stage = stageByNumber(1)!.map;
    const s = newRun({ challenge: 'burnt-mill' });
    expect(s.map.buildSpots).toEqual(stage.buildSpots!.slice(0, 4));
    const [col, row] = stage.buildSpots![4]!;
    expect(s.map.terrain[row]![col]).toBe('#');
    expect(stage.terrain[row]![col]).toBe('.');
    expect(stage.buildSpots).toHaveLength(8);
    expect(original.spotInfo(s, 4).error).toBe('no such Build Spot');
    expect(buildOn(s, 3, 'arrow_tower').spec).toBe('arrow_tower');
    // The Map is built once per Challenge.
    expect(newRun({ challenge: 'burnt-mill' }).map).toBe(s.map);
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
      expect(restored.map.buildSpots).toHaveLength(4);
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
    expect(loaded.map.buildSpots).toHaveLength(8);
    toBreak(loaded);
    expect(status(loaded).break!.totalTicks).toBe(30 * 30);
  });
});
