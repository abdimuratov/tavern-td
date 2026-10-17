import type { EffectSpec, TowerSpec } from '../../sim';

// Shapes of Gem's content. Tower specs are core TowerSpecs plus a `gem` block the
// Gem Game Mode reads: what the structure is, and abilities the core tick doesn't
// run (Barrage, burns, mana, auras that grow with kills).

export const GEM_TYPES = ['amethyst', 'aquamarine', 'diamond', 'emerald', 'opal', 'ruby', 'sapphire', 'topaz'] as const;
export type GemType = (typeof GEM_TYPES)[number];

/** Lowest to highest. A Draft never rolls Great; only merging makes one. */
export const QUALITIES = ['chipped', 'flawed', 'normal', 'flawless', 'perfect', 'great'] as const;
export type Quality = (typeof QUALITIES)[number];

export type GemStructure = 'gem' | 'special' | 'stone' | 'slate' | 'rock';

/**
 * WC3 Barrage: on its own cooldown it hits up to `targets` enemies in `radius`,
 * apart from the attack. assumed (engine-defined): the nearest enemies, hit at
 * once, with the tower's attack type against armor and no damage bonuses.
 */
export interface BarrageSpec {
  readonly damage: number;
  /** 0 hits every enemy in the radius. */
  readonly targets: number;
  readonly radius: number;
  /** Seconds. */
  readonly cooldown: number;
  /** Impact effects each Barrage hit applies (Fire Star's mark). */
  readonly onHit?: readonly EffectSpec[];
}

/**
 * Gem TD+'s immolation: spell damage to every enemy in `radius`, air and ground,
 * +10% per 10 kills of its tower up to +100%.
 */
export interface BurnSpec {
  /** Damage per second before the kill bonus. */
  readonly dps: number;
  readonly radius: number;
}

/** A tower aura whose strength follows the tower's Kill Step (Viper Slate). */
export interface KillAuraSpec {
  readonly kind: 'damage' | 'attackSpeed';
  readonly radius: number;
  /** Value at Kill Step 1…11. */
  readonly byKillStep: readonly number[];
  readonly key: string;
}

export interface GemInfo {
  readonly kind: GemStructure;
  readonly type?: GemType;
  readonly quality?: Quality;
  /** Special or slate line it belongs to, e.g. `malachite` or `hold`. */
  readonly family?: string;
  /** 1-based tier within a special's line. */
  readonly tier?: number;
  /** Spec id of the next tier, for upgrades. */
  readonly next?: string;
  readonly barrage?: BarrageSpec;
  readonly burn?: BurnSpec;
  /** Mana for abilities that cost it. assumed: towers start full. */
  readonly mana?: { readonly max: number; readonly regen: number };
  readonly killAura?: KillAuraSpec;
}

export interface GemTowerSpec extends TowerSpec {
  readonly gem: GemInfo;
}

/** A Recipe: these gems, kept or in one Draft, fuse into the first tier of `tiers`. */
export interface SpecialLine {
  readonly id: string;
  readonly name: string;
  /** Gem spec ids. No gem is part of two Recipes. */
  readonly parts: readonly string[];
  /** Tower spec ids, tier 1 first. */
  readonly tiers: readonly string[];
}

/** A base slate: a Normal gem kept as a slate when its Draft also holds one of the listed Flawed gems. */
export interface BaseSlate {
  readonly id: string;
  /** Gem spec id of the Normal gem that becomes the slate. */
  readonly normal: string;
  /** Gem spec ids; any one is enough. Order matters to Extra Chance. */
  readonly flawed: readonly string[];
  /** The base slate it combines with. */
  readonly partner: string;
  /** The combination slate the pair makes. */
  readonly combo: string;
}

// Gem's own effect kinds (registered by src/sim/modes/gem). Declared as type
// aliases so they fit the core's EffectSpec. "Spell damage" below means Gem TD+'s
// spell damage: the Spells row of the damage table, ignoring the armor value.

/**
 * Emerald and Jade poison (WC3 Poison Sting): spell damage per second plus a
 * move slow. assumed: one poison per creep, the strongest (Aspo's stacking flag 9
 * is engine-defined; Gem TD+ applies same-named debuffs once).
 */
export type GemPoisonEffect = { readonly kind: 'gem.poison'; readonly dps: number; readonly duration: number; readonly slow: number };

/**
 * WC3 Frost Attack: a move slow on the target, or on every creep in `radius` of
 * the impact (artillery frost slows everything the splash hit). Heroes get `heroDuration`.
 */
export type GemFrostEffect = {
  readonly kind: 'gem.frost';
  readonly amount: number;
  readonly duration: number;
  readonly heroDuration: number;
  readonly radius?: number;
  readonly targets?: 'ground' | 'air' | 'both';
};

/**
 * WC3 bounce missile: one target, plus one more per tower of `family` you own,
 * each within `radius` of the last, at full damage. assumed: the bounces land at once.
 */
export type GemBounceEffect = { readonly kind: 'gem.bounce'; readonly radius: number; readonly family: string };

/** Dark Emerald: a chance to stun an unstunned target; while stunned it takes `damageTaken` more from everything, this hit included. */
export type GemStunHitEffect = { readonly kind: 'gem.stunHit'; readonly chance: number; readonly duration: number; readonly damageTaken: number };

/** Paraiba Tourmaline's Frost Nova: per hit, a chance (for mana) of spell damage to the target plus an area, and a slow. */
export type GemNovaEffect = {
  readonly kind: 'gem.nova';
  readonly chance: number;
  readonly mana: number;
  readonly targetDamage: number;
  readonly areaDamage: number;
  readonly radius: number;
  readonly slow: number;
  readonly slowDuration: number;
};

/** Blood Stone's Blood Lightning: per hit, `chance` + `chancePerExtra` per extra tower of `family` you own, for mana. */
export type GemLightningEffect = {
  readonly kind: 'gem.lightning';
  readonly chance: number;
  readonly chancePerExtra: number;
  readonly family: string;
  readonly mana: number;
  /** Damage per target at Kill Step 1…11. */
  readonly byKillStep: readonly number[];
  readonly maxTargets: number;
  readonly range: number;
};

/** Lucky China Jade: per hit, one roll of 1–100: 1 pays ⌊Wave / 2⌋ gold, 2 stuns. */
export type GemLuckyEffect = { readonly kind: 'gem.lucky'; readonly goldChance: number; readonly stunChance: number; readonly stunDuration: number };

/** Fire Star's mark: the target burns itself and enemies within `radius`, refreshed by later hits; each Fire Star marks separately. */
export type GemFireMarkEffect = { readonly kind: 'gem.fireMark'; readonly dps: number; readonly radius: number; readonly duration: number };

/**
 * Hold and Ancient Slate: the attack itself is interrupted; an unstunned target
 * is stunned, takes `damage` + `perKill` × kills of `attackType` damage, nearby
 * towers are ordered onto it, and the slate is disarmed.
 */
export type GemGrabEffect = {
  readonly kind: 'gem.grab';
  /** Seconds, rolled uniformly between the two. */
  readonly stun: readonly [min: number, max: number];
  readonly damage: number;
  readonly perKill: number;
  readonly attackType: string;
  readonly disarm: number;
  readonly taunt: number;
  /** Armor removed for the stun: base + perOwned × (slates of `family` you own), by layer. */
  readonly armor?: { readonly family: string; readonly ground: readonly [number, number]; readonly air: readonly [number, number] };
};

/** Damage Slate: each attack also strikes for `damage` + `perKill` × kills, then the slate is disarmed. */
export type GemStrikeEffect = { readonly kind: 'gem.strike'; readonly damage: number; readonly perKill: number; readonly attackType: string; readonly disarm: number };

/** Poison Slate's Shadow Strike, for mana; without mana the attack is cancelled. */
export type GemShadowStrikeEffect = {
  readonly kind: 'gem.shadowStrike';
  readonly mana: number;
  /** Up-front and per-tick spell damage at Kill Step 1…11. */
  readonly byKillStep: readonly number[];
  readonly durationByKillStep: readonly number[];
  readonly slow: number;
  /** Seconds between ticks. */
  readonly interval: number;
};

export type GemSpell =
  /** Every enemy within the radius; the total is capped, split evenly. */
  | { readonly spell: 'fanOfKnives'; readonly damage: readonly number[]; readonly radius: readonly number[]; readonly maxTotal: number }
  /** The target and the nearest other enemies within `range` of the slate. */
  | { readonly spell: 'forkedLightning'; readonly damage: readonly number[]; readonly maxTargets: number; readonly range: number }
  /** Ground enemies along a line toward the target; the total is capped. */
  | { readonly spell: 'carrionSwarm'; readonly damage: number; readonly maxTotal: number; readonly distance: number; readonly width: number }
  | { readonly spell: 'thunderClap'; readonly damage: readonly number[]; readonly radius: readonly number[]; readonly slow: number; readonly slowDuration: number }
  | { readonly spell: 'armor'; readonly amount: number; readonly duration: number };

/**
 * Spell and Elder Slate: on each attack (`attack`) or landed hit (`impact`), a
 * chance to cast one spell picked uniformly. Per-step arrays follow the
 * Kill Step; a one-element array is a fixed value.
 */
export type GemSpellsEffect = { readonly kind: 'gem.spells'; readonly on: 'attack' | 'impact'; readonly chance: number; readonly mana: number; readonly spells: readonly GemSpell[] };

/**
 * Wraith Slate's Incinerate: hit k within `duration` deals +k × perStack; a
 * creep that dies burning explodes. assumed: Wraith Slates share one stack count.
 */
export type GemIncinerateEffect = {
  readonly kind: 'gem.incinerate';
  readonly perStack: number;
  readonly duration: number;
  readonly explosion: { readonly full: number; readonly fullRadius: number; readonly half: number; readonly halfRadius: number; readonly delay: number };
};

/** Slow Slate: sets the target's base speed to `factor` × its default, for good; it doesn't stack. */
export type GemPermaSlowEffect = { readonly kind: 'gem.permaSlow'; readonly factor: number };

/** Ancient Blood Stone: a crit whose multiplier follows the Kill Step 1…11. */
export type GemKillCritEffect = { readonly kind: 'gem.killCrit'; readonly chance: number; readonly byKillStep: readonly number[] };
