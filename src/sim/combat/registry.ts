import type { Sim } from '../core/mode';
import type { AttackSpec, EffectSpec, TowerSpec } from '../core/specs';
import type { Creep, Status, Tower } from '../core/state';

// The effect extension point. Each effect kind is one handler; a tower's attack
// effects, its auras and the statuses they leave behind all resolve by `kind`.
// A Game Mode adds a kind by calling registerEffect before registerMode.

/** One attack about to launch. Multishot adds targets here. */
export interface Attack {
  readonly tower: Tower;
  readonly spec: TowerSpec;
  readonly attack: AttackSpec;
  /** Effective range this attack, bonuses included. */
  readonly range: number;
  readonly targets: Creep[];
}

/** One projectile or instant hit about to launch. Crit scales it here. */
export interface Shot {
  readonly tower: Tower;
  readonly attack: AttackSpec;
  readonly target: Creep;
  damage: number;
  crit: number;
}

/** Where a shot lands. `target` is null when its creep died in flight: then only area effects apply. */
export interface Impact {
  /** Id of the tower that fired; it may be gone by now. */
  readonly tower: number;
  readonly attack: AttackSpec;
  readonly target: Creep | null;
  readonly x: number;
  readonly y: number;
  /** Before the damage table and armor. */
  readonly damage: number;
  readonly crit: number;
}

/** A creep's stats this tick, summed from its strongest status per key. */
export interface CreepMods {
  /** Move-speed fraction removed (negative is a haste). */
  slow: number;
  /** Added to the spec's armor. */
  armor: number;
  stunned: boolean;
  /** Extra fraction of all damage it takes (Gem's Dark Emerald stun: 0.2). */
  damageTaken: number;
}

export interface TowerMods {
  /** Cooldown is divided by (1 + attackSpeed). */
  attackSpeed: number;
  /** Damage is multiplied by (1 + damage). */
  damage: number;
  /** World units added to range. */
  range: number;
}

export interface EffectHandler<E extends EffectSpec = EffectSpec> {
  readonly kind: string;
  /** Checked at registerMode: a problem with this effect's numbers, or null. */
  validate?(effect: E): string | null;
  /** Once per attack, before anything launches. */
  onAttack?(effect: E, attack: Attack, sim: Sim): void;
  /** Once per projectile or instant hit, at launch. */
  onLaunch?(effect: E, shot: Shot, sim: Sim): void;
  /** Once per landing, after the target took the hit. */
  onImpact?(effect: E, impact: Impact, sim: Sim): void;
  /** Every tick for the strongest creep status of this kind per key (e.g. poison). */
  tickCreep?(status: Status, creep: Creep, sim: Sim): void;
  /** Adds the strongest creep status of this kind per key to the creep's stats. */
  creepMods?(status: Status, mods: CreepMods): void;
  /** Adds the strongest tower status of this kind per key to the tower's stats. */
  towerMods?(status: Status, mods: TowerMods): void;
}

const handlers = new Map<string, EffectHandler>();

export function registerEffect<E extends EffectSpec>(handler: EffectHandler<E>): void {
  handlers.set(handler.kind, handler as unknown as EffectHandler);
}

export function effectHandler(kind: string): EffectHandler | undefined {
  return handlers.get(kind);
}
