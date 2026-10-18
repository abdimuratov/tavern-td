import { FULL_SALE_UNTIL, fieldOfCol } from '../../../content/linewars';
import { RACE_SPECS } from '../../../content/maul';
import { findTower } from '../../combat/targeting';
import { addTower, removeTower, setTowerSpec } from '../../combat/towers';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import { cellCol } from '../../path/grid';
import { towerSpec } from '../maul/state';
import { footprintAt, nextFor, reshape, saleValue, spotError, treeBuildError, treeUpgradeError } from '../maul/tree';
import { lwState, modeEvent, other, sideOf, spend, earn, ticks, towerSide, type SideId } from './state';

// Building, upgrading and selling for one Side (docs/line-wars-design.md §5).
// A Side builds in its own Field only, any time; Blocks are refused and
// Juggling is allowed, as in Maul. Maul's tree answers what a tower can become
// and what a sale returns; Line Wars charges the Side that acts.

/** Why (col, row) is outside `side`'s Field, or null: off the Map, or in the Rival's Field. */
export function fieldError(state: GameState, side: SideId, col: number, row: number): string | null {
  const cells = footprintAt(state, col, row);
  if (cells.length === 0) return 'off the Map';
  for (const c of cells) if (fieldOfCol(cellCol(state.map, c)) === other(side)) return 'that\'s the Rival\'s Field';
  return null;
}

/** Why `side` can't stand a tower at (col, row) right now, in a player's words, or null. */
export function lwSpotError(state: GameState, side: SideId, col: number, row: number): string | null {
  return fieldError(state, side, col, row) ?? spotError(state, col, row);
}

/** What `side` can build from nothing: its Race's Wall and two Tier 1 towers. */
export function lwBuildable(state: GameState, side: SideId): readonly string[] {
  return RACE_SPECS[sideOf(state, side).race].builds;
}

/** What `spec` can become for `side`. */
export function lwNextOf(state: GameState, side: SideId, spec: string): readonly string[] {
  return nextFor([sideOf(state, side).race], spec);
}

/** Why `side` can't build `spec` from nothing now (whatever the spot), or null. */
export function lwBuildError(state: GameState, side: SideId, spec: string): string | null {
  const s = sideOf(state, side);
  return treeBuildError([s.race], s.gold, spec, (race) => `the ${RACE_SPECS[race].name} aren't your Race`);
}

/** Why `side` can't turn `tower` into `to` now, or null. */
export function lwUpgradeError(state: GameState, side: SideId, tower: Tower | undefined, to: string): string | null {
  if (tower && !owns(state, side, tower)) return 'that tower isn\'t yours';
  const s = sideOf(state, side);
  return treeUpgradeError([s.race], s.gold, tower, to);
}

/** Why `side` can't sell `tower`, or null. */
export function lwSellError(state: GameState, side: SideId, tower: Tower | undefined): string | null {
  if (!tower || !Object.hasOwn(lwState(state).towers, String(tower.id))) return 'no such tower';
  if (!owns(state, side, tower)) return 'that tower isn\'t yours';
  return null;
}

function owns(state: GameState, side: SideId, tower: Tower): boolean {
  return towerSide(state, tower) === side;
}

/** True while a sale returns everything: before any Send can unlock. */
export function fullSaleOpen(state: GameState): boolean {
  return state.tick < ticks(FULL_SALE_UNTIL);
}

/** Gold selling `tower` returns now: everything until 0:20, then 75%, rounded down. */
export function lwSellValue(state: GameState, tower: Tower): number {
  const paid = lwState(state).towers[String(tower.id)] ?? 0;
  return saleValue(paid, fullSaleOpen(state) ? paid : 0);
}

/** Runs a build or a sale, then counts and reports the creeps it turned around for `side`. */
function juggled<T extends Tower>(state: GameState, side: SideId, events: SimEvent[], change: () => T): T {
  const { result: tower, turned } = reshape(state, change);
  if (turned > 0) {
    const s = sideOf(state, side);
    s.turned += turned;
    s.juggles++;
    modeEvent(events, 'lw.juggle', { side, tower: tower.id, turned, total: s.turned });
  }
  return tower;
}

function charge(state: GameState, side: SideId, id: number, gold: number, events: SimEvent[]): void {
  spend(state, side, gold, events);
  const towers = lwState(state).towers;
  towers[String(id)] = (towers[String(id)] ?? 0) + gold;
  sideOf(state, side).version++;
}

export function lwBuild(state: GameState, side: SideId, spec: string, col: number, row: number, events: SimEvent[]): Tower {
  const cost = towerSpec(spec)!.maul.total;
  const tower = juggled(state, side, events, () => addTower(state, spec, footprintAt(state, col, row)[0]!, events));
  charge(state, side, tower.id, cost, events);
  modeEvent(events, 'lw.built', { side, tower: tower.id, spec, cost });
  return tower;
}

/** Upgrades in place: the footprint stays, so the maze doesn't change. */
export function lwUpgrade(state: GameState, side: SideId, tower: Tower, to: string, events: SimEvent[]): void {
  const from = tower.spec;
  const price = towerSpec(to)!.maul.price;
  charge(state, side, tower.id, price, events);
  setTowerSpec(tower, to, events);
  modeEvent(events, 'lw.upgraded', { side, tower: tower.id, from, to, cost: price });
}

export function lwSell(state: GameState, side: SideId, tower: Tower, events: SimEvent[]): void {
  const gold = lwSellValue(state, tower);
  const full = gold > 0 && gold === lwState(state).towers[String(tower.id)];
  juggled(state, side, events, () => {
    removeTower(state, tower.id, events);
    return tower;
  });
  delete lwState(state).towers[String(tower.id)];
  sideOf(state, side).version++;
  earn(state, side, gold, events);
  modeEvent(events, 'lw.sold', { side, tower: tower.id, gold, full });
}

export function towerById(state: GameState, id: number | null): Tower | undefined {
  return id === null ? undefined : findTower(state, id);
}
