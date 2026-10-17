import {
  BASE_SLATES, QUALITIES, ROCK, SPECIAL_LINES, STONE_OF_BRYVX, gemId,
  type BaseSlate,
} from '../../../content/gem';
import { addTower, setTowerSpec } from '../../combat/towers';
import { findTower } from '../../combat/targeting';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import { startNextWave } from '../../core/waves';
import { placementError, type PlacementError } from '../../path/block';
import { cellOf, footprintCells } from '../../path/grid';
import { finishRound, isTypeTarget, rollGem, startRound } from './chance';
import { pushSlate, registerPart } from './field';
import { DRAFT_SIZE, gemParts, gemState, isSlate, modeEvent, newTowerState, qualityIndex } from './state';

// The build phase: five Draft gems go down one by one, then one choice on one
// of them keeps it (possibly merged, downgraded, fused or turned into a slate),
// the rest become Rocks, and the Wave starts (docs/research/gem-td-rules.md §3–4, §6–7).

/** Gems cover 2 × 2 cells. */
export const GEM_FOOTPRINT = 2;

/** The cells a Draft gem anchored at (col, row) would cover; empty off the Map. */
export function gemFootprint(state: GameState, col: number, row: number): number[] {
  const anchor = cellOf(state.map, col, row);
  return anchor < 0 ? [] : footprintCells(state.map, anchor, GEM_FOOTPRINT);
}

/** Why a Draft gem can't go at (col, row) right now, or null. */
export function draftPlacementError(state: GameState, col: number, row: number): PlacementError | 'not now' | 'the Draft is full' | null {
  const gs = gemState(state);
  if (state.phase !== 'build') return 'not now';
  if (gs.draft.length >= DRAFT_SIZE) return 'the Draft is full';
  const cells = gemFootprint(state, col, row);
  if (cells.length === 0) return 'out of bounds';
  return placementError(state, cells);
}

/**
 * Places the next Draft gem: rolls it (Extra Chance first, then Gem Quality) and
 * builds it. assumed: the placeholder's 1 s build is skipped, so there is nothing to cancel.
 */
export function placeDraftGem(state: GameState, col: number, row: number, events: SimEvent[]): string | null {
  const error = draftPlacementError(state, col, row);
  if (error === 'not now') return 'Draft gems go down between Waves';
  if (error) return error;
  const gs = gemState(state);
  const index = gs.draft.length;
  if (index === 0) startRound(state);
  const forced = gs.extra.rolls[index] ?? '';
  const spec = forced !== '' ? forced : rollGem(state.rng, gs.quality);
  const tower = addTower(state, spec, cellOf(state.map, col, row), events);
  gs.towers[String(tower.id)] = newTowerState(spec);
  gs.draft.push(tower.id);
  const extraChanced = gs.extra.target !== '' && isTypeTarget(gs.extra.target) && spec === gemId(gs.extra.target, 'perfect');
  modeEvent(events, 'gem.drafted', { tower: tower.id, spec, index, extraChanced });
  if (gs.draft.length === DRAFT_SIZE) {
    const target = gs.extra.target;
    if (target !== '') {
      const specs = draftSpecs(state);
      finishRound(state, isTypeTarget(target) ? specs.includes(gemId(target, 'perfect')) : slateFormable(specs, target));
    }
    modeEvent(events, 'gem.draftReady', { towers: [...gs.draft] });
  }
  return null;
}

export function draftTowers(state: GameState): Tower[] {
  return gemState(state).draft.map((id) => findTower(state, id)).filter((t): t is Tower => t !== undefined);
}

function draftSpecs(state: GameState): string[] {
  return draftTowers(state).map((t) => t.spec);
}

/** Whether a Draft holding these gems can make the base slate: its Normal gem and one of its Flawed gems. */
export function slateFormable(specs: readonly string[], slateId: string): boolean {
  const slate = BASE_SLATES.find((s) => s.id === slateId);
  return slate !== undefined && specs.includes(slate.normal) && slate.flawed.some((f) => specs.includes(f));
}

/** The Recipe the Draft completes, if any (each gem is part of at most one, so at most one fires). */
export function draftRecipe(state: GameState): string | null {
  const specs = draftSpecs(state);
  for (const line of SPECIAL_LINES) if (line.parts.every((p) => specs.includes(p))) return line.tiers[0]!;
  return null;
}

export type MergeCount = 2 | 3 | 4;

/** What merging `count` copies of a Draft gem makes, or null when the Draft can't: ×2 needs 2+, ×3 exactly 3, ×4 4+. */
export function mergeResult(state: GameState, tower: Tower, count: MergeCount): string | null {
  const parts = gemParts(tower.spec);
  if (!parts) return null;
  const n = draftSpecs(state).filter((s) => s === tower.spec).length;
  if (count === 2 ? n < 2 : count === 3 ? n !== 3 : n < 4) return null;
  const q = qualityIndex(parts.quality) + (count === 2 ? 1 : 2);
  return q >= QUALITIES.length ? STONE_OF_BRYVX : gemId(parts.type, QUALITIES[q]!);
}

export function downgradeResult(tower: Tower): string | null {
  const parts = gemParts(tower.spec);
  if (!parts || parts.quality === 'chipped') return null;
  return gemId(parts.type, QUALITIES[qualityIndex(parts.quality) - 1]!);
}

/** The base slate this Draft gem can be kept as (it is that slate's Normal gem and a Flawed piece is in the Draft). */
export function draftSlate(state: GameState, tower: Tower): BaseSlate | null {
  const slate = BASE_SLATES.find((s) => s.normal === tower.spec);
  return slate && slateFormable(draftSpecs(state), slate.id) ? slate : null;
}

/** The combination slate this Draft gem can become: its base slate and the partner's are both in the Draft. */
export function draftComboSlate(state: GameState, tower: Tower): string | null {
  const slate = draftSlate(state, tower);
  return slate && slateFormable(draftSpecs(state), slate.partner) ? slate.combo : null;
}

/** True when all five Draft gems are down and one can be chosen. */
export function choosing(state: GameState): boolean {
  return state.phase === 'build' && gemState(state).draft.length === DRAFT_SIZE;
}

export function inDraft(state: GameState, id: number): boolean {
  return gemState(state).draft.includes(id);
}

/**
 * Ends the Draft: `kept` becomes `spec` in place, every other Draft gem becomes
 * a Rock where it stood, the kept structure joins the field-Recipe queues, and
 * the Wave starts at once.
 */
export function finalizeDraft(state: GameState, kept: Tower, spec: string, action: string, events: SimEvent[]): void {
  const gs = gemState(state);
  for (const t of draftTowers(state)) {
    if (t === kept) continue;
    setTowerSpec(t, ROCK, events);
    t.kills = 0;
    gs.towers[String(t.id)] = newTowerState(ROCK);
  }
  if (spec !== kept.spec) {
    const wasWalkable = isSlate(kept.spec);
    setTowerSpec(kept, spec, events);
    gs.towers[String(kept.id)] = newTowerState(spec);
    if (wasWalkable !== isSlate(spec)) state.pathVersion++;
  }
  gs.draft = [];
  if (isSlate(spec)) pushSlate(state, kept, events);
  registerPart(state, kept, events);
  modeEvent(events, 'gem.kept', { tower: kept.id, spec, action });
  gs.starting = true;
  startNextWave(state, events);
  gs.starting = false;
}

/** What the UI can offer for one Draft gem. */
export interface DraftChoice {
  readonly tower: number;
  readonly spec: string;
  /** Spec a Downgrade keeps, or null. */
  readonly downgrade: string | null;
  /** Specs merging ×2, ×3 and ×4 would make; null where not allowed. */
  readonly merge: { readonly 2: string | null; readonly 3: string | null; readonly 4: string | null };
  /** The special this Draft's Recipe makes (any of the five can become it), or null. */
  readonly recipe: string | null;
  /** The base slate Keep Slate makes, or null. */
  readonly slate: string | null;
  /** The combination slate Combine Slate makes, or null. */
  readonly comboSlate: string | null;
}

/** Every Draft gem's choices once all five are down; empty before that. */
export function draftChoices(state: GameState): DraftChoice[] {
  if (!choosing(state)) return [];
  const recipe = draftRecipe(state);
  return draftTowers(state).map((t) => ({
    tower: t.id,
    spec: t.spec,
    downgrade: downgradeResult(t),
    merge: { 2: mergeResult(state, t, 2), 3: mergeResult(state, t, 3), 4: mergeResult(state, t, 4) },
    recipe,
    slate: draftSlate(state, t)?.id ?? null,
    comboSlate: draftComboSlate(state, t),
  }));
}
