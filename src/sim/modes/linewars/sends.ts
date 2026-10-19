import {
  DRAIN_LIVES, INCOME_SECONDS, LIVE_CAP, LW_SENDS, SEND_LIST, START_LIVES, SUDDEN_DEATH_AT, SUDDEN_HP_PER_MINUTE, SUDDEN_STEAL,
  fieldSpawns, isSendId, type LwSendSpec, type SendId,
} from '../../../content/linewars';
import { spawnCreep } from '../../combat/creeps';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import { nextInt } from '../../core/rng';
import type { GameState } from '../../core/state';
import { modeEvent, other, sideOf, spend, ticks, type LwSide, type SideId } from './state';

// Sends (docs/line-wars-design.md §8): bought for the Rival's Field, where they
// enter at once at random cells of its spawn row, and raising the buyer's
// income at once and for good. Unlocks, Stock and the live cap are the brakes.

/** The tick a Send unlocks, for both Sides at once. */
export function unlockTick(send: LwSendSpec): number {
  return ticks(send.unlock);
}

/** The tick Sudden Death starts. */
export function suddenTick(): number {
  return ticks(SUDDEN_DEATH_AT);
}

/**
 * The last tick a Run can reach when both Sides start with `lives` (design
 * §10): the drain that would empty both if no Leak ever moved a life. Leaks
 * only move lives, so by then the smaller pile is empty. 15:50 with 30 lives.
 */
export function lastTick(lives: number = START_LIVES): number {
  const every = ticks(INCOME_SECONDS);
  const first = Math.ceil(suddenTick() / every) * every;
  return first + (Math.ceil(lives / DRAIN_LIVES) - 1) * every;
}

/** m:ss of a Run tick, for refusals. */
export function clock(tick: number): string {
  const seconds = Math.floor(tick / TICK_RATE);
  const s = seconds % 60;
  return `${(seconds - s) / 60}:${s < 10 ? '0' : ''}${s}`;
}

/** A Send is locked until its unlock has been processed: then it has Stock, or is refilling. */
export function sendLocked(s: LwSide, id: SendId): boolean {
  return (s.stock[id] ?? 0) === 0 && (s.restock[id] ?? -1) < 0;
}

/** HP of each creep of a Send bought on Run tick `tick`: its own, times Sudden Death's growth by tick from its start. */
export function sendHpAt(send: LwSendSpec, tick: number): number {
  const from = suddenTick();
  if (tick < from) return send.hp;
  const minutes = (tick - from) / (60 * TICK_RATE);
  return Math.max(1, Math.round(send.hp * (1 + SUDDEN_HP_PER_MINUTE * minutes)));
}

/** HP of each creep of a Send bought now. */
export function sendHp(state: GameState, send: LwSendSpec): number {
  return sendHpAt(send, state.tick);
}

/** Lives a creep of `send` steals if it leaks on Run tick `tick`: its steal, doubled in Sudden Death. */
export function leakStealAt(send: LwSendSpec, tick: number): number {
  return tick < suddenTick() ? send.steals : send.steals * SUDDEN_STEAL;
}

/** Lives a creep of `send` steals if it leaks now. */
export function leakSteal(state: GameState, send: LwSendSpec): number {
  return leakStealAt(send, state.tick);
}

/** Income a Send bought on Run tick `tick` adds: none from Sudden Death on. */
export function sendIncomeAt(send: LwSendSpec, tick: number): number {
  return tick < suddenTick() ? send.income : 0;
}

/** Income a Send bought now adds. */
export function sendIncome(state: GameState, send: LwSendSpec): number {
  return sendIncomeAt(send, state.tick);
}

/** Why `side` can't buy `send` now, or null: locked, no Stock, gold, or the live cap. */
export function sendError(state: GameState, side: SideId, send: string | null): string | null {
  if (!isSendId(send)) return 'no such Send';
  const spec = LW_SENDS[send];
  const s = sideOf(state, side);
  if (sendLocked(s, send)) return `${spec.name} unlocks at ${clock(unlockTick(spec))}`;
  if ((s.stock[send] ?? 0) <= 0) return `no ${spec.name} in Stock`;
  if (spec.price > s.gold) return `needs ${spec.price} gold`;
  if (s.live + spec.count > LIVE_CAP) return `${LIVE_CAP} of yours are already out`;
  return null;
}

/** Buys `send` for `side` (check sendError first): its creeps enter the other Field now. Returns their ids. */
export function applySend(state: GameState, side: SideId, send: SendId, events: SimEvent[]): number[] {
  const spec = LW_SENDS[send];
  const s = sideOf(state, side);
  spend(state, side, spec.price, events);
  s.spent += spec.price;
  if (s.stock[send] === spec.cap) s.restock[send] = state.tick + ticks(spec.restock);
  s.stock[send] = (s.stock[send] ?? 0) - 1;
  const gained = sendIncome(state, spec);
  s.income += gained;
  const hp = sendHp(state, spec);
  const defender = other(side);
  const [first, count] = fieldSpawns(defender);
  const ids: number[] = [];
  for (let k = 0; k < spec.count; k++) {
    const spawn = first + nextInt(state.rng, 0, count - 1);
    ids.push(spawnCreep(state, spec.creep, { hp, spawn }, events).id);
  }
  s.live += spec.count;
  s.sent++;
  sideOf(state, defender).inbound.push({ tick: state.tick, send, hp: hp * spec.count });
  modeEvent(events, 'lw.sent', { side, send, creeps: ids, income: gained });
  return ids;
}

/** Unlocks and restocks due this tick, Side 0 first (design §4, step 2.1). */
export function runStock(state: GameState, events: SimEvent[]): void {
  for (const spec of SEND_LIST) {
    const id = spec.id;
    if (state.tick === unlockTick(spec)) {
      for (const side of [0, 1] as const) {
        const s = sideOf(state, side);
        s.stock[id] = 1;
        s.restock[id] = spec.cap > 1 ? state.tick + ticks(spec.restock) : -1;
      }
      modeEvent(events, 'lw.unlock', { send: id });
      continue;
    }
    for (const side of [0, 1] as const) {
      const s = sideOf(state, side);
      const due = s.restock[id] ?? -1;
      if (due < 0 || state.tick < due) continue;
      s.stock[id] = (s.stock[id] ?? 0) + 1;
      s.restock[id] = s.stock[id]! < spec.cap ? state.tick + ticks(spec.restock) : -1;
    }
  }
}
