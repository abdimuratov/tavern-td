import { afterEach, describe, expect, it } from 'vitest';
import { ORIGINAL_TOWERS } from '../src/content/original';
import type { CampaignProgress } from '../src/platform/storage';
import { snapshot, type Command, type GameState, type Point } from '../src/sim';
import type { RunView } from '../src/ui/mode-ui';
import { ORIGINAL_UI, validOriginalSave } from '../src/ui/modes/original';
import {
  campaign, describeOutcome, opened, runTalents, stageOpen, stagesCleared, starsEarned, starsFree, withResult,
} from '../src/ui/modes/original/campaign';
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
const EMPTY: CampaignProgress = { stages: {}, talents: [] };

afterEach(() => {
  ring.value = null;
  campaign.value = { stages: {}, talents: [] };
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
    campaign.value = { stages: { 1: { stars: 3, hardest: 'normal', fastest: 300 } }, talents: ['fletching'] };
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
    expect(opened(EMPTY, withResult(EMPTY, 1, won(3)))).toEqual(['Frost towers', 'Talents', 'Stage 2, Greyriver Crossing']);
    const two = { ...EMPTY, stages: { 1: { stars: 3, hardest: 'normal' as const, fastest: 1 } } };
    expect(opened(two, withResult(two, 2, won(1)))).toContain('Tier 3');
  });

  it('spends Stars on Talents and hands a Run only Talents that read right', () => {
    const c: CampaignProgress = { stages: { 1: { stars: 3, hardest: 'hard', fastest: 300 } }, talents: ['fletching', 'quick-nock'] };
    expect(starsFree(c)).toBe(0);
    expect(runTalents(c)).toEqual(['fletching', 'quick-nock']);
    expect(runTalents({ ...c, talents: ['quick-nock'] })).toEqual([]);
  });
});
