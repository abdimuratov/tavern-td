import {
  FIELD_COLS, FIELD_ROWS, LW_SENDS, SEND_LIST, SUDDEN_DEATH_AT, type SendId, type SkillId,
} from '../../../src/content/linewars';
import { MAUL_TOWERS, RACE_SPECS, RACES, type RaceId } from '../../../src/content/maul';
import {
  TICK_RATE, createRun, linewars, step,
  type Command, type Difficulty, type ReplayEntry, type SimEvent,
} from '../../../src/sim';

// Headless Line Wars players for the tests and the balance runner
// (docs/line-wars-design.md §13). The player-side bot is the AI itself on the
// `competent` profile (`drivers: ['ai', 'ai']`). The scripted sanity bots are
// independent of the AI and play through the command log, as a person would:
// Side 0 in playLw, and either Side through sideBot (the Versus net tests run
// one on each fake peer):
// - turtle: mazes and upgrades, and never sends after the opening;
// - rusher: Snowlings and Brawlers only, with no towers after the opening;
// - flyer: defends, and sends Harpies whenever they are in Stock;
// - greedy: always the best-ratio Send, defending only after a Leak.
// `idle` builds nothing and sends nothing: two of them show a Run ends by 19:50.

export type LwBot = 'competent' | 'turtle' | 'rusher' | 'flyer' | 'greedy' | 'idle';
export const SANITY_BOTS: readonly LwBot[] = ['turtle', 'rusher', 'flyer', 'greedy'];

export interface LwPlay {
  readonly bot?: LwBot;
  /** Side 1's driver: the AI (default) or a second idle player. */
  readonly rival?: 'ai' | 'idle';
  readonly race?: RaceId;
  readonly rivalRace?: RaceId;
  /** Skill profiles for AI Sides (tools); Side 0's competent and Side 1's the Difficulty by default. */
  readonly skills?: readonly [SkillId | null, SkillId | null];
  /** Every logged command, stamped with its tick: a replay log. */
  readonly record?: ReplayEntry[];
  readonly maxTicks?: number;
}

export interface LwRunResult {
  readonly result: string;
  readonly why: string;
  readonly won: boolean;
  readonly ticks: number;
  readonly seconds: number;
  readonly lives: readonly [number, number];
  readonly stolen: readonly [number, number];
  /** Each Side's income at 5, 10 and 15 min (the last known if the Run ended sooner). */
  readonly income: readonly (readonly [number, number])[];
  /** Creeps that leaked into each Side's exit, by Send. */
  readonly leaks: readonly [Readonly<Record<string, number>>, Readonly<Record<string, number>>];
  /** Commands the AI issued that were refused (must stay empty), and the bot's own refusals. */
  readonly aiRefused: readonly string[];
  readonly botRefused: readonly string[];
  readonly aiCommands: readonly [number, number];
  readonly meanStepMs: number;
  readonly maxStepMs: number;
  readonly state: linewars.LwGameState;
}

/** The 16 Race pairings, ordered so that each run of four covers every Race once on each Side, mirrors last. */
export const PAIRINGS: readonly (readonly [RaceId, RaceId])[] = [
  [0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3], [2, 0], [3, 1], [0, 3], [1, 0], [2, 1], [3, 2], [0, 0], [1, 1], [2, 2], [3, 3],
].map(([a, b]) => [RACES[a!]!, RACES[b!]!] as const);

/** The pairing a seed plays, rotated across seeds. */
export function pairingFor(seed: number): readonly [RaceId, RaceId] {
  return PAIRINGS[(seed - 1) % PAIRINGS.length]!;
}

type State = linewars.LwGameState;
type SideId = linewars.SideId;

/** Side 0's serpentine, top to bottom, gaps alternating from the Divide side: its own plan, not the AI's blueprint. */
function serpentine(): [number, number][] {
  const out: [number, number][] = [];
  const [west, east] = FIELD_COLS[0];
  for (let i = 0; i < 9; i++) {
    const row = FIELD_ROWS[0] + 1 + 3 * i;
    const gapWest = i % 2 === 0;
    const cols: number[] = [];
    for (let c = gapWest ? west + 2 : west; c <= (gapWest ? east - 1 : east - 3); c += 2) cols.push(c);
    if (gapWest) cols.reverse();
    for (const c of cols) out.push([c, row]);
  }
  return out;
}

/** Each Side's plan: Side 1's is Side 0's mirrored, so its gaps also start from the Divide side. */
const PLANS: readonly (readonly [number, number][])[] = (() => {
  const plan = serpentine();
  const [west, east] = FIELD_COLS[0];
  // A 2 × 2 anchored at local column l covers l and l + 1; mirrored, it is anchored at 14 − l.
  const mirrored = plan.map(([c, row]): [number, number] => [FIELD_COLS[1][0] + (east - west - 1) - (c - west), row]);
  return [plan, mirrored];
})();

interface Ctx {
  readonly state: State;
  readonly race: RaceId;
  readonly side: SideId;
}

function me(c: Ctx): linewars.LwSide {
  return c.state.mode.sides[c.side];
}

function nextWall(c: Ctx): Command | null {
  const wall = RACE_SPECS[c.race].builds[0];
  if (MAUL_TOWERS[wall]!.maul.total > me(c).gold) return null;
  for (const [col, row] of PLANS[c.side]!) {
    if (linewars.lwSpotError(c.state, c.side, col, row) === null) return { type: 'lw.build', side: c.side, spec: wall, col, row };
  }
  return null;
}

/** The cheapest upgrade it can afford, lowest Tier first, line A at a Wall and the first fork at Tier 2. */
function nextUpgrade(c: Ctx): Command | null {
  const towers = c.state.towers.filter((t) => linewars.towerSide(c.state, t) === c.side);
  let best: { tower: number; to: string; tier: number; price: number } | null = null;
  for (const t of towers) {
    const info = MAUL_TOWERS[t.spec]!.maul;
    const options = linewars.lwNextOf(c.state, c.side, t.spec);
    const to = info.tier === 0 ? options.find((o) => MAUL_TOWERS[o]!.maul.line === 'a') : options[0];
    if (!to) continue;
    const price = MAUL_TOWERS[to]!.maul.price;
    if (linewars.lwUpgradeError(c.state, c.side, t, to) !== null) continue;
    if (!best || info.tier < best.tier || (info.tier === best.tier && price < best.price)) best = { tower: t.id, to, tier: info.tier, price };
  }
  return best ? { type: 'lw.upgrade', side: c.side, tower: best.tower, to: best.to } : null;
}

/** A Wall while Walls have under `share` of all gold earned, otherwise an upgrade. */
function defend(c: Ctx, share = 0.35): Command | null {
  const walls = c.state.towers.filter((t) => linewars.towerSide(c.state, t) === c.side && MAUL_TOWERS[t.spec]!.maul.tier === 0).length;
  const wallCost = MAUL_TOWERS[RACE_SPECS[c.race].builds[0]]!.maul.total;
  if (walls * wallCost < share * me(c).earned) {
    const w = nextWall(c);
    if (w) return w;
  }
  return nextUpgrade(c);
}

function send(c: Ctx, id: SendId): Command | null {
  return linewars.sendError(c.state, c.side, id) === null ? { type: 'lw.send', side: c.side, send: id } : null;
}

/** The opening every scripted bot plays: a Wall upgraded at once, then Walls. */
function opening(c: Ctx): Command | null {
  const ours = c.state.towers.filter((t) => linewars.towerSide(c.state, t) === c.side);
  if (ours.length === 1 && MAUL_TOWERS[ours[0]!.spec]!.maul.tier === 0) return nextUpgrade(c);
  return nextWall(c);
}

function towersWorth(c: Ctx): number {
  let n = 0;
  for (const t of c.state.towers) if (linewars.towerSide(c.state, t) === c.side) n += c.state.mode.towers[String(t.id)] ?? 0;
  return n;
}

function bestRatio(c: Ctx): Command | null {
  let best: SendId | null = null;
  for (const s of SEND_LIST) {
    if (linewars.sendError(c.state, c.side, s.id) !== null) continue;
    if (!best || s.income / s.price > LW_SENDS[best].income / LW_SENDS[best].price) best = s.id;
  }
  return best ? { type: 'lw.send', side: c.side, send: best } : null;
}

/** One decision of a scripted bot, or null to wait. */
function decide(bot: LwBot, c: Ctx, leakTick: number): Command | null {
  const t = c.state.tick;
  if (bot === 'idle') return null;
  if (t < 20 * TICK_RATE) return opening(c);
  switch (bot) {
    case 'turtle':
      return defend(c);
    case 'rusher':
      return send(c, 'brawler') ?? send(c, 'snowlings');
    case 'flyer': {
      if (towersWorth(c) < 0.4 * me(c).earned) return defend(c);
      if (t >= LW_SENDS.harpies.unlock * TICK_RATE) return send(c, 'harpies');
      return bestRatio(c);
    }
    case 'greedy': {
      if (leakTick >= 0 && t - leakTick <= 20 * TICK_RATE) return defend(c);
      return bestRatio(c);
    }
    default:
      return null;
  }
}

/**
 * Plays one Run to its end: Side 0 is `bot` (the competent AI, or a scripted
 * bot through the command log), Side 1 the AI on `difficulty`.
 */
export function playLw(seed: number, difficulty: Difficulty, o: LwPlay = {}): LwRunResult {
  const bot = o.bot ?? 'competent';
  const [race, rivalRace] = [o.race ?? pairingFor(seed)[0], o.rivalRace ?? pairingFor(seed)[1]];
  const drivers = [bot === 'competent' ? 'ai' : 'human', o.rival === 'idle' ? 'human' : 'ai'];
  const skills = o.skills ?? [bot === 'competent' ? 'competent' : null, null];
  const state = createRun({
    mode: 'linewars', seed, difficulty, options: { race, rivalRace, drivers, skills: [...skills] },
  }) as State;
  const ctx: Ctx = { state, race, side: 0 };
  const maxTicks = o.maxTicks ?? 40 * 60 * TICK_RATE;
  const aiRefused: string[] = [];
  const botRefused: string[] = [];
  const leaks: [Record<string, number>, Record<string, number>] = [{}, {}];
  const aiCommands: [number, number] = [0, 0];
  const income: [number, number][] = [];
  let leakTick = -1;
  let total = 0;
  let max = 0;
  let steps = 0;
  const mark = [5, 10, 15].map((m) => m * 60 * TICK_RATE);
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const commands: Command[] = [];
    if (bot !== 'competent' && state.tick % 15 === 0) {
      const c = decide(bot, ctx, leakTick);
      if (c) commands.push(c);
    }
    for (const c of commands) o.record?.push({ tick: state.tick, command: c });
    const t0 = performance.now();
    const events: SimEvent[] = step(state, commands);
    const dt = performance.now() - t0;
    total += dt;
    if (dt > max) max = dt;
    steps++;
    for (const e of events) {
      if (e.type === 'rejected') {
        const text = `${String(e.command.type)}: ${e.reason}`;
        if (commands.includes(e.command)) botRefused.push(text);
        else aiRefused.push(text);
      } else if (e.type === 'mode' && e.name === 'lw.leak') {
        const d = e.data as { send: string; from: 0 | 1 };
        leaks[d.from][d.send] = (leaks[d.from][d.send] ?? 0) + 1;
        if (d.from === 0) leakTick = state.tick;
      } else if (e.type === 'mode' && e.name === 'lw.ai') {
        aiCommands[(e.data as { side: 0 | 1 }).side]++;
      }
    }
    if (mark.includes(state.tick)) income.push([state.mode.sides[0].income, state.mode.sides[1].income]);
  }
  while (income.length < mark.length) income.push([state.mode.sides[0].income, state.mode.sides[1].income]);
  const ms = state.mode;
  return {
    result: ms.result, why: ms.why, won: ms.result === 'side0', ticks: state.tick, seconds: state.tick / TICK_RATE,
    lives: [ms.sides[0].lives, ms.sides[1].lives], stolen: [ms.sides[0].stolen, ms.sides[1].stolen], income, leaks,
    aiRefused, botRefused, aiCommands, meanStepMs: total / Math.max(1, steps), maxStepMs: max, state,
  };
}

/** A scripted bot playing one Side of a Run it doesn't own, as a person would: a Versus peer in the net tests. */
export interface SideBot {
  readonly side: SideId;
  /** Its move on this state, or null to wait. playLw asks every 15 ticks, and so should its callers. */
  next(state: State): Command | null;
  /** The events of a step, so it notices Leaks out of its Field (Greedy defends for 20 s after one). */
  seen(state: State, events: readonly SimEvent[]): void;
}

/** One of the scripted bots for either Side; the same decisions playLw makes for Side 0. */
export function sideBot(bot: Exclude<LwBot, 'competent'>, side: SideId): SideBot {
  let leakTick = -1;
  return {
    side,
    next: (state) => decide(bot, { state, race: state.mode.sides[side].race, side }, leakTick),
    seen(state, events) {
      for (const e of events) {
        if (e.type === 'mode' && e.name === 'lw.leak' && (e.data as { from: SideId }).from === side) leakTick = state.tick;
      }
    },
  };
}

/** The last tick a Run can reach: the 30th drain, at 19:50. */
export const LAST_TICK = (SUDDEN_DEATH_AT + 29 * 10) * TICK_RATE;
