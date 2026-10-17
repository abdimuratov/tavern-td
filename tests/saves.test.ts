import { describe, expect, it } from 'vitest';
import { checkRun, readCode, SAVE_VERSION, SaveProblem, writeCode, type SaveRules } from '../src/app/saves';
import { encodeSave } from '../src/platform/savecode';
import { hashState, snapshot, type GameState } from '../src/sim';
import { ELEMENT_UI } from '../src/ui/modes/element';
import { GEM_UI } from '../src/ui/modes/gem';
import { buildAt, newElementRun, run, send as sendElement } from './sim/element/helpers';
import { finishWave, newGemRun, OPEN_SPOTS, send } from './sim/gem/helpers';

const RULES: SaveRules = { playable: (id) => id === 'gem', validState: (s) => GEM_UI.validSave!(s) };

/** A Gem Run a Wave in, as a save holds it: plain JSON. */
function savedRun(): GameState {
  const state = newGemRun(3);
  for (const [col, row] of OPEN_SPOTS.slice(0, 5)) send(state, { type: 'gem.placeDraft', col, row });
  send(state, { type: 'gem.keep', tower: state.towers[0]!.id });
  finishWave(state);
  return JSON.parse(snapshot(state)) as GameState;
}

function problem(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SaveProblem);
    return (err as Error).message;
  }
  throw new Error('expected a SaveProblem');
}

describe('saved Runs', () => {
  it('accept a Gem Run and hand back the same state', () => {
    const data = savedRun();
    expect(hashState(checkRun(data, RULES))).toBe(hashState(data));
  });

  it('refuse a Game Mode this build lacks or does not let you play', () => {
    expect(problem(() => checkRun({ ...savedRun(), modeId: 'element' }, RULES))).toMatch(/Game Mode/);
    expect(problem(() => checkRun(savedRun(), { playable: () => false }))).toMatch(/Game Mode/);
  });

  it('refuse towers and creeps this build does not know', () => {
    const towers = savedRun();
    towers.towers[0]!.spec = 'obsidian-perfect';
    expect(problem(() => checkRun(towers, RULES))).toMatch(/towers or creeps/);
    const creeps = savedRun();
    creeps.creeps.push({ ...creeps.towers[0]!, spec: 'dragon', wave: 1, hp: 1, maxHp: 1, speed: 1, bounty: 1, air: false, seg: 0 } as never);
    expect(problem(() => checkRun(creeps, RULES))).toMatch(/towers or creeps/);
  });

  it('refuse a finished Run, another snapshot version and a damaged mode state', () => {
    expect(problem(() => checkRun({ ...savedRun(), phase: 'lost' }, RULES))).toMatch(/already over/);
    expect(problem(() => checkRun({ ...savedRun(), v: 99 }, RULES))).toMatch(/another version/);
    expect(problem(() => checkRun({ ...savedRun(), mode: { draft: 'nope' } }, RULES))).toMatch(/damaged/);
    expect(problem(() => checkRun(null, RULES))).toMatch(/another version/);
  });
});

describe('save codes for Runs', () => {
  it('round-trip a Run exactly', async () => {
    const state = savedRun();
    const back = await readCode(await writeCode(state), RULES);
    expect(hashState(back)).toBe(hashState(state));
  });

  it('say why a code can not be loaded', async () => {
    const why = (code: string): Promise<string> => readCode(code, RULES).then(() => 'loaded', (err: Error) => err.message);
    expect(await why('hello')).toMatch(/isn't a Tavern TD save code/);
    expect(await why('TTD1.00000000.AAAA')).toMatch(/damaged/);
    expect(await why(await encodeSave({ v: SAVE_VERSION + 1, state: savedRun() }))).toMatch(/newer version/);
    expect(await why(await encodeSave({ v: 1, state: savedRun() }))).toMatch(/older version/);
    expect(await why(await encodeSave([1, 2, 3]))).toMatch(/isn't a Tavern TD save code/);
    expect(await why(await encodeSave({ v: SAVE_VERSION, state: { ...savedRun(), modeId: 'nope' } }))).toMatch(/Game Mode/);
  });
});

const BOTH: SaveRules = {
  playable: (id) => id === 'gem' || id === 'element',
  validState: (s) => (s.modeId === 'element' ? ELEMENT_UI : GEM_UI).validSave!(s),
};

/** An Element Run mid-Wave, with towers building and firing, creeps on the Lane and projectiles in flight. */
function elementMidWave(): GameState {
  const state = newElementRun({ length: 'express', picks: 'allPick', seed: 5 });
  sendElement(state, { type: 'element.summon', element: 'water' });
  buildAt(state, 'basic_arrow_tower', 17, 18);
  buildAt(state, 'water_tower', 17, 22);
  sendElement(state, { type: 'element.sendNow' });
  run(state, 420);
  expect(state.creeps.length).toBeGreaterThan(0);
  return JSON.parse(snapshot(state)) as GameState;
}

describe('Element saves', () => {
  it('accept an Element Run and hand back the same state', () => {
    const data = elementMidWave();
    expect(hashState(checkRun(data, BOTH))).toBe(hashState(data));
  });

  it('round-trip through a save code exactly', async () => {
    const state = elementMidWave();
    const back = await readCode(await writeCode(state), BOTH);
    expect(hashState(back)).toBe(hashState(state));
    expect(ELEMENT_UI.optionsOf!(back)).toEqual({ picks: 'allPick', length: 'express' });
  });

  it('refuse unknown towers and a damaged Element state', () => {
    const towers = elementMidWave();
    towers.towers[0]!.spec = 'meteor_tower';
    expect(problem(() => checkRun(towers, BOTH))).toMatch(/towers or creeps/);
    const mode = elementMidWave();
    (mode.mode as { levels: Record<string, number> }).levels['water'] = 9;
    expect(problem(() => checkRun(mode, BOTH))).toMatch(/damaged/);
  });
});
