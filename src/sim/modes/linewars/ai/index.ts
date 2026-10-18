import {
  AIR_GUARD, AIR_GUARD_SPAN, AI_PROFILES, CROWD_MAX, CROWD_STEP, DANGER_AFTER_LEAK, DANGER_MARGIN, FIELD_ROWS,
  FINISH_LIVES, FINISH_MARGIN, FLOOR_BASE, FLOOR_CAP, FLOOR_SECONDS, FLOOR_SHARE, GREED_LEAK_BONUS, HARPY_THIN, HOLD_TICKS,
  LIVE_CAP, LW_AI_WEIGHTS, LW_CREEPS, LW_SENDS, MIN_AIR_SHARE, OPENING_LINE, OPENING_UNTIL, REPEAT_STEALS, ROW_WALLS,
  SALVO_BANK_TICKS, SALVO_MARGIN, SALVO_PLAN_TICKS, SALVO_SHARE, SEND_LIST, SURPLUS_RESERVES, blueprint, mapCol, sendOfCreep,
  type AiProfile, type LwSendSpec, type SendId,
} from '../../../../content/linewars';
import { MAUL_TOWERS, RACE_SPECS, type ArmorType } from '../../../../content/maul';
import { findCreep } from '../../../combat/targeting';
import type { Command } from '../../../core/commands';
import type { SimEvent } from '../../../core/events';
import { nextFloat, nextInt } from '../../../core/rng';
import type { GameState, Tower } from '../../../core/state';
import type { Json } from '../../../core/types';
import { cellOf } from '../../../path/grid';
import { spotError } from '../../maul/tree';
import { lwNextOf } from '../build';
import { applyLwCommand } from '../commands';
import { sendHp, sendIncome, sendLocked, suddenTick, unlockTick } from '../sends';
import { creepField, lwState, modeEvent, other, payOf, ticks, type LwAi, type LwSide, type SideId } from '../state';
import { ARMORS, airTailCover, armorIndex, coverAt, fieldMap, potential, potentialLeft, profileOf, type FieldMap } from './field';

// The Rival's AI (docs/line-wars-design.md §11). It is sim code under
// ADR-0002: it runs inside the tick after the logged commands, reads only the
// state (and of the other Side only what the HUD shows of it: its Field, Race,
// income and lives, never its gold or Stock), draws only from its own RNG
// stream, and acts only by passing ordinary `lw.*` commands through the same
// handler the log uses. Its commands are never logged: a replay of the seed and
// the human commands reproduces every one. Each applied command emits `lw.ai`.

/** What one think works with. */
interface Mind {
  readonly state: GameState;
  readonly side: SideId;
  readonly ai: LwAi;
  readonly profile: AiProfile;
  readonly events: SimEvent[];
  readonly me: LwSide;
  /** The other Side, read only for its Race, income, lives and the version of its Field's towers. */
  readonly foe: { readonly side: SideId; readonly lives: number; readonly version: () => number };
  /** This think's upgrade list, until an action changes the towers. */
  upgrades: { readonly version: number; readonly list: readonly Upgrade[] } | null;
}

interface Upgrade {
  readonly tower: Tower;
  readonly to: string;
  readonly price: number;
  readonly value: number;
}

/** Stop the think and keep the gold. */
const HOLD = 'hold';
/** Commands to apply as one action; a salvo is several Sends but one action. */
interface Act {
  readonly commands: readonly Command[];
  readonly salvo?: boolean;
}
type Action = Act | typeof HOLD | undefined;

function act(...commands: Command[]): Act {
  return { commands };
}

/** Runs `side`'s AI if this is one of its think ticks (§11.1): Side 0 on multiples of its interval, Side 1 half an interval later. */
export function runAi(state: GameState, side: SideId, events: SimEvent[]): void {
  const ms = lwState(state);
  const ai = ms.ai[side];
  if (!ai || ms.result !== 'playing') return;
  const profile = AI_PROFILES[ai.skill];
  const interval = Math.max(1, ticks(profile.think));
  const offset = side === 0 ? 0 : Math.floor(interval / 2);
  if (state.tick < offset || (state.tick - offset) % interval !== 0) return;
  const foeSide = other(side);
  const mind: Mind = {
    state, side, ai, profile, events, me: ms.sides[side],
    foe: { side: foeSide, lives: ms.sides[foeSide].lives, version: () => ms.sides[foeSide].version },
    upgrades: null,
  };
  remember(mind);
  for (let n = 0; n < profile.actions; n++) {
    const act = decide(mind);
    if (act === undefined || act === HOLD) break;
    apply(mind, act);
    if (ms.result !== 'playing') break;
  }
}

/** Takes in what happened since the last think: its Field's leaks, and how its last salvo did. */
function remember(m: Mind): void {
  const { ai, me, profile, state } = m;
  if (me.leaked > ai.leaksSeen) {
    if (profile.leakLambda > 0) {
      ai.boost = Math.min(profile.leakLambdaMax, boostNow(m) + profile.leakLambda * (me.leaked - ai.leaksSeen));
      ai.boostTick = state.tick;
    }
    ai.leaksSeen = me.leaked;
  }
  if (ai.salvoCreeps.length > 0 && ai.salvoCreeps.every((id) => !findCreep(state, id))) {
    ai.repeat = me.stolen - ai.salvoStolen >= REPEAT_STEALS ? [...ai.salvo] : [];
    ai.salvoCreeps = [];
  }
  const fresh = me.earned - ai.earnedSeen;
  ai.earnedSeen = me.earned;
  if (isSalvoTime(m) && fresh > 0) ai.bank = Math.min(SALVO_BANK_TICKS * payOf(state, m.side), ai.bank + SALVO_SHARE * fresh);
  ai.bank = Math.min(ai.bank, me.gold);
}

/** Gold every rule but the salvo may spend: what isn't in the salvo bank. */
function free(m: Mind): number {
  return m.me.gold - m.ai.bank;
}

/** λ's bonus after leaks, fading over time. */
function boostNow(m: Mind): number {
  const { ai, profile, state } = m;
  if (ai.boost <= 0) return 0;
  return Math.max(0, ai.boost - (profile.leakLambdaFade * (state.tick - ai.boostTick)) / ticks(60));
}

function apply(m: Mind, { commands, salvo }: Act): void {
  const { state, ai, events, side } = m;
  const before = state.nextId;
  for (const command of commands) {
    if (!applyLwCommand(state, command, events, 'ai')) continue;
    ai.applied++;
    modeEvent(events, 'lw.ai', { side, command: command as unknown as Json });
    if (command.type === 'lw.build' && ai.first === 0) ai.first = state.towers[state.towers.length - 1]!.id;
  }
  ai.bank = Math.min(ai.bank, m.me.gold);
  if (salvo) {
    ai.salvo = commands.map((c) => String((c as { send?: unknown }).send));
    ai.salvoCreeps = state.creeps.filter((c) => c.id >= before).map((c) => c.id);
    ai.salvoStolen = m.me.stolen;
    ai.repeat = [];
  }
  m.upgrades = null;
}

/**
 * The first rule that fires (§11.4): commands to apply, HOLD to keep the
 * gold, or nothing to do. A rule that holds keeps only the gold outside the
 * salvo bank, which it can't spend anyway, so the bank may still buy a salvo.
 */
function decide(m: Mind): Action {
  if (m.state.tick < ticks(OPENING_UNTIL)) return opening(m);
  const a = danger(m) ?? maze(m) ?? airGuard(m) ?? floor(m) ?? sendRule(m) ?? surplus(m);
  if (a !== HOLD) return a;
  return salvo(m, foeMap(m)) ?? HOLD;
}

// --- The blueprint -------------------------------------------------------------

interface Slot {
  readonly index: number;
  readonly col: number;
  readonly row: number;
}

/** The blueprint's Walls on the Map for this Side, in build order, with Easy's skips and unused rows left out. */
function slots(m: Mind): Slot[] {
  const limit = m.profile.rows * ROW_WALLS;
  const skip = new Set(m.ai.skip);
  const out: Slot[] = [];
  blueprint(m.ai.flip).forEach(([local, row], index) => {
    if (index >= limit || skip.has(index)) return;
    const a = mapCol(m.side, local);
    const b = mapCol(m.side, local + 1);
    out.push({ index, col: Math.min(a, b), row: FIELD_ROWS[0] + row });
  });
  return out;
}

function built(m: Mind, s: Slot): boolean {
  return m.state.grid[cellOf(m.state.map, s.col, s.row)] !== 0;
}

function wallSpec(m: Mind): string {
  return RACE_SPECS[m.me.race].builds[0];
}

/** The next blueprint Wall that can go down now; one with a creep in the way waits for a later think. */
function nextWall(m: Mind): Command | undefined {
  const wall = wallSpec(m);
  if (MAUL_TOWERS[wall]!.maul.total > free(m)) return undefined;
  for (const s of slots(m)) {
    if (built(m, s) || spotError(m.state, s.col, s.row) !== null) continue;
    return { type: 'lw.build', side: m.side, spec: wall, col: s.col, row: s.row };
  }
  return undefined;
}

// --- Rule 1: the opening -------------------------------------------------------

function opening(m: Mind): Action {
  const { ai, me } = m;
  const first = ai.first === 0 ? undefined : m.state.towers.find((t) => t.id === ai.first);
  if (first && MAUL_TOWERS[first.spec]!.maul.tier === 0) {
    const builds = RACE_SPECS[me.race].builds;
    const to = OPENING_LINE[me.race] === 'b' ? builds[2] : builds[1];
    if (MAUL_TOWERS[to]!.maul.price <= me.gold) return act({ type: 'lw.upgrade', side: m.side, tower: first.id, to });
    return HOLD;
  }
  const wall = nextWall(m);
  return wall ? act(wall) : HOLD;
}

// --- Upgrades ------------------------------------------------------------------

interface Mix {
  /** HP share of each armor type among your recent Sends; uniform before any arrive. */
  readonly armor: readonly number[];
  /** What the air cells of an air-hitting upgrade count for. */
  readonly air: number;
}

function mixOf(m: Mind): Mix {
  const by = new Array<number>(ARMORS).fill(0);
  let total = 0;
  let air = 0;
  const from = m.state.tick - ticks(120);
  for (const e of m.me.inbound) {
    if (e.tick < from) continue;
    const cs = CREEP_OF[e.send];
    by[armorIndex(cs.armorType)] = by[armorIndex(cs.armorType)]! + e.hp;
    total += e.hp;
    if (cs.flying) air += e.hp;
  }
  const armor = total > 0 ? by.map((h) => h / total) : by.map(() => 1 / ARMORS);
  const harpies = m.state.tick > unlockTick(LW_SENDS.harpies);
  return { armor, air: Math.max(total > 0 ? air / total : 0, harpies ? MIN_AIR_SHARE : 0) };
}

/** Each Send's creep's armor type and whether it flies. */
const CREEP_OF: Readonly<Record<SendId, { readonly armorType: ArmorType; readonly flying: boolean }>> = Object.fromEntries(
  SEND_LIST.map((s) => [s.id, { armorType: LW_CREEPS[s.creep]!.armorType, flying: LW_CREEPS[s.creep]!.flying }]),
) as Record<SendId, { readonly armorType: ArmorType; readonly flying: boolean }>;

const LIGHT = armorIndex('light');

/** What a tower of `spec` standing where `at` stands is worth to the AI: its DPS against the mix times the route and air it covers. */
function worth(fm: FieldMap, cache: Map<string, { ground: number; air: number }>, spec: string, at: Tower, ley: number, mix: Mix): number {
  const p = profileOf(spec);
  const W = LW_AI_WEIGHTS;
  const cover = (r: number): { ground: number; air: number } => {
    const key = `${at.id}:${r}`;
    let c = cache.get(key);
    if (!c) {
      c = coverAt(fm, at.x, at.y, r);
      cache.set(key, c);
    }
    return c;
  };
  let v = 0;
  if (p.range > 0 && (p.ground || p.air)) {
    const c = cover(p.range);
    if (p.ground) {
      let d = 0;
      for (let a = 0; a < ARMORS; a++) d += mix.armor[a]! * p.direct[a]!;
      v += (d * ley + p.dot + W.slowValue * p.hitSlow + W.armorValue * p.hitStrip) * c.ground;
    }
    if (p.air) v += (p.direct[LIGHT]! * ley + p.dotAir + W.slowValue * p.hitSlow) * c.air * mix.air;
  }
  if (p.auraRadius > 0) {
    const c = cover(p.auraRadius);
    v += (p.auraPoison + W.slowValue * p.auraSlow + W.armorValue * p.auraStrip) * c.ground;
    if (p.auraAir) v += (W.slowValue * p.auraSlow + W.armorValue * p.auraStrip) * c.air * mix.air;
  }
  return v;
}

/**
 * How much route and air line each tower covers at each radius. Towers never
 * move and upgrades never change the route, so it is kept until the path
 * changes: derived data keyed by the state, as flow fields are.
 */
const covers = new WeakMap<GameState, [CoverCache | null, CoverCache | null]>();

interface CoverCache {
  readonly pathVersion: number;
  readonly map: Map<string, { ground: number; air: number }>;
}

function coverCache(m: Mind): Map<string, { ground: number; air: number }> {
  let pair = covers.get(m.state);
  if (!pair) {
    pair = [null, null];
    covers.set(m.state, pair);
  }
  const cached = pair[m.side];
  if (cached && cached.pathVersion === m.state.pathVersion) return cached.map;
  const fresh: CoverCache = { pathVersion: m.state.pathVersion, map: new Map() };
  pair[m.side] = fresh;
  return fresh.map;
}

/** Every upgrade its towers could take now, best value per gold first (§11.3). */
function upgradeList(m: Mind): readonly Upgrade[] {
  if (m.upgrades && m.upgrades.version === m.me.version) return m.upgrades.list;
  const fm = ownMap(m);
  const cache = coverCache(m);
  const mix = mixOf(m);
  const list: Upgrade[] = [];
  fm.towers.forEach((t, i) => {
    const ley = fm.ley[i]!;
    const now = worth(fm, cache, t.spec, t, ley, mix);
    for (const to of lwNextOf(m.state, m.side, t.spec)) {
      const price = MAUL_TOWERS[to]!.maul.price;
      let gain = worth(fm, cache, to, t, ley, mix) - now;
      const p = profileOf(to);
      if (p.leyRadius > 0) {
        fm.towers.forEach((u, k) => {
          if (u === t || fm.ley[k]! > 1) return;
          const dx = u.x - t.x;
          const dy = u.y - t.y;
          if (dx * dx + dy * dy <= p.leyRadius * p.leyRadius) gain += (p.leyFactor - 1) * worth(fm, cache, u.spec, u, 1, mix);
        });
      }
      if (gain > 0) list.push({ tower: t, to, price, value: gain / price });
    }
  });
  list.sort((a, b) => b.value - a.value || a.tower.id - b.tower.id || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  m.upgrades = { version: m.me.version, list };
  return list;
}

/** The upgrade it picks among those it can afford, by its profile's pick (§12); null for none. */
function pickUpgrade(m: Mind, budget: number): Command | null {
  const list = upgradeList(m).filter((u) => u.price <= budget);
  if (list.length === 0) return null;
  let u = list[0]!;
  if (m.profile.pick === 'mostly' && list.length > 1 && nextFloat(m.ai.rng) >= m.profile.bestChance) u = list[1]!;
  if (m.profile.pick === 'top3' && list.length > 1) u = list[nextInt(m.ai.rng, 0, Math.min(3, list.length) - 1)]!;
  return { type: 'lw.upgrade', side: m.side, tower: u.tower.id, to: u.to };
}

/**
 * An upgrade if it can afford one; HOLD when the cheapest worth buying is
 * within a few ticks of pay, so it saves for it; nothing otherwise, so a Side
 * under a flood still plays on rather than freezing.
 */
function upgradeOrHold(m: Mind, budget: number): Action {
  const up = pickUpgrade(m, budget);
  if (up) return act(up);
  const list = upgradeList(m);
  if (list.length === 0) return undefined;
  let cheapest = Infinity;
  for (const u of list) if (u.price < cheapest) cheapest = u.price;
  return cheapest <= budget + HOLD_TICKS * payOf(m.state, m.side) ? HOLD : undefined;
}

function ownMap(m: Mind): FieldMap {
  return fieldMap(m.state, m.side, m.me.version);
}

function foeMap(m: Mind): FieldMap {
  return fieldMap(m.state, m.foe.side, m.foe.version());
}

/**
 * The crowd factor (§11.3): 1 + 0.1 for every other creep of the same sender
 * in that Field, at most 2. Each other creep counts for the share of the walk
 * it would survive alone (its HP over its potential, at most 1), so cheap
 * creeps that die at once don't shield dear ones.
 */
function crowdOf(others: number): number {
  return Math.min(CROWD_MAX, 1 + CROWD_STEP * Math.max(0, others));
}

function survival(hp: number, pot: number): number {
  return pot <= 0 ? 1 : Math.min(1, hp / pot);
}

// --- Rule 2: danger ------------------------------------------------------------

function inDanger(m: Mind): boolean {
  const { state, me, profile } = m;
  if (profile.leakDanger && me.leakTick >= 0 && state.tick - me.leakTick <= ticks(DANGER_AFTER_LEAK)) return true;
  const mine = state.creeps.filter((c) => c.hp > 0 && creepField(c) === m.side);
  if (mine.length === 0) return false;
  const fm = ownMap(m);
  const pots = mine.map((c) => {
    const send = sendOfCreep(c.spec);
    return send ? potentialLeft(state, fm, c, send.id) : Infinity;
  });
  let total = 0;
  mine.forEach((c, i) => {
    total += survival(c.hp, pots[i]!);
  });
  return mine.some((c, i) => pots[i]! < DANGER_MARGIN * c.hp * crowdOf(total - survival(c.hp, pots[i]!)));
}

function danger(m: Mind): Action {
  return inDanger(m) ? upgradeOrHold(m, free(m)) : undefined;
}

// --- Rule 3: the maze ----------------------------------------------------------

function maze(m: Mind): Action {
  const wallCost = MAUL_TOWERS[wallSpec(m)]!.maul.total;
  const all = slots(m);
  const walls = all.filter((s) => built(m, s)).length;
  if (walls >= all.length || walls * wallCost >= m.profile.mazeShare * m.me.earned) return undefined;
  const wall = nextWall(m);
  return wall ? act(wall) : undefined;
}

// --- Rule 4: the air guard -----------------------------------------------------

function airGuard(m: Mind): Action {
  const { state, me, profile } = m;
  if (profile.airFrom === null && me.airLeaks === 0) return undefined;
  const from = profile.airFrom ?? 0;
  let need = 0;
  for (const [at, towers] of AIR_GUARD) if (state.tick >= ticks(Math.max(at, from))) need = towers;
  if (need === 0) return undefined;
  const fm = ownMap(m);
  let have = 0;
  for (const t of fm.towers) {
    const p = profileOf(t.spec);
    if (MAUL_TOWERS[t.spec]!.maul.tier >= 1 && p.air && airTailCover(fm, t.x, t.y, p.range, AIR_GUARD_SPAN) > 0) have++;
  }
  if (have >= need) return undefined;
  let best: { tower: Tower; to: string; cover: number; price: number } | null = null;
  for (const t of fm.towers) {
    if (MAUL_TOWERS[t.spec]!.maul.tier !== 0) continue;
    for (const to of lwNextOf(state, m.side, t.spec)) {
      const p = profileOf(to);
      if (!p.air) continue;
      const cover = airTailCover(fm, t.x, t.y, p.range, AIR_GUARD_SPAN);
      const price = MAUL_TOWERS[to]!.maul.price;
      if (cover > 0 && (!best || cover > best.cover || (cover === best.cover && price < best.price))) best = { tower: t, to, cover, price };
    }
  }
  if (!best) return undefined;
  if (best.price > free(m)) return HOLD;
  return act({ type: 'lw.upgrade', side: m.side, tower: best.tower.id, to: best.to });
}

// --- Rule 5: the defense floor -------------------------------------------------

function floor(m: Mind): Action {
  const { state, me } = m;
  const towers = lwState(state).towers;
  let worthNow = 0;
  for (const t of ownMap(m).towers) worthNow += towers[String(t.id)] ?? 0;
  let recent = 0;
  const from = state.tick - ticks(FLOOR_SECONDS);
  for (const e of me.inbound) if (e.tick >= from) recent += e.hp;
  const lambda = m.profile.lambda + boostNow(m);
  const need = Math.max(FLOOR_SHARE * me.earned, Math.min(FLOOR_CAP * me.earned, FLOOR_BASE + lambda * recent));
  return worthNow < need ? upgradeOrHold(m, free(m)) : undefined;
}

// --- Rule 6: sending -----------------------------------------------------------

function isSalvoTime(m: Mind): boolean {
  return (m.ai.salvoTick >= 0 && m.state.tick >= m.ai.salvoTick) || m.state.tick >= suddenTick();
}

/** Whether it may buy `send` now: unlocked, in Stock, within the live cap, and paid for out of `budget`. */
function canSend(m: Mind, send: LwSendSpec, budget: number): boolean {
  return !sendLocked(m.me, send.id) && (m.me.stock[send.id] ?? 0) > 0 && send.price <= budget && m.me.live + send.count <= LIVE_CAP;
}

function sendCommand(m: Mind, send: SendId): Command {
  return { type: 'lw.send', side: m.side, send };
}

function reserveOf(m: Mind): number {
  if (finishing(m)) return 0;
  return m.profile.reserve * payOf(m.state, m.side);
}

/** Hard and Insane go for the kill when the other Side is down to its last few lives. */
function finishing(m: Mind): boolean {
  return m.profile.sight === 'armor' && m.foe.lives <= FINISH_LIVES;
}

/** A lone creep of `send`'s margin against the other Field: the damage it would take over its HP. */
function marginOf(m: Mind, fm: FieldMap, send: LwSendSpec): number {
  return potential(fm, send.id, m.profile.sight) / sendHp(m.state, send);
}

/**
 * A salvo from the bank, once it holds enough for the plan (§11.4). The plan
 * is made against what ten ticks of pay would bank, or the bank itself if it
 * holds more, so saving never chases its own plan. When nothing in Stock
 * would get through, the bank goes back to greed.
 */
function salvo(m: Mind, fm: FieldMap): Action {
  const { state, ai } = m;
  if (!isSalvoTime(m)) return undefined;
  const pay = payOf(state, m.side);
  const finish = finishing(m) ? reserveOf(m) + Math.max(0, free(m)) : 0;
  const plan = salvoPlan(m, fm, Math.max(ai.bank, SALVO_PLAN_TICKS * pay) + finish);
  if (!plan) {
    ai.bank = 0;
    return undefined;
  }
  let cost = 0;
  for (const id of plan) cost += LW_SENDS[id].price;
  if (cost > ai.bank + finish) return undefined;
  ai.bank = Math.max(0, ai.bank - cost);
  return { commands: plan.map((id) => sendCommand(m, id)), salvo: true };
}

function sendRule(m: Mind): Action {
  const { state, profile } = m;
  const reserve = reserveOf(m);
  const fm = foeMap(m);
  const s = salvo(m, fm);
  if (s) return s;
  const budget = free(m) - reserve;
  if (budget <= 0) return undefined;
  if (profile.harpies) {
    const harpies = LW_SENDS.harpies;
    if (canSend(m, harpies, budget) && potential(fm, 'harpies', 'armor') < HARPY_THIN * harpies.count * sendHp(state, harpies)) {
      return act(sendCommand(m, 'harpies'));
    }
  }
  const sudden = state.tick >= suddenTick();
  let best: { send: LwSendSpec; score: number } | null = null;
  for (const send of SEND_LIST) {
    if (!canSend(m, send, budget)) continue;
    const leaks = marginOf(m, fm, send) < 1;
    // In Sudden Death a Send adds no income, so gold that buys nothing else goes into the most HP it can.
    const score = sudden ? sendHp(state, send) / send.price : (sendIncome(state, send) / send.price) * (leaks ? GREED_LEAK_BONUS : 1);
    if (score > 0 && (!best || score > best.score)) best = { send, score };
  }
  return best ? act(sendCommand(m, best.send.id)) : undefined;
}

/**
 * The salvo to save for (§11.4): of the sets of Sends in Stock that `budget`
 * buys, the one expected to steal the most lives a gold, the bigger on a tie.
 * A creep is expected to get through when its HP times its crowd beats the
 * margin times the damage the other Field can deal it. Built greedily, a Send at a
 * time: the one that adds the most lives, or else the most crowd, per gold.
 * Null when nothing in Stock would get through.
 */
function salvoPlan(m: Mind, fm: FieldMap, budget: number): SendId[] | null {
  const { me, ai, state } = m;
  if (ai.repeat.length > 0) {
    const need = new Map<string, number>();
    for (const id of ai.repeat) need.set(id, (need.get(id) ?? 0) + 1);
    let creeps = 0;
    for (const id of ai.repeat) creeps += LW_SENDS[id as SendId]?.count ?? 0;
    const ok = [...need].every(([id, n]) => LW_SENDS[id as SendId] && !sendLocked(me, id as SendId) && (me.stock[id] ?? 0) >= n);
    if (ok && me.live + creeps <= LIVE_CAP) return ai.repeat as SendId[];
    ai.repeat = [];
  }
  const margin = finishing(m) ? FINISH_MARGIN : SALVO_MARGIN;
  interface Kind { readonly send: LwSendSpec; readonly hp: number; readonly pot: number; readonly share: number; left: number }
  const kinds: Kind[] = [];
  for (const send of SEND_LIST) {
    const stock = sendLocked(me, send.id) ? 0 : me.stock[send.id] ?? 0;
    if (stock <= 0) continue;
    const hp = sendHp(state, send);
    const pot = potential(fm, send.id, m.profile.sight);
    kinds.push({ send, hp, pot, share: survival(hp, pot), left: stock });
  }
  if (kinds.length === 0) return null;
  // Its creeps already in that Field walk with the salvo.
  let base = 0;
  for (const c of state.creeps) {
    if (c.hp <= 0 || creepField(c) !== m.foe.side) continue;
    const send = sendOfCreep(c.spec);
    if (send) base += survival(c.hp, potentialLeft(state, fm, c, send.id));
  }
  const counts = new Map<Kind, number>();
  const livesOf = (extra: Kind | null): number => {
    let total = base;
    for (const [k, n] of counts) total += k.share * k.send.count * n;
    if (extra) total += extra.share * extra.send.count;
    let lives = 0;
    const each = (k: Kind, n: number): void => {
      if (n > 0 && k.hp * crowdOf(total - k.share) > margin * k.pot) lives += k.send.steals * k.send.count * n;
    };
    for (const [k, n] of counts) each(k, n + (k === extra ? 1 : 0));
    if (extra && !counts.has(extra)) each(extra, 1);
    return lives;
  };
  const plan: SendId[] = [];
  let cost = 0;
  let creeps = me.live;
  let lives = 0;
  let best: { size: number; lives: number; cost: number } | null = null;
  for (let guard = 0; guard < LIVE_CAP; guard++) {
    let pick: { k: Kind; gain: number; lives: number } | null = null;
    for (const k of kinds) {
      if (k.left <= 0 || cost + k.send.price > budget || creeps + k.send.count > LIVE_CAP) continue;
      const after = livesOf(k);
      // Lives gained per gold, or else crowd added per gold.
      const gain = after > lives ? (after - lives) / k.send.price : (k.share * k.send.count) / k.send.price / 1e6;
      if (!pick || gain > pick.gain) pick = { k, gain, lives: after };
    }
    if (!pick || pick.k.share <= 0) break;
    counts.set(pick.k, (counts.get(pick.k) ?? 0) + 1);
    pick.k.left--;
    plan.push(pick.k.send.id);
    cost += pick.k.send.price;
    creeps += pick.k.send.count;
    lives = pick.lives;
    // The most lives a gold, the more lives on a tie.
    if (lives > 0 && (!best || lives * best.cost > best.lives * cost || (lives * best.cost === best.lives * cost && lives > best.lives))) best = { size: plan.length, lives, cost };
  }
  return best === null ? null : plan.slice(0, (best as { size: number }).size);
}

// --- Rule 7: surplus -----------------------------------------------------------

function surplus(m: Mind): Action {
  if (free(m) <= SURPLUS_RESERVES * reserveOf(m)) return undefined;
  const up = pickUpgrade(m, free(m));
  return up ? act(up) : undefined;
}
