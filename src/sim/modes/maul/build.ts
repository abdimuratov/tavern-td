import { RACE_SPECS, SELL_SHARE, TOWER_FOOTPRINT } from '../../../content/maul';
import { findTower } from '../../combat/targeting';
import { addTower, removeTower, setTowerSpec } from '../../combat/towers';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import { canAfford, earnGold, spendGold } from '../../economy';
import { placementError } from '../../path/block';
import { nextCell } from '../../path/flow';
import { cellAt, cellOf, footprintCells, mapData } from '../../path/grid';
import { mlState, modeEvent, towerSpec } from './state';

// Building, upgrading and selling (docs/maul-design.md §4). Any time, mid-Wave
// included: towers are the maze, so a build or a sale can turn creeps around
// (Juggling, which Maul allows as Wintermaul did). The Block check refuses any
// build that would leave a spawn, a checkpoint or a live creep without a path.

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

/** What the Run can build from nothing: each held Race's Wall and two Tier 1 towers. */
export function buildable(state: GameState): string[] {
  return mlState(state).races.flatMap((r) => [...RACE_SPECS[r].builds]);
}

/** What `spec` can become in this Run: a Wall any held Race's Tier 1, anything else its own next steps. */
export function nextOf(state: GameState, spec: string): readonly string[] {
  const ts = towerSpec(spec);
  if (!ts) return [];
  if (ts.maul.tier !== 0) return ts.maul.next;
  return mlState(state).races.flatMap((r) => [RACE_SPECS[r].builds[1], RACE_SPECS[r].builds[2]]);
}

/** Why the Run can't build `spec` from nothing now (whatever the spot), or null. */
export function buildError(state: GameState, spec: string): string | null {
  const ts = towerSpec(spec);
  if (!ts) return 'no such tower';
  if (!mlState(state).races.includes(ts.maul.race)) return `the ${RACE_SPECS[ts.maul.race].name} aren't in this Run`;
  if (!buildable(state).includes(spec)) return 'made by upgrading a tower';
  if (!canAfford(state, ts.maul.total)) return `needs ${ts.maul.total} gold`;
  return null;
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

/** Changes the maze through `change` (which returns the tower built or sold), then counts and reports the creeps it turned around. */
function reshape<T extends Tower>(state: GameState, events: SimEvent[], change: () => T): T {
  const live = state.creeps.some((c) => c.hp > 0 && !c.air);
  const before = live ? headings(state) : new Map<number, [number, number]>();
  const tower = change();
  const turned = countTurned(state, before);
  if (turned > 0) {
    const ms = mlState(state);
    ms.turned += turned;
    ms.juggles++;
    modeEvent(events, 'maul.juggle', { tower: tower.id, turned, total: ms.turned });
  }
  return tower;
}

function charge(state: GameState, id: number, gold: number, events: SimEvent[]): void {
  spendGold(state, gold, events);
  const ms = mlState(state);
  const ts = ms.towers[String(id)] ?? { paid: 0, fresh: 0 };
  ts.paid += gold;
  if (ms.refundOpen) ts.fresh += gold;
  ms.towers[String(id)] = ts;
}

export function build(state: GameState, spec: string, col: number, row: number, events: SimEvent[]): Tower {
  const cost = towerSpec(spec)!.maul.total;
  const tower = reshape(state, events, () => addTower(state, spec, footprintAt(state, col, row)[0]!, events));
  charge(state, tower.id, cost, events);
  modeEvent(events, 'maul.built', { tower: tower.id, spec, cost });
  return tower;
}

/** Why `tower` can't become `to` now, or null. */
export function upgradeError(state: GameState, tower: Tower | undefined, to: string): string | null {
  const from = tower ? towerSpec(tower.spec) : undefined;
  if (!tower || !from) return 'no such tower';
  const target = towerSpec(to);
  if (!target || !nextOf(state, tower.spec).includes(to)) return `${from.name} can't become that`;
  if (!canAfford(state, target.maul.price)) return `needs ${target.maul.price} gold`;
  return null;
}

/** Upgrades in place: the footprint stays, so the maze doesn't change. */
export function upgrade(state: GameState, tower: Tower, to: string, events: SimEvent[]): void {
  const from = tower.spec;
  const price = towerSpec(to)!.maul.price;
  charge(state, tower.id, price, events);
  setTowerSpec(tower, to, events);
  modeEvent(events, 'maul.upgraded', { tower: tower.id, from, to, cost: price });
}

/** Gold a sale returns: what was spent during the current Break in full, the rest at 75%. */
export function sellValue(state: GameState, tower: Tower): number {
  const ts = mlState(state).towers[String(tower.id)];
  if (!ts) return 0;
  return Math.floor(ts.fresh + SELL_SHARE * (ts.paid - ts.fresh));
}

export function sell(state: GameState, tower: Tower, events: SimEvent[]): void {
  const gold = sellValue(state, tower);
  const full = gold > 0 && gold === mlState(state).towers[String(tower.id)]?.paid;
  reshape(state, events, () => {
    removeTower(state, tower.id, events);
    return tower;
  });
  delete mlState(state).towers[String(tower.id)];
  earnGold(state, gold, events);
  modeEvent(events, 'maul.sold', { tower: tower.id, gold, full });
}

export function towerById(state: GameState, id: number | null): Tower | undefined {
  return id === null ? undefined : findTower(state, id);
}
