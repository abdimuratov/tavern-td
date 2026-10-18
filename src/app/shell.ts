import { setAudioSettings } from '../platform/audio';
import { setHapticsEnabled } from '../platform/native';
import { loadRun, saveSettings, type Settings } from '../platform/storage';
import type { Difficulty, GameState, RunOptions } from '../sim';
import { CATALOG, catalogEntry, type CatalogEntry } from '../ui/catalog';
import type { RunChoices } from '../ui/mode-ui';
import { appActions, savedRuns, screen, settings, type CodeCheck, type SavedRunInfo } from '../ui/state';
import { startPlay, type Play, type PlayTarget } from './game';
import { checkRun, readCode, SAVE_VERSION, SaveProblem, type SaveRules } from './saves';

declare global {
  interface Window {
    /** The running play screen, for the e2e tests and the Safari inspector. */
    tavern?: Play;
  }
}

const RULES: SaveRules = {
  playable: (modeId) => catalogEntry(modeId)?.ui !== undefined,
  validState: (state) => catalogEntry(state.modeId)?.ui?.validSave?.(state) ?? true,
};

/** A Run's seed. Only the app picks seeds; the game logic never touches Math.random (ADR-0002). */
export function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function targetFor(entry: CatalogEntry, difficulty: Difficulty, choices: RunChoices = {}): PlayTarget {
  const ui = entry.ui!;
  // Settings that come from the mode's own progress (the Original's Talents) are read as each Run starts.
  const options = (): Pick<RunOptions, 'options'> => {
    if (ui.runSettings) return { options: ui.runSettings(choices) };
    return Object.keys(choices).length > 0 ? { options: { ...choices } } : {};
  };
  return { ui, runOptions: () => ({ mode: entry.id, seed: newSeed(), difficulty, ...options() }) };
}

/** The choices a saved Run was started with, so "Play again" keeps them. */
function choicesOf(entry: CatalogEntry, state: GameState): RunChoices {
  return entry.ui?.optionsOf?.(state) ?? {};
}

function optionsLine(entry: CatalogEntry | undefined, state: GameState): string {
  return entry?.ui?.optionsText?.(choicesOf(entry, state)) ?? '';
}

/** How far a saved Run has got: "Wave 12", or the mode's own words. */
function progressLine(entry: CatalogEntry | undefined, state: GameState): string {
  return entry?.ui?.progressText?.(state) ?? `Wave ${state.wave.number}`;
}

interface Loaded {
  readonly info: SavedRunInfo;
  readonly state?: GameState;
}

/**
 * The screens around a Run: the main menu, starting, resuming and importing
 * Runs, and quitting back. It owns the one play screen there can be at a time.
 */
export function createShell(boardHost: HTMLElement, opts: { fps?(fps: number): void } = {}) {
  let play: Play | null = null;
  let starting = false;

  async function loadSaved(modeId: string): Promise<Loaded | null> {
    const saved = await loadRun(modeId);
    if (!saved) return null;
    if (saved.version !== SAVE_VERSION) {
      return { info: { ok: false, modeId, problem: "Your saved Run is from an older version and can't be continued." } };
    }
    try {
      const state = checkRun(saved.data, RULES);
      const entry = catalogEntry(modeId);
      const options = optionsLine(entry, state);
      const progress = progressLine(entry, state);
      return { info: { ok: true, modeId, wave: state.wave.number, difficulty: state.difficulty, savedAt: saved.savedAt, progress, options }, state };
    } catch (err) {
      const why = err instanceof SaveProblem ? err.message : 'It is damaged.';
      return { info: { ok: false, modeId, problem: `Your saved Run can't be continued. ${why}` } };
    }
  }

  async function refreshSaves(): Promise<void> {
    const out: Record<string, SavedRunInfo> = {};
    for (const e of CATALOG) {
      if (!e.ui) continue;
      const loaded = await loadSaved(e.id);
      if (loaded) out[e.id] = loaded.info;
    }
    savedRuns.value = out;
  }

  function stopPlay(): void {
    if (!play) return;
    play.stop();
    play = null;
    delete window.tavern;
  }

  async function showMenu(): Promise<void> {
    stopPlay();
    await Promise.all([
      refreshSaves(),
      ...CATALOG.map((e) => e.ui?.loadProgress?.().catch((err: unknown) => console.warn(`[shell] ${e.id} progress`, err))),
    ]);
    screen.value = 'menu';
  }

  async function quit(): Promise<void> {
    await play?.flush();
    await showMenu();
  }

  /** Opens the play screen on `target`. A saved Run resumes paused; `save` writes it at once so Continue finds it. */
  async function begin(target: PlayTarget, from: { initial?: GameState; save: boolean }): Promise<void> {
    if (starting) return;
    starting = true;
    try {
      stopPlay();
      screen.value = 'play';
      const s = settings.value;
      play = await startPlay(target, boardHost, {
        ...(from.initial ? { initial: from.initial } : {}),
        paused: from.initial !== undefined,
        speed: s.defaultSpeed,
        showGrid: s.showGrid,
        onQuit: () => void quit(),
        ...(opts.fps ? { fps: opts.fps } : {}),
      });
      window.tavern = play;
      if (from.save) play.controller.save('start');
    } catch (err) {
      console.error('[shell] could not start the Run', err);
      await showMenu();
    } finally {
      starting = false;
    }
  }

  function applySettings(next: Settings): void {
    settings.value = next;
    setAudioSettings(next);
    setHapticsEnabled(next.haptics);
    play?.setShowGrid(next.showGrid);
  }

  appActions.value = {
    newRun(modeId, difficulty, choices) {
      const entry = catalogEntry(modeId);
      if (entry?.ui) void begin(targetFor(entry, difficulty, choices), { save: true });
    },
    continueRun(modeId) {
      void (async () => {
        const entry = catalogEntry(modeId);
        const loaded = await loadSaved(modeId);
        if (!entry?.ui || !loaded?.state) {
          await refreshSaves();
          return;
        }
        await begin(targetFor(entry, loaded.state.difficulty, choicesOf(entry, loaded.state)), { initial: loaded.state, save: false });
      })();
    },
    async checkCode(code): Promise<CodeCheck> {
      try {
        const state = await readCode(code, RULES);
        const entry = catalogEntry(state.modeId)!;
        return {
          ok: true,
          modeId: state.modeId,
          wave: state.wave.number,
          difficulty: state.difficulty,
          gold: state.gold,
          progress: progressLine(entry, state),
          options: optionsLine(entry, state),
          start: () => void begin(targetFor(entry, state.difficulty, choicesOf(entry, state)), { initial: state, save: true }),
        };
      } catch (err) {
        return { ok: false, message: err instanceof SaveProblem ? err.message : "That code can't be loaded." };
      }
    },
    updateSettings(next) {
      applySettings(next);
      void saveSettings(next);
    },
  };

  return {
    showMenu,
    applySettings,
    /** Plays a target outside the catalog, such as the dev sandbox; Quit returns to the menu. */
    playTarget: (target: PlayTarget) => begin(target, { save: false }),
  };
}
