import type { CreepSpec, Difficulty, TowerSpec } from '../../sim';

// Shapes of Element's content (docs/research/element-td-rules.md). Tower specs
// are core TowerSpecs plus an `element` block the Element Game Mode reads; each
// attacking tower carries one effect kind for its family that lands its hits
// (registered in src/sim/modes/element/effects.ts). Names are ours; spec ids
// keep the port's unit names so every number can be traced to the source.

export const ELEMENTS = ['water', 'fire', 'nature', 'earth', 'light', 'dark'] as const;
export type Element = (typeof ELEMENTS)[number];
/** A tower's damage type or a creep's armour: an Element, or Composite. */
export type DamageElement = Element | 'composite';

export type TowerKind = 'basic' | 'elementalBasic' | 'single' | 'pure' | 'dual' | 'triple' | 'periodic';

/** How a tower picks its target (the port's targeting modes; the player can't change them here). */
export type TargetMode = 'closest' | 'farthest' | 'lowestHp' | 'highestHp';

/** The port's four slow families; only the strongest of a family counts, different families multiply. */
export type SlowFamily = 'tornado' | 'explode' | 'gaia' | 'sludge';

export type Trait = 'fast' | 'heal' | 'mechanical' | 'undead' | 'regen' | 'bulky' | 'vengeance' | 'time_lapse';

/** Abilities that don't ride on an attack: support casts, autocasts, pulses and tornadoes. */
export type TowerAbility =
  /** Blacksmith-style: +`value` base damage (and ability damage) on one tower in range. */
  | { readonly kind: 'fireUp'; readonly value: number; readonly duration: number; readonly cooldown: number; readonly range: number }
  /** Well-style: +`value` attack speed on one tower in range. */
  | { readonly kind: 'springForward'; readonly value: number; readonly duration: number; readonly cooldown: number; readonly range: number }
  /** Trickery-style: a temporary copy of a tower in range on the nearest free spot. */
  | {
    readonly kind: 'conjure'; readonly duration: number; readonly cooldown: number; readonly range: number;
    readonly lock: number; readonly spot: number; readonly anyTower: boolean;
  }
  /** Marks the highest-HP unmarked creep: damage to it is amplified by `base`% or, with few creeps around, `max`%. */
  | {
    readonly kind: 'faerieFire'; readonly base: number; readonly max: number; readonly crowd: number; readonly crowdMax: number;
    readonly duration: number; readonly cooldown: number; readonly range: number;
  }
  /** Removes `pct`% of current HP from the highest-HP unmarked creep, returned after `duration` if it lives. */
  | { readonly kind: 'frostbite'; readonly pct: number; readonly duration: number; readonly cooldown: number; readonly range: number }
  /** For `duration`, each attack also fires at every other creep within `radius` of the target for `pct` of the attack. */
  | { readonly kind: 'magicAttack'; readonly duration: number; readonly cooldown: number; readonly radius: number; readonly pct: number }
  /** No attack: when ready, every creep within `radius` takes `base` + `perCreep` × their number. */
  | { readonly kind: 'pulse'; readonly base: number; readonly perCreep: number; readonly radius: number; readonly cooldown: number }
  /** No attack: every `cooldown` a tornado chases the closest creep, hitting and slowing everything near it. */
  | {
    readonly kind: 'tornado'; readonly damage: number; readonly radius: number; readonly duration: number; readonly speed: number;
    readonly slow: number; readonly range: number; readonly cooldown: number;
  };

export interface ElementTowerInfo {
  readonly kind: TowerKind;
  /** The port's script class: which rules it runs. Kill counts carry over an upgrade within one family. */
  readonly family: string;
  /** 1–3, or 4 for a Pure tower. */
  readonly level: number;
  readonly elements: readonly Element[];
  /** What its damage counts as against a creep's armour. */
  readonly damage: DamageElement;
  /** Gold paid for this tower and every step below it: what selling refunds a share of. */
  readonly totalCost: number;
  /** Pure Essence it costs (and returns when sold). */
  readonly essence: number;
  /** Element levels needed to build or upgrade into it. */
  readonly requires: Readonly<Partial<Record<Element, number>>>;
  /** Spec ids it can be upgraded into. */
  readonly upgrades: readonly string[];
  /** Seconds it builds (or rebuilds after an upgrade) before it attacks. */
  readonly buildTime: number;
  /** Arrow, Cannon and the three support duals: never buffed or copied. */
  readonly support: boolean;
  /** Support towers buff or copy the lowest first; null for support towers. */
  readonly buffPriority: number | null;
  readonly target: TargetMode;
  /** Keeps attacking its target while it lives and stays in range, instead of re-picking every attack. */
  readonly keepTarget: boolean;
  /** The port's attack range, without the 50-unit hull a creep counts as in range at. */
  readonly range: number;
  readonly baseDamage: number;
  readonly cooldown: number;
  /** World units per second; 0 for instant or none. */
  readonly projectileSpeed: number;
  /** Split splash radii: 100% within `full`, 50% out to `half`. */
  readonly splash: { readonly full: number; readonly half: number } | null;
  readonly ability?: TowerAbility;
}

export interface ElementTowerSpec extends TowerSpec {
  readonly element: ElementTowerInfo;
}

export interface ElementCreepSpec extends CreepSpec {
  readonly armorType: DamageElement;
  readonly trait: Trait | null;
  /** The endless boss. */
  readonly boss?: boolean;
  /** An Elemental: killing it raises `element` to `level`. */
  readonly elemental?: { readonly element: Element; readonly level: number };
  /** The port's unit, for tracing. */
  readonly unit: string;
}

/** One of the fixed Waves, Normal-to-Insane numbers per Difficulty. */
export interface ElementWave {
  readonly wave: number;
  /** Creep spec id. */
  readonly creep: string;
  readonly unit: string;
  readonly element: DamageElement;
  readonly trait: Trait | null;
  /** HP per creep before Difficulty and bulky (the port's WAVE_HEALTH). */
  readonly hpBase: number;
  /** HP per creep spawned, Difficulty and bulky included. */
  readonly hp: Readonly<Record<Difficulty, number>>;
  readonly count: number;
  /** Seconds between spawns. */
  readonly interval: number;
  readonly bounty: Readonly<Record<Difficulty, number>>;
  /** Seconds of break before this Wave. */
  readonly breakBefore: Readonly<Record<Difficulty, number>>;
  /** A Lumber (and, in All Random, a draw) arrives at the start of the break before it. */
  readonly lumber: boolean;
  /** A free Pure Essence arrives at the start of the break before it. */
  readonly essence: boolean;
}

// Effect kinds (registered by src/sim/modes/element/effects.ts). One per tower
// family; each lands the family's hit and runs its on-hit ability. `full` and
// `half` are split-splash radii.

export type SplashRadii = { readonly full: number; readonly half: number };

/** Arrow, Cannon and plain single-target attacks. `ground`: an artillery shell aimed where the target stood. */
export type BasicHit = { readonly kind: 'element.basic'; readonly mode: 'single' | 'splash' | 'ground'; readonly full?: number; readonly half?: number };
/** Excess damage of a kill flies to a random creep within `radius` of the dead one as pure damage. */
export type DarkHit = { readonly kind: 'element.dark'; readonly radius: number; readonly speed: number };
/** The splash repeats `delay` s later at the same spot for `pct` of the hit. */
export type EarthHit = SplashRadii & { readonly kind: 'element.earth'; readonly pct: number; readonly delay: number };
/** Splash radii grow by `grow` (half) and `grow`/2 (full) per consecutive hit on one creep. */
export type FireHit = SplashRadii & { readonly kind: 'element.fire'; readonly grow: number };
/** Each consecutive hit on one creep adds `bonus` base damage. */
export type LightHit = { readonly kind: 'element.light'; readonly bonus: number };
/** +`per` damage for each other creep within `radius` of the target. */
export type NatureHit = { readonly kind: 'element.nature'; readonly radius: number; readonly per: number };
/** After the splash, one bounce to a random creep within `range` of the target for `pct` of the attack. */
export type WaterHit = SplashRadii & { readonly kind: 'element.water'; readonly range: number; readonly pct: number; readonly speed: number };
/** Fires up to `count` element shots of `damage` per attack, cycling the Elements. */
export type PeriodicHit = { readonly kind: 'element.periodic'; readonly damage: number; readonly count: number; readonly speed: number; readonly range: number };
/** Damage grows as the target's HP falls. */
export type DiseaseHit = { readonly kind: 'element.disease' };
/** Chain lightning at launch: `damage`, then up to `jumps` bounces ×`grow` each, every `every` s. */
export type ElectricityHit = {
  readonly kind: 'element.electricity'; readonly damage: number; readonly grow: number; readonly radius: number;
  readonly shrink: number; readonly jumps: number; readonly every: number;
};
/** Burns everything within `radius` of the target now and every second for `duration` s, stacking. */
export type FlameHit = { readonly kind: 'element.flame'; readonly burn: number; readonly radius: number; readonly duration: number };
/** Artillery: five blasts of `damage` within `radius`, at the spot and `offset` away on each axis. */
export type GunpowderHit = { readonly kind: 'element.gunpowder'; readonly damage: number; readonly radius: number; readonly offset: number };
/** A kill by its own hit explodes for `damage` within `radius`. */
export type HydroHit = { readonly kind: 'element.hydro'; readonly damage: number; readonly radius: number };
/** Stuns the target `stun` s unless an Ice-type stun hit it within `lockout` s. */
export type IceHit = SplashRadii & { readonly kind: 'element.ice'; readonly stun: number; readonly lockout: number };
/** Kills add `points`; every `perLife` points give a life up to `maxLives`. +`bonus` damage at `bonusAt` lives or fewer. */
export type LifeHit = {
  readonly kind: 'element.life'; readonly points: number; readonly perLife: number; readonly maxLives: number;
  readonly bonus: number; readonly bonusAt: number;
};
/** Each attack costs `perStack` range, up to `max` stacks, cleared after `reset` s without attacking. */
export type MagicHit = SplashRadii & { readonly kind: 'element.magic'; readonly perStack: number; readonly max: number; readonly reset: number };
/** Splash scaled by each creep's remaining HP fraction. */
export type MossHit = SplashRadii & { readonly kind: 'element.moss' };
/** Every creep within `full` gets a new poison: `perTick` every `every` s for `duration` s. */
export type PoisonHit = SplashRadii & { readonly kind: 'element.poison'; readonly perTick: number; readonly every: number; readonly duration: number };
/** Same target again: damage ×`factor` per stack up to `max`; a new target halves the stacks. */
export type QuarkHit = SplashRadii & { readonly kind: 'element.quark'; readonly factor: number; readonly max: number };
/** Plain splash; the tower's Faerie Fire is its `ability`. */
export type EnchantmentHit = SplashRadii & { readonly kind: 'element.enchantment' };
/** −`per` base damage a second while firing, down to `maxStacks` stacks, then back to full. */
export type EphemeralHit = { readonly kind: 'element.ephemeral'; readonly per: number; readonly maxStacks: number; readonly reset: number };
/** Acid on the target and, by extra shots, every creep within `radius` of it. */
export type ErosionHit = { readonly kind: 'element.erosion'; readonly radius: number; readonly speed: number } & AcidValues;
export type AcidValues = { readonly amp: number; readonly dot: number; readonly duration: number; readonly every: number };
/** Napalm: each hit adds `napalm` to every creep within the half radius; when it lapses or the creep dies, everything within `radius` takes the total. */
export type FlamethrowerHit = SplashRadii & { readonly kind: 'element.flamethrower'; readonly napalm: number; readonly radius: number; readonly duration: number };
/** The impact point floods for `hits` hits, one per second, of `damage` within `radius`. */
export type FloodingHit = { readonly kind: 'element.flooding'; readonly damage: number; readonly radius: number; readonly hits: number };
/** Kills pay `pct`% more bounty. */
export type GoldHit = { readonly kind: 'element.gold'; readonly pct: number };
/** `chance` of ×`multiplier`; every `every` attacks, a shot at every other creep within `radius` of the tower. */
export type HailHit = { readonly kind: 'element.hail'; readonly chance: number; readonly multiplier: number; readonly every: number; readonly radius: number };
/** Each attack takes `step` s off its attack time, up to `max` stacks, reset after `reset` s idle. */
export type HasteHit = { readonly kind: 'element.haste'; readonly step: number; readonly max: number; readonly reset: number };
/** Damage = distance / 1000 × `multiplier`. */
export type ImpulseHit = { readonly kind: 'element.impulse'; readonly multiplier: number };
/** Marks creeps within `radius`: every `every` s they take `pct`% of the HP lost since. */
export type JinxHit = { readonly kind: 'element.jinx'; readonly pct: number; readonly radius: number; readonly every: number; readonly ticks: number };
/** Instant; −`per` per other creep within `radius` of the target, at most −`cap`. */
export type LaserHit = { readonly kind: 'element.laser'; readonly radius: number; readonly per: number; readonly cap: number };
/** Splash, plus the sludge slow on every creep within `radius` of the target. */
export type MuckHit = SplashRadii & { readonly kind: 'element.muck'; readonly slow: number; readonly radius: number; readonly duration: number };
/** No projectile: every attack hits every creep within `radius` of the tower and slows those within `slowRadius`. */
export type NovaHit = {
  readonly kind: 'element.nova'; readonly damage: number; readonly radius: number; readonly slowRadius: number;
  readonly slow: number; readonly duration: number;
};
/** Full damage within `base` + `per` × distance of the impact. */
export type ObliterationHit = { readonly kind: 'element.obliteration'; readonly base: number; readonly per: number };
/** Plain splash; the tower's Frostbite is its `ability`. */
export type PolarHit = SplashRadii & { readonly kind: 'element.polar' };
/** Every `every`th attack hits every creep within `radius` of the tower for `damage` + `pct`% of its HP. */
export type QuakeHit = { readonly kind: 'element.quake'; readonly damage: number; readonly pct: number; readonly radius: number; readonly every: number };
/** A line of `count` circles of `radius` toward the target: slow plus a stacking `dps` DoT. */
export type RootsHit = {
  readonly kind: 'element.roots'; readonly dps: number; readonly slow: number; readonly radius: number; readonly first: number;
  readonly step: number; readonly count: number; readonly duration: number;
};
/** Plain splash; the tower's magic attack is its `ability`. */
export type RunicHit = SplashRadii & { readonly kind: 'element.runic' };
/** Each hit within `reset` s shrinks the splash and adds `bonus` damage, up to `max` stacks. */
export type TidalHit = SplashRadii & {
  readonly kind: 'element.tidal'; readonly bonus: number; readonly shrinkHalf: number; readonly shrinkFull: number;
  readonly max: number; readonly reset: number;
};
/** Secondary shots: Periodic element shots, overkill bolts, bounces, storm and magic-attack shots. */
export type ShotHit = { readonly kind: 'element.shot'; readonly mode: 'single' | 'pure' | 'splash' | 'area'; readonly full?: number; readonly half?: number; readonly radius?: number };
/** Erosion's extra shots: acid only. */
export type AcidShot = { readonly kind: 'element.acid' } & AcidValues;
