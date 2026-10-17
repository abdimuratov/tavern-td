import {
  EXTRA_CHANCE_QUALITY, FATAL_LEAK_WAVE, MAX_QUALITY, WAVE_COUNT,
  type GemStructure, type GemType, type Quality,
} from '../../../content/gem';
import { towerMods } from '../../combat/mods';
import { findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { GameState } from '../../core/state';
import { extraChanceCost, nextBonus, qualityOdds } from './chance';
import { choosing, draftChoices, draftPlacementError, gemFootprint, type DraftChoice } from './draft';
import {
  FROZEN, extraChanceError, fieldRecipeError, nextQualityCost, qualityError, rockError, slateMoveError, swapSideError,
  upgradeError, upgradeOf,
} from './field';
import { DRAFT_SIZE, SWAP_MANA, gemState, infoOf, killAward, killStep, peekTowerState, specOf } from './state';

// Pure questions the UI asks about a Gem Run. None of them change the state.

/** Where the Run is, from the player's side: placing the Draft, choosing from it, fighting a Wave, or over. */
export type GemStep = 'draft' | 'choose' | 'wave' | 'over';

export interface GemStatus {
  readonly step: GemStep;
  /** Draft gems down this build phase (0–5). */
  readonly placed: number;
  readonly draftSize: number;
  /** Latest Wave started (0 before the first) and the one the next Draft leads to. */
  readonly wave: number;
  readonly nextWave: number;
  readonly totalWaves: number;
  readonly quality: number;
  readonly maxQuality: number;
  /** Gold for the next Gem Quality, or null at the top. */
  readonly nextQualityCost: number | null;
  /** Why Gem Quality can't be bought now, or null. */
  readonly qualityBlocked: string | null;
  /** Chance of each gem quality per Draft gem at the current Gem Quality, Chipped to Great. */
  readonly odds: readonly number[];
  readonly swapMana: number;
  readonly swapCost: number;
  /** Waves to clear before a swap is ready, 0 when it is. */
  readonly wavesUntilSwap: number;
  /** True while a leak costs only its bounty (before Wave 10). */
  readonly leaksFree: boolean;
  /** The first Wave on which a leak ends the Run. */
  readonly fatalLeakWave: number;
  readonly extraChance: ExtraChanceStatus;
}

export interface ExtraChanceStatus {
  readonly unlocked: boolean;
  /** Gem type or base slate targeted this round, '' for none. */
  readonly target: string;
  readonly bonus: number;
  /** Gold the current target cost (refunded on a switch or clear). */
  readonly paid: number;
  /** False once this round's first Draft gem is down. */
  readonly canChange: boolean;
}

export function gemStatus(state: GameState): GemStatus {
  const gs = gemState(state);
  const over = state.phase === 'won' || state.phase === 'lost';
  const step: GemStep = over ? 'over' : state.phase === 'wave' ? 'wave' : choosing(state) ? 'choose' : 'draft';
  // Leaks on the Wave being fought (or the next one, between Waves).
  const leakWave = state.phase === 'wave' ? state.wave.number : state.wave.number + 1;
  return {
    step,
    placed: gs.draft.length,
    draftSize: DRAFT_SIZE,
    wave: state.wave.number,
    nextWave: Math.min(state.wave.number + 1, WAVE_COUNT),
    totalWaves: state.wave.total,
    quality: gs.quality,
    maxQuality: MAX_QUALITY,
    nextQualityCost: nextQualityCost(state),
    qualityBlocked: qualityError(state),
    odds: qualityOdds(gs.quality),
    swapMana: gs.mana,
    swapCost: SWAP_MANA,
    wavesUntilSwap: Math.max(0, SWAP_MANA - gs.mana),
    leaksFree: leakWave < FATAL_LEAK_WAVE,
    fatalLeakWave: FATAL_LEAK_WAVE,
    extraChance: {
      unlocked: gs.quality >= EXTRA_CHANCE_QUALITY,
      target: gs.extra.target,
      bonus: gs.extra.bonus,
      paid: gs.extra.target === '' ? 0 : extraChanceCost(gs.extra.target),
      canChange: !(state.phase === 'build' && gs.draft.length > 0),
    },
  };
}

/** What Extra Chance would cost and start at for a target, and why it can't be set now (null when it can). */
export function extraChanceQuote(state: GameState, target: string): { readonly cost: number; readonly bonus: number; readonly blocked: string | null } {
  const gs = gemState(state);
  return { cost: target === '' ? 0 : extraChanceCost(target), bonus: target === '' ? 0 : nextBonus(gs.extra, target), blocked: extraChanceError(state, target) };
}

/** The 2 × 2 cells a Draft gem anchored at (col, row) covers (for the ghost, placementError and previewRoute), and why it can't go there. */
export function draftSpot(state: GameState, col: number, row: number): { readonly cells: number[]; readonly error: string | null } {
  const error = draftPlacementError(state, col, row);
  return { cells: gemFootprint(state, col, row), error: error === 'not now' ? 'Draft gems go down between Waves' : error };
}

export { draftChoices, type DraftChoice };

/** Draft gems that could merge (×2/×3/×4), form the Draft's Recipe, or become a slate right now. */
export function draftHighlights(state: GameState): { readonly merge: number[]; readonly recipe: number[]; readonly slate: number[] } {
  const choices = draftChoices(state);
  return {
    merge: choices.filter((c) => c.merge[2] !== null).map((c) => c.tower),
    recipe: choices.filter((c) => c.recipe !== null).map((c) => c.tower),
    slate: choices.filter((c) => c.slate !== null).map((c) => c.tower),
  };
}

export interface GemTowerInfo {
  readonly kind: GemStructure;
  readonly type: GemType | null;
  readonly quality: Quality | null;
  /** Special or slate line. */
  readonly family: string | null;
  readonly tier: number | null;
  readonly kills: number;
  readonly killStep: number;
  /** The kill award's attack-damage bonus (0.1 per 10 kills, up to 1.2). */
  readonly killBonus: number;
  /** Attack bonuses on it right now, kill award and auras included. */
  readonly damageBonus: number;
  readonly attackSpeedBonus: number;
  readonly mana: number | null;
  readonly maxMana: number | null;
  readonly inDraft: boolean;
}

export function towerInfo(state: GameState, id: number): GemTowerInfo | null {
  const t = findTower(state, id);
  const info = t ? infoOf(t.spec) : undefined;
  if (!t || !info) return null;
  const mods = towerMods(t);
  const mana = info.mana ? peekTowerState(state, t).mana : null;
  return {
    kind: info.kind,
    type: info.type ?? null,
    quality: info.quality ?? null,
    family: info.family ?? null,
    tier: info.tier ?? null,
    kills: t.kills,
    killStep: killStep(t.kills),
    killBonus: specOf(t.spec)?.attack ? killAward(t.kills) : 0,
    damageBonus: mods.damage,
    attackSpeedBonus: mods.attackSpeed,
    mana,
    maxMana: info.mana?.max ?? null,
    inDraft: gemState(state).draft.includes(id),
  };
}

/** One thing the selected structure can do: its command, cost, result, and why it's unavailable (null when it can go now). */
export interface GemAction<C> {
  readonly command: C;
  readonly blocked: string | null;
}

/** Everything the selected structure can do, and at what cost. Absent entries don't apply to it at all. */
export interface GemTowerActions {
  readonly upgrade?: GemAction<{ readonly type: 'gem.upgradeSpecial'; readonly tower: number }> & { readonly to: string; readonly cost: number };
  readonly combineRecipe?: GemAction<{ readonly type: 'gem.combineRecipe'; readonly tower: number }> & { readonly to: string };
  readonly removeRock?: GemAction<{ readonly type: 'gem.removeRock'; readonly tower: number }>;
  /** Swapping needs a second structure: send `{ type: 'gem.swap', a: tower, b }`. `blocked` covers this side only. */
  readonly swap?: { readonly blocked: string | null };
  /** Send `{ type: 'gem.moveSlate', tower, col, row }` with the destination. */
  readonly moveSlate?: { readonly blocked: string | null };
  /** For a Draft gem: its choices (keep, downgrade, merge, Recipe, slates). */
  readonly draft?: DraftChoice;
}

export function towerActions(state: GameState, id: number): GemTowerActions {
  const t = findTower(state, id);
  const info = t ? infoOf(t.spec) : undefined;
  if (!t || !info) return {};
  const gs = gemState(state);
  const out: { -readonly [K in keyof GemTowerActions]: GemTowerActions[K] } = {};
  const up = upgradeOf(t.spec);
  if (up) out.upgrade = { command: { type: 'gem.upgradeSpecial', tower: id }, blocked: upgradeError(state, t), to: up.to, cost: up.cost };
  const ts = peekTowerState(state, t);
  if (ts.combine !== '') out.combineRecipe = { command: { type: 'gem.combineRecipe', tower: id }, blocked: fieldRecipeError(state, t), to: ts.combine };
  if (info.kind === 'rock') out.removeRock = { command: { type: 'gem.removeRock', tower: id }, blocked: rockError(state, t) };
  if (info.kind === 'slate') {
    out.moveSlate = { blocked: ts.moved ? 'this slate has already moved' : state.phase !== 'wave' ? FROZEN : null };
  } else {
    out.swap = { blocked: swapSideError(state, t) };
  }
  if (gs.draft.includes(id)) {
    const choice = draftChoices(state).find((c) => c.tower === id);
    if (choice) out.draft = choice;
  }
  return out;
}

/** Why a slate can't teleport to anchor (col, row), or null: for the destination ghost. */
export { slateMoveError };

/** For Records: best Wave reached, score = damage dealt on that Wave, and the clear time of a win. */
export interface GemRecord {
  readonly wave: number;
  readonly won: boolean;
  /** Damage dealt on the last Wave reached, dead creeps at full HP and live or leaked ones as hurt; mostly the Damage Test's at Wave 50. */
  readonly score: number;
  /** Seconds from Wave 1's first spawn to the win, or null. */
  readonly clearSeconds: number | null;
}

export function gemRecord(state: GameState): GemRecord {
  const gs = gemState(state);
  let score = gs.waveDamage;
  for (const c of state.creeps) if (c.wave === state.wave.number && c.hp > 0) score += c.maxHp - c.hp;
  const won = state.phase === 'won';
  return {
    wave: state.wave.number,
    won,
    score: Math.floor(score),
    clearSeconds: won && gs.startTick >= 0 && gs.wonTick >= 0 ? (gs.wonTick - gs.startTick) / TICK_RATE : null,
  };
}
