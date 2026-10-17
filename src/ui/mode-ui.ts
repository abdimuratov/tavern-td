import type { HapticKind } from '../platform/native';
import type { SoundName } from '../platform/audio';
import type { ModeLook } from '../render/look';
import { getMode, type Command, type GameState, type Point, type SimEvent, type Tower, type WaveSpec } from '../sim';

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
}

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
}

export interface WavePreview {
  /** 1-based. */
  readonly number: number;
  readonly groups: readonly WavePreviewGroup[];
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
