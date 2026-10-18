import { RACE_SPECS, SELL_SHARE, TOWER_FOOTPRINT, type RaceId } from '../../../content/maul';
import type { GameState, Tower } from '../../core/state';
import { placementError } from '../../path/block';
import { nextCell } from '../../path/flow';
import { cellAt, cellOf, footprintCells, mapData } from '../../path/grid';
import { towerSpec } from './state';

// Maul's tower tree as both Maul and Line Wars use it (docs/line-wars-design.md
// §4). Nothing here reads or charges a purse: each question takes the Races a
// player holds and the gold it has, so Maul passes its Run's and Line Wars
// passes the acting Side's.

/** The cells a tower anchored (top-left) at (col, row) would cover; empty off the Map. */
export function footprintAt(state: GameState, col: number, row: number): number[] {
  const anchor = cellOf(state.map, col, row);
  return anchor < 0 ? [] : footprintCells(state.map, anchor, TOWER_FOOTPRINT);
}

/** Why a tower can't stand at (col, row) right now, in a player's words, or null. */
export function spotError(state: GameState, col: number, row: number): string | null {
  const cells = footprintAt(state, col, row);
  if (cells.length === 0) return 'off the Map';
  switch (placementError(state, cells)) {
    case null: return null;
    case 'out of bounds': return 'off the Map';
    case 'unbuildable': return 'can\'t build on the creeps\' road or rock';
    case 'occupied': return 'another tower is there';
    case 'creep in the way': return 'a creep is in the way';
    case 'blocks the path': return 'that would block the path';
  }
}

/** What a player holding `races` can build from nothing: each Race's Wall and two Tier 1 towers. */
export function buildableBy(races: readonly RaceId[]): string[] {
  return races.flatMap((r) => [...RACE_SPECS[r].builds]);
}

/** What `spec` can become for a player holding `races`: a Wall any held Race's Tier 1, anything else its own next steps. */
export function nextFor(races: readonly RaceId[], spec: string): readonly string[] {
  const ts = towerSpec(spec);
  if (!ts) return [];
  if (ts.maul.tier !== 0) return ts.maul.next;
  return races.flatMap((r) => [RACE_SPECS[r].builds[1], RACE_SPECS[r].builds[2]]);
}

/**
 * Why a player holding `races` and `gold` can't build `spec` from nothing
 * (whatever the spot), or null. `outsider` words the refusal of another Race's tower.
 */
export function treeBuildError(races: readonly RaceId[], gold: number, spec: string, outsider: (race: RaceId) => string): string | null {
  const ts = towerSpec(spec);
  if (!ts) return 'no such tower';
  if (!races.includes(ts.maul.race)) return outsider(ts.maul.race);
  if (!buildableBy(races).includes(spec)) return 'made by upgrading a tower';
  if (ts.maul.total > gold) return `needs ${ts.maul.total} gold`;
  return null;
}

/** Why `tower` can't become `to` for a player holding `races` and `gold`, or null. */
export function treeUpgradeError(races: readonly RaceId[], gold: number, tower: Tower | undefined, to: string): string | null {
  const from = tower ? towerSpec(tower.spec) : undefined;
  if (!tower || !from) return 'no such tower';
  const target = towerSpec(to);
  if (!target || !nextFor(races, tower.spec).includes(to)) return `${from.name} can't become that`;
  if (target.maul.price > gold) return `needs ${target.maul.price} gold`;
  return null;
}

/** Gold a sale returns: `fresh` (gold that comes back in full) plus 75% of the rest of `paid`, rounded down. */
export function saleValue(paid: number, fresh: number): number {
  return Math.floor(fresh + SELL_SHARE * (paid - fresh));
}

/**
 * Creeps a change to the maze turns around: each live ground creep's next step
 * before and after, and those now heading away from where they were going.
 */
function headings(state: GameState): Map<number, [number, number]> {
  const md = mapData(state.map);
  const out = new Map<number, [number, number]>();
  for (const c of state.creeps) {
    if (c.hp <= 0 || c.air) continue;
    const cell = cellAt(md, c.x, c.y);
    if (cell < 0) continue;
    const next = nextCell(state, c.seg, cell);
    if (next < 0) continue;
    out.set(c.id, [md.cx[next]! - md.cx[cell]!, md.cy[next]! - md.cy[cell]!]);
  }
  return out;
}

function countTurned(state: GameState, before: Map<number, [number, number]>): number {
  if (before.size === 0) return 0;
  const after = headings(state);
  let turned = 0;
  for (const [id, [x0, y0]] of before) {
    const now = after.get(id);
    if (now && now[0] * x0 + now[1] * y0 < 0) turned++;
  }
  return turned;
}

/**
 * Changes the maze through `change` (a build or a sale) and counts the live
 * creeps it turned around: Juggling, which the caller records and reports.
 */
export function reshape<T>(state: GameState, change: () => T): { readonly result: T; readonly turned: number } {
  const live = state.creeps.some((c) => c.hp > 0 && !c.air);
  const before = live ? headings(state) : new Map<number, [number, number]>();
  const result = change();
  return { result, turned: countTurned(state, before) };
}
