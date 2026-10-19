import { signal } from '@preact/signals';
import { DEFAULT_SETTINGS, type RecordUpdate, type Settings } from '../platform/storage';
import type { Command, Difficulty, Phase } from '../sim';
import type { Hotkeys } from './hotkeys';
import type { ModeUi, RunChoices, RunView } from './mode-ui';

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
  /**
   * A Versus Run: 1× only, so the speed buttons and their keys are gone, and
   * the Rival's line has no Difficulty factor. It has no save code either.
   */
  readonly versus: boolean;
  startWave(): void;
  setSpeed(speed: Speed): void;
  togglePause(): void;
  /** A fresh Run of the same Game Mode, Difficulty and choices. */
  restart(): void;
  /** Clears the ghost and the selection, as Esc does. */
  cancel(): void;
  /** A HUD button press, for its haptic. */
  tap(): void;
  /** Pauses and opens the in-Run menu. */
  openMenu(): void;
  /** Closes the in-Run menu and resumes. */
  closeMenu(): void;
  /** Saves the Run and goes back to the main menu. */
  quit(): void;
  /** The Run as it stands as a save code; absent for a Run that has none (Versus). */
  exportCode?(): Promise<string>;
  /**
   * Versus: this player's commands not applied yet, which land Input Delay
   * Turns after the tap, so a pending Send can show faintly until it lands.
   */
  inFlight?(): readonly Command[];
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
/** The Run's time in quarter seconds, for countdowns: it changes four times a game second, not every frame. */
export const runClock = signal(0);
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

/** The in-Run menu's page, null while it is closed. */
export type RunMenuPage = 'main' | 'settings' | 'howto' | 'export' | 'concede';
export const runMenu = signal<RunMenuPage | null>(null);

/** How the Run ended, for the end screen. `update` arrives once the Record is merged. */
export interface RunEnd {
  readonly won: boolean;
  /** The heading, when it isn't Victory or Defeat (Line Wars' Draw). */
  readonly title?: string;
  /** The line under Victory or Defeat. */
  readonly summary: string;
  /** The Wave reached, as shown. */
  readonly wave: string;
  /** Null for modes without a score. */
  readonly score: number | null;
  /** The winning time in seconds, null for a loss. */
  readonly seconds: number | null;
  readonly difficulty: Difficulty;
  /** The Run's other choices in a few words, such as "Express", for Play again; '' for none. */
  readonly options: string;
  readonly update: RecordUpdate | null;
}
export const runEnd = signal<RunEnd | null>(null);

export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });

/** Which screen is up: nothing yet, the main menu, Versus' code swap and Lobby, or a Run. */
export const screen = signal<'boot' | 'menu' | 'versus' | 'play'>('boot');

/** A Run saved for Continue, or why the save can't be used. */
export type SavedRunInfo =
  | {
    readonly ok: true; readonly modeId: string; readonly wave: number; readonly difficulty: Difficulty; readonly savedAt: number;
    /** How far it has got, such as "Wave 12". */
    readonly progress: string;
    /** The Run's other choices in a few words, such as "Express"; '' for none. */
    readonly options: string;
  }
  | { readonly ok: false; readonly modeId: string; readonly problem: string };

/** Saved Runs by Game Mode id, refreshed whenever the main menu opens. */
export const savedRuns = signal<Readonly<Record<string, SavedRunInfo>>>({});

/** A pasted save code, checked: what it holds, or why it can't be loaded. */
export type CodeCheck =
  | {
    readonly ok: true; readonly modeId: string; readonly wave: number; readonly difficulty: Difficulty; readonly gold: number;
    /** How far it has got, such as "Wave 12". */
    readonly progress: string;
    readonly options: string; start(): void;
  }
  | { readonly ok: false; readonly message: string };

/** What the menus ask of the app. The app fills it in at boot. */
export interface AppActions {
  newRun(modeId: string, difficulty: Difficulty, choices?: RunChoices): void;
  continueRun(modeId: string): void;
  checkCode(code: string): Promise<CodeCheck>;
  /** Saves and applies new settings at once. */
  updateSettings(next: Settings): void;
  /** Versus: make a Join code and wait for the Rival as Host. */
  hostVersus(): void;
  /** Versus: the Join box, empty or filled in from a link. */
  joinVersus(code?: string): void;
}

export const appActions = signal<AppActions | null>(null);

