import {
  BASE_SLATES, COMBO_SLATES, GEM_GEMS, GEM_SLATES, GEM_SPECIALS, QUALITIES, ROCK, ROCK_SPEC, SPECIAL_LINES,
  type BaseSlate, type GemInfo, type GemTowerSpec, type GemType, type Quality,
} from '../../../content/gem';
import type { GameModeRules, Sim } from '../../core/mode';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import type { Json } from '../../core/types';
import { getMode } from '../registry';

export const GEM_MODE_ID = 'gem';

/** Gems in a Draft. */
export const DRAFT_SIZE = 5;
/** Builder mana: a swap costs all of it, and it refills by 1 per Wave cleared (src/gem/swap.j). */
export const SWAP_MANA = 10;
export const START_GOLD = 10;

/** Per-structure state the core doesn't keep. */
export interface GemTowerState {
  /** Mana for abilities that cost it. */
  mana: number;
  /** Ticks until its Barrage may fire again (fractional). */
  barrage: number;
  /** Its place in the field-Recipe queue of its spec (1-based), 0 when it isn't waiting to be a Recipe part. */
  slot: number;
  /** The special or combination slate it can become right now (Combine Special), '' for none. */
  combine: string;
  /** A slate that has used its one teleport. */
  moved: boolean;
}

export interface ExtraChanceState {
  /** This round's target: a gem type (for its Perfect) or a base slate id; '' for none. */
  target: string;
  bonus: number;
  /** Last round's target and bonus, which set the next bonus. */
  previous: string;
  previousBonus: number;
  /** One gem spec per Draft placement ('' rolls normally), rolled at the round's first gem; empty before. */
  rolls: string[];
}

/** A Wraith Slate explosion waiting for its delay. */
export interface PendingBlast {
  tick: number;
  x: number;
  y: number;
  tower: number;
  full: number;
  fullRadius: number;
  half: number;
  halfRadius: number;
}

export interface GemState {
  /** Tower ids of this build phase's Draft gems in placement order; empty during a Wave. */
  draft: number[];
  /** Gem Quality, 0–8. */
  quality: number;
  /** Builder mana, 0–10. */
  mana: number;
  extra: ExtraChanceState;
  /** Field-Recipe queues by part spec: slots handed out so far, and parts still waiting. */
  parts: { [spec: string]: { next: number; size: number } };
  /** Per-structure state by tower id. */
  towers: { [id: string]: GemTowerState };
  blasts: PendingBlast[];
  /** Damage dealt to the latest Wave's creeps, counting dead ones at full HP and leaked ones as hurt. */
  waveDamage: number;
  /** Tick Wave 1 started (its first spawn), -1 before. */
  startTick: number;
  /** Tick the Run was won, -1 before. */
  wonTick: number;
  /** True only while the mode itself starts a Wave. */
  starting: boolean;
}

export type GemGameState = GameState<GemState>;

/** Every structure Gem can build, by spec id. */
export const GEM_TOWERS: Readonly<Record<string, GemTowerSpec>> = {
  ...GEM_GEMS,
  ...GEM_SPECIALS,
  ...GEM_SLATES,
  [ROCK]: ROCK_SPEC,
};

export function gemState(state: GameState): GemState {
  return state.mode as GemState;
}

export function rules(state: GameState): GameModeRules {
  return getMode(state.modeId);
}

export function makeSim(state: GameState, events: SimEvent[]): Sim {
  return { state, rules: rules(state), events };
}

export function specOf(spec: string): GemTowerSpec | undefined {
  return Object.hasOwn(GEM_TOWERS, spec) ? GEM_TOWERS[spec] : undefined;
}

export function infoOf(spec: string): GemInfo | undefined {
  return specOf(spec)?.gem;
}

export function isSlate(spec: string): boolean {
  return infoOf(spec)?.kind === 'slate';
}

export function isRock(spec: string): boolean {
  return spec === ROCK;
}

/** The Kill Step, min(kills / 10 + 1, 11), which several specials and slates scale with. */
export function killStep(kills: number): number {
  return Math.min(Math.floor(kills / 10) + 1, 11);
}

/** A per-Kill-Step table's value; a one-element table is fixed. */
export function byStep(table: readonly number[], kills: number): number {
  return table[Math.min(table.length, killStep(kills)) - 1]!;
}

/** Gem TD+'s kill award: +10% attack damage per 10 kills, up to +120% (Trig_Gem_Awards_Actions). */
export function killAward(kills: number): number {
  return 0.1 * Math.min(12, Math.floor(kills / 10));
}

/** A burn's kill bonus: +10% per 10 kills of its tower, up to +100% (src/gem/immolation.j). */
export function burnBonus(kills: number): number {
  return 1 + 0.1 * Math.floor(Math.min(100, kills) / 10);
}

export function newTowerState(spec: string): GemTowerState {
  return { mana: infoOf(spec)?.mana?.max ?? 0, barrage: 0, slot: 0, combine: '', moved: false };
}

/** The structure's Gem state without creating it: for read-only questions. */
export function peekTowerState(state: GameState, tower: Tower): GemTowerState {
  const towers = gemState(state).towers;
  const key = String(tower.id);
  return Object.hasOwn(towers, key) ? towers[key]! : newTowerState(tower.spec);
}

/** The structure's Gem state, created on first use. */
export function towerState(state: GameState, tower: Tower): GemTowerState {
  const towers = gemState(state).towers;
  const key = String(tower.id);
  if (!Object.hasOwn(towers, key)) towers[key] = newTowerState(tower.spec);
  return towers[key]!;
}

/** How many structures of a special or slate line you have on the field. */
export function ownedCount(state: GameState, family: string): number {
  let n = 0;
  for (const t of state.towers) if (infoOf(t.spec)?.family === family) n++;
  return n;
}

export function qualityIndex(q: Quality): number {
  return QUALITIES.indexOf(q);
}

export function gemParts(spec: string): { type: GemType; quality: Quality } | null {
  const info = infoOf(spec);
  return info?.kind === 'gem' && info.type && info.quality ? { type: info.type, quality: info.quality } : null;
}

export function baseSlate(id: string): BaseSlate | undefined {
  return BASE_SLATES.find((s) => s.id === id);
}

/** What a kept structure is a part of: a special line (its tier 1) or a combination slate. */
export interface FieldRecipe {
  readonly result: string;
  readonly parts: readonly string[];
}

const FIELD_RECIPES: ReadonlyMap<string, FieldRecipe> = (() => {
  const map = new Map<string, FieldRecipe>();
  for (const line of SPECIAL_LINES) for (const p of line.parts) map.set(p, { result: line.tiers[0]!, parts: line.parts });
  for (const [combo, parts] of Object.entries(COMBO_SLATES)) for (const p of parts) map.set(p, { result: combo, parts });
  return map;
})();

export function fieldRecipe(spec: string): FieldRecipe | undefined {
  return FIELD_RECIPES.get(spec);
}

export function modeEvent(events: SimEvent[], name: string, data: Json): void {
  events.push({ type: 'mode', name, data });
}
