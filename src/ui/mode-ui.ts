import type { ComponentType } from 'preact';
import type { HapticKind } from '../platform/native';
import type { SoundName } from '../platform/audio';
import type { RunResult } from '../platform/storage';
import type { ModeLook, TowerLook } from '../render/look';
import { getMode, type Command, type Difficulty, type GameState, type Point, type SimEvent, type Tower, type WaveSpec } from '../sim';
import type { Hint, HintTone, PlaySession } from './state';

/** What a Game Mode's UI sees of the Run it is attached to. */
export interface RunView {
  /** The live state: read it, never write it. Change the Run with send(). */
  readonly state: GameState;
  /** Queues a command for the next tick. */
  send(command: Command): void;
  /** Re-reads the mode's buttons and the ghost, after the mode's own UI state changed. */
  refresh(): void;
  /** Selects a structure by id (0 clears), as a tap on it would. */
  select(id: number): void;
  /** A short message over the board for a moment (`ms`, about 2 s by default), such as "Recipe ready". */
  say(text: string, tone?: HintTone, ms?: number): void;
}

/** What a ghost looks like when there's no tower spec to take it from. */
export type GhostLook = Pick<TowerLook, 'shape' | 'color' | 'size' | 'plate'>;

/** A structure the player could place with the pointer where it is. */
export interface Placement {
  /** Cells it would cover. The ghost, its red reason and the path preview all use these. */
  readonly cells: readonly number[];
  /** Sent when the player confirms. */
  readonly command: Command;
  /** The tower spec the ghost shows, for its shape and range; omit for a plain marker (a Draft gem is random). */
  readonly spec?: string;
  /** A reason to refuse before the Map is asked, such as "not enough gold". */
  readonly error?: string | null;
  /** What the hint says while the ghost is valid, such as "Arrow · 10 gold". */
  readonly label?: string;
  /** True when `error` already covers the Map's own checks (bounds, Block), so they aren't run twice. */
  readonly checked?: boolean;
  /** False for a structure creeps walk over: it can't change the route, so no route preview is drawn. */
  readonly route?: boolean;
  /** The ghost's look when `spec` is absent. */
  readonly look?: GhostLook;
  /**
   * On touch, a second tap this many CSS pixels from the ghost's centre still
   * builds it, however far the board is zoomed out. Without it the tap must
   * land on the ghost's own cells.
   */
  readonly tapSlop?: number;
}

/** A HUD button. Its key is bound while it is on screen, WC3-style. */
export interface UiAction {
  readonly id: string;
  readonly label: string;
  /** A second line: a cost, a refund. */
  readonly detail?: string;
  /** One letter or digit, lower case. Overrides a core key (P, 1–3, Space) while the button is shown. */
  readonly key?: string;
  /** Pressed in, such as the tower type being built. */
  readonly active?: boolean;
  /** Greyed out and inert; a string says why. */
  readonly disabled?: boolean | string;
  /** Shown faded but still pressable, such as a tower you can't afford yet. */
  readonly dim?: boolean;
  readonly tone?: 'primary' | 'danger';
  /** A colour swatch, 0xRRGGBB, such as the tower's own colour. */
  readonly swatch?: number;
  run(): void;
}

/** Overrides the default sound or haptic for one event; null silences it. */
export interface CueOverride {
  readonly sound: SoundName | null;
  readonly haptic: HapticKind | null;
}

export interface WavePreviewGroup {
  readonly creep: string;
  readonly name: string;
  readonly count: number;
  readonly air: boolean;
  readonly boss: boolean;
  /** The boss tag's text, such as Gem's "Damage Test"; "Boss" by default. */
  readonly tag?: string;
  /** A colour dot before the name, such as the creep's Element. */
  readonly swatch?: number;
  /** Small tags after the name, such as Element's Traits. */
  readonly traits?: readonly string[];
  /** Everything else about the group, for a tooltip. */
  readonly about?: string;
}

export interface WavePreview {
  /** 1-based. */
  readonly number: number;
  readonly groups: readonly WavePreviewGroup[];
}

/** One choice a New Run asks for besides Difficulty, such as Element's Length. */
export interface RunOptionSpec {
  readonly id: string;
  readonly label: string;
  readonly choices: readonly { readonly id: string; readonly label: string; readonly about: string }[];
  readonly default: string;
}

/** A Run's choices by RunOptionSpec id. */
export type RunChoices = Readonly<Record<string, string>>;

/** Records kept apart within one Game Mode and Difficulty, because their results don't compare (Element's Full and Express). */
export interface RecordBoard {
  readonly id: string;
  readonly name: string;
  /** A Wave number as the Records table shows it, such as "Boss 3" past Element's 55. */
  wave?(n: number): string;
}

/** The end card's words, for a Run whose end the core's defaults don't describe. */
export interface EndText {
  /** Won, by the Game Mode's own measure: Element's Full is won once Wave 55 is cleared, though the boss Waves go on. */
  readonly won: boolean;
  /** One line under Victory or Defeat. */
  readonly summary: string;
  /** The Wave reached, as the card shows it. */
  readonly wave: string;
}

/**
 * Everything Game-Mode-specific in the play screen. The core HUD shows gold,
 * Waves, speed and the wave preview; a mode adds its look, what a confirmed
 * cell builds, its buttons and their keys through these. Every method is
 * optional and called during rendering, so keep them quick and side-effect free
 * (apart from the actions' run()). Signals read inside them are tracked.
 */
export interface ModeUi {
  readonly modeId: string;
  /** Shapes and colours for its towers and creeps; DEFAULT_LOOK fills the rest. */
  readonly look?: Partial<ModeLook>;
  /** False hides the lives readout, for modes without lives such as Gem. */
  readonly showLives?: boolean;
  /** False hides the start-Wave button, for modes that start Waves themselves. */
  readonly showStartWave?: boolean;
  /** The HUD's Wave readout, such as "3/55" or "Boss 2"; null hides it. Default: number/total. */
  waveLabel?(view: RunView): { readonly label: string; readonly value: string } | null;
  /** What a Difficulty does, for the New Run page, when the rules keep it in their own tables. */
  difficultyAbout?(difficulty: Difficulty): string;
  /** Choices a New Run asks for besides Difficulty, in order. */
  readonly runOptions?: readonly RunOptionSpec[];
  /** The choices a Run was started with, so Continue's "Play again" keeps them. */
  optionsOf?(state: GameState): RunChoices;
  /** The choices in a few words, such as "Express · All Random", for Continue and the end card. */
  optionsText?(choices: RunChoices): string;
  /** The Record boards it keeps, when its Records split within a Difficulty. */
  readonly recordBoards?: readonly RecordBoard[];
  /** The board a Run with these choices counts toward. */
  recordBoard?(choices: RunChoices): string;
  /** The end card's words; the core's defaults otherwise. */
  endText?(state: GameState): EndText;
  /** Re-read marks at least every this many ticks, for marks that change without an event (a build finishing). */
  readonly marksEvery?: number;
  /** What the pointer at world point `p` would build, or null when nothing can be built there now. */
  placement?(view: RunView, p: Point): Placement | null;
  /** Buttons for the selected structure, such as Sell or Keep. */
  towerActions?(view: RunView, tower: Tower): readonly UiAction[];
  /** Extra label–value rows for the selected structure's panel. */
  towerInfo?(view: RunView, tower: Tower): readonly (readonly [string, string])[];
  /** Buttons always on the HUD, such as a build menu or Gem's chance upgrade. */
  actions?(view: RunView): readonly UiAction[];
  /** Waves to preview; defaults to the Game Mode's own Wave list. Null hides one. */
  wavePreview?(view: RunView, index: number): WavePreview | null;
  /** Called by Esc and right-click after the ghost and selection are cleared: drop the mode's own build choice. */
  cancel?(view: RunView): void;
  /** A sound or haptic other than the default for this event; undefined keeps the default. */
  feedback?(event: SimEvent, state: GameState): CueOverride | undefined;
  /** Every tick's events, for a mode's own UI state. */
  onEvents?(view: RunView, events: readonly SimEvent[]): void;
  /** A tap on a structure while the mode waits for a second pick (Gem's swap). True when the mode used it. */
  tapTower?(view: RunView, tower: Tower): boolean;
  /** True while the mode waits for a second pick, so Esc cancels that instead of opening the menu. */
  pending?(view: RunView): boolean;
  /** Marks on structures, re-read after every tick that changed a structure or the mode's state. */
  marks?(state: GameState): readonly StructureMark[];
  /** The hint line when no ghost or message is up, such as what to do next. */
  hint?(view: RunView): Hint | null;
  /** The finished Run as a Record entry; modes without one keep no Records. */
  result?(state: GameState): RunResult;
  /** A deeper check of the mode's own state in a loaded save; false refuses the save as damaged. */
  validSave?(state: GameState): boolean;
  /** The mode's own block under the speed controls, such as Gem's Draft progress. */
  readonly Status?: ComponentType<ModeHudProps>;
  /** The mode's own block in the actions area, such as Gem Quality. Hidden on a short screen while something is selected. */
  readonly Actions?: ComponentType<ModeHudProps>;
  /** Replaces the selected structure's stats and buttons. */
  readonly Panel?: ComponentType<ModePanelProps>;
  /** Replaces the start-Wave button at the bottom of the HUD, such as Element's Send now with the Break countdown. */
  readonly Footer?: ComponentType<ModeHudProps>;
  /** The mode's one-screen how-to-play. */
  readonly HowTo?: ComponentType;
}

export interface ModeHudProps {
  readonly s: PlaySession;
}

export interface ModePanelProps {
  readonly s: PlaySession;
  readonly tower: Tower;
}

/** A sign on a structure, drawn by the board. */
export interface StructureMark {
  readonly tower: number;
  readonly color: number;
  /** Corner brackets for "not settled yet", a ring for "look here". */
  readonly style: 'brackets' | 'ring';
  readonly pulse?: boolean;
}

/** The core's Wave for 0-based `index`, or undefined past the last. */
export function waveSpecAt(state: GameState, index: number): WaveSpec | undefined {
  if (index < 0 || index >= state.wave.total) return undefined;
  const rules = getMode(state.modeId);
  return rules.waveFor ? rules.waveFor(index, state) : rules.waves?.[index];
}

/**
 * A Wave's groups by creep. A group is a boss when it is a single creep, or one
 * that costs 5 or more lives to leak.
 */
export function defaultWavePreview(state: GameState, index: number): WavePreview | null {
  const spec = waveSpecAt(state, index);
  if (!spec) return null;
  const rules = getMode(state.modeId);
  const groups = spec.groups.map((g) => {
    const cs = Object.hasOwn(rules.creeps, g.creep) ? rules.creeps[g.creep] : undefined;
    return {
      creep: g.creep,
      name: cs?.name ?? g.creep,
      count: g.count,
      air: cs?.flying ?? false,
      boss: g.count === 1 || (cs?.leakCost ?? 1) >= 5,
    };
  });
  return { number: index + 1, groups };
}

/** The upcoming Waves: the next `count`, starting with the one the start-Wave button would send. */
export function upcomingWaves(ui: ModeUi, view: RunView, count: number): WavePreview[] {
  const out: WavePreview[] = [];
  const first = view.state.wave.number;
  for (let i = first; i < first + count && i < view.state.wave.total; i++) {
    const w = ui.wavePreview ? ui.wavePreview(view, i) : defaultWavePreview(view.state, i);
    if (w) out.push(w);
  }
  return out;
}
