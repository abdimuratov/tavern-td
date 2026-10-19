import type { RunView } from '../mode-ui';

// The Waves & Towers sheet's data, as each Game Mode gives it (ModeUi.reference).
// Plain data, no Preact: a mode derives its rows from its content tables and
// sim queries, and Reference.tsx draws every mode's alike (CONTEXT.md: Waves
// tab, Towers tab, Best against).

/** The sheet's two tabs: Waves (Line Wars' Sends) and Towers. */
export type ReferenceTabId = 'waves' | 'towers';

/** The filter values chosen, by filter id, such as `{ stage: '3', challenge: '1', difficulty: 'hard' }`. */
export type ReferenceValues = Readonly<Record<string, string>>;

/** Where the sheet was opened. */
export interface ReferenceContext {
  /** The Run, when it is opened from the in-Run menu: Difficulty is then fixed, and the Waves tab marks Now and Next. */
  readonly view?: RunView;
  /** Values to open on, such as the war map's selected Stage. */
  readonly from?: ReferenceValues;
}

export interface ReferenceChoice {
  readonly id: string;
  readonly label: string;
  /** A tooltip. */
  readonly about?: string;
}

/** One control in the sheet's filter row. */
export interface ReferenceFilter {
  readonly id: string;
  readonly label: string;
  /**
   * `select` for a long list (Stages), `seg` for a few (Difficulties), and
   * `toggle` for off and on: its two choices are off then on, and `label` is its button's text.
   */
  readonly kind: 'select' | 'seg' | 'toggle';
  /** A toggle's text on a phone on its side, where the row has less room, such as "Challenge". */
  readonly short?: string;
  readonly choices: readonly ReferenceChoice[];
  /** The value in force, after the mode's own rules (a Challenge plays Normal). */
  readonly value: string;
  /** Shown but fixed, with the reason, such as "Fixed for this Run". */
  readonly locked?: string;
  /** The tabs it shows on; both when left out. */
  readonly tabs?: readonly ReferenceTabId[];
}

/** A tag's colour: the wave preview's air, boss and trait, or good and bad for a strength or a weakness. */
export type ReferenceTone = 'air' | 'boss' | 'trait' | 'good' | 'bad';

export interface ReferenceTag {
  readonly text: string;
  readonly tone?: ReferenceTone;
  /** A tooltip. */
  readonly about?: string;
}

export interface ReferenceRankItem {
  readonly text: string;
  /** Its number, such as "85%". */
  readonly value?: string;
  /** 1 for the best; equal ranks tie. */
  readonly rank: number;
  /** Why it moved, from the rules beyond the table, such as "poison ignores its Shield". */
  readonly why?: readonly string[];
}

/** A list from best to worst, such as Best against. */
export interface ReferenceRank {
  readonly label: string;
  readonly items: readonly ReferenceRankItem[];
  /** What was left out and why, such as "Can't hit air: Cannon, Poison". */
  readonly note?: string;
}

/** One block of a row's detail. */
export interface ReferenceSection {
  readonly title?: string;
  /** A colour dot before the title, 0xRRGGBB. */
  readonly swatch?: number;
  readonly tags?: readonly ReferenceTag[];
  /** Label–value pairs, such as HP and Armor. */
  readonly facts?: readonly (readonly [string, string])[];
  /** Short lines, such as abilities and Perks. */
  readonly lines?: readonly string[];
  readonly ranks?: readonly ReferenceRank[];
}

/** One compact line in a tab's list; a tap or Enter expands its sections. */
export interface ReferenceRow {
  /** Unique within its tab; the row's test id is `ref-row-<id>`. */
  readonly id: string;
  /** A short lead, such as the Wave's number or a Tier. */
  readonly lead?: string;
  readonly title: string;
  /** The rest of the line, cut short where it doesn't fit. */
  readonly summary?: string;
  readonly swatch?: number;
  readonly tags?: readonly ReferenceTag[];
  /** Dimmed, with the reason, such as a family the Challenge doesn't allow. */
  readonly off?: string;
  readonly sections: readonly ReferenceSection[];
}

/** Rows under an optional heading row, such as a Tower Family's towers. */
export interface ReferenceGroup {
  readonly id: string;
  /** The heading, itself a row that expands when it has sections. */
  readonly head?: ReferenceRow;
  readonly rows: readonly ReferenceRow[];
}

export interface ReferenceTab {
  /** Chips always shown above the list, such as a Stage's gold and lives, or a Challenge's changes. */
  readonly intro?: readonly ReferenceTag[];
  /** A line above the list, such as a Challenge's rule. */
  readonly note?: string;
  readonly groups: readonly ReferenceGroup[];
}

/** The Waves-tab rows to mark in a Run: the Wave being fought and the next one. */
export interface ReferenceCurrent {
  readonly now: string | null;
  readonly next: string | null;
}

/**
 * A Game Mode's Waves & Towers sheet: its filters, its two tabs, and in a Run
 * which Wave is on. Every number in it comes from the mode's content tables
 * and sim queries; only short role lines are written by hand.
 */
export interface ModeReference {
  /** The first tab's name: "Waves" by default, "Sends" in Line Wars. */
  readonly wavesLabel?: string;
  /** The values to open on, from the Run or from where the sheet was opened. */
  defaults(ctx: ReferenceContext): ReferenceValues;
  /** The filter row for these values. */
  filters(values: ReferenceValues, ctx: ReferenceContext): readonly ReferenceFilter[];
  waves(values: ReferenceValues): ReferenceTab;
  towers(values: ReferenceValues): ReferenceTab;
  /** In a Run: the Waves-tab rows of the Wave being fought and the next, each null for none or when the values show another Stage. */
  current?(view: RunView, values: ReferenceValues): ReferenceCurrent;
}
