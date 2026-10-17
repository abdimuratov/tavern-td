import {
  createRun, step, TICK_RATE,
  type Command, type GameState, type Replay, type ReplayEntry, type RunOptions, type SimEvent,
} from '../sim';
import type { Speed } from '../ui/state';

export type { Speed };

/** Why the Run is being saved: the end of a Wave, or the app going to the background. */
export type AutosaveReason = 'waveEnd' | 'background';

export interface RunControllerOptions {
  /** What each Run starts from; called again for "play again", so it can pick a new seed. */
  runOptions(): RunOptions;
  /** Saves a Run in progress. Errors are logged, never thrown into the loop. */
  autosave?(state: GameState, reason: AutosaveReason): unknown;
  /** Forgets the autosave of a Run that has ended, so Continue isn't offered for it. */
  clearSave?(state: GameState): unknown;
  /** Defaults to window.requestAnimationFrame; tests pass their own. */
  requestFrame?(callback: (now: number) => void): number;
  cancelFrame?(handle: number): void;
}

export interface RunController {
  /** The Run being played. Replaced by restart(); read it, never mutate it. */
  readonly state: GameState;
  readonly speed: Speed;
  readonly paused: boolean;
  /** Every command applied this Run with its tick: a seed plus this replays the Run. */
  readonly log: readonly ReplayEntry[];
  /** How far between the last two ticks to draw, 0–1. */
  readonly alpha: number;
  /** Queues a command for the next tick. While paused, it is applied by a single tick of its own. */
  send(command: Command): void;
  setSpeed(speed: Speed): void;
  setPaused(paused: boolean): void;
  /** Starts a fresh Run from runOptions(). */
  restart(): void;
  /** Pauses and saves: for the app going to the background. */
  background(): void;
  /** The Run so far as a replay, for bug reports and tests. */
  replay(): Replay;
  /** After every tick, with that tick's events. */
  onStep(listener: (state: GameState, events: readonly SimEvent[]) => void): () => void;
  /** Once per display frame, after the ticks it ran. `dt` is real milliseconds since the last frame. */
  onFrame(listener: (alpha: number, dt: number) => void): () => void;
  /** When a Run starts, including the first. */
  onRun(listener: (state: GameState) => void): () => void;
  start(): void;
  stop(): void;
  /** One display frame at time `now` (ms). The loop calls it; tests drive it directly. */
  frame(now: number): void;
}

export const TICK_MS = 1000 / TICK_RATE;
/** A frame longer than this (a GC pause, a tab in the background) counts as this long, so play never fast-forwards. */
export const MAX_FRAME_MS = 100;
const NO_COMMANDS: readonly Command[] = [];
/** Frame times summed in floating point fall a hair short of a whole tick; this keeps 60 Hz at exactly two frames a tick. */
const EPSILON_MS = 1e-3;

/**
 * Owns the Run: its state, the command queue and log, and a fixed-step loop
 * that runs the game logic at 30 Hz whatever the display rate. 2× and 3× run
 * two or three ticks per tick interval, which ADR-0002 guarantees changes
 * nothing but the pace.
 */
export function createRunController(opts: RunControllerOptions): RunController {
  const requestFrame = opts.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const cancelFrame = opts.cancelFrame ?? ((h) => cancelAnimationFrame(h));
  const stepListeners = new Set<(state: GameState, events: readonly SimEvent[]) => void>();
  const frameListeners = new Set<(alpha: number, dt: number) => void>();
  const runListeners = new Set<(state: GameState) => void>();

  let runOptions = opts.runOptions();
  let state = createRun(runOptions);
  let log: ReplayEntry[] = [];
  let queue: Command[] = [];
  let speed: Speed = 1;
  let paused = false;
  let acc = 0;
  let alpha = 0;
  let last: number | null = null;
  let handle = 0;
  let running = false;

  const guard = (what: string, fn: () => unknown): void => {
    try {
      void Promise.resolve(fn()).catch((err: unknown) => console.error(`[run] ${what} failed`, err));
    } catch (err) {
      console.error(`[run] ${what} failed`, err);
    }
  };

  const save = (reason: AutosaveReason): void => {
    if (!opts.autosave || state.phase === 'won' || state.phase === 'lost') return;
    const s = state;
    guard('autosave', () => opts.autosave!(s, reason));
  };

  function tick(): void {
    let commands = NO_COMMANDS;
    if (queue.length > 0) {
      commands = queue;
      queue = [];
      for (const command of commands) log.push({ tick: state.tick, command });
    }
    const events = step(state, commands);
    for (const l of stepListeners) l(state, events);
    let ended = false;
    let waveEnded = false;
    for (const e of events) {
      if (e.type === 'won' || e.type === 'lost') ended = true;
      else if (e.type === 'waveEnd') waveEnded = true;
    }
    if (ended) {
      const s = state;
      if (opts.clearSave) guard('clearing the autosave', () => opts.clearSave!(s));
    } else if (waveEnded) {
      save('waveEnd');
    }
  }

  const over = (): boolean => state.phase === 'won' || state.phase === 'lost';

  function frame(now: number): void {
    const dt = last === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, now - last));
    last = now;
    if (!paused && !over()) {
      acc += dt * speed;
      // MAX_FRAME_MS already bounds the catch-up; this only guards against a misbehaving clock.
      const maxTicks = Math.ceil((MAX_FRAME_MS * speed) / TICK_MS);
      let n = 0;
      while (acc >= TICK_MS - EPSILON_MS && n < maxTicks) {
        tick();
        acc -= TICK_MS;
        n++;
        if (over()) break;
      }
      if (acc >= TICK_MS) acc = 0;
      acc = Math.max(0, acc);
      alpha = over() ? 1 : acc / TICK_MS;
    } else if (queue.length > 0 && !over()) {
      tick();
    }
    for (const l of frameListeners) l(alpha, dt);
  }

  const loop = (now: number): void => {
    if (!running) return;
    frame(now);
    handle = requestFrame(loop);
  };

  return {
    get state() {
      return state;
    },
    get speed() {
      return speed;
    },
    get paused() {
      return paused;
    },
    get log() {
      return log;
    },
    get alpha() {
      return alpha;
    },
    send(command) {
      queue.push(command);
    },
    setSpeed(next) {
      speed = next;
    },
    setPaused(next) {
      paused = next;
    },
    restart() {
      runOptions = opts.runOptions();
      state = createRun(runOptions);
      log = [];
      queue = [];
      acc = 0;
      alpha = 0;
      paused = false;
      for (const l of runListeners) l(state);
    },
    background() {
      paused = true;
      save('background');
    },
    replay() {
      return { ...runOptions, log: [...log], until: state.tick };
    },
    onStep(l) {
      stepListeners.add(l);
      return () => stepListeners.delete(l);
    },
    onFrame(l) {
      frameListeners.add(l);
      return () => frameListeners.delete(l);
    },
    onRun(l) {
      runListeners.add(l);
      l(state);
      return () => runListeners.delete(l);
    },
    start() {
      if (running) return;
      running = true;
      last = null;
      handle = requestFrame(loop);
    },
    stop() {
      running = false;
      cancelFrame(handle);
    },
    frame,
  };
}
