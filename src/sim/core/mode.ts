import type { TowerMods } from '../combat/registry';
import type { Command } from './commands';
import type { SimEvent } from './events';
import type { CreepSpec, DamageTable, MapSpec, TowerSpec, WaveSpec } from './specs';
import type { Creep, Difficulty, GameState, Tower } from './state';
import type { Json } from './types';

/** What starts a Run. A replay is these plus the command log, so it must stay JSON. */
export interface RunOptions {
  readonly mode: string;
  readonly seed: number;
  readonly difficulty: Difficulty;
  /** A Map id the Game Mode knows, or a whole Map. The Game Mode decides what it accepts. */
  readonly map?: string | MapSpec;
  /** Game Mode specific choices, e.g. Element's All Pick or Express. */
  readonly options?: { readonly [key: string]: Json };
}

export interface LeakOutcome {
  readonly lives: number;
  /** `restart` sends the creep back to the spawn to walk the route again. */
  readonly then: 'remove' | 'restart';
}

/** What every phase of a tick works with. */
export interface Sim {
  readonly state: GameState;
  readonly rules: GameModeRules;
  readonly events: SimEvent[];
}

/**
 * A Game Mode's rules. The core runs the tick; the mode supplies content and
 * decides everything Classic-specific through these hooks. Mode state lives
 * in `state.mode`, typed by `M`.
 */
export interface GameModeRules<M = unknown> {
  readonly id: string;
  readonly towers: Readonly<Record<string, TowerSpec>>;
  readonly creeps: Readonly<Record<string, CreepSpec>>;
  readonly damageTable: DamageTable;
  /** WC3's armor constant, 0.06 by default. */
  readonly armorFactor?: number;
  /** Creep HP multiplier per Difficulty; DEFAULT_DIFFICULTY_HP otherwise. */
  readonly difficultyHp?: Readonly<Record<Difficulty, number>>;
  /** Fixed Waves. Setup may change `state.wave.total`, e.g. when it uses waveFor. */
  readonly waves?: readonly WaveSpec[];
  /** Lets startWave run while another Wave is still on the Map (early calls, timed Waves). */
  readonly overlapWaves?: boolean;

  /** Wave `index` (0-based) when Waves depend on the Run; `waves[index]` otherwise. */
  waveFor?(index: number, state: GameState<M>): WaveSpec | undefined;
  /** Builds the Run: must call setMap, and sets gold, lives, `state.mode` and any starting structures. */
  setup(state: GameState<M>, opts: RunOptions): void;
  /** Handles a mode command. Returns false for a type it doesn't know, which the core rejects. */
  handleCommand?(state: GameState<M>, command: Command, events: SimEvent[]): boolean;
  /** A reason to refuse startWave right now, or null. */
  canStartWave?(state: GameState<M>): string | null;
  /** Runs every tick after the commands, before creeps and towers move. */
  onTick?(state: GameState<M>, events: SimEvent[]): void;
  onWaveStart?(state: GameState<M>, wave: number, events: SimEvent[]): void;
  /** Runs before the core decides between the next build phase and a win. */
  onWaveEnd?(state: GameState<M>, wave: number, events: SimEvent[]): void;
  /** After a creep is put on the Map, by a Wave or by the mode itself. */
  onSpawn?(state: GameState<M>, creep: Creep, events: SimEvent[]): void;
  /**
   * The creep a ready tower attacks, or null to stay idle. `range` is its
   * attack range with bonuses. Default: keep the current target while it lives
   * and stays in range, otherwise the closest creep.
   */
  towerTarget?(state: GameState<M>, tower: Tower, range: number): Creep | null;
  /** Seconds between this tower's attacks before attack-speed bonuses; the spec's cooldown by default. */
  towerCooldown?(state: GameState<M>, tower: Tower): number | null;
  /**
   * Bonuses the Game Mode adds on top of a tower's statuses when it attacks,
   * such as the Original's Tower Levels and Talents; null for none.
   */
  towerBonus?(state: GameState<M>, tower: Tower): Readonly<TowerMods> | null;
  /** After the bounty is paid. `tower` is the killer's id, 0 for none. */
  onKill?(state: GameState<M>, creep: Creep, tower: number, events: SimEvent[]): void;
  /** Default: lose the spec's leakCost (1) and remove the creep. */
  onLeak?(state: GameState<M>, creep: Creep, events: SimEvent[]): LeakOutcome;
}
