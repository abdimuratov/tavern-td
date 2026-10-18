import { afterEach, describe, expect, it } from 'vitest';
import { LW_SENDS, SEND_LIST, SUDDEN_DEATH_AT } from '../src/content/linewars';
import { createLookCache } from '../src/render/look';
import { CELL, getMode, linewars, snapshot, restore, TICK_RATE, type Command, type GameState, type SimEvent } from '../src/sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../src/ui/catalog';
import type { RunView } from '../src/ui/mode-ui';
import { LINEWARS_UI, validLwSave } from '../src/ui/modes/linewars';
import { LW_LOOK } from '../src/ui/modes/linewars/look';
import { building, lastSend } from '../src/ui/modes/linewars/picks';
import { leakedText, matchup, progressText, sendTags, sendWhy, stolenText, suddenText } from '../src/ui/modes/linewars/text';
import { buildAt, col, newRun, run, runTo } from './sim/linewars/helpers';

interface FakeView extends RunView {
  readonly sent: Command[];
  readonly said: { text: string; tone: string | undefined }[];
}

function viewOf(state: GameState): FakeView {
  const sent: Command[] = [];
  const said: { text: string; tone: string | undefined }[] = [];
  return {
    state, sent, said,
    send: (c) => void sent.push(c),
    refresh: () => {},
    select: () => {},
    say: (text, tone) => void said.push({ text, tone }),
  };
}

/** The world point a 2×2 footprint with top-left (col, row) centres on. */
const corner = (c: number, row: number) => ({ x: (c + 1) * CELL, y: (row + 1) * CELL });

const mode = (name: string, data: unknown): SimEvent => ({ type: 'mode', name, data: data as never });

afterEach(() => {
  building.value = null;
  lastSend.value = null;
});

describe('Line Wars on the main menu', () => {
  it('names each Difficulty by the Rival\'s income factor and how it plays', () => {
    expect(difficultyAbout('linewars', 'easy')).toMatch(/^Rival's income ×0\.85 · /);
    expect(difficultyAbout('linewars', 'normal')).toMatch(/^Rival's income ×1 · .*10:00/);
    expect(difficultyAbout('linewars', 'hard')).toMatch(/^Rival's income ×1\.1 · /);
    expect(difficultyAbout('linewars', 'insane')).toMatch(/^Rival's income ×1\.5 · /);
    for (const d of ['easy', 'normal', 'hard', 'insane'] as const) expect(difficultyAbout('linewars', d)).not.toMatch(/\bAI\b/);
  });

  it('asks for your Race, then the Rival\'s with Random first, and reads the matchup back', () => {
    const [race, rival] = LINEWARS_UI.runOptions!;
    expect(race!.choices.map((c) => c.id)).toEqual(['ironclad', 'rimeborn', 'mirefolk', 'runecasters']);
    expect(rival!.choices.map((c) => c.id)).toEqual(['random', 'ironclad', 'rimeborn', 'mirefolk', 'runecasters']);
    expect(rival!.default).toBe('random');
    expect(matchup({ race: 'rimeborn', rivalRace: 'ironclad' })).toBe('Rimeborn vs Ironclad');
    expect(matchup({ race: 'rimeborn', rivalRace: 'random' })).toBe('Rimeborn vs Random');
    const state = newRun({ race: 'mirefolk', rivalRace: 'runecasters' });
    expect(LINEWARS_UI.optionsOf!(state)).toEqual({ race: 'mirefolk', rivalRace: 'runecasters' });
    expect(LINEWARS_UI.optionsText!(LINEWARS_UI.optionsOf!(state))).toBe('Mirefolk vs Runecasters');
  });

  it('shows a saved Run by its time, and its Records\' Wave column as the best steal', () => {
    const state = newRun();
    run(state, 30 * 250);
    expect(progressText(state)).toBe('4:10 in');
    expect(LINEWARS_UI.recordWave!.heading).toBe('Best steal');
    expect(LINEWARS_UI.recordWave!.best(1)).toBe('Best steal: 1 life');
    expect(LINEWARS_UI.recordWave!.best(12)).toBe('Best steal: 12 lives');
  });
});

describe('the Line Wars Ghost', () => {
  it('builds in your Field only, says why on the Rival\'s, and refuses a Block with its reason', () => {
    const state = newRun();
    const view = viewOf(state);
    expect(LINEWARS_UI.placement!(view, corner(col(0, 4), 10))).toBeNull();
    building.value = 'bulwark';
    const ok = LINEWARS_UI.placement!(view, corner(col(0, 4), 10))!;
    expect(ok.command).toEqual({ type: 'lw.build', side: 0, spec: 'bulwark', col: col(0, 4), row: 10 });
    expect(ok).toMatchObject({ error: null, label: 'Bulwark · 10 gold', checked: true, tapSlop: 26 });
    expect(ok.cells).toHaveLength(4);
    expect(LINEWARS_UI.placement!(view, corner(col(1, 4), 10))!.error).toBe('that\'s the Rival\'s Field');
    // Wall off row 10 of your Field but for its last gap, then close it.
    for (let c = 0; c < 14; c += 2) buildAt(state, 0, 'bulwark', col(0, c), 10);
    expect(LINEWARS_UI.placement!(view, corner(col(0, 14), 10))!.error).toBe('that would block the path');
  });

  it('draws your route live and the Rival\'s faint, one each from the middle of its spawn strip', () => {
    const routes = LINEWARS_UI.routes!(newRun());
    expect(routes).toEqual({ live: [8], faint: [24] });
  });

  it('keeps the shared HUD\'s Wave, lives and start button out of the way', () => {
    const view = viewOf(newRun());
    expect(LINEWARS_UI.showLives).toBe(false);
    expect(LINEWARS_UI.showStartWave).toBe(false);
    expect(LINEWARS_UI.waveLabel!(view)).toBeNull();
    expect(LINEWARS_UI.wavePreview!(view, 0)).toBeNull();
  });
});

describe('the send menu', () => {
  it('binds Z X C V B and A D F G H, cheapest first, never S', () => {
    expect(SEND_LIST.map((s) => s.key).join('')).toBe('ZXCVBADFGH');
    expect(SEND_LIST.map((s) => s.key)).not.toContain('S');
  });

  it('says why a dim Send can\'t be bought: locked, out of Stock, gold, the cap', () => {
    const state = newRun();
    const me = () => linewars.lwStatus(state).sides[0];
    const opt = (id: string) => linewars.sendOptions(state, 0).find((o) => o.send === id)!;
    const why = (id: string) => sendWhy(opt(id), me().gold, me().live, me().cap);
    expect(why('snowlings')).toBe('unlocks in 0:20');
    expect(why('mammoth')).toBe('unlocks in 10:00');
    runTo(state, 20 * TICK_RATE + 1);
    expect(why('snowlings')).toBeNull();
    run(state, 1, [{ type: 'lw.send', side: 0, send: 'snowlings' }]);
    expect(why('snowlings')).toBe('out of Stock: 1 more in 5 s');
    state.mode.sides[0].gold = 10;
    runTo(state, 41 * TICK_RATE);
    expect(why('brawler')).toBe('needs 40 gold');
    state.mode.sides[0].gold = 1000;
    state.mode.sides[0].live = 40;
    expect(why('brawler')).toBe('40 of yours are out already');
  });

  it('tags each Send as the board would: Air, Boss, or its kind', () => {
    expect(sendTags('harpies')).toEqual(['Air']);
    expect(sendTags('warlord')).toEqual(['Boss']);
    expect(sendTags('mammoth')).toEqual(['Boss']);
    expect(sendTags('sleet_hound')).toEqual(['Fast']);
    expect(sendTags('brute')).toEqual(['Armored']);
    expect(sendTags('troll')).toEqual(['Regen']);
    expect(sendTags('hollow')).toEqual(['Unslowable']);
  });
});

describe('Line Wars feedback', () => {
  it('silences the Rival\'s builds, upgrades, shots and kills, and plays a horn for its flyers and bosses', () => {
    const state = newRun();
    const theirs = buildAt(state, 1, 'rime_wall', col(1, 4), 10);
    const mine = buildAt(state, 0, 'bulwark', col(0, 4), 10);
    const fb = LINEWARS_UI.feedback!;
    const silent = { sound: null, haptic: null };
    expect(fb({ type: 'placed', tower: theirs.id, spec: theirs.spec, cell: theirs.cell }, state)).toEqual(silent);
    expect(fb({ type: 'placed', tower: mine.id, spec: mine.spec, cell: mine.cell }, state)).toBeUndefined();
    expect(fb({ type: 'fire', tower: theirs.id, target: 1, projectile: 0 }, state)).toEqual(silent);
    expect(fb({ type: 'changed', tower: theirs.id, spec: 'frost_spire', from: 'rime_wall' }, state)).toEqual(silent);
    expect(fb({ type: 'kill', creep: 1, tower: theirs.id, bounty: 0, x: 4 * CELL, y: 10 * CELL }, state)).toEqual(silent);
    expect(fb({ type: 'kill', creep: 1, tower: mine.id, bounty: 0, x: 34 * CELL, y: 10 * CELL }, state)).toBeUndefined();
    expect(fb(mode('lw.sent', { side: 1, send: 'harpies' }), state)?.sound).toBe('horn');
    expect(fb(mode('lw.sent', { side: 1, send: 'warlord' }), state)?.sound).toBe('horn');
    expect(fb(mode('lw.sent', { side: 1, send: 'brawler' }), state)?.sound).toBe('arrive');
    // Your own Send ticks a haptic (Android only).
    expect(fb(mode('lw.sent', { side: 0, send: 'brawler' }), state)?.haptic).toBe('tap');
    expect(fb(mode('lw.leak', { from: 0, to: 1, lives: 1 }), state)?.sound).toBe('leak');
    expect(fb(mode('lw.leak', { from: 1, to: 0, lives: 1 }), state)?.sound).toBe('resource');
  });

  it('calls out steals, Leaks, the Rival\'s flyers and bosses, juggles, Sudden Death, and air 30 s ahead', () => {
    const state = newRun();
    const view = viewOf(state);
    LINEWARS_UI.onEvents!(view, [mode('lw.leak', { from: 1, to: 0, lives: 1, send: 'brawler' }), mode('lw.leak', { from: 1, to: 0, lives: 1, send: 'brawler' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.leak', { from: 0, to: 1, lives: 2, send: 'warlord' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.sent', { side: 1, send: 'harpies' }), mode('lw.sent', { side: 1, send: 'brawler' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.sent', { side: 1, send: 'mammoth' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.juggle', { side: 0, turned: 3 })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.sudden', { tick: 0 })]);
    expect(view.said.map((x) => x.text)).toEqual([
      '+2 ♥ stolen',
      '−2 ♥ Tusked Warlord got through',
      'The Rival sent Harpies: they fly over your maze',
      'The Rival sent a War Mammoth',
      'Juggled: 3 creeps turned back',
      'Sudden Death: Income is frozen, and every Income tick takes a life from both Sides',
    ]);
    expect(stolenText(1)).toBe('+1 ♥ stolen');
    expect(leakedText(3, ['Snowling', 'Snowling', 'Snowling'])).toBe('−3 ♥ 3 creeps got through');

    const air = viewOf(state);
    runTo(state, (LW_SENDS.harpies.unlock - 30) * TICK_RATE + 1);
    LINEWARS_UI.onEvents!(air, []);
    expect(air.said.map((x) => x.text)).toEqual(['Air in 0:30: Harpies fly straight over the maze']);
  });

  it('remembers your last Send for Space, for this Run only', () => {
    const state = newRun();
    LINEWARS_UI.onEvents!(viewOf(state), [mode('lw.sent', { side: 0, send: 'troll' })]);
    expect(lastSend.value).toEqual({ seed: state.seed, send: 'troll' });
  });

  it('throws a token across the Divide for every Send, from the sender\'s side', () => {
    const state = newRun();
    const looks = createLookCache(getMode('linewars'), LW_LOOK);
    const [mine] = looks.effects(mode('lw.sent', { side: 0, send: 'harpies' }) as Extract<SimEvent, { type: 'mode' }>, state)!;
    const [theirs] = looks.effects(mode('lw.sent', { side: 1, send: 'harpies' }) as Extract<SimEvent, { type: 'mode' }>, state)!;
    expect(mine).toMatchObject({ kind: 'arc', shape: 'chevron' });
    expect(mine!.x).toBeGreaterThan(mine!.x2!);
    expect(theirs!.x).toBeLessThan(theirs!.x2!);
    // Both ends lie in the Divide's edges, over neither Field's towers.
    for (const x of [mine!.x, mine!.x2!]) expect(x / CELL).toBeGreaterThan(15.5);
    for (const x of [mine!.x, mine!.x2!]) expect(x / CELL).toBeLessThan(28);
  });

  it('hangs each Side\'s Race on a banner over the Divide', () => {
    const state = newRun({ race: 'ironclad', rivalRace: 'rimeborn' });
    const terrain = createLookCache(getMode('linewars'), LW_LOOK).terrain(state);
    expect(terrain.banners!.map((b) => [b.title, b.text])).toEqual([['Rival', 'Rimeborn'], ['You', 'Ironclad']]);
    for (const b of terrain.banners!) {
      expect(b.x - b.width / 2).toBeGreaterThan(16 * CELL);
      expect(b.x + b.width / 2).toBeLessThan(28 * CELL);
    }
    expect(terrain).toMatchObject({ spawns: 'strip', splitRegions: true });
  });
});

describe('the end of a Line Wars Run', () => {
  it('says Victory, Defeat or Draw with why, and records a draw as played, not won', () => {
    const won = newRun({ lives: 1 });
    won.mode.sides[1].lives = 1;
    linewars.endRun(won, 0, 'lives', []);
    expect(LINEWARS_UI.endText!(won)).toMatchObject({ won: true, title: 'Victory', summary: 'You took the Rival\'s last life on Normal' });
    const lost = newRun();
    linewars.endRun(lost, 1, 'drain', []);
    expect(LINEWARS_UI.endText!(lost)).toMatchObject({ won: false, title: 'Defeat', summary: 'Sudden Death drained your last life first' });
    const draw = newRun();
    draw.mode.sides[0].stolen = 4;
    linewars.endRun(draw, null, 'draw', []);
    expect(draw.phase).toBe('lost');
    expect(LINEWARS_UI.endText!(draw)).toMatchObject({ won: false, title: 'Draw', wave: '4' });
    expect(LINEWARS_UI.result!(draw)).toMatchObject({ won: false, wave: 4 });
  });

  it('reads the Sudden Death clock, then turns it red', () => {
    const state = newRun();
    expect(suddenText(linewars.lwStatus(state))).toBe('Sudden Death in 15:00');
    state.tick = SUDDEN_DEATH_AT * TICK_RATE;
    expect(suddenText(linewars.lwStatus(state))).toBe('Sudden Death · −1 ♥ each tick');
  });
});

describe('Line Wars saves', () => {
  it('accepts its own state and refuses a damaged one', () => {
    const state = newRun();
    run(state, 400);
    expect(validLwSave(restore(snapshot(state)))).toBe(true);
    const broken = restore(snapshot(state));
    (broken.mode as { sides: unknown[] }).sides = [{}];
    expect(validLwSave(broken)).toBe(false);
    expect(DIFFICULTY_NAME.normal).toBe('Normal');
  });
});
