import type { ComponentType } from 'preact';
import type { HapticKind } from '../platform/native';
import type { SoundName } from '../platform/audio';
import type { RunResult } from '../platform/storage';
import type { PointerKind } from '../render/gestures';
import type { ModeLook, TowerLook } from '../render/look';
import { getMode, type Command, type Difficulty, type GameState, type Json, type Point, type SimEvent, type Tower, type WaveSpec } from '../sim';
import type { Hint, HintTone, PlaySession, RunEnd } from './state';

/**
 * The Side a device shows as you (CONTEXT.md, Viewer Side): 0, except on a
 * Versus Guest's device, where it is 1. Only Line Wars has Sides; every other
 * Game Mode sees 0 and ignores it. The sim never knows it.
 */
export type ViewerSide = 0 | 1;

/**
 * What a Game Mode's UI sees of the Run it is attached to. ModeUi methods
 * handed only the state take the Viewer Side as an optional last argument,
 * 0 when it is left out.
 */
export interface RunView {
  /** The live state: read it, never write it. Change the Run with send(). */
  readonly state: GameState;
  /** The Viewer Side: the commands the UI builds name it, and its readouts are from it. */
  readonly side: ViewerSide;
  /** Queues a command for the next tick. */
  send(command: Command): void;
  /** Re-reads the mode's buttons and the ghost, after the mode's own UI state changed. */
  refresh(): void;
  /** Selects a structure by id (0 clears), as a tap on it would. */
  select(id: number): void;
  /** A short message over the board for a moment (`ms`, about 2 s by default), such as "Recipe ready". */
  say(text: string, tone?: HintTone, ms?: number): void;
  /**
   * Shows the ghost the mode's placement gives at world point `p`, as a tap
   * there would, and keeps it up while the pointer is elsewhere; null takes it
   * down. `kind` is the pointer that asked, for the hint's words. The play
   * screen always has it; a test's view may leave it out.
   */
  showGhost?(p: Point | null, kind?: PointerKind): void;
  /** Where a world point is on the page, in CSS pixels, for the mode's own layer over the board. */
  toScreen?(p: Point): Point;
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
  /** The circle the ghost shows, when it isn't the spec's attack range (an Original Totem's aura). */
  readonly range?: number;
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

/** A question the main menu asks before something it can't undo, such as replacing a saved Run. */
export interface ConfirmSpec {
  readonly title: string;
  readonly text: string;
  readonly yes: string;
  run(): void;
}

/** What a Game Mode's own main-menu page gets, such as the Original's Stage select. */
export interface MenuPageProps {
  /** Its sub-page, '' for its first; Esc and Back step from a sub-page to the first. */
  readonly view: string;
  go(view: string): void;
  /** Back to the main menu. */
  back(): void;
  confirm(c: ConfirmSpec): void;
}

/** Records kept apart within one Game Mode and Difficulty, because their results don't compare (Element's Full and Express). */
export interface RecordBoard {
  readonly id: string;
  readonly name: string;
  /** A Wave number as the Records table shows it, such as "Boss 3" past Element's 55. */
  wave?(n: number): string;
  /**
   * The one Difficulty the board keeps, such as Versus' Normal: it shows as a
   * row named `name` under the mode's table by Difficulty, not as a table of its own.
   */
  readonly only?: Difficulty;
}

/** The end card's words, for a Run whose end the core's defaults don't describe. */
export interface EndText {
  /** Won, by the Game Mode's own measure: Element's Full is won once Wave 55 is cleared, though the boss Waves go on. */
  readonly won: boolean;
  /** The card's heading, when it isn't Victory or Defeat, such as Line Wars' Draw. */
  readonly title?: string;
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
  /**
   * Shapes and colours for its towers and creeps; DEFAULT_LOOK fills the rest.
   * A function gets the Viewer Side, for a look that says which Side is you
   * (Line Wars' banners).
   */
  readonly look?: Partial<ModeLook> | ((side: ViewerSide) => Partial<ModeLook>);
  /** False hides the lives readout, for modes without lives such as Gem. */
  readonly showLives?: boolean;
  /** False hides the start-Wave button, for modes that start Waves themselves. */
  readonly showStartWave?: boolean;
  /**
   * How far a saved Run has got, for Continue and Import, when it isn't "Wave n",
   * such as Line Wars' Run time.
   */
  progressText?(state: GameState): string;
  /**
   * What the Records' Wave column counts, when it isn't the best Wave reached,
   * such as Line Wars' best steal: its heading, and a best as New Run shows it.
   */
  readonly recordWave?: { readonly heading: string; best(n: number): string };
  /**
   * Which spawns' ground routes the board draws, when it shouldn't draw every
   * spawn's alike: `live` ones are drawn and previewed as usual, `faint` ones
   * thin and dim, such as the Rival's route in Line Wars.
   */
  routes?(state: GameState, side?: ViewerSide): { readonly live: readonly number[]; readonly faint: readonly number[] };
  /** The HUD's Wave readout, such as "3/55" or "Boss 2"; null hides it. Default: number/total. */
  waveLabel?(view: RunView): { readonly label: string; readonly value: string } | null;
  /** What a Difficulty does, for the New Run page, when the rules keep it in their own tables. */
  difficultyAbout?(difficulty: Difficulty): string;
  /** Choices a New Run asks for besides Difficulty, in order. */
  readonly runOptions?: readonly RunOptionSpec[];
  /**
   * The Run settings the rules take, when they aren't the choices as they
   * stand, such as the Original's Stage number with the Campaign's Talents.
   * Called as each Run starts, Play again included.
   */
  runSettings?(choices: RunChoices): { readonly [key: string]: Json };
  /** Reads the mode's own progress from storage; the main menu waits for it before it shows. */
  loadProgress?(): Promise<void>;
  /**
   * Replaces New Run and its Difficulty page with the mode's own main-menu
   * page, such as the Original's Stage select; the mode card's button says `label`.
   */
  readonly MenuPage?: { readonly label: string; readonly Page: ComponentType<MenuPageProps> };
  /**
   * The choices a Run was started with, so Continue's "Play again" keeps them;
   * in Line Wars as the Viewer Side sees them ("your Race" is that Side's).
   */
  optionsOf?(state: GameState, side?: ViewerSide): RunChoices;
  /** The choices in a few words, such as "Express · All Random", for Continue and the end card. */
  optionsText?(choices: RunChoices): string;
  /** The Record boards it keeps, when its Records split within a Difficulty. */
  readonly recordBoards?: readonly RecordBoard[];
  /** The board a Run with these choices counts toward. A Versus Run counts toward `versus` instead. */
  recordBoard?(choices: RunChoices): string;
  /**
   * The end card's words from the Viewer Side; the core's defaults otherwise.
   * `versus` is a Versus Run, which always plays Normal, so it isn't named.
   */
  endText?(state: GameState, side?: ViewerSide, versus?: boolean): EndText;
  /**
   * Called once when a Run ends, to fold it into the mode's own progress, such
   * as the Original's Campaign. The end card's `End` shows what it changed.
   */
  finish?(state: GameState): Promise<void>;
  /** Replaces the end card's results, such as the Original's Stars and unlocks. */
  readonly End?: ComponentType<ModeEndProps>;
  /** The mode's own Records, in place of the table by Difficulty. */
  readonly Records?: ComponentType;
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
  /** A sound or haptic other than the default for this event, as the Viewer Side hears it; undefined keeps the default. */
  feedback?(event: SimEvent, state: GameState, side?: ViewerSide): CueOverride | undefined;
  /** Every tick's events, for a mode's own UI state. */
  onEvents?(view: RunView, events: readonly SimEvent[]): void;
  /** A tap on a structure while the mode waits for a second pick (Gem's swap). True when the mode used it. */
  tapTower?(view: RunView, tower: Tower): boolean;
  /**
   * A tap or click on the board where no structure stands, before any ghost is
   * evaluated. True when the mode used it, such as the Original opening its
   * build ring on a Build Spot.
   */
  tapGround?(view: RunView, p: Point, kind: PointerKind): boolean;
  /** The circle a selected structure shows, when it isn't the spec's attack range (Levels, Talents, Totem auras). */
  towerReach?(state: GameState, tower: Tower): number;
  /** True while the mode waits for a second pick, so Esc cancels that instead of opening the menu. */
  pending?(view: RunView): boolean;
  /** Marks on structures, re-read after every tick that changed a structure or the mode's state. */
  marks?(state: GameState): readonly StructureMark[];
  /**
   * Versus: where a command of this player's that hasn't landed yet will act,
   * in world units, so the board marks it faintly until its tick (a build's
   * footprint, an upgraded or sold tower); null for one with no place.
   */
  pendingMark?(state: GameState, command: Command): { readonly x: number; readonly y: number; readonly span: number } | null;
  /** The mode plays Versus (Line Wars): its main-menu card offers Host and Join. */
  readonly versus?: boolean;
  /** The hint line when no ghost or message is up, such as what to do next. */
  hint?(view: RunView): Hint | null;
  /** The finished Run as the Viewer Side's Record entry; modes without one keep no Records. */
  result?(state: GameState, side?: ViewerSide): RunResult;
  /** The gold the HUD shows, when it isn't the core's `gold`: Line Wars' is Side 0's copy, so it gives the Viewer Side's own purse. */
  gold?(state: GameState, side?: ViewerSide): number;
  /** A deeper check of the mode's own state in a loaded save; false refuses the save as damaged. */
  validSave?(state: GameState): boolean;
  /** The mode's own readouts in the top row beside gold, such as Line Wars' income and its countdown. */
  readonly Stats?: ComponentType<ModeHudProps>;
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
  /** The mode's own layer over the board, such as the Original's build ring. */
  readonly Board?: ComponentType<ModeHudProps>;
}

export interface ModeEndProps {
  readonly s: PlaySession;
  readonly end: RunEnd;
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
