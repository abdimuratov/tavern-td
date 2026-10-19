import {
  createRun, step, TICK_RATE,
  type Command, type GameState, type Replay, type ReplayEntry, type RunOptions, type SimEvent,
} from '../sim';
import type { Speed } from '../ui/state';

export type { Speed };

/**
 * Why the Run is being saved: the end of a Wave, a Game Mode's own checkpoint
 * (Line Wars has no Waves, so it asks once a minute), the app going to the
 * background, the player quitting to the menu, or a new Run starting (so
 * Continue finds it).
 */
export type AutosaveReason = 'waveEnd' | 'checkpoint' | 'background' | 'quit' | 'start';

/** A Game Mode asks for an autosave with a mode event named `<mode>.checkpoint`, such as Line Wars' `lw.checkpoint`. */
export function isCheckpoint(e: SimEvent): boolean {
  return e.type === 'mode' && (e.name === 'checkpoint' || e.name.endsWith('.checkpoint'));
}

/**
 * Where a Run's ticks get their commands. Without one the controller is its
 * own source: its queue, speed and pause. Versus passes the lockstep
 * (src/net/lockstep.ts), which holds a tick until both players' Batches are in.
 */
export interface TickSource {
  /** This device's player's command. Local play: the next tick. Lockstep: the next Batch. */
  submit(command: Command): void;
  /** The commands tick `tick` applies, or null while it can't step (a Batch isn't in, or a pause lands on it). */
  take(tick: number): readonly Command[] | null;
  /** After each step: lockstep hashes on its interval here. */
  stepped(state: GameState): void;
  /** 1, or up to 2 while this device is behind its own clock, to make up a long frame (docs/versus-design.md §4.4). */
  pace(): number;
}

/** What a tick source may ask of the controller it drives: a resync or rejoin swaps the Run in place. */
export interface RunTarget {
  readonly state: GameState;
  readonly log: readonly ReplayEntry[];
  adopt(state: GameState, log?: readonly ReplayEntry[]): void;
  replay(): Replay;
}

export interface RunControllerOptions {
  /** What each Run starts from; called again for "play again", so it can pick a new seed. */
  runOptions(): RunOptions;
  /** A saved Run to play first instead of a fresh one. replay() then covers only what came after it. */
  initial?: GameState;
  /** Start paused, as a resumed Run does. */
  paused?: boolean;
  /** Saves a Run in progress. Errors are logged, never thrown into the loop. */
  autosave?(state: GameState, reason: AutosaveReason): unknown;
  /** Forgets the autosave of a Run that has ended, so Continue isn't offered for it. */
  clearSave?(state: GameState): unknown;
  /**
   * Where the ticks get their commands. With one, send() goes to its submit(),
   * setSpeed() and setPaused() do nothing, and a null take() holds the loop
   * without banking time.
   */
  ticks?: TickSource;
  /** Defaults to window.requestAnimationFrame; tests pass their own. */
  requestFrame?(callback: (now: number) => void): number;
  cancelFrame?(handle: number): void;
}

export interface RunController extends RunTarget {
  /** The Run being played. Replaced by restart(); read it, never mutate it. */
  readonly state: GameState;
  readonly speed: Speed;
  readonly paused: boolean;
  /** Every command applied this Run with its tick, in the order applied: a seed plus this replays the Run. */
  readonly log: readonly ReplayEntry[];
  /** How far between the last two ticks to draw, 0–1. */
  readonly alpha: number;
  /**
   * Queues a command for the next tick. While paused, it is applied by a single
   * tick of its own. With a tick source, it goes to the source's submit().
   */
  send(command: Command): void;
  /** Ignored with a tick source: Versus plays 1× and pauses through the lockstep. */
  setSpeed(speed: Speed): void;
  setPaused(paused: boolean): void;
  /** Starts a fresh Run from runOptions(). */
  restart(): void;
  /**
   * Swaps in another state of this Run, such as the Host's after a Versus
   * resync or rejoin, and tells onRun listeners so the board and HUD reset.
   * With `log`, it replaces the log too (a rejoin brings the Host's).
   */
  adopt(state: GameState, log?: readonly ReplayEntry[]): void;
  /** Pauses and saves: for the app going to the background. With a tick source it only saves; the source pauses. */
  background(): void;
  /** Saves now, unless the Run is over. */
  save(reason: AutosaveReason): void;
  /** Runs up to `ticks` ticks at once, stopping at the Run's end: for tests and debugging. */
  fastForward(ticks: number): void;
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
/** A tick source may run this device at up to twice real time while it makes up a long frame. */
export const MAX_PACE = 2;
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
  const source = opts.ticks ?? null;

  let runOptions = opts.runOptions();
  let state = opts.initial ?? createRun(runOptions);
  let log: ReplayEntry[] = [];
  let queue: Command[] = [];
  let speed: Speed = 1;
  let paused = source ? false : opts.paused ?? false;
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

  /** The local source's commands for the next tick: everything queued. */
  function queued(): readonly Command[] {
    if (queue.length === 0) return NO_COMMANDS;
    const commands = queue;
    queue = [];
    return commands;
  }

  function tick(commands: readonly Command[]): void {
    for (const command of commands) log.push({ tick: state.tick, command });
    const events = step(state, commands);
    source?.stepped(state);
    for (const l of stepListeners) l(state, events);
    let ended = false;
    let waveEnded = false;
    let checkpoint = false;
    for (const e of events) {
      if (e.type === 'won' || e.type === 'lost') ended = true;
      else if (e.type === 'waveEnd') waveEnded = true;
      else if (isCheckpoint(e)) checkpoint = true;
    }
    if (ended) {
      const s = state;
      if (opts.clearSave) guard('clearing the autosave', () => opts.clearSave!(s));
    } else if (waveEnded) {
      save('waveEnd');
    } else if (checkpoint) {
      save('checkpoint');
    }
  }

  /** One tick if it can step now: always for the local source, when the tick source has its commands otherwise. */
  function tryTick(): boolean {
    const commands = source ? source.take(state.tick) : queued();
    if (commands === null) return false;
    tick(commands);
    return true;
  }

  const over = (): boolean => state.phase === 'won' || state.phase === 'lost';

  function frame(now: number): void {
    const dt = last === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, now - last));
    last = now;
    if (source) {
      if (!over()) sourceFrame(dt);
    } else if (!paused && !over()) {
      acc += dt * speed;
      // MAX_FRAME_MS already bounds the catch-up; this only guards against a misbehaving clock.
      const maxTicks = Math.ceil((MAX_FRAME_MS * speed) / TICK_MS);
      let n = 0;
      while (acc >= TICK_MS - EPSILON_MS && n < maxTicks) {
        tryTick();
        acc -= TICK_MS;
        n++;
        if (over()) break;
      }
      if (acc >= TICK_MS) acc = 0;
      acc = Math.max(0, acc);
      alpha = over() ? 1 : acc / TICK_MS;
    } else if (queue.length > 0 && !over()) {
      tryTick();
    }
    for (const l of frameListeners) l(alpha, dt);
  }

  /**
   * A frame under a tick source: 1× time, or up to 2× while the source says
   * this device is behind its clock. A tick the source can't give yet holds
   * the loop, and the time held is not banked, so a device that waited for
   * the Rival doesn't race ahead afterwards.
   */
  function sourceFrame(dt: number): void {
    acc += dt * Math.min(MAX_PACE, Math.max(1, source!.pace()));
    const maxTicks = Math.ceil((MAX_FRAME_MS * MAX_PACE) / TICK_MS);
    let n = 0;
    while (acc >= TICK_MS - EPSILON_MS && n < maxTicks) {
      if (!tryTick()) {
        acc = Math.min(acc, TICK_MS);
        break;
      }
      acc -= TICK_MS;
      n++;
      if (over()) break;
    }
    acc = Math.min(Math.max(0, acc), TICK_MS * MAX_PACE);
    alpha = over() ? 1 : Math.min(1, acc / TICK_MS);
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
      if (source) source.submit(command);
      else queue.push(command);
    },
    setSpeed(next) {
      if (!source) speed = next;
    },
    setPaused(next) {
      if (!source) paused = next;
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
    adopt(next, nextLog) {
      state = next;
      if (nextLog) log = [...nextLog];
      queue = [];
      acc = 0;
      alpha = 0;
      for (const l of runListeners) l(state);
    },
    background() {
      if (!source) paused = true;
      save('background');
    },
    save,
    fastForward(ticks) {
      for (let i = 0; i < ticks && !over(); i++) if (!tryTick()) break;
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
