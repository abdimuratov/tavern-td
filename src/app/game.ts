import { play } from '../platform/audio';
import { onBackground } from '../platform/lifecycle';
import { haptic } from '../platform/native';
import { clearRun, recordResult, saveRun, type RecordUpdate } from '../platform/storage';
import { createBoard } from '../render/board';
import { cellsBox, towerCells } from '../render/footprint';
import type { BoardMark } from '../render/marks';
import { CELL, findTower, TICK_RATE, type Command, type GameState, type RunOptions, type SimEvent } from '../sim';
import { createHotkeys, keyName } from '../ui/hotkeys';
import type { ModeUi, RunView, ViewerSide } from '../ui/mode-ui';
import { defaultEndText } from '../ui/RunEnd';
import {
  gold, hint, lives, paused, phase, revision, runClock, runEnd, runMenu, session, speed, waveNumber, waveTotal,
  type RunEnd, type Speed,
} from '../ui/state';
import { createRunController, type AutosaveReason, type RunController, type TickSource } from './controller';
import { createFeedback } from './feedback';
import { createInput, type Input } from './input';
import { SAVE_VERSION, writeCode } from './saves';
import { recordVersus, VERSUS_BOARD, type VersusOutcome } from './versus-records';

/** One Game Mode's Runs, ready to play: what the main menu hands to startPlay. */
export interface PlayTarget {
  readonly ui: ModeUi;
  runOptions(): RunOptions;
  /** Commands sent as each Run starts, such as a prebuilt maze. */
  opening?(): readonly Command[];
}

export interface PlayOptions {
  /** A saved Run to resume instead of a fresh one. */
  readonly initial?: GameState;
  /** Start paused, as a resumed Run does. */
  readonly paused?: boolean;
  readonly speed?: Speed;
  readonly showGrid?: boolean;
  /**
   * The Side this device shows as you (Line Wars): 0 by default, 1 for a
   * Versus Guest. The UI's commands name it, the HUD reads it, and 1 mirrors
   * the board so its Field is on the right.
   */
  readonly viewer?: ViewerSide;
  /**
   * A Versus Run (docs/versus-design.md §6, §7): no autosave and no save code,
   * 1× only (no speed buttons or 1–3 keys), the Rival's line without its
   * factor, and its Record on the Versus board. The app going to the background
   * is the session's to handle (lifecycle's onBackground and onForeground).
   */
  readonly versus?: boolean;
  /** False keeps a finished Run out of Records, as the mirror rehearsal does (window.tavernMirror). */
  readonly record?: boolean;
  /** Where the Run's ticks get their commands: Versus passes the lockstep (RunControllerOptions.ticks). */
  readonly ticks?: TickSource;
  /** Replaces what the pause button and P do: Versus asks the lockstep, so both devices stop on one tick. */
  onPause?(): void;
  /** Called by Quit to menu once the Run is saved. */
  onQuit?(): void;
  fps?(fps: number): void;
}

export interface Play {
  readonly controller: RunController;
  /** Client (CSS pixel) position of a world point, for tests and debugging. */
  worldToClient(x: number, y: number): { x: number; y: number };
  /** Resolves once the latest autosave (or clearing it), and the mode's record of a finished Run, have been written. */
  flush(): Promise<unknown>;
  /**
   * Versus: records a Run the session ended rather than the sim, on the Versus
   * board from the Viewer Side (design §6). 'conceded' is a loss, and
   * 'rival-conceded' and 'claimed' are wins, each with the score so far and no
   * fastest time; 'desync' records nothing, and 'run' is what the Run's own end
   * already recorded, so it records nothing again. Resolves to the Record's
   * update, or null when nothing was recorded.
   */
  recordVersus(outcome: VersusOutcome): Promise<RecordUpdate | null>;
  setShowGrid(show: boolean): void;
  stop(): void;
}

/** Events after which the mode's buttons or the selected panel may read differently. */
const HUD_EVENTS = new Set<SimEvent['type']>([
  'placed', 'removed', 'changed', 'waveStart', 'waveEnd', 'won', 'lost', 'goldChanged', 'livesChanged', 'mode', 'kill',
]);
/** Events after which the mode's marks on structures may have moved or changed. */
const MARK_EVENTS = new Set<SimEvent['type']>(['placed', 'removed', 'changed', 'waveStart', 'waveEnd', 'mode']);

/**
 * Wires a Run controller to the board, input, HUD, sound and haptics, and
 * starts the loop. Order within a tick: the board catches up first (effects
 * need the creeps it is about to drop), then sound, then input and the HUD.
 */
export async function startPlay(target: PlayTarget, boardHost: HTMLElement, opts: PlayOptions = {}): Promise<Play> {
  const { ui } = target;
  const side: ViewerSide = opts.viewer ?? 0;
  const versus = opts.versus === true;
  const hotkeys = createHotkeys();
  // The page knows which Game Mode is up, so its stylesheet can size the HUD for it (Line Wars' is wider).
  document.documentElement.dataset['mode'] = ui.modeId;
  let input: Input | null = null;
  const board = await createBoard(boardHost, {
    onTap: (p, kind) => input?.tap(p, kind),
    onHover: (p) => input?.hover(p),
    onSecondary: () => input?.secondary(),
    // A Versus Guest's board is mirrored, so its Field is on the right beside the HUD.
    mirror: side === 1,
  });
  const look = typeof ui.look === 'function' ? ui.look(side) : ui.look;
  board.setShowGrid(opts.showGrid ?? true);

  let lastWrite: Promise<unknown> = Promise.resolve();
  /** The mode folding the last finished Run into its own progress, such as the Original's Campaign. */
  let finishing: Promise<unknown> = Promise.resolve();
  const controller = createRunController({
    runOptions: target.runOptions,
    ...(opts.initial ? { initial: opts.initial } : {}),
    paused: opts.paused ?? false,
    ...(opts.ticks ? { ticks: opts.ticks } : {}),
    // A Versus Run can't go on alone, so it is never saved (design §6).
    ...(versus ? {} : {
      autosave: (s: GameState) => (lastWrite = saveRun(s.modeId, s, SAVE_VERSION)),
      clearSave: (s: GameState) => (lastWrite = clearRun(s.modeId)),
    }),
  });
  controller.setSpeed(versus ? 1 : opts.speed ?? 1);
  const view: RunView = {
    get state() {
      return controller.state;
    },
    side,
    send: (command) => controller.send(command),
    refresh: () => input?.refresh(),
    select: (id) => input?.select(id),
    say: (text, tone = 'info', ms) => input?.flash(text, tone, ms),
    showGhost: (p, kind) => input?.pin(p, kind),
    toScreen: (p) => board.worldToClient(p),
  };
  const feedback = createFeedback({ play, haptic }, () => board.looks, () => ui, side);
  input = createInput({ controller, board, ui, view, feedback });
  const inp = input;

  let dirty = false;
  const syncHud = (s: GameState): void => {
    gold.value = ui.gold ? ui.gold(s, side) : s.gold;
    lives.value = s.lives;
    waveNumber.value = s.wave.number;
    waveTotal.value = s.wave.total;
    phase.value = s.phase;
    runClock.value = Math.floor((s.tick * 4) / TICK_RATE);
    paused.value = controller.paused;
    speed.value = controller.speed;
    if (dirty) {
      dirty = false;
      revision.value++;
    }
  };

  const updateMarks = (s: GameState): void => {
    const marks: BoardMark[] = [];
    for (const m of ui.marks?.(s) ?? []) {
      const t = findTower(s, m.tower);
      if (!t) continue;
      const box = cellsBox(s.map, towerCells(t));
      marks.push({ x: t.x, y: t.y, span: Math.min(box.w, box.h) * CELL, color: m.color, style: m.style, ...(m.pulse ? { pulse: true } : {}) });
    }
    board.setMarks(marks);
  };

  /**
   * Records the finished Run and shows the end screen, both from the Viewer
   * Side; the Record's "new best" arrives once it is merged.
   */
  const ended = (s: GameState): void => {
    const result = opts.record === false ? null : ui.result?.(s, side) ?? null;
    const text = ui.endText?.(s, side) ?? defaultEndText(s);
    const choices = ui.optionsOf?.(s, side) ?? {};
    const end: RunEnd = {
      won: text.won,
      ...(text.title ? { title: text.title } : {}),
      summary: text.summary,
      wave: text.wave,
      score: result ? result.score : null,
      seconds: text.won ? result?.seconds ?? s.tick / TICK_RATE : null,
      difficulty: s.difficulty,
      options: ui.optionsText?.(choices) ?? '',
      update: null,
    };
    runEnd.value = end;
    if (ui.finish) finishing = ui.finish(s).catch((err: unknown) => console.error('[play] could not record the Run', err));
    if (!result) return;
    const recordBoard = versus ? VERSUS_BOARD : ui.recordBoard?.(choices);
    void recordResult(s.modeId, s.difficulty, result, recordBoard).then((update) => {
      if (runEnd.value === end) runEnd.value = { ...end, update };
    });
  };

  const offRun = controller.onRun((s) => {
    board.setRun(s, look);
    inp.reset();
    ui.cancel?.(view);
    runEnd.value = null;
    dirty = true;
    syncHud(s);
    updateMarks(s);
    for (const c of target.opening?.() ?? []) controller.send(c);
  });
  const offStep = controller.onStep((s, events) => {
    board.afterStep(s, events);
    feedback.events(s, events);
    inp.afterStep(s, events);
    ui.onEvents?.(view, events);
    let marks = ui.marksEvery !== undefined && s.tick % ui.marksEvery === 0;
    for (const e of events) {
      if (!dirty && HUD_EVENTS.has(e.type)) dirty = true;
      if (MARK_EVENTS.has(e.type)) marks = true;
      if (e.type === 'won' || e.type === 'lost') ended(s);
    }
    if (marks) updateMarks(s);
  });
  let frames = 0;
  let fpsFrom = performance.now();
  const offFrame = controller.onFrame((alpha, dt) => {
    inp.frame();
    board.render(alpha, dt);
    syncHud(controller.state);
    if (opts.fps) {
      frames++;
      const now = performance.now();
      if (now - fpsFrom >= 500) {
        opts.fps((frames * 1000) / (now - fpsFrom));
        frames = 0;
        fpsFrom = now;
      }
    }
  });

  const setSpeed = (s: Speed): void => {
    controller.setSpeed(s);
    speed.value = s;
  };
  const setPaused = (p: boolean): void => {
    controller.setPaused(p);
    paused.value = p;
  };
  const togglePause = opts.onPause ?? ((): void => setPaused(!controller.paused));
  const startWave = (): void => controller.send({ type: 'startWave' });
  const openMenu = (): void => {
    setPaused(true);
    hint.value = null;
    runMenu.value = 'main';
  };
  const closeMenu = (): void => {
    runMenu.value = null;
    setPaused(false);
  };
  const save = (reason: AutosaveReason): void => controller.save(reason);
  /** Esc steps back: out of a menu page, then the menu, then a pick or selection, and otherwise opens the menu. */
  const escape = (): void => {
    if (runMenu.value) {
      if (runMenu.value === 'main') closeMenu();
      else runMenu.value = 'main';
    } else if (inp.busy() || ui.pending?.(view)) {
      inp.cancel();
    } else if (controller.state.phase !== 'won' && controller.state.phase !== 'lost') {
      openMenu();
    }
  };
  const unbind = [
    hotkeys.bind('space', 'Start the next Wave', startWave),
    hotkeys.bind('p', 'Pause', togglePause),
    // Versus plays 1× only.
    ...(versus ? [] : [
      hotkeys.bind('1', 'Speed 1×', () => setSpeed(1)),
      hotkeys.bind('2', 'Speed 2×', () => setSpeed(2)),
      hotkeys.bind('3', 'Speed 3×', () => setSpeed(3)),
    ]),
    hotkeys.bind('escape', 'Back', escape),
  ];
  // While the in-Run menu is open, only Esc reaches the game, so a letter typed there can't buy or build.
  const onKey = (e: KeyboardEvent): void => {
    if (runMenu.value) {
      if (!e.repeat && keyName(e) === 'escape') {
        e.preventDefault();
        escape();
      }
      return;
    }
    if (hotkeys.handle(e)) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  // In Versus the session pauses both devices when the app goes to the background (step 3b wires it).
  const offBackground = versus ? () => {} : onBackground(() => {
    controller.background();
    paused.value = true;
  });

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.stop();
    offRun();
    offStep();
    offFrame();
    offBackground();
    for (const u of unbind) u();
    window.removeEventListener('keydown', onKey);
    session.value = null;
    runMenu.value = null;
    runEnd.value = null;
    hint.value = null;
    board.destroy();
    if (document.documentElement.dataset['mode'] === ui.modeId) delete document.documentElement.dataset['mode'];
  };

  session.value = {
    view,
    ui,
    hotkeys,
    versus,
    startWave,
    setSpeed,
    togglePause,
    restart: () => {
      controller.restart();
      save('start');
    },
    cancel: () => inp.cancel(),
    tap: () => feedback.tap(),
    openMenu,
    closeMenu,
    quit: () => {
      save('quit');
      opts.onQuit?.();
    },
    // A Versus Run has no save code (design §6).
    ...(versus ? {} : { exportCode: () => writeCode(controller.state) }),
  };
  controller.start();

  return {
    controller,
    worldToClient: (x, y) => board.worldToClient({ x, y }),
    flush: () => Promise.all([lastWrite, finishing]),
    recordVersus: (outcome) => (opts.record === false ? Promise.resolve(null) : recordVersus(ui, controller.state, side, outcome)),
    setShowGrid: (show) => board.setShowGrid(show),
    stop,
  };
}
