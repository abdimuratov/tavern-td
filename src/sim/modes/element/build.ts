import { BUILDABLE, ELEMENTS, SELL, elementName, type Element, type ElementTowerInfo } from '../../../content/element';
import { addTower, removeTower, setTowerSpec } from '../../combat/towers';
import { findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import { canAfford, earnGold, spendGold } from '../../economy';
import { placementError } from '../../path/block';
import { cellOf, footprintCells } from '../../path/grid';
import { dropCopiesBy, dropOneCopy, removeClone } from './abilities';
import { FIRE_UP, SPRING, distance2, removeStatus } from './combat';
import {
  elState, isBuilt, isClone, makeSim, modeEvent, newTowerState, roundHalfUp, towerInfoOf, towerSpec, towerState,
} from './state';

// Building, upgrading and selling (docs/research/element-td-rules.md §3.1,
// upgrades.lua, sell.lua). Any time, mid-Wave included. Towers are 2 × 2 on
// the plots; the lane is never buildable, so nothing can Block.

export const FOOTPRINT = 2;

/** The cells a tower anchored (top-left) at (col, row) would cover; empty off the Map. */
export function footprintAt(state: GameState, col: number, row: number): number[] {
  const anchor = cellOf(state.map, col, row);
  return anchor < 0 ? [] : footprintCells(state.map, anchor, FOOTPRINT);
}

/** Why a tower can't stand at (col, row), or null. */
export function spotError(state: GameState, col: number, row: number): string | null {
  const cells = footprintAt(state, col, row);
  if (cells.length === 0) return 'off the Map';
  switch (placementError(state, cells)) {
    case null: return null;
    case 'unbuildable': return 'towers go beside the lane, on raised ground';
    case 'occupied': return 'another tower is there';
    case 'out of bounds': return 'off the Map';
    default: return 'can\'t build there';
  }
}

function listNeeds(needs: [Element, number][]): string {
  return needs.map(([e, l]) => `${elementName(e)} ${l}`).join(' and ');
}

/** The Element levels a tower still needs, as "needs Water 2 and Earth 2", or null when they are met. */
export function requirementError(state: GameState, info: ElementTowerInfo): string | null {
  const levels = elState(state).levels;
  const missing: [Element, number][] = [];
  for (const e of ELEMENTS) {
    const need = info.requires[e] ?? 0;
    if (levels[e] < need) missing.push([e, need]);
  }
  if (info.kind === 'periodic' && ELEMENTS.some((e) => levels[e] < 1)) return 'needs all six Elements at level 1';
  return missing.length === 0 ? null : `needs ${listNeeds(missing)}`;
}

/** Why `spec` can't be bought now (Element levels, essence, gold), or null. Shared by builds and upgrades. */
function priceError(state: GameState, spec: string): string | null {
  const info = towerInfoOf(spec);
  const cost = towerSpec(spec)?.cost ?? 0;
  if (!info) return 'no such tower';
  const needs = requirementError(state, info);
  if (needs) return needs;
  if (info.essence > elState(state).essence) return 'needs a Pure Essence';
  if (!canAfford(state, cost)) return `needs ${cost} gold`;
  return null;
}

/** Why `spec` can't be built from nothing now (whatever the spot), or null. */
export function buildError(state: GameState, spec: string): string | null {
  if (!towerInfoOf(spec)) return 'no such tower';
  if (!BUILDABLE.includes(spec)) return 'made by upgrading a tower';
  return priceError(state, spec);
}

function buildTicks(spec: string): number {
  return Math.round((towerInfoOf(spec)?.buildTime ?? 1) * TICK_RATE);
}

export function build(state: GameState, spec: string, col: number, row: number, events: SimEvent[]): Tower {
  const info = towerInfoOf(spec)!;
  const cost = towerSpec(spec)?.cost ?? 0;
  spendGold(state, cost, events);
  const es = elState(state);
  es.essence -= info.essence;
  const tower = addTower(state, spec, footprintAt(state, col, row)[0]!, events);
  const t = buildTicks(spec);
  // It can't attack or cast until built (BuildTime).
  tower.cd = t;
  es.towers[String(tower.id)] = newTowerState(state.tick + t);
  modeEvent(events, 'element.built', { tower: tower.id, spec, cost, ready: state.tick + t });
  return tower;
}

/** Why `tower` can't become `to` now, or null. */
export function upgradeError(state: GameState, tower: Tower | undefined, to: string): string | null {
  const info = tower ? towerInfoOf(tower.spec) : undefined;
  if (!tower || !info) return 'no such tower';
  if (isClone(state, tower)) return 'a copy can\'t be upgraded';
  if (!info.upgrades.includes(to)) return `${towerSpec(tower.spec)?.name ?? 'it'} can't become that`;
  if (!isBuilt(state, tower)) return 'still building';
  return priceError(state, to);
}

/**
 * The tower rebuilds as `to` over its BuildTime. Kills carry over within one
 * family; Fire Up and Spring Forward carry over at full duration; streaks restart.
 */
export function upgrade(state: GameState, tower: Tower, to: string, events: SimEvent[]): void {
  const from = tower.spec;
  const fromInfo = towerInfoOf(from)!;
  const toInfo = towerInfoOf(to)!;
  const cost = towerSpec(to)?.cost ?? 0;
  const sim = makeSim(state, events);
  dropOneCopy(sim, tower);
  spendGold(state, cost, events);
  const es = elState(state);
  es.essence -= toInfo.essence;
  const old = towerState(state, tower);
  setTowerSpec(tower, to, events);
  const t = buildTicks(to);
  tower.cd = t;
  const same = fromInfo.family === toInfo.family;
  if (!same) tower.kills = 0;
  const fresh = newTowerState(state.tick + t);
  fresh.vengeance = old.vengeance;
  fresh.noCloneUntil = old.noCloneUntil;
  if (same) {
    fresh.castAt = Math.max(old.castAt, fresh.ready);
    fresh.count = old.count;
    if (toInfo.family === 'ephemeral') {
      fresh.stacks = old.stacks;
      fresh.activeUntil = old.activeUntil;
      fresh.timer = old.timer;
      fresh.lastAt = old.lastAt;
    }
  }
  es.towers[String(tower.id)] = fresh;
  for (const s of tower.status) if (s.key === FIRE_UP || s.key === SPRING) s.ticks = 60 * TICK_RATE;
  removeStatus(tower.status, 'element:magic');
  modeEvent(events, 'element.upgraded', { tower: tower.id, from, to, cost, ready: fresh.ready });
}

/** Gold selling returns: a share of everything paid, rounded half up (elemental Arrows and Cannons round up); a copy returns nothing. */
export function sellValue(state: GameState, tower: Tower): number {
  const info = towerInfoOf(tower.spec);
  if (!info || isClone(state, tower)) return 0;
  const arrowCannon = info.family === 'arrow' || info.family === 'cannon';
  const pct = elState(state).picks === 'allRandom' ? SELL.random : arrowCannon ? SELL.arrowCannon : SELL.normal;
  const raw = info.totalCost * pct;
  return info.kind === 'elementalBasic' ? Math.ceil(raw) : roundHalfUp(raw);
}

export function sellError(state: GameState, tower: Tower | undefined): string | null {
  if (!tower || !towerInfoOf(tower.spec)) return 'no such tower';
  if (!isClone(state, tower) && !isBuilt(state, tower)) return 'still building';
  return null;
}

export function sell(state: GameState, tower: Tower, events: SimEvent[]): void {
  const info = towerInfoOf(tower.spec)!;
  const sim = makeSim(state, events);
  if (isClone(state, tower)) {
    removeClone(sim, tower);
    modeEvent(events, 'element.sold', { tower: tower.id, gold: 0, essence: 0 });
    return;
  }
  const gold = sellValue(state, tower);
  // Pure Essence comes back with any refund.
  const essence = gold > 0 ? info.essence : 0;
  dropOneCopy(sim, tower);
  if (info.family === 'trickery') dropCopiesBy(sim, tower);
  // Selling a level-1 Blacksmith or Well (the port compares the class name exactly) strips the longest buff of its kind within 1000.
  if (tower.spec === 'blacksmith_tower' || tower.spec === 'well_tower') stripBuff(state, tower, tower.spec === 'blacksmith_tower' ? FIRE_UP : SPRING);
  removeTower(state, tower.id, events);
  delete elState(state).towers[String(tower.id)];
  earnGold(state, gold, events);
  elState(state).essence += essence;
  modeEvent(events, 'element.sold', { tower: tower.id, gold, essence });
}

function stripBuff(state: GameState, seller: Tower, key: string): void {
  let best: { tower: Tower; ticks: number } | null = null;
  for (const t of state.towers) {
    if (t === seller || distance2(t.x, t.y, seller.x, seller.y) > 1000 * 1000) continue;
    for (const s of t.status) if (s.key === key && (best === null || s.ticks > best.ticks)) best = { tower: t, ticks: s.ticks };
  }
  if (best) removeStatus(best.tower.status, key);
}

export function towerById(state: GameState, id: number | null): Tower | undefined {
  return id === null ? undefined : findTower(state, id);
}
