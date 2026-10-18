import type { MaulCreepSpec } from '../maul';

// Shapes of Line Wars' content (docs/line-wars-design.md). Towers, creeps,
// the damage table and the effect kinds are Maul's; Line Wars adds the Sends
// that buy those creeps for the Rival's Field, and the Rival's AI settings.

/** The ten Sends, cheapest first: the order of the send menu and its hotkeys. */
export const SEND_IDS = [
  'snowlings', 'brawler', 'sleet_hound', 'troll', 'hollow', 'brute', 'harpies', 'ice_golem', 'warlord', 'mammoth',
] as const;
export type SendId = (typeof SEND_IDS)[number];

/** One Send (design §8): what it costs, what it pays back, and the creeps it buys. */
export interface LwSendSpec {
  readonly id: SendId;
  /** The Send's name in the send menu: its creep's, or a pack's own plural. */
  readonly name: string;
  /** Its Mac hotkey (§15). */
  readonly key: string;
  /** The Maul creep it is made from: the creep spec its creeps carry, and its shape. */
  readonly creep: string;
  /** Creeps it puts in the Rival's Field. */
  readonly count: number;
  readonly price: number;
  /** Added to the buyer's income at once and for good (none from Sudden Death on). */
  readonly income: number;
  /** HP of each creep, before Sudden Death's growth. */
  readonly hp: number;
  /** Gold the defender earns for each creep it kills. */
  readonly bounty: number;
  /** Lives each creep moves from the defender to the sender when it leaks. */
  readonly steals: number;
  /** Seconds into the Run it unlocks, for both Sides at once, with 1 in Stock. */
  readonly unlock: number;
  /** The most a Side can hold in Stock. */
  readonly cap: number;
  /** Seconds between +1s to Stock while it is below the cap. */
  readonly restock: number;
}

/** A Line Wars creep: Maul's creep with the Send's HP and steal. */
export interface LwCreepSpec extends MaulCreepSpec {
  readonly lw: { readonly send: SendId };
}

/** The AI's skill profiles: one per Difficulty, and `competent` for the tools' player-side bot (design §13). */
export const SKILLS = ['easy', 'normal', 'hard', 'insane', 'competent'] as const;
export type SkillId = (typeof SKILLS)[number];

/** How the AI judges your maze when it plans a salvo. */
export type SalvoSight = 'raw' | 'armor';

/** One skill profile (design §12). Every field is a [tune] knob. */
export interface AiProfile {
  /** Seconds between thinks. */
  readonly think: number;
  /** Actions a think; a salvo is one. */
  readonly actions: number;
  /** Blueprint rows it builds, in build order (9 is the whole maze). */
  readonly rows: number;
  /** Chance each blueprint Wall is skipped, leaving a shortcut. */
  readonly skip: number;
  /** Share of all gold earned that Walls may have. */
  readonly mazeShare: number;
  /** Upgrade pick: the best, the best `bestChance` of the time else the second, or at random among the best 3. */
  readonly pick: 'best' | 'mostly' | 'top3';
  readonly bestChance: number;
  /** λ: defense floor gold per HP of your Sends that entered its Field in the last minute. */
  readonly lambda: number;
  /** Gold it keeps back from Sends, as a share of its pay per income tick. */
  readonly reserve: number;
  /** Air guard from this Run second, or only once a flyer has leaked (null). */
  readonly airFrom: number | null;
  /** Salvos from this Run second (null: greed only, until Sudden Death). */
  readonly salvoFrom: number | null;
  readonly sight: SalvoSight;
  /** Harpies first when your air defence is thin. */
  readonly harpies: boolean;
  /** Danger for 20 s after one of yours leaks. */
  readonly leakDanger: boolean;
  /** λ added per leak, the most it can add, and how much fades a minute. */
  readonly leakLambda: number;
  readonly leakLambdaMax: number;
  readonly leakLambdaFade: number;
}

/** What the AI's estimates count a tower's extras as (design §11.3): each is a [tune] knob. */
export interface AiWeights {
  /** Extra creeps a splash hits, as a share of a full hit each. */
  readonly splash: number;
  /** Each multishot bolt beyond the first, as a share of a full hit. */
  readonly multishot: number;
  /** Each chain jump, as a share of the hit it jumped from. */
  readonly chain: number;
  /** Spores: poison per second times this, for the creeps the cloud catches. */
  readonly spread: number;
  /** A tower's on-hit slow counts as this share of its amount on the cells it covers. */
  readonly hitSlow: number;
  /** In the upgrade value: each point of slow (0–1) on a tower counts as this much DPS a cell. */
  readonly slowValue: number;
  /** In the upgrade value: each point of armor an aura or spores strip counts as this much DPS. */
  readonly armorValue: number;
  /** Venom: a tower keeps this many creeps poisoned at once, as a share of one. */
  readonly venom: number;
}
