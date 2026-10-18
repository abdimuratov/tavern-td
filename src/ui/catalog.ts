import { DEFAULT_DIFFICULTY_HP, getMode, hasMode, type Difficulty } from '../sim';
import type { ModeUi } from './mode-ui';
import { ELEMENT_UI } from './modes/element';
import { GEM_UI } from './modes/gem';
import { MAUL_UI } from './modes/maul';
import { ORIGINAL_UI } from './modes/original';

/** A Game Mode as the main menu lists it. Only those with a `ui` can be played yet. */
export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  /** The Classic it recreates, or what it is. */
  readonly origin: string;
  readonly blurb: string;
  readonly ui?: ModeUi;
}

export const CATALOG: readonly CatalogEntry[] = [
  { id: 'gem', name: 'Gem', origin: 'Gem TD', blurb: 'Draft five gems, keep one, and maze the rest as Rocks.', ui: GEM_UI },
  { id: 'element', name: 'Element', origin: 'Element TD', blurb: 'Raise six Elements with Lumber and fuse their towers beside one long Lane.', ui: ELEMENT_UI },
  {
    id: 'original', name: 'Original', origin: 'Our own Campaign',
    blurb: 'The March is burning. Hold the old road Stage by Stage, and spend the Stars you win on Talents.', ui: ORIGINAL_UI,
  },
  {
    id: 'maul', name: 'Maul', origin: 'Wintermaul',
    blurb: 'Pick a Race and maze an open field with its towers. Juggling allowed; the last boss must not get through.', ui: MAUL_UI,
  },
];

export function catalogEntry(modeId: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === modeId);
}

export const DIFFICULTY_NAME: Readonly<Record<Difficulty, string>> = {
  easy: 'Easy', normal: 'Normal', hard: 'Hard', insane: 'Insane',
};

/** What a Difficulty does to this Game Mode's creeps, from its own HP table. */
export function difficultyAbout(modeId: string, d: Difficulty): string {
  const own = catalogEntry(modeId)?.ui?.difficultyAbout;
  if (own) return own(d);
  if (d === 'normal') return "The Classic's own numbers";
  const table = (hasMode(modeId) ? getMode(modeId).difficultyHp : undefined) ?? DEFAULT_DIFFICULTY_HP;
  const change = Math.round((table[d] - 1) * 100);
  return `Creeps have ${Math.abs(change)}% ${change < 0 ? 'less' : 'more'} HP`;
}
