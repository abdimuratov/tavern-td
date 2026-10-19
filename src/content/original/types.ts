import type { CreepSpec, MapSpec, ScenerySpec, TowerSpec } from '../../sim';

// Shapes of the Original's content (docs/original-design.md). Tower and creep
// specs are core specs plus an `original` block the Original Game Mode reads.
// Numbers marked "assumed" fill gaps the design doc leaves open.

export const FAMILIES = ['arrow', 'cannon', 'frost', 'arcane', 'poison', 'totem'] as const;
/** A Tower Family. */
export type Family = (typeof FAMILIES)[number];

export const DAMAGE_TYPES = ['pierce', 'siege', 'magic', 'poison'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const ARMOR_TYPES = ['unarmored', 'armored', 'warded', 'boss'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

/** How an attacking tower picks its target; the player changes it freely. */
export const TARGETINGS = ['first', 'last', 'strong', 'close'] as const;
export type Targeting = (typeof TARGETINGS)[number];

/** Auras a tower gives out. Tower bonuses are fractions (+0.15 attack speed); creep ones are armor points and slow fractions. */
export interface OriginalAuras {
  readonly attackSpeed?: number;
  readonly damage?: number;
  readonly range?: number;
  /** Armor removed from creeps in reach. */
  readonly armor?: number;
  /** Move speed removed from creeps in reach. */
  readonly slow?: number;
  /** World units; the tower's attack range when absent (Blizzard Spire). */
  readonly radius?: number;
}

/** What a tower is in the Original, beyond the core's attack. */
export interface OriginalTowerInfo {
  readonly family: Family;
  /** 1–3 for the Tiers, 4 for a Specialisation. */
  readonly tier: 1 | 2 | 3 | 4;
  /** Gold this step costs: the build price at Tier 1, the upgrade price after. */
  readonly price: number;
  /** Gold for this tower and every step below it (the doc's Total). */
  readonly total: number;
  /** What it can become: the next Tier, the two Specialisations at Tier 3, nothing after. */
  readonly next: readonly string[];
  /** Null for a Totem that doesn't attack. */
  readonly damageType: DamageType | null;
  /** The targeting a new tower starts with. */
  readonly targeting: Targeting;
  /** Keeps its target while it lives and stays in range, instead of re-picking every attack. */
  readonly sticky?: boolean;
  /** Can't fire at creeps this close (world units). */
  readonly minRange?: number;
  /** Full damage within `full` of the impact, half within `half`. */
  readonly splash?: { readonly full: number; readonly half: number };
  readonly slow?: { readonly amount: number; readonly duration: number };
  /** A share of hits freeze the creep in place. */
  readonly freeze?: { readonly chance: number; readonly duration: number };
  /** A poison that refreshes rather than stacks. */
  readonly poison?: { readonly dps: number; readonly duration: number };
  /** Each hit adds a stack of poison, up to `max` on a creep. */
  readonly stacks?: { readonly dps: number; readonly duration: number; readonly max: number };
  /** The hit jumps on to `jumps` more creeps within `radius`, losing `falloff` of its damage each jump. */
  readonly bounce?: { readonly jumps: number; readonly falloff: number; readonly radius: number };
  /** A beam: +`ramp` damage for each second on the same creep, up to ×`max`. */
  readonly beam?: { readonly ramp: number; readonly max: number };
  /** Lobs a cloud that poisons every creep inside. */
  readonly cloud?: { readonly radius: number; readonly duration: number; readonly dps: number };
  /** Each attack hits every creep in range. */
  readonly nova?: boolean;
  /** Arrows (or bolts) per attack, each at a different creep. */
  readonly multishot?: number;
  readonly crit?: { readonly chance: number; readonly multiplier: number };
  /** Hits Armored creeps as if they were Unarmored. */
  readonly ignoresArmored?: boolean;
  readonly auras?: OriginalAuras;
}

export interface OriginalTowerSpec extends TowerSpec {
  readonly original: OriginalTowerInfo;
}

/** A boss's own behaviour. */
export type BossInfo =
  /** Below `at` of its max HP, once: speeds up by `haste` for `duration` s. */
  | { readonly kind: 'enrage'; readonly at: number; readonly haste: number; readonly duration: number }
  /** Every `every` s, drops `count` of `creep` just behind it. */
  | { readonly kind: 'brood'; readonly every: number; readonly creep: string; readonly count: number }
  /**
   * Crossing each share of max HP in `at`: a Shield of `shield` × a Ghoul's HP
   * at the Wave's Threat for `duration` s, and `count` of `creep` called to its side.
   */
  | {
    readonly kind: 'rift'; readonly at: readonly number[]; readonly shield: number; readonly duration: number;
    readonly creep: string; readonly count: number;
  };

export interface OriginalCreepInfo {
  readonly role: string;
  /** HP as a multiple of a Ghoul's at the Wave's Threat. */
  readonly hpMult: number;
  /** How many make up a Wave of only this creep, and the seconds between them. */
  readonly perWave: number;
  readonly gap: number;
  /** Lives its leak costs. */
  readonly lives: number;
  /** XP its killer earns. */
  readonly xp: number;
  /** Share of max HP regained per second. */
  readonly regen?: number;
  /** A Shield: a flat block per hit of this share of a Ghoul's HP at the Wave's Threat. */
  readonly shield?: number;
  /** When it dies, these burst out where it fell. Creeps a creep drops pay no bounty. */
  readonly split?: { readonly creep: string; readonly count: number };
  readonly boss?: BossInfo;
}

export interface OriginalCreepSpec extends CreepSpec {
  readonly armorType: ArmorType;
  readonly original: OriginalCreepInfo;
}

/** One group of a Wave. */
export interface OriginalGroup {
  readonly creep: string;
  readonly count: number;
  /** Which of the Map's routes it walks, and whose air line it flies; 0 by default. */
  readonly route?: number;
  /** Seconds between spawns; the creep's own gap by default. */
  readonly gap?: number;
  /**
   * Seconds after the Wave starts that its first creep spawns. By default it
   * follows the group before: one of that group's gaps after its last spawn.
   */
  readonly at?: number;
}

export interface OriginalWave {
  readonly groups: readonly OriginalGroup[];
}

export type Region = 'ashfield' | 'blightfen' | 'rift';

/** One Stage of the Campaign: its Map (routes, air lines, Scenery) and its Waves. */
export interface StageSpec {
  /** 1–12, the Campaign order. */
  readonly number: number;
  readonly id: string;
  readonly name: string;
  readonly region: Region;
  /** The one line shown on the Stage-select screen. */
  readonly line: string;
  readonly map: MapSpec;
  /** Threat of Wave 1; Wave w has Threat `threat + w − 1`. */
  readonly threat: number;
  readonly gold: number;
  readonly waves: readonly OriginalWave[];
}

/**
 * What a Challenge changes about its Stage's Run (docs/original-design.md §16).
 * Every field is optional: what a Challenge leaves out plays as the Stage does.
 */
export interface ChallengeModifiers {
  /** The only Tower Families that may be built, of those the Campaign has opened. */
  readonly families?: readonly Family[];
  /**
   * Burnt ground: Open ground the Challenge takes away, painted over at setup
   * and added to the Map's Scenery as `burnt`. Road and the Stage's own Scenery stay as they are.
   */
  readonly burnt?: Omit<ScenerySpec, 'kind'>;
  /** The Tower cap: the most towers that may stand at once. Standing towers stay; selling one frees room. */
  readonly maxTowers?: number;
  /** Lives at the start, instead of 20. */
  readonly lives?: number;
  /** Starting gold, instead of the Stage's. */
  readonly gold?: number;
  /** Creep HP times this, on top of Difficulty; Shields and dropped creeps scale with it. */
  readonly hp?: number;
  /** Send now still ends a Break, but pays no early-call gold. */
  readonly noEarlyCall?: boolean;
  /** Seconds of each Break, instead of 30. */
  readonly breakSeconds?: number;
  /** Towers stop at Tier 2, though the Campaign has opened Tier 3. */
  readonly maxTier?: 2;
  /** No tower may take a Specialisation. */
  readonly noSpecialisations?: boolean;
}

/** A Challenge: a Stage played again under its own named rule, for extra Stars (§16). */
export interface ChallengeSpec {
  /** The Stage it is played on, 1–12; each Stage has one Challenge. */
  readonly stage: number;
  readonly id: string;
  readonly name: string;
  /** The rule in one line, for the Stage panel. */
  readonly rule: string;
  readonly modifiers: ChallengeModifiers;
  /** Stars its first win pays; it pays them once. */
  readonly stars: number;
}

/** What a Talent does. Family-wide numbers are fractions unless named otherwise. */
export type TalentEffect =
  | { readonly kind: 'damage'; readonly value: number }
  | { readonly kind: 'range'; readonly value: number }
  | { readonly kind: 'attackSpeed'; readonly value: number }
  /** Towers and upgrades of the family cost this share less. */
  | { readonly kind: 'cost'; readonly value: number }
  | { readonly kind: 'splashRadius'; readonly value: number }
  /** `armor` takes `value` from `damage` instead of the table's share. */
  | { readonly kind: 'armorType'; readonly damage: DamageType; readonly armor: ArmorType; readonly value: number }
  | { readonly kind: 'flyingDamage'; readonly value: number }
  /** Every tower of the family crits; one that already crits gains `chance`. */
  | { readonly kind: 'crit'; readonly chance: number; readonly multiplier: number }
  /** Hits leave −`armor` for `duration` s. */
  | { readonly kind: 'shrapnel'; readonly armor: number; readonly duration: number }
  /** Towers of the family sell for this share. */
  | { readonly kind: 'sellShare'; readonly value: number }
  /** A share of shots stun everything in the full-damage splash. */
  | { readonly kind: 'concussion'; readonly chance: number; readonly duration: number }
  /** Seconds added to the family's slows. */
  | { readonly kind: 'slowDuration'; readonly value: number }
  /** Points added to the family's slows. */
  | { readonly kind: 'slowStrength'; readonly value: number }
  /** Slowed creeps take this much more from Pierce and Siege. */
  | { readonly kind: 'brittle'; readonly value: number }
  /** Gold added to every kill the family makes. */
  | { readonly kind: 'killGold'; readonly value: number }
  /** A creep that dies slowed by the family deals `share` of its max HP as Magic to creeps within `radius`. */
  | { readonly kind: 'shatter'; readonly share: number; readonly radius: number }
  /** A share of attacks fire a second shot at another creep. */
  | { readonly kind: 'echo'; readonly chance: number }
  /** +`per` damage for each other tower of the family within `radius`, up to `max`. */
  | { readonly kind: 'leyline'; readonly per: number; readonly radius: number; readonly max: number }
  | { readonly kind: 'poisonDamage'; readonly value: number }
  /** Seconds added to every poison. */
  | { readonly kind: 'poisonDuration'; readonly value: number }
  /** A creep that dies poisoned passes its poison to the nearest creep within `radius`. */
  | { readonly kind: 'contagion'; readonly radius: number }
  /** Poisoned creeps have −`armor`. */
  | { readonly kind: 'corrode'; readonly armor: number }
  /** Poisoned creeps don't regenerate. */
  | { readonly kind: 'antivenom' }
  /** Poison slows by this much. */
  | { readonly kind: 'poisonSlow'; readonly value: number }
  /** The family's towers can hit flying creeps. */
  | { readonly kind: 'hitsAir' }
  | { readonly kind: 'auraRadius'; readonly value: number }
  /** Points added to the family's attack-speed auras. */
  | { readonly kind: 'auraAttackSpeed'; readonly value: number }
  /** Towers in the family's auras gain this much more XP. */
  | { readonly kind: 'auraXp'; readonly value: number }
  /** Creeps within the family's auras take this much more damage. */
  | { readonly kind: 'hex'; readonly value: number }
  /** The family's auras also give this much range. */
  | { readonly kind: 'auraRange'; readonly value: number }
  /** The family's towers are built at this Tower Level. */
  | { readonly kind: 'startLevel'; readonly level: number };

export interface TalentSpec {
  readonly id: string;
  readonly family: Family;
  /** 1–4: rows are bought in order, and row 4 is the capstone. */
  readonly row: number;
  readonly name: string;
  readonly text: string;
  readonly effect: TalentEffect;
}

/** A Perk a tower gains at Tower Level 5 or 10. */
export type PerkEffect =
  | { readonly kind: 'range'; readonly value: number }
  /** Every `every`th arrow (or attack) multiplies its damage. */
  | { readonly kind: 'everyNth'; readonly every: number; readonly multiplier: number }
  | { readonly kind: 'splashRadius'; readonly value: number }
  /** Every `every`th attack fires a second shot at another creep. */
  | { readonly kind: 'secondShot'; readonly every: number }
  /** Every `every` s, slows every creep in range. */
  | { readonly kind: 'nova'; readonly every: number; readonly slow: number; readonly duration: number }
  | { readonly kind: 'freeze'; readonly chance: number; readonly duration: number }
  /** Every hit jumps to one more creep within `radius` for `share` of its damage. */
  | { readonly kind: 'arc'; readonly share: number; readonly radius: number }
  /** Each hit also poisons the nearest other creep within `radius`. */
  | { readonly kind: 'spores'; readonly radius: number }
  | { readonly kind: 'poisonDamage'; readonly value: number }
  | { readonly kind: 'auraRadius'; readonly value: number }
  /** Every `every` s, towers in its aura get +`value` attack speed for `duration` s. */
  | { readonly kind: 'drums'; readonly every: number; readonly value: number; readonly duration: number };

export interface PerkSpec {
  readonly name: string;
  readonly text: string;
  readonly effect: PerkEffect;
}
