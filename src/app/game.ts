import { play } from '../platform/audio';
import { onBackground } from '../platform/lifecycle';
import { haptic } from '../platform/native';
import { clearRun, saveRun } from '../platform/storage';
import { createBoard } from '../render/board';
import type { Command, GameState, RunOptions, SimEvent } from '../sim';
import { createHotkeys } from '../ui/hotkeys';
import type { ModeUi, RunView } from '../ui/mode-ui';
import {
  gold, lives, paused, phase, revision, session, speed, waveNumber, waveTotal, type Speed,
} from '../ui/state';
import { createRunController, type RunController } from './controller';
import { createFeedback } from './feedback';
import { createInput, type Input } from './input';

/** One Game Mode's Runs, ready to play: what the main menu will hand to startPlay. */
export interface PlayTarget {
  readonly ui: ModeUi;
  runOptions(): RunOptions;
  /** Commands sent as each Run starts, such as a prebuilt maze. */
  opening?(): readonly Command[];
}

export interface Play {
  readonly controller: RunController;
  /** Client (CSS pixel) position of a world point, for tests and debugging. */
  worldToClient(x: number, y: number): { x: number; y: number };
  stop(): void;
}

/** Events after which the mode's buttons or the selected panel may read differently. */
const HUD_EVENTS = new Set<SimEvent['type']>([
  'placed', 'removed', 'changed', 'waveStart', 'waveEnd', 'won', 'lost', 'goldChanged', 'livesChanged', 'mode', 'kill',
]);

/**
 * Wires a Run controller to the board, input, HUD, sound and haptics, and
 * starts the loop. Order within a tick: the board catches up first (effects
 * need the creeps it is about to drop), then sound, then input and the HUD.
 */
export async function startPlay(target: PlayTarget, boardHost: HTMLElement, opts: { fps?: (fps: number) => void } = {}): Promise<Play> {
  const { ui } = target;
  const hotkeys = createHotkeys();
  let input: Input | null = null;
  const board = await createBoard(boardHost, {
    onTap: (p, kind) => input?.tap(p, kind),
    onHover: (p) => input?.hover(p),
    onSecondary: () => input?.secondary(),
  });
  const controller = createRunController({
    runOptions: target.runOptions,
    autosave: (s: GameState) => saveRun(s.modeId, s),
    clearSave: (s: GameState) => clearRun(s.modeId),
  });
  const view: RunView = {
    get state() {
      return controller.state;
    },
    send: (command) => controller.send(command),
    refresh: () => input?.refresh(),
    select: (id) => input?.select(id),
  };
  const feedback = createFeedback({ play, haptic }, () => board.looks, () => ui);
  input = createInput({ controller, board, ui, view, feedback });
  const inp = input;

  let dirty = false;
  const syncHud = (s: GameState): void => {
    gold.value = s.gold;
    lives.value = s.lives;
    waveNumber.value = s.wave.number;
    waveTotal.value = s.wave.total;
    phase.value = s.phase;
    paused.value = controller.paused;
    speed.value = controller.speed;
    if (dirty) {
      dirty = false;
      revision.value++;
    }
  };

  const offRun = controller.onRun((s) => {
    board.setRun(s, ui.look);
    inp.reset();
    dirty = true;
    syncHud(s);
    for (const c of target.opening?.() ?? []) controller.send(c);
  });
  const offStep = controller.onStep((s, events) => {
    board.afterStep(s, events);
    feedback.events(s, events);
    inp.afterStep(s, events);
    ui.onEvents?.(view, events);
    if (!dirty) for (const e of events) if (HUD_EVENTS.has(e.type)) dirty = true;
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
  const togglePause = (): void => {
    controller.setPaused(!controller.paused);
    paused.value = controller.paused;
  };
  const startWave = (): void => controller.send({ type: 'startWave' });
  const unbind = [
    hotkeys.bind('space', 'Start the next Wave', startWave),
    hotkeys.bind('p', 'Pause', togglePause),
    hotkeys.bind('1', 'Speed 1×', () => setSpeed(1)),
    hotkeys.bind('2', 'Speed 2×', () => setSpeed(2)),
    hotkeys.bind('3', 'Speed 3×', () => setSpeed(3)),
    hotkeys.bind('escape', 'Cancel', () => inp.cancel()),
    hotkeys.attach(window),
  ];
  const offBackground = onBackground(() => {
    controller.background();
    paused.value = true;
  });

  session.value = {
    view,
    ui,
    hotkeys,
    startWave,
    setSpeed,
    togglePause,
    restart: () => controller.restart(),
    cancel: () => inp.cancel(),
    tap: () => feedback.tap(),
  };
  controller.start();

  return {
    controller,
    worldToClient: (x, y) => board.worldToClient({ x, y }),
    stop() {
      controller.stop();
      offRun();
      offStep();
      offFrame();
      offBackground();
      for (const u of unbind) u();
      session.value = null;
      board.destroy();
    },
  };
}
