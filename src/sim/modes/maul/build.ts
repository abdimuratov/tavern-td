import { RACE_SPECS } from '../../../content/maul';
import { findTower } from '../../combat/targeting';
import { addTower, removeTower, setTowerSpec } from '../../combat/towers';
import type { SimEvent } from '../../core/events';
import type { GameState, Tower } from '../../core/state';
import { earnGold, spendGold } from '../../economy';
import { mlState, modeEvent, towerSpec } from './state';
import { buildableBy, footprintAt, nextFor, reshape as reshapeTree, saleValue, treeBuildError, treeUpgradeError } from './tree';

export { footprintAt, spotError } from './tree';

// Building, upgrading and selling (docs/maul-design.md §4). Any time, mid-Wave
// included: towers are the maze, so a build or a sale can turn creeps around
// (Juggling, which Maul allows as Wintermaul did). The Block check refuses any
// build that would leave a spawn, a checkpoint or a live creep without a path.

/** What the Run can build from nothing: each held Race's Wall and two Tier 1 towers. */
export function buildable(state: GameState): string[] {
  return buildableBy(mlState(state).races);
}

/** What `spec` can become in this Run: a Wall any held Race's Tier 1, anything else its own next steps. */
export function nextOf(state: GameState, spec: string): readonly string[] {
  return nextFor(mlState(state).races, spec);
}

/** Why the Run can't build `spec` from nothing now (whatever the spot), or null. */
export function buildError(state: GameState, spec: string): string | null {
  return treeBuildError(mlState(state).races, state.gold, spec, (race) => `the ${RACE_SPECS[race].name} aren't in this Run`);
}

/** Changes the maze through `change` (which returns the tower built or sold), then counts and reports the creeps it turned around. */
function reshape<T extends Tower>(state: GameState, events: SimEvent[], change: () => T): T {
  const { result: tower, turned } = reshapeTree(state, change);
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
  return treeUpgradeError(mlState(state).races, state.gold, tower, to);
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
  return saleValue(ts.paid, ts.fresh);
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
