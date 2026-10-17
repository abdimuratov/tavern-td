import { signal } from '@preact/signals';
import type { Phase } from '../sim';
import type { ModeUi, RunView } from './mode-ui';
import type { Hotkeys } from './hotkeys';

export const portrait = signal(false);
/** True once the service worker's first install has finished. */
export const offlineReady = signal(false);
/** Set when a new version is waiting; calling it reloads into that version. */
export const pendingUpdate = signal<(() => void) | null>(null);

export type Speed = 1 | 2 | 3;

/** What the play screen's HUD drives. The app builds it; the HUD knows nothing else about the Run. */
export interface PlaySession {
  readonly view: RunView;
  readonly ui: ModeUi;
  readonly hotkeys: Hotkeys;
  startWave(): void;
  setSpeed(speed: Speed): void;
  togglePause(): void;
  restart(): void;
  /** Clears the ghost and the selection, as Esc does. */
  cancel(): void;
  /** A HUD button press, for its haptic. */
  tap(): void;
}

export const session = signal<PlaySession | null>(null);

// Mirrors of the Run, written once per frame and only when they change, so the
// HUD re-renders on gold or a Wave starting, not 60 times a second.
export const gold = signal(0);
export const lives = signal(0);
export const waveNumber = signal(0);
export const waveTotal = signal(0);
export const phase = signal<Phase>('build');
export const speed = signal<Speed>(1);
export const paused = signal(false);
/** The selected structure's id, 0 for none. */
export const selected = signal(0);
/** Bumped when anything the mode's buttons or the selected panel show may have changed. */
export const revision = signal(0);

export type HintTone = 'info' | 'ok' | 'error';
export interface Hint {
  readonly text: string;
  readonly tone: HintTone;
}
/** The line over the board: what a ghost would build, or why it can't. */
export const hint = signal<Hint | null>(null);
