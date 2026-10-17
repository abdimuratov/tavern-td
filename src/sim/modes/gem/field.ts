import {
  COMBO_SLATES, EXTRA_CHANCE_QUALITY, MAX_QUALITY, QUALITY_COST, ROCK, SLATE_PUSH, SLATE_STACKING_RADIUS,
} from '../../../content/gem';
import { removeTower, setTowerSpec } from '../../combat/towers';
import { findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import { nextInt } from '../../core/rng';
import type { GameState, Tower } from '../../core/state';
import { canAfford, earnGold, spendGold } from '../../economy';
import { cellOf, footprintCells, footprintCentre, mapData } from '../../path/grid';
import { extraChanceCost, isSlateTarget, isTypeTarget, nextBonus } from './chance';
import {
  GEM_TOWERS, SWAP_MANA, baseSlate, fieldRecipe, gemState, infoOf, isRock, isSlate, modeEvent,
  newTowerState, peekTowerState, specOf, towerState,
} from './state';

// Everything done to structures already on the field: field Recipes, special
// upgrades, swaps, Rock removal, slate moves, and the Mine's Gem Quality and
// Extra Chance. Your towers are frozen between Waves (Gem TD+ hands them to a
// neutral player), so tower actions happen during a Wave.

export const FROZEN = 'towers are frozen between Waves';

/**
 * Puts a kept gem or base slate in its spec's field-Recipe queue. It can fuse
 * (Combine Special) when no other part of its Recipe has a shorter queue; it
 * then fuses with the parts holding the same place in theirs (src/gem/combination.j).
 */
export function registerPart(state: GameState, tower: Tower, events: SimEvent[]): void {
  const recipe = fieldRecipe(tower.spec);
  if (!recipe) return;
  const gs = gemState(state);
  const queue = (gs.parts[tower.spec] ??= { next: 0, size: 0 });
  queue.next++;
  queue.size++;
  const ts = towerState(state, tower);
  ts.slot = queue.next;
  const ready = recipe.parts.every((p) => p === tower.spec || queue.size <= (gs.parts[p]?.size ?? 0));
  if (!ready) return;
  ts.combine = recipe.result;
  modeEvent(events, 'gem.recipeReady', { tower: tower.id, spec: recipe.result });
}

/** Why `tower` can't fuse its field Recipe now, or null. */
export function fieldRecipeError(state: GameState, tower: Tower): string | null {
  if (peekTowerState(state, tower).combine === '') return 'no Recipe to complete';
  if (state.phase !== 'wave') return FROZEN;
  return null;
}

/** Fuses a field Recipe: `tower` becomes the special in place, gem parts become Rocks, slate parts vanish; kills add up. */
export function combineField(state: GameState, tower: Tower, events: SimEvent[]): void {
  const gs = gemState(state);
  const ts = towerState(state, tower);
  const result = ts.combine;
  const recipe = fieldRecipe(tower.spec)!;
  const slot = ts.slot;
  let kills = tower.kills;
  const used: number[] = [];
  gs.parts[tower.spec]!.size--;
  for (const part of recipe.parts) {
    if (part === tower.spec) continue;
    const queue = gs.parts[part];
    if (queue) queue.size--;
    const other = state.towers.find((t) => t.spec === part && t !== tower && peekTowerState(state, t).slot === slot);
    if (!other) continue;
    kills += other.kills;
    used.push(other.id);
    if (isSlate(part)) {
      removeTower(state, other.id, events);
      delete gs.towers[String(other.id)];
    } else {
      setTowerSpec(other, ROCK, events);
      other.kills = 0;
      gs.towers[String(other.id)] = newTowerState(ROCK);
    }
  }
  setTowerSpec(tower, result, events);
  tower.kills = kills;
  gs.towers[String(tower.id)] = newTowerState(result);
  if (isSlate(result)) pushSlate(state, tower, events);
  modeEvent(events, 'gem.recipe', { tower: tower.id, spec: result, parts: used, kills });
}

/** The next tier of a special and its price, or null at the top of its line. */
export function upgradeOf(spec: string): { readonly to: string; readonly cost: number } | null {
  const next = infoOf(spec)?.next;
  return next === undefined ? null : { to: next, cost: GEM_TOWERS[next]?.cost ?? 0 };
}

export function upgradeError(state: GameState, tower: Tower): string | null {
  const up = upgradeOf(tower.spec);
  if (!up) return 'nothing to upgrade';
  if (state.phase !== 'wave') return FROZEN;
  if (!canAfford(state, up.cost)) return 'not enough gold';
  return null;
}

/** Upgrades a special to its next tier. The build takes 1 s, so it doesn't attack meanwhile. */
export function upgradeSpecial(state: GameState, tower: Tower, events: SimEvent[]): void {
  const up = upgradeOf(tower.spec)!;
  spendGold(state, up.cost, events);
  const ts = towerState(state, tower);
  const mana = ts.mana;
  setTowerSpec(tower, up.to, events);
  const fresh = newTowerState(up.to);
  fresh.mana = Math.min(fresh.mana, mana);
  gemState(state).towers[String(tower.id)] = { ...fresh, slot: ts.slot, combine: ts.combine };
  tower.cd = Math.max(tower.cd, TICK_RATE);
  modeEvent(events, 'gem.upgraded', { tower: tower.id, spec: up.to, cost: up.cost });
}

/** Why this structure can't take part in a swap now, whatever the other one is; null when it can. */
export function swapSideError(state: GameState, t: Tower | undefined): string | null {
  if (!t || !specOf(t.spec)) return 'no such structure';
  if (isSlate(t.spec)) return 'slates can\'t be swapped';
  const gs = gemState(state);
  if (gs.mana < SWAP_MANA) return 'not enough mana: one swap per 10 Waves';
  if (state.phase === 'build' && !isRock(t.spec) && !gs.draft.includes(t.id)) return FROZEN;
  return null;
}

/** Why `a` and `b` can't swap places now, or null. */
export function swapError(state: GameState, a: Tower | undefined, b: Tower | undefined): string | null {
  if (a && a === b) return 'pick two different structures';
  return swapSideError(state, a) ?? swapSideError(state, b);
}

/** Two structures trade places. Both are 2 × 2 and solid, so the maze keeps its shape. */
export function swapTowers(state: GameState, a: Tower, b: Tower, events: SimEvent[]): void {
  gemState(state).mana = 0;
  const { cell, cells, x, y } = a;
  a.cell = b.cell;
  a.cells = b.cells;
  a.x = b.x;
  a.y = b.y;
  b.cell = cell;
  b.cells = cells;
  b.x = x;
  b.y = y;
  for (const c of a.cells) state.grid[c] = a.id;
  for (const c of b.cells) state.grid[c] = b.id;
  a.target = 0;
  b.target = 0;
  state.pathVersion++;
  modeEvent(events, 'gem.swapped', { a: a.id, b: b.id });
}

export function rockError(_state: GameState, tower: Tower | undefined): string | null {
  return !tower || !isRock(tower.spec) ? 'not a Rock' : null;
}

/**
 * Removes a Rock for free, at any time, mid-Wave too (which opens the maze).
 * Remove's 2 s cooldown (A008) sits on each Rock, which goes at once, so
 * removing different Rocks has no shared cooldown.
 */
export function removeRock(state: GameState, tower: Tower, events: SimEvent[]): void {
  removeTower(state, tower.id, events);
  delete gemState(state).towers[String(tower.id)];
}

/** Slates of the same line, its combination, or its parts, that `tower` would stand too close to at (x, y). */
function stackingAt(state: GameState, tower: Tower, x: number, y: number): boolean {
  const kin = new Set<string>([tower.spec]);
  const parts = Object.hasOwn(COMBO_SLATES, tower.spec) ? COMBO_SLATES[tower.spec]! : null;
  if (parts) for (const p of parts) kin.add(p);
  else {
    const combo = baseSlate(tower.spec)?.combo;
    if (combo) kin.add(combo);
  }
  const r2 = SLATE_STACKING_RADIUS * SLATE_STACKING_RADIUS;
  return state.towers.some((t) => t !== tower && kin.has(t.spec) && (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y) <= r2);
}

/** Whether a 2 × 2 slate could stand with its anchor at `anchor`: on buildable cells holding nothing else. */
function slateCellsFree(state: GameState, tower: Tower, anchor: number): number[] | null {
  const cells = footprintCells(state.map, anchor, 2);
  if (cells.length === 0) return null;
  const md = mapData(state.map);
  for (const c of cells) if (md.buildable[c] !== 1 || (state.grid[c] !== 0 && state.grid[c] !== tower.id)) return null;
  return cells;
}

function moveTo(state: GameState, tower: Tower, anchor: number, cells: number[]): void {
  for (const c of tower.cells) if (state.grid[c] === tower.id) state.grid[c] = 0;
  tower.cell = anchor;
  tower.cells = cells;
  const p = footprintCentre(state.map, anchor, 2);
  tower.x = p.x;
  tower.y = p.y;
  for (const c of cells) state.grid[c] = tower.id;
  state.pathVersion++;
}

/** Unit steps for 8 compass directions, so a push needs no trigonometry. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0], [-Math.SQRT1_2, -Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * A new slate too close to its kin is pushed 400 in a random direction until
 * clear (src/gem/slate/stacking.j). assumed: one of 8 directions, snapped to
 * the build grid, onto free buildable cells; after 16 tries it stays put.
 */
export function pushSlate(state: GameState, tower: Tower, events: SimEvent[]): void {
  if (!stackingAt(state, tower, tower.x, tower.y)) return;
  let x = tower.x;
  let y = tower.y;
  for (let attempt = 0; attempt < 16; attempt++) {
    const [dx, dy] = DIRS[nextInt(state.rng, 0, DIRS.length - 1)]!;
    const nx = x + SLATE_PUSH * dx;
    const ny = y + SLATE_PUSH * dy;
    const anchor = cellOf(state.map, Math.round(nx / 64 - 1), Math.round(ny / 64 - 1));
    const cells = anchor < 0 ? null : slateCellsFree(state, tower, anchor);
    if (!cells) continue;
    const p = footprintCentre(state.map, anchor, 2);
    x = p.x;
    y = p.y;
    if (stackingAt(state, tower, x, y)) continue;
    moveTo(state, tower, anchor, cells);
    modeEvent(events, 'gem.slateMoved', { tower: tower.id, cell: anchor, pushed: true });
    return;
  }
}

/** Why a slate can't teleport to anchor (col, row), or null. Each slate teleports once. */
export function slateMoveError(state: GameState, tower: Tower | undefined, col: number, row: number): string | null {
  if (!tower || !isSlate(tower.spec)) return 'not a slate';
  if (peekTowerState(state, tower).moved) return 'this slate has already moved';
  if (state.phase !== 'wave') return FROZEN;
  const anchor = cellOf(state.map, col, row);
  const cells = anchor < 0 ? null : slateCellsFree(state, tower, anchor);
  if (!cells) return 'no room there';
  const p = footprintCentre(state.map, anchor, 2);
  if (stackingAt(state, tower, p.x, p.y)) return 'too close to a slate of its kind';
  return null;
}

export function moveSlate(state: GameState, tower: Tower, col: number, row: number, events: SimEvent[]): void {
  const anchor = cellOf(state.map, col, row);
  moveTo(state, tower, anchor, slateCellsFree(state, tower, anchor)!);
  towerState(state, tower).moved = true;
  modeEvent(events, 'gem.slateMoved', { tower: tower.id, cell: anchor, pushed: false });
}

/** Gold for the next Gem Quality, or null at the top. */
export function nextQualityCost(state: GameState): number | null {
  const q = gemState(state).quality;
  return q >= MAX_QUALITY ? null : QUALITY_COST[q]!;
}

export function qualityError(state: GameState): string | null {
  const cost = nextQualityCost(state);
  if (cost === null) return 'Gem Quality is at its highest';
  if (!canAfford(state, cost)) return 'not enough gold';
  return null;
}

/** Researches the next Gem Quality at the Mine (assumed instant; it takes 1 s in Gem TD+). */
export function buyQuality(state: GameState, events: SimEvent[]): void {
  const cost = nextQualityCost(state)!;
  spendGold(state, cost, events);
  const gs = gemState(state);
  gs.quality++;
  modeEvent(events, 'gem.quality', { quality: gs.quality, cost });
}

/** Why Extra Chance can't target `target` ('' clears it) now, or null. */
export function extraChanceError(state: GameState, target: string): string | null {
  const gs = gemState(state);
  if (gs.quality < EXTRA_CHANCE_QUALITY) return `Extra Chance unlocks at Gem Quality ${EXTRA_CHANCE_QUALITY}`;
  if (state.phase === 'build' && gs.draft.length > 0) return 'set Extra Chance before the first Draft gem';
  if (target === '') return gs.extra.target === '' ? 'no Extra Chance target set' : null;
  if (!isTypeTarget(target) && !isSlateTarget(target)) return 'pick a gem type or a base slate';
  if (target === gs.extra.target) return null;
  const refund = gs.extra.target === '' ? 0 : extraChanceCost(gs.extra.target);
  if (!canAfford(state, extraChanceCost(target) - refund)) return 'not enough gold';
  return null;
}

/** Sets, switches (refunding the old fee) or clears ('') this round's Extra Chance target. */
export function setExtraChance(state: GameState, target: string, events: SimEvent[]): void {
  const extra = gemState(state).extra;
  if (target === extra.target) return;
  if (extra.target !== '') earnGold(state, extraChanceCost(extra.target), events);
  if (target === '') {
    extra.target = '';
    extra.bonus = 0;
  } else {
    const bonus = nextBonus(extra, target);
    spendGold(state, extraChanceCost(target), events);
    extra.target = target;
    extra.bonus = bonus;
  }
  extra.rolls = [];
  modeEvent(events, 'gem.extraChance', { target: extra.target, bonus: extra.bonus });
}

export function towerById(state: GameState, id: number | null): Tower | undefined {
  return id === null ? undefined : findTower(state, id);
}
