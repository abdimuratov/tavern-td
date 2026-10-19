import {
  INCOME_SECONDS, LIVE_CAP, LW_CREEPS, RIVAL_INCOME, SCORE, SEND_LIST, sendOfCreep, type SendId,
} from '../../../content/linewars';
import { RACE_SPECS, type RaceId, type TowerLine } from '../../../content/maul';
import { towerMods } from '../../combat/mods';
import { TICK_RATE } from '../../core/constants';
import type { GameState } from '../../core/state';
import { towerSpec } from '../maul/state';
import { footprintAt } from '../maul/tree';
import {
  fullSaleOpen, lwBuildError, lwNextOf, lwSellValue, lwSpotError, lwUpgradeError, towerById,
} from './build';
import { sendError, sendHp, sendIncome, sendLocked, suddenTick, unlockTick } from './sends';
import { creepField, lwState, other, payOf, sideOf, ticks, towerSide, type Driver, type LwState, type SideId } from './state';

// Pure questions the UI, the AI and the bots ask about a Line Wars Run. None
// of them change the state. The AI asks the same ones before it acts, so it
// never issues a command the handler would refuse.

export interface LwSideStatus {
  readonly side: SideId;
  readonly driver: Driver;
  readonly race: RaceId;
  readonly gold: number;
  readonly income: number;
  /** What it is paid each income tick: the Rival's income times the Difficulty's factor. */
  readonly pay: number;
  readonly factor: number;
  readonly lives: number;
  /** Its creeps alive in the other Field, of the cap. */
  readonly live: number;
  readonly cap: number;
  readonly sent: number;
  readonly stolen: number;
  readonly killed: number;
  readonly turned: number;
  readonly juggles: number;
}

export interface LwStatus {
  readonly over: boolean;
  readonly result: LwState['result'];
  readonly why: LwState['why'];
  /** Run seconds so far (or at the end). */
  readonly seconds: number;
  /** Steps until the one that pays the next income tick (0: the next step pays), and the interval. */
  readonly incomeIn: number;
  readonly incomeTicks: number;
  /** Ticks until Sudden Death starts; 0 once it has. */
  readonly suddenIn: number;
  readonly sudden: boolean;
  readonly sides: readonly [LwSideStatus, LwSideStatus];
  readonly score: number;
}

function sideStatus(state: GameState, side: SideId): LwSideStatus {
  const s = sideOf(state, side);
  return {
    side, driver: s.driver, race: s.race, gold: s.gold, income: s.income, pay: payOf(state, side),
    factor: side === 1 ? RIVAL_INCOME[state.difficulty] : 1, lives: s.lives, live: s.live, cap: LIVE_CAP,
    sent: s.sent, stolen: s.stolen, killed: s.killed, turned: s.turned, juggles: s.juggles,
  };
}

export function lwStatus(state: GameState): LwStatus {
  const ms = lwState(state);
  const over = ms.result !== 'playing';
  const tick = over ? ms.endTick : state.tick;
  const every = ticks(INCOME_SECONDS);
  // The next tick that pays: the first is at 0:10, then every 10 s.
  const next = Math.max(every, Math.ceil(tick / every) * every);
  return {
    over, result: ms.result, why: ms.why, seconds: tick / TICK_RATE,
    incomeIn: next - tick, incomeTicks: every,
    suddenIn: Math.max(0, suddenTick() - tick), sudden: tick >= suddenTick(),
    sides: [sideStatus(state, 0), sideStatus(state, 1)], score: ms.score,
  };
}

export interface SendOption {
  readonly send: SendId;
  readonly name: string;
  readonly key: string;
  readonly creep: string;
  readonly count: number;
  readonly price: number;
  /** Income it would add now: none in Sudden Death. */
  readonly income: number;
  /** HP of each creep if bought now. */
  readonly hp: number;
  readonly flying: boolean;
  readonly stock: number;
  readonly cap: number;
  /** Ticks to the next +1 to Stock, and the restock's length; 0 when full or locked. */
  readonly restockIn: number;
  readonly restockTicks: number;
  /** Ticks until it unlocks; 0 once it has. */
  readonly unlockIn: number;
  /** Why it can't be bought now, or null. */
  readonly blocked: string | null;
}

/** The send menu for `side`, cheapest first. */
export function sendOptions(state: GameState, side: SideId): SendOption[] {
  const s = sideOf(state, side);
  return SEND_LIST.map((spec) => {
    const due = s.restock[spec.id] ?? -1;
    return {
      send: spec.id, name: spec.name, key: spec.key, creep: spec.creep, count: spec.count, price: spec.price,
      income: sendIncome(state, spec), hp: sendHp(state, spec), flying: LW_CREEPS[spec.creep]!.flying,
      stock: s.stock[spec.id] ?? 0, cap: spec.cap,
      restockIn: due >= 0 ? Math.max(0, due - state.tick) : 0, restockTicks: ticks(spec.restock),
      unlockIn: sendLocked(s, spec.id) ? Math.max(0, unlockTick(spec) - state.tick) : 0,
      blocked: sendError(state, side, spec.id),
    };
  });
}

export interface LwBuildOption {
  readonly spec: string;
  readonly name: string;
  readonly line: TowerLine;
  readonly cost: number;
  readonly role: string;
  readonly blocked: string | null;
}

/** What `side`'s build menu offers: its Race's Wall and two Tier 1 towers. */
export function buildOptions(state: GameState, side: SideId): LwBuildOption[] {
  return RACE_SPECS[sideOf(state, side).race].builds.map((spec) => {
    const ts = towerSpec(spec)!;
    return { spec, name: ts.name, line: ts.maul.line, cost: ts.maul.total, role: ts.maul.role, blocked: lwBuildError(state, side, spec) };
  });
}

/** The 2 × 2 cells a tower anchored at (col, row) covers, for the Ghost, and why `side` can't build there now. */
export function buildSpot(state: GameState, side: SideId, col: number, row: number): { readonly cells: number[]; readonly error: string | null } {
  return { cells: footprintAt(state, col, row), error: lwSpotError(state, side, col, row) };
}

export interface LwUpgradeOption {
  readonly to: string;
  readonly name: string;
  readonly tier: number;
  readonly price: number;
  readonly role: string;
  readonly blocked: string | null;
}

export interface LwTowerActions {
  readonly tower: number;
  readonly spec: string;
  readonly name: string;
  /** The Side it belongs to; the panel is read-only for the Rival's ("Rival's tower"). */
  readonly side: SideId;
  readonly mine: boolean;
  readonly tier: number;
  readonly role: string;
  /** Range with bonuses, for the range ring. */
  readonly range: number;
  readonly upgrades: readonly LwUpgradeOption[];
  readonly sellValue: number;
  readonly fullRefund: boolean;
  readonly paid: number;
  readonly kills: number;
}

/** The panel for tower `id` as `viewer` sees it: upgrades and a sale only for its own. */
export function towerActions(state: GameState, viewer: SideId, id: number): LwTowerActions | null {
  const tower = towerById(state, id);
  const spec = tower ? towerSpec(tower.spec) : undefined;
  const side = tower ? towerSide(state, tower) : -1;
  if (!tower || !spec || side < 0) return null;
  const owner = side as SideId;
  const mine = owner === viewer;
  const paid = lwState(state).towers[String(tower.id)] ?? 0;
  const sale = lwSellValue(state, tower);
  return {
    tower: tower.id, spec: tower.spec, name: spec.name, side: owner, mine, tier: spec.maul.tier, role: spec.maul.role,
    range: (spec.attack?.range ?? 0) + towerMods(tower).range,
    upgrades: mine ? lwNextOf(state, owner, tower.spec).map((to) => {
      const target = towerSpec(to)!;
      return { to, name: target.name, tier: target.maul.tier, price: target.maul.price, role: target.maul.role, blocked: lwUpgradeError(state, owner, tower, to) };
    }) : [],
    sellValue: mine ? sale : 0, fullRefund: mine && fullSaleOpen(state), paid, kills: tower.kills,
  };
}

export interface InFieldGroup {
  readonly send: SendId;
  readonly name: string;
  readonly count: number;
  readonly flying: boolean;
  readonly boss: boolean;
}

/** The other Side's creeps now walking `side`'s Field, grouped by Send: Line Wars' wave preview. */
export function inField(state: GameState, side: SideId): InFieldGroup[] {
  const counts = new Map<SendId, number>();
  for (const c of state.creeps) {
    if (c.hp <= 0 || creepField(c) !== side) continue;
    const send = sendOfCreep(c.spec);
    if (send) counts.set(send.id, (counts.get(send.id) ?? 0) + 1);
  }
  return SEND_LIST.filter((s) => counts.has(s.id)).map((s) => ({
    send: s.id, name: s.name, count: counts.get(s.id)!, flying: LW_CREEPS[s.creep]!.flying, boss: LW_CREEPS[s.creep]!.maul.kind === 'boss',
  }));
}

/** The next Send to unlock and the ticks until it does, or null once all have. */
export function nextUnlock(state: GameState): { readonly send: SendId; readonly name: string; readonly ticksLeft: number } | null {
  for (const s of SEND_LIST) if (unlockTick(s) > state.tick) return { send: s.id, name: s.name, ticksLeft: unlockTick(s) - state.tick };
  return null;
}

/** The finished (or running) Run as a Record entry (§14), from one Side's view: `wave` is the lives that Side's Leaks stole. */
export interface LwRecord {
  readonly wave: number;
  readonly won: boolean;
  readonly draw: boolean;
  readonly score: number;
  /** The Run's length in seconds, once it is over; null while it runs. */
  readonly seconds: number | null;
  /** That Side's Race, then the other's. */
  readonly races: readonly [RaceId, RaceId];
  readonly why: LwState['why'];
}

/**
 * A Side's score by §14's formula, from its own tallies: 100 a life its Leaks
 * stole, plus the bounty of its kills, plus a win's 1,000, 5 a second left
 * before 20:00 and 20 a life left. The sim keeps only Side 0's (`score`), and
 * this gives the same number for it.
 */
export function lwScore(state: GameState, side: SideId): number {
  const ms = lwState(state);
  const s = ms.sides[side];
  let score = SCORE.perSteal * s.stolen + s.bounty;
  if (ms.result === (side === 0 ? 'side0' : 'side1')) {
    const left = Math.max(0, Math.floor((ticks(SCORE.clock) - ms.endTick) / TICK_RATE));
    score += SCORE.win + SCORE.perSecond * left + SCORE.perLife * s.lives;
  }
  return score;
}

/** The Record entry for `side`: Side 0 by default, Side 1 for a Versus Guest. */
export function lwRecord(state: GameState, side: SideId = 0): LwRecord {
  const ms = lwState(state);
  return {
    wave: ms.sides[side].stolen, won: ms.result === (side === 0 ? 'side0' : 'side1'), draw: ms.result === 'draw',
    score: side === 0 ? ms.score : lwScore(state, side),
    seconds: ms.endTick >= 0 ? ms.endTick / TICK_RATE : null, races: [ms.sides[side].race, ms.sides[other(side)].race], why: ms.why,
  };
}
