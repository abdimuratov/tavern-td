import { afterEach, describe, expect, it } from 'vitest';
import { readCode, writeCode, type SaveRules } from '../src/app/saves';
import { challengeOfStage, ORIGINAL_TOWERS } from '../src/content/original';
import type { CampaignProgress } from '../src/platform/storage';
import { hashState, original, snapshot, step, type Command, type GameState, type Point } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { ORIGINAL_UI, originalOptionsText, validOriginalSave } from '../src/ui/modes/original';
import {
  campaign, challengeLines, challengeOpen, challengeRecord, challengesWon, challengeStarsEarned, challengeState, challengeWon,
  describeOutcome, MOST_STARS, opened, runTalents, stageOpen, stagesCleared, starsEarned, starsFree, withChallengeResult, withResult, withRun,
} from '../src/ui/modes/original/campaign';
import { challengeStatus } from '../src/ui/modes/original/StageSelect';
import { ORIGINAL_LOOK, REGION_TERRAIN } from '../src/ui/modes/original/look';
import { ring, spotCentre } from '../src/ui/modes/original/ring';
import { buildOn, newRun, placeTower, setLevel } from './sim/original/helpers';

interface FakeView extends RunView {
  readonly sent: Command[];
  readonly ghosts: (Point | null)[];
}

function viewOf(state: GameState): FakeView {
  const sent: Command[] = [];
  const ghosts: (Point | null)[] = [];
  return {
    state, side: 0, sent, ghosts,
    send: (c) => void sent.push(c),
    refresh: () => {},
    select: () => {},
    say: () => {},
    showGhost: (p) => void ghosts.push(p),
  };
}

/** The middle of Build Spot `spot` on the Mill Road. */
function spotPoint(spot: number): Point {
  return spotCentre(newRun({ cleared: 0 }), spot)!;
}

const won = (stars: number, seconds = 400) => ({ won: true, stars, difficulty: 'normal' as const, seconds });
const EMPTY: CampaignProgress = { stages: {}, challenges: {}, talents: [] };

afterEach(() => {
  ring.value = null;
  campaign.value = { stages: {}, challenges: {}, talents: [] };
});

describe('the build ring', () => {
  it('opens on an empty Build Spot, shows the picked Ghost there, and builds on a second tap', () => {
    const state = newRun({ cleared: 0 });
    const view = viewOf(state);
    const p = spotPoint(2);
    expect(ORIGINAL_UI.placement!(view, p)).toBeNull();
    expect(ORIGINAL_UI.tapGround!(view, p, 'touch')).toBe(true);
    expect(ring.value).toEqual({ spot: 2, family: null, kind: 'touch' });
    // No family yet: no Ghost.
    expect(ORIGINAL_UI.placement!(view, p)).toBeNull();

    ring.value = { ...ring.value!, family: 'cannon' };
    const ghost = ORIGINAL_UI.placement!(view, p)!;
    expect(ghost.command).toEqual({ type: 'original.build', spot: 2, spec: 'cannon_tower' });
    expect(ghost).toMatchObject({ error: null, label: 'Cannon Tower · 90 gold', range: 288, route: false, checked: true });
    expect(ghost.cells).toHaveLength(4);
    // The Ghost stands only on the ring's own Spot.
    expect(ORIGINAL_UI.placement!(view, spotPoint(3))).toBeNull();

    expect(ORIGINAL_UI.tapGround!(view, p, 'touch')).toBe(true);
    expect(view.sent).toEqual([{ type: 'original.build', spot: 2, spec: 'cannon_tower' }]);
    expect(ring.value).toBeNull();
    expect(view.ghosts.at(-1)).toBeNull();
  });

  it('closes on a tap away from it, and leaves other taps alone when it is shut', () => {
    const state = newRun({ cleared: 0 });
    const view = viewOf(state);
    ORIGINAL_UI.tapGround!(view, spotPoint(0), 'mouse');
    expect(ORIGINAL_UI.pending!(view)).toBe(true);
    // The road at the top of the Map is no Build Spot.
    expect(ORIGINAL_UI.tapGround!(view, { x: 600, y: 192 }, 'mouse')).toBe(true);
    expect(ring.value).toBeNull();
    expect(ORIGINAL_UI.tapGround!(view, { x: 600, y: 192 }, 'mouse')).toBe(false);
  });

  it('keeps a Spot whose family is short of gold open, and shows why on the Ghost', () => {
    const state = newRun({ cleared: 0 });
    state.gold = 50;
    const view = viewOf(state);
    ORIGINAL_UI.tapGround!(view, spotPoint(1), 'touch');
    ring.value = { ...ring.value!, family: 'arrow' };
    expect(ORIGINAL_UI.placement!(view, spotPoint(1))!.error).toBe('needs 70 gold');
    ORIGINAL_UI.tapGround!(view, spotPoint(1), 'touch');
    expect(view.sent).toHaveLength(1);
    expect(ring.value).not.toBeNull();
  });

  it('shows a tower its real reach: its attack range, or a Totem its aura', () => {
    const state = newRun();
    const arrow = placeTower(state, 0, 'arrow_tower');
    const totem = placeTower(state, 1, 'drum_totem');
    expect(ORIGINAL_UI.towerReach!(state, arrow)).toBe(320);
    expect(ORIGINAL_UI.towerReach!(state, totem)).toBe(256);
  });
});

describe('the Original play screen', () => {
  it('previews Waves with each creep, its tags and its numbers', () => {
    const view = viewOf(newRun({ cleared: 0 }));
    const w5 = ORIGINAL_UI.wavePreview!(view, 4)!;
    expect(w5.number).toBe(5);
    expect(w5.groups[0]).toMatchObject({ name: 'Hound', count: 16, air: false, boss: false, traits: ['Fast'] });
    expect(w5.groups[0]!.about).toMatch(/HP each/);
    expect(ORIGINAL_UI.wavePreview!(view, 12)).toBeNull();
  });

  it('takes the Stage chosen with the Campaign\'s Talents and Stages finished', () => {
    campaign.value = { stages: { 1: { stars: 3, hardest: 'normal', fastest: 300 } }, challenges: {}, talents: ['fletching'] };
    expect(ORIGINAL_UI.runSettings!({ stage: '1' })).toEqual({ stage: 1, talents: ['fletching'], cleared: 1 });
    expect(ORIGINAL_UI.optionsText!({ stage: '1' })).toBe('The Mill Road');
    expect(ORIGINAL_UI.optionsOf!(newRun({ stage: 1 }))).toEqual({ stage: '1' });
  });

  it('numbers a tower from Tower Level 2, in gold once it holds a Perk', () => {
    const state = newRun();
    const t = buildOn(state, 0, 'arrow_tower');
    expect(ORIGINAL_LOOK.towerLabel!(t, state)).toBeNull();
    setLevel(state, t, 3);
    expect(ORIGINAL_LOOK.towerLabel!(t, state)).toEqual({ text: '3', color: 0xffffff });
    setLevel(state, t, 5);
    expect(ORIGINAL_LOOK.towerLabel!(t, state)?.color).not.toBe(0xffffff);
  });

  it('shapes each family, shows Tiers as pips and a Specialisation as a crest', () => {
    const tower = (id: string) => ORIGINAL_LOOK.tower(id, ORIGINAL_TOWERS[id]!);
    expect(tower('arrow_tower')).toMatchObject({ shape: 'triangle', pips: 1 });
    expect(tower('great_bombard')).toMatchObject({ shape: 'circle', pips: 3, splash: 112 });
    expect(tower('venom_spitter')).toMatchObject({ shape: 'drop', pips: 2 });
    expect(tower('drum_totem').shape).toBe('pillar');
    const deadeye = tower('deadeye_perch');
    expect(deadeye.crest).toBeDefined();
    expect(deadeye.pips).toBeUndefined();
    expect(tower('blizzard_spire').nova).toBe(true);
  });

  it('paints each Region in its own palette', () => {
    const state = newRun();
    expect(typeof ORIGINAL_LOOK.terrain === 'function' && ORIGINAL_LOOK.terrain(state)).toEqual(REGION_TERRAIN.ashfield);
  });

  it('accepts its own saves and refuses a damaged one', () => {
    const state = newRun({ cleared: 0 });
    buildOn(state, 0, 'arrow_tower');
    const saved = JSON.parse(snapshot(state)) as GameState;
    expect(validOriginalSave(saved)).toBe(true);
    expect(validOriginalSave({ ...saved, mode: { ...(saved.mode as object), stage: 99 } })).toBe(false);
    expect(validOriginalSave({ ...saved, mode: { ...(saved.mode as object), talents: ['nope'] } })).toBe(false);
    const towers = { ...(saved.mode as { towers: Record<string, object> }).towers };
    towers[Object.keys(towers)[0]!] = { ...towers[Object.keys(towers)[0]!], targeting: 'sideways' };
    expect(validOriginalSave({ ...saved, mode: { ...(saved.mode as object), towers } })).toBe(false);
  });

  it('accepts a Challenge\'s saves and refuses one naming a Challenge it can\'t play', () => {
    const saved = JSON.parse(snapshot(newRun({ challenge: 'cold-water', cleared: 2 }))) as GameState;
    const mode = saved.mode as Record<string, unknown>;
    expect(validOriginalSave(saved)).toBe(true);
    expect(validOriginalSave({ ...saved, mode: { ...mode, challenge: 'made-up' } })).toBe(false);
    expect(validOriginalSave({ ...saved, mode: { ...mode, challenge: 'short-rope' } })).toBe(false);
    expect(validOriginalSave({ ...saved, mode: { ...mode, challenge: 3 } })).toBe(false);
    expect(validOriginalSave({ ...saved, difficulty: 'hard' })).toBe(false);
  });

  it('says how the Run ended, in the Stage\'s words', () => {
    const state = newRun({ cleared: 0 });
    state.phase = 'lost';
    state.wave.number = 7;
    expect(ORIGINAL_UI.endText!(state)).toEqual({ won: false, summary: 'The road fell on Wave 7 of 12', wave: '7/12' });
    state.phase = 'won';
    state.lives = 19;
    expect(ORIGINAL_UI.endText!(state)).toMatchObject({ won: true, summary: 'The Mill Road held on Normal with 19 lives left' });
  });
});

describe('the Campaign', () => {
  it('opens Stages in order and counts Stars by each Stage\'s best', () => {
    expect(stagesCleared(EMPTY)).toBe(0);
    expect(stageOpen(EMPTY, 1)).toBe(true);
    const one = withResult(EMPTY, 1, won(2));
    expect(stagesCleared(one)).toBe(1);
    expect(starsEarned(one)).toBe(2);
    // Stage 2 opens once Stage 1 is won; Stage 3 waits for Stage 2.
    expect(stageOpen(EMPTY, 2)).toBe(false);
    expect(stageOpen(one, 2)).toBe(true);
    expect(stageOpen(one, 3)).toBe(false);
  });

  it('pays only what beats a Stage\'s best, and a loss changes nothing', () => {
    const one = withResult(EMPTY, 1, won(2, 500));
    const again = withResult(one, 1, won(3, 450));
    const out = describeOutcome(one, again, 1, won(3, 450), true);
    expect(out).toMatchObject({ gained: 1, total: 3, newBest: { stars: true, hardest: false, fastest: true } });
    expect(withResult(again, 1, { won: false, stars: 0, difficulty: 'insane', seconds: null })).toBe(again);
    expect(describeOutcome(again, withResult(again, 1, won(1, 900)), 1, won(1, 900), true).gained).toBe(0);
    // Folding the same Run in twice changes nothing more.
    expect(withResult(again, 1, won(3, 450))).toEqual(again);
  });

  it('names what a first win opens: Frost, Talents and the next Stage', () => {
    expect(opened(EMPTY, withResult(EMPTY, 1, won(3)))).toEqual([
      'Frost towers', 'Talents', 'Stage 2, Greyriver Crossing', 'Challenge: The Burnt Mill',
    ]);
    const two = { ...EMPTY, stages: { 1: { stars: 3, hardest: 'normal' as const, fastest: 1 } } };
    expect(opened(two, withResult(two, 2, won(1)))).toContain('Tier 3');
  });

  it('spends Stars on Talents and hands a Run only Talents that read right', () => {
    const c: CampaignProgress = { stages: { 1: { stars: 3, hardest: 'hard', fastest: 300 } }, challenges: {}, talents: ['fletching', 'quick-nock'] };
    expect(starsFree(c)).toBe(0);
    expect(runTalents(c)).toEqual(['fletching', 'quick-nock']);
    expect(runTalents({ ...c, talents: ['quick-nock'] })).toEqual([]);
  });
});

describe('Challenges in the Campaign', () => {
  const one: CampaignProgress = withResult(EMPTY, 1, won(2, 500));
  const challengeWin = (seconds: number) => ({ won: true, stars: 1, difficulty: 'normal' as const, seconds });
  const challengeLoss = { won: false, stars: 0, difficulty: 'normal' as const, seconds: null };

  it('opens a Stage\'s Challenge once the Stage is won', () => {
    expect(challengeOpen(EMPTY, 1)).toBe(false);
    expect(challengeOpen(one, 1)).toBe(true);
    expect(challengeOpen(one, 2)).toBe(false);
    expect(challengeWon(one, 1)).toBe(false);
    expect(challengeRecord(one, 1)).toBeNull();
  });

  it('pays a Challenge\'s Star once, into the Talent budget, and leaves the Stage\'s Record alone', () => {
    const a = withChallengeResult(one, 1, challengeWin(600));
    expect(a.stages).toBe(one.stages);
    expect(challengeRecord(a, 1)).toEqual({ fastest: 600 });
    expect([challengeWon(a, 1), challengesWon(a), challengeStarsEarned(a)]).toEqual([true, 1, 1]);
    expect(starsEarned(a)).toBe(3);
    expect(starsFree({ ...a, talents: ['fletching', 'quick-nock'] })).toBe(0);
    // Winning again, faster: no more Stars, a faster Record.
    const b = withChallengeResult(a, 1, challengeWin(450));
    expect(starsEarned(b)).toBe(3);
    expect(challengeRecord(b, 1)).toEqual({ fastest: 450 });
    expect(withChallengeResult(b, 1, challengeWin(800))).toEqual(b);
    // A loss changes nothing.
    expect(withChallengeResult(b, 1, challengeLoss)).toBe(b);
    expect(withChallengeResult(one, 1, challengeLoss)).toBe(one);
  });

  it('routes a finished Run by whether it was a Challenge', () => {
    const viaChallenge = withRun(one, { ...challengeWin(300), stage: 1, challenge: 'burnt-mill' });
    expect(viaChallenge.stages).toEqual(one.stages);
    expect(challengeWon(viaChallenge, 1)).toBe(true);
    const viaStage = withRun(one, { ...won(3, 300), stage: 1, challenge: null });
    expect(viaStage.challenges).toEqual({});
    expect(viaStage.stages['1']).toEqual({ stars: 3, hardest: 'normal', fastest: 300 });
  });

  it('describes a Challenge\'s end: its Star on the first win only, its fastest win, nothing opened', () => {
    const first = withChallengeResult(one, 1, challengeWin(600));
    expect(describeOutcome(one, first, 1, challengeWin(600), true, 'burnt-mill')).toEqual({
      stage: 1, challenge: 'burnt-mill', won: true, stars: 1, gained: 1, total: 3,
      record: null, challengeRecord: { fastest: 600 },
      newBest: { stars: true, hardest: false, fastest: true }, opened: [], saved: true,
    });
    const again = withChallengeResult(first, 1, challengeWin(700));
    expect(describeOutcome(first, again, 1, challengeWin(700), true, 'burnt-mill')).toMatchObject({
      gained: 0, total: 3, newBest: { stars: false, hardest: false, fastest: false },
    });
    expect(describeOutcome(one, one, 1, challengeLoss, true, 'burnt-mill')).toMatchObject({ won: false, gained: 0, challengeRecord: null });
  });

  it('counts 48 Stars in all, and gives each rule as short lines', () => {
    expect(MOST_STARS).toBe(48);
    expect(challengeLines(challengeOfStage(2)!)).toEqual(['Cannon and Frost only', '+30% creep HP']);
    // A rule that allows most families names the ones it leaves out.
    expect(challengeLines(challengeOfStage(10)!)).toEqual(['No Arrow towers', '+10% creep HP']);
    expect(challengeLines(challengeOfStage(5)!)).toEqual(['No Frost or Arcane towers', '15 lives']);
    expect(challengeLines(challengeOfStage(1)!)).toEqual(['4 Build Spots']);
    expect(challengeLines(challengeOfStage(3)!)).toEqual(['Tiers 1–2']);
    expect(challengeLines(challengeOfStage(6)!)).toEqual(['No Specialisations', '350 gold to start']);
    expect(challengeLines(challengeOfStage(7)!)).toEqual(['8 s Breaks']);
    expect(challengeLines(challengeOfStage(11)!)).toEqual(['18 s Breaks']);
    expect(challengeLines(challengeOfStage(8)!)).toEqual(['450 gold to start', 'Send now pays no gold']);
    expect(challengeLines(challengeOfStage(12)!)).toEqual(['13 lives']);
    expect(challengeLines(challengeOfStage(4)!)).toEqual(['+15% creep HP']);
    expect(challengeLines(challengeOfStage(9)!)).toEqual(['8 Build Spots']);
  });

  it('marks a Challenge locked, then open once its Stage is won, then won with its fastest win', () => {
    expect([challengeState(EMPTY, 1), challengeStatus(EMPTY, 1)]).toEqual(['locked', 'Win this Stage to open it']);
    expect([challengeState(one, 1), challengeStatus(one, 1)]).toEqual(['open', '1 Star · Normal']);
    expect(challengeState(one, 2)).toBe('locked');
    const a = withChallengeResult(one, 1, challengeWin(522));
    expect([challengeState(a, 1), challengeStatus(a, 1)]).toEqual(['won', 'Won · fastest 8:42']);
    // A repaired Record keeps the win without a time.
    expect(challengeStatus({ ...a, challenges: { 1: { fastest: null } } }, 1)).toBe('Won');
    expect(challengeState(one, 13)).toBeNull();
  });
});

describe('starting and ending a Challenge', () => {
  const fourStages: CampaignProgress = {
    stages: Object.fromEntries([1, 2, 3, 4].map((n) => [n, { stars: 2, hardest: 'normal' as const, fastest: 600 }])),
    challenges: {},
    talents: ['fletching'],
  };

  it('starts the Stage\'s Challenge with the Campaign\'s Talents and unlocks, and names it', () => {
    campaign.value = fourStages;
    expect(ORIGINAL_UI.runSettings!({ stage: '3', challenge: '1' })).toEqual({
      stage: 3, challenge: 'short-rope', talents: ['fletching'], cleared: 4,
    });
    // Without the flag it is the Stage's own Run, as before.
    expect(ORIGINAL_UI.runSettings!({ stage: '3' })).toEqual({ stage: 3, talents: ['fletching'], cleared: 4 });
    expect(originalOptionsText({ stage: '3', challenge: '1' })).toBe('Challenge: Short Rope · Gallows Hill');
    expect(originalOptionsText({ stage: '3' })).toBe('Gallows Hill');
  });

  it('keeps a Challenge Run a Challenge through Play again, Continue and save codes', () => {
    campaign.value = fourStages;
    const run = newRun({ challenge: 'gravelords-host', cleared: 4 });
    const choices = ORIGINAL_UI.optionsOf!(run);
    expect(choices).toEqual({ stage: '4', challenge: '1' });
    expect(ORIGINAL_UI.optionsText!(choices)).toBe('Challenge: The Gravelord\'s Host · Fort Harrow');
    // Play again and Continue start from these choices: the same Challenge, which the sim accepts on Normal.
    const again = original.originalOptions({ mode: 'original', seed: 2, difficulty: 'normal', options: ORIGINAL_UI.runSettings!(choices) });
    expect(again).toMatchObject({ stage: 4, challenge: 'gravelords-host', cleared: 4 });
    const loaded = JSON.parse(snapshot(run)) as GameState;
    expect(ORIGINAL_UI.optionsOf!(loaded)).toEqual({ stage: '4', challenge: '1' });
  });

  it('says how a Challenge ended: won with the lives left, or the Wave it fell on', () => {
    const state = newRun({ challenge: 'burnt-mill', cleared: 1 });
    state.phase = 'lost';
    state.wave.number = 7;
    expect(ORIGINAL_UI.endText!(state)).toEqual({ won: false, summary: 'The Challenge fell on Wave 7 of 12', wave: '7/12' });
    state.phase = 'won';
    state.lives = 1;
    expect(ORIGINAL_UI.endText!(state)).toEqual({ won: true, summary: 'Challenge won: The Burnt Mill, with 1 life left', wave: '12/12' });
  });
});

describe('save codes with Challenges', () => {
  const RULES: SaveRules = { playable: (id) => id === 'original', validState: validOriginalSave };

  it('carry a Challenge Run, which plays on as it would have', async () => {
    const s = newRun({ challenge: 'no-rest' });
    step(s, [{ type: 'original.sendNow' }]);
    for (let i = 0; i < 200; i++) step(s, []);
    const loaded = await readCode(await writeCode(s), RULES);
    expect((loaded.mode as original.OriginalState).challenge).toBe('no-rest');
    for (let i = 0; i < 400; i++) {
      step(s, []);
      step(loaded, []);
    }
    expect(original.originalStatus(loaded).break?.totalTicks).toBe(8 * 30);
    expect(hashState(loaded)).toBe(hashState(s));
  });

  it('load a code from before Challenges as the Stage\'s own Run', async () => {
    // A Stage's Run has no `challenge`, as no save written before Challenges did.
    const s = newRun({ stage: 7, cleared: 6 });
    step(s, [{ type: 'original.sendNow' }]);
    const loaded = await readCode(await writeCode(s), RULES);
    expect(Object.hasOwn(loaded.mode as object, 'challenge')).toBe(false);
    expect(original.originalStatus(loaded)).toMatchObject({ challenge: null, lives: 20 });
  });
});
