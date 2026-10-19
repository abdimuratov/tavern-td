import { afterEach, describe, expect, it } from 'vitest';
import { LW_SENDS, SEND_LIST, SUDDEN_DEATH_AT } from '../src/content/linewars';
import { createLookCache } from '../src/render/look';
import { CELL, getMode, linewars, snapshot, restore, TICK_RATE, type Command, type GameState, type SimEvent } from '../src/sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../src/ui/catalog';
import { recordVersus, versusResult } from '../src/app/versus-records';
import type { RunView, ViewerSide } from '../src/ui/mode-ui';
import { LINEWARS_UI, validLwSave } from '../src/ui/modes/linewars';
import { LW_LOOK, lwLook } from '../src/ui/modes/linewars/look';
import { building, lastSend } from '../src/ui/modes/linewars/picks';
import { trySend } from '../src/ui/modes/linewars/SendMenu';
import {
  leakedText, lwEndText, matchup, progressText, rivalLine, sendTags, sendWhy, sidesFrom, stolenText, suddenText,
} from '../src/ui/modes/linewars/text';
import type { PlaySession } from '../src/ui/state';
import { buildAt, col, newRun, run, runTo } from './sim/linewars/helpers';

interface FakeView extends RunView {
  readonly sent: Command[];
  readonly said: { text: string; tone: string | undefined }[];
}

function viewOf(state: GameState, side: ViewerSide = 0): FakeView {
  const sent: Command[] = [];
  const said: { text: string; tone: string | undefined }[] = [];
  return {
    state, side, sent, said,
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

describe('Line Wars as Side 1 sees it (a Versus Guest)', () => {
  // newRun: Side 0 Ironclad, Side 1 Rimeborn, both human. The viewer here is Side 1.
  const SILENT = { sound: null, haptic: null };

  it('builds in Side 1\'s Field with commands that name Side 1, and calls Side 0\'s Field the Rival\'s', () => {
    const state = newRun();
    const view = viewOf(state, 1);
    building.value = 'rime_wall';
    const ok = LINEWARS_UI.placement!(view, corner(col(1, 4), 10))!;
    expect(ok.command).toEqual({ type: 'lw.build', side: 1, spec: 'rime_wall', col: col(1, 4), row: 10 });
    expect(ok).toMatchObject({ error: null, label: 'Rime Wall · 10 gold' });
    expect(LINEWARS_UI.placement!(view, corner(col(0, 4), 10))!.error).toBe('that\'s the Rival\'s Field');
    // Side 0's Wall isn't in Side 1's build menu.
    building.value = 'bulwark';
    expect(LINEWARS_UI.placement!(view, corner(col(1, 4), 10))).toBeNull();
  });

  it('sends for Side 1, and says why a Send is dim from Side 1\'s own purse', () => {
    const state = newRun();
    const view = viewOf(state, 1);
    const s = { view } as unknown as PlaySession;
    runTo(state, 20 * TICK_RATE + 1);
    trySend(s, 'snowlings');
    expect(view.sent).toEqual([{ type: 'lw.send', side: 1, send: 'snowlings' }]);
    expect(lastSend.value).toEqual({ seed: state.seed, send: 'snowlings' });
    runTo(state, 41 * TICK_RATE);
    state.mode.sides[1].gold = 10;
    state.mode.sides[0].gold = 1000;
    trySend(s, 'brawler');
    expect(view.sent).toHaveLength(1);
    expect(view.said.at(-1)!.text).toBe('Brawler: needs 40 gold');
  });

  it('shows Side 1\'s gold, not the core\'s copy of Side 0\'s', () => {
    const state = newRun();
    state.mode.sides[1].gold = 77;
    expect(LINEWARS_UI.gold!(state, 1)).toBe(77);
    expect(LINEWARS_UI.gold!(state, 0)).toBe(state.gold);
    expect(LINEWARS_UI.gold!(state)).toBe(state.gold);
  });

  it('puts your Side first in the status, and drops the Rival\'s factor in Versus', () => {
    const state = newRun({ difficulty: 'hard' });
    state.mode.sides[1].lives = 12;
    const st = linewars.lwStatus(state);
    const [me, rival] = sidesFrom(st, 1);
    expect([me.side, me.race, me.lives]).toEqual([1, 'rimeborn', 12]);
    expect([rival.side, rival.race]).toEqual([0, 'ironclad']);
    expect(sidesFrom(st, 0).map((x) => x.side)).toEqual([0, 1]);
    // Side 0 seeing Hard's Rival: its factor shows, and Versus has none to show.
    const [, theirs] = sidesFrom(st, 0);
    expect(rivalLine(theirs, false)).toBe('Rimeborn · +10 ×1.1');
    expect(rivalLine(theirs, true)).toBe('Rimeborn · +10');
    expect(rivalLine(rival, true)).toBe('Ironclad · +10');
  });

  it('draws Side 1\'s route live and Side 0\'s faint, and reads the matchup from Side 1', () => {
    const state = newRun();
    expect(LINEWARS_UI.routes!(state, 1)).toEqual({ live: [24], faint: [8] });
    expect(LINEWARS_UI.routes!(state, 0)).toEqual({ live: [8], faint: [24] });
    expect(LINEWARS_UI.optionsOf!(state, 1)).toEqual({ race: 'rimeborn', rivalRace: 'ironclad' });
  });

  it('hangs "You" over Side 1\'s Field, west of the Divide in the world, so the mirror puts it on the right', () => {
    const state = newRun({ race: 'ironclad', rivalRace: 'rimeborn' });
    const terrain = createLookCache(getMode('linewars'), lwLook(1)).terrain(state);
    expect(terrain.banners!.map((b) => [b.title, b.text])).toEqual([['Rival', 'Ironclad'], ['You', 'Rimeborn']]);
    const [rival, you] = terrain.banners!;
    expect(you!.x).toBeLessThan(rival!.x);
    const zero = createLookCache(getMode('linewars'), lwLook(0)).terrain(state).banners!;
    expect(you!.x).toBe(zero[0]!.x);
    expect(rival!.x).toBe(zero[1]!.x);
    expect(lwLook(0)).toBe(LW_LOOK);
  });

  it('hears Side 1\'s own moves and keeps Side 0\'s quiet', () => {
    const state = newRun();
    const theirs = buildAt(state, 0, 'bulwark', col(0, 4), 10);
    const mine = buildAt(state, 1, 'rime_wall', col(1, 4), 10);
    const fb = (e: SimEvent) => LINEWARS_UI.feedback!(e, state, 1);
    expect(fb({ type: 'placed', tower: theirs.id, spec: theirs.spec, cell: theirs.cell })).toEqual(SILENT);
    expect(fb({ type: 'placed', tower: mine.id, spec: mine.spec, cell: mine.cell })).toBeUndefined();
    expect(fb({ type: 'fire', tower: theirs.id, target: 1, projectile: 0 })).toEqual(SILENT);
    expect(fb({ type: 'fire', tower: mine.id, target: 1, projectile: 0 })).toBeUndefined();
    expect(fb({ type: 'kill', creep: 1, tower: theirs.id, bounty: 0, x: 34 * CELL, y: 10 * CELL })).toEqual(SILENT);
    expect(fb({ type: 'kill', creep: 1, tower: mine.id, bounty: 0, x: 4 * CELL, y: 10 * CELL })).toBeUndefined();
    expect(fb({ type: 'rejected', command: { type: 'lw.send', side: 0, send: 'brawler' }, reason: 'x' })).toEqual(SILENT);
    expect(fb({ type: 'rejected', command: { type: 'lw.send', side: 1, send: 'brawler' }, reason: 'x' })).toBeUndefined();
    expect(fb(mode('lw.sent', { side: 1, send: 'brawler' }))?.haptic).toBe('tap');
    expect(fb(mode('lw.sent', { side: 0, send: 'harpies' }))?.sound).toBe('horn');
    expect(fb(mode('lw.leak', { from: 0, to: 1, lives: 1 }))?.sound).toBe('resource');
    expect(fb(mode('lw.leak', { from: 1, to: 0, lives: 1 }))?.sound).toBe('leak');
    expect(fb(mode('lw.juggle', { side: 0, turned: 2 }))).toEqual(SILENT);
  });

  it('calls out Side 1\'s steals, Leaks and juggles, and the Rival\'s flyers', () => {
    const state = newRun();
    const view = viewOf(state, 1);
    LINEWARS_UI.onEvents!(view, [mode('lw.leak', { from: 0, to: 1, lives: 2, send: 'warlord' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.leak', { from: 1, to: 0, lives: 1, send: 'brawler' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.sent', { side: 0, send: 'harpies' }), mode('lw.sent', { side: 1, send: 'troll' })]);
    LINEWARS_UI.onEvents!(view, [mode('lw.juggle', { side: 1, turned: 1 }), mode('lw.juggle', { side: 0, turned: 4 })]);
    expect(view.said.map((x) => x.text)).toEqual([
      '+2 ♥ stolen',
      '−1 ♥ Brawler got through',
      'The Rival sent Harpies: they fly over your maze',
      'Juggled: 1 creep turned back',
    ]);
    expect(lastSend.value).toEqual({ seed: state.seed, send: 'troll' });
  });

  it('hints from Side 1\'s towers, not Side 0\'s', () => {
    const state = newRun();
    buildAt(state, 0, 'bulwark', col(0, 4), 10);
    expect(LINEWARS_UI.hint!(viewOf(state, 0))).toBeNull();
    expect(LINEWARS_UI.hint!(viewOf(state, 1))?.text).toMatch(/^Pick a Wall/);
  });

  it('says Victory when Side 1 wins, though the core calls it lost, and records the Run from Side 1', () => {
    const won = newRun();
    won.mode.sides[1].stolen = 5;
    won.mode.sides[1].bounty = 40;
    linewars.endRun(won, 1, 'lives', []);
    expect(won.phase).toBe('lost');
    expect(LINEWARS_UI.endText!(won, 1)).toMatchObject({ won: true, title: 'Victory', summary: 'You took the Rival\'s last life on Normal', wave: '5' });
    expect(LINEWARS_UI.endText!(won, 0)).toMatchObject({ won: false, title: 'Defeat' });
    expect(lwEndText(won)).toEqual(LINEWARS_UI.endText!(won, 0));
    const r = LINEWARS_UI.result!(won, 1);
    expect(r).toMatchObject({ won: true, wave: 5, score: linewars.lwScore(won, 1) });
    expect(r.score).toBeGreaterThan(1000);
    expect(LINEWARS_UI.result!(won, 0)).toMatchObject({ won: false });
    // The end plays your win, not the core's loss.
    expect(LINEWARS_UI.feedback!({ type: 'lost' }, won, 1)?.sound).toBe('win');
    expect(LINEWARS_UI.feedback!({ type: 'lost' }, won, 0)?.sound).toBe('lose');

    const lost = newRun();
    linewars.endRun(lost, 0, 'drain', []);
    expect(LINEWARS_UI.endText!(lost, 1)).toMatchObject({ won: false, title: 'Defeat', summary: 'Sudden Death drained your last life first' });
    const draw = newRun();
    linewars.endRun(draw, null, 'draw', []);
    expect(LINEWARS_UI.endText!(draw, 1)).toMatchObject({ won: false, title: 'Draw' });
  });
});

describe('the Versus Records board', () => {
  it('shows as a Versus row kept on Normal only, beside the table by Difficulty', () => {
    expect(LINEWARS_UI.recordBoards).toEqual([{ id: 'versus', name: 'Versus', only: 'normal' }]);
    // Single-player Runs keep counting toward the boards by Difficulty.
    expect(LINEWARS_UI.recordBoard).toBeUndefined();
  });

  it('records a Run the sim ended as it stands, a draw as played, and a Desync as nothing', async () => {
    const won = newRun();
    won.mode.sides[1].stolen = 3;
    linewars.endRun(won, 1, 'lives', []);
    expect(versusResult(LINEWARS_UI, won, 1, 'run')).toEqual(LINEWARS_UI.result!(won, 1));
    expect(versusResult(LINEWARS_UI, won, 1, 'run')).toMatchObject({ won: true, wave: 3 });
    const draw = newRun();
    linewars.endRun(draw, null, 'draw', []);
    expect(versusResult(LINEWARS_UI, draw, 1, 'run')).toMatchObject({ won: false });
    expect(versusResult(LINEWARS_UI, won, 1, 'desync')).toBeNull();
    // Neither touches storage: 'run' was recorded by the Run's own end.
    await expect(recordVersus(LINEWARS_UI, won, 1, 'run')).resolves.toBeNull();
    await expect(recordVersus(LINEWARS_UI, won, 1, 'desync')).resolves.toBeNull();
  });

  it('counts a concede as a loss and the Rival\'s concede or a claim as a win, with the score so far and no fastest time', () => {
    const state = newRun();
    run(state, 30 * 60);
    state.mode.sides[1].stolen = 2;
    state.mode.sides[1].bounty = 55;
    const soFar = linewars.lwScore(state, 1);
    expect(soFar).toBe(255);
    expect(versusResult(LINEWARS_UI, state, 1, 'conceded')).toEqual({ wave: 2, score: soFar, won: false, seconds: 0 });
    expect(versusResult(LINEWARS_UI, state, 1, 'rival-conceded')).toEqual({ wave: 2, score: soFar, won: true, seconds: 0 });
    expect(versusResult(LINEWARS_UI, state, 1, 'claimed')).toEqual({ wave: 2, score: soFar, won: true, seconds: 0 });
  });
});
