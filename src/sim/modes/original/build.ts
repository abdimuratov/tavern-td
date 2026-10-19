import { FAMILY_BASE, LEVEL_XP, SELL_SHARE, TARGETINGS, type Family, type Targeting } from '../../../content/original';
import { addTower, removeTower, setTowerSpec } from '../../combat/towers';
import { findTower } from '../../combat/targeting';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import { canAfford, earnGold, spendGold } from '../../economy';
import { buildSpotCells } from '../../path/grid';
import { challengeUnlocks, runModifiers } from './challenge';
import { unlocksFor, type Unlocks } from './progression';
import { familyTalents } from './talents';
import { modeEvent, newTowerState, orState, peekTower, towerInfo, towerSpec, type OriginalTowerState } from './state';

// Building, Tier upgrades, Specialisations, selling and targeting
// (docs/original-design.md §3, §6, §10). Towers stand only on Build Spots, so
// nothing can Block. Building and upgrading are instant, at any time.

/** The Run's unlocks: the Campaign progress it was started with, narrowed by its Challenge. */
export function runUnlocks(state: GameState): Unlocks {
  return challengeUnlocks(orState(state).cleared, runModifiers(state));
}

/** What `spec` costs in this Run: its step's price less the family's cost Talents, rounded. */
export function priceOf(state: GameState, spec: string): number {
  const info = towerInfo(spec);
  if (!info) return 0;
  return Math.round(info.price * (1 - familyTalents(state, info.family).cost));
}

/** Why the family can't be built or climbed into `spec` at all in this Run (locked, or not in its Challenge), or null. */
function lockError(state: GameState, spec: string): string | null {
  const info = towerInfo(spec);
  if (!info) return 'no such tower';
  const open = unlocksFor(orState(state).cleared);
  if (!open.families.includes(info.family)) return `the ${info.family} family isn't unlocked yet`;
  if (info.tier === 3 && open.maxTier < 3) return 'Tier 3 unlocks after Stage 2';
  if (info.tier === 4 && !open.specialisations) return 'Specialisations unlock after Stage 5';
  const run = runUnlocks(state);
  if (!run.families.includes(info.family)) return `no ${info.family} towers in this Challenge`;
  if (info.tier === 3 && run.maxTier < 3) return 'no Tier 3 in this Challenge';
  if (info.tier === 4 && !run.specialisations) return 'no Specialisations in this Challenge';
  return null;
}

/** The tower standing on Build Spot `spot`, or undefined. */
export function towerOnSpot(state: GameState, spot: number): Tower | undefined {
  const cells = buildSpotCells(state.map, spot);
  const id = cells.length > 0 ? state.grid[cells[0]!] ?? 0 : 0;
  return id !== 0 ? findTower(state, id) : undefined;
}

/** Why Build Spot `spot` can't take a tower now, whatever the family, or null. */
export function spotError(state: GameState, spot: number): string | null {
  const cells = buildSpotCells(state.map, spot);
  if (cells.length === 0) return 'no such Build Spot';
  if (cells.some((c) => state.grid[c] !== 0)) return 'a tower stands there';
  return null;
}

/** Why `spec` can't be built from nothing now, or null. Only a family's Tier 1 tower is built. */
export function buildError(state: GameState, spec: string): string | null {
  const info = towerInfo(spec);
  if (!info) return 'no such tower';
  if (FAMILY_BASE[info.family] !== spec) return 'made by upgrading a tower';
  const locked = lockError(state, spec);
  if (locked) return locked;
  const price = priceOf(state, spec);
  return canAfford(state, price) ? null : `needs ${price} gold`;
}

/** Records gold spent on a tower: all of it toward its sell value, and the part spent during the current Break toward a full refund. */
function spend(state: GameState, ts: OriginalTowerState, gold: number): void {
  const breaks = orState(state).breaks;
  if (ts.freshBreak !== breaks) {
    ts.fresh = 0;
    ts.freshBreak = breaks;
  }
  ts.spent += gold;
  ts.fresh += gold;
}

export function build(state: GameState, spot: number, spec: string, events: SimEvent[]): Tower {
  const info = towerInfo(spec)!;
  const price = priceOf(state, spec);
  spendGold(state, price, events);
  const tower = addTower(state, spec, buildSpotCells(state.map, spot)[0]!, events);
  const ts = newTowerState(info.targeting, orState(state).breaks);
  spend(state, ts, price);
  // Elder Spirits (Totem capstone): Totems start at Tower Level 5, Perk included.
  const start = familyTalents(state, info.family).startLevel;
  if (start > 1) {
    ts.xp = LEVEL_XP[start - 1] ?? 0;
    ts.level = start;
  }
  orState(state).towers[String(tower.id)] = ts;
  modeEvent(events, 'original.built', { tower: tower.id, spec, spot, cost: price });
  return tower;
}

/** Why `tower` can't become `to` now (a Tier upgrade or a Specialisation), or null. */
export function upgradeError(state: GameState, tower: Tower | undefined, to: string): string | null {
  const info = tower ? towerInfo(tower.spec) : undefined;
  if (!tower || !info) return 'no such tower';
  if (info.next.length === 0) return 'a Specialisation is final';
  if (!info.next.includes(to)) return `${towerSpec(tower.spec)?.name ?? 'it'} can't become that`;
  const locked = lockError(state, to);
  if (locked) return locked;
  const price = priceOf(state, to);
  return canAfford(state, price) ? null : `needs ${price} gold`;
}

/**
 * The tower becomes `to` at once. XP, Tower Level and targeting stay. assumed:
 * a tower that still had its old default targeting takes the new one's
 * (Deadeye and Storm Totem aim at Strong).
 */
export function upgrade(state: GameState, tower: Tower, to: string, events: SimEvent[]): void {
  const from = tower.spec;
  const price = priceOf(state, to);
  spendGold(state, price, events);
  const ts = peekTower(state, tower.id)!;
  spend(state, ts, price);
  if (ts.targeting === towerInfo(from)!.targeting) ts.targeting = towerInfo(to)!.targeting;
  ts.beamOn = 0;
  setTowerSpec(tower, to, events);
  modeEvent(events, 'original.upgraded', { tower: tower.id, from, to, cost: price });
}

/** The share of everything spent that selling returns: 70%, or Salvage's 85% for Cannons. */
export function sellShare(state: GameState, family: Family): number {
  return familyTalents(state, family).sellShare ?? SELL_SHARE;
}

/**
 * Gold selling returns now: the share of what was spent before the current
 * Break began, and all of what was spent since. assumed: rounded down, and
 * the time before Wave 1 counts as a Break.
 */
export function sellValue(state: GameState, tower: Tower): number {
  const info = towerInfo(tower.spec);
  const ts = peekTower(state, tower.id);
  if (!info || !ts) return 0;
  const fresh = ts.freshBreak === orState(state).breaks ? ts.fresh : 0;
  return fresh + Math.floor((ts.spent - fresh) * sellShare(state, info.family));
}

export function sell(state: GameState, tower: Tower, events: SimEvent[]): void {
  const gold = sellValue(state, tower);
  removeTower(state, tower.id, events);
  delete orState(state).towers[String(tower.id)];
  earnGold(state, gold, events);
  modeEvent(events, 'original.sold', { tower: tower.id, gold });
}

export function isTargeting(value: unknown): value is Targeting {
  return typeof value === 'string' && (TARGETINGS as readonly string[]).includes(value);
}

/** Why `tower` can't take a targeting, or null. */
export function targetingError(tower: Tower | undefined): string | null {
  if (!tower || !towerInfo(tower.spec)) return 'no such tower';
  if (!towerSpec(tower.spec)?.attack) return 'a Totem doesn\'t attack';
  return null;
}

export function setTargeting(state: GameState, tower: Tower, targeting: Targeting, events: SimEvent[]): void {
  peekTower(state, tower.id)!.targeting = targeting;
  tower.target = 0;
  modeEvent(events, 'original.targeting', { tower: tower.id, targeting });
}

export function towerById(state: GameState, id: number | null): Tower | undefined {
  return id === null ? undefined : findTower(state, id);
}
