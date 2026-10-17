import { stageByNumber, type Family, type OriginalWave } from '../../../src/content/original';
import {
  CELL, createRun, original, routeData, routePoint, step,
  type Command, type Difficulty, type MapSpec, type ReplayEntry, type SimEvent,
} from '../../../src/sim';

// A headless Original player. It fills the Build Spots that see the most of
// the routes, mixing families in a fixed rotation, then spends on whichever
// Tier upgrade (or Specialisation) is cheapest. It sends Wave 1 at once and,
// when greedy, calls each Wave early once the field is clear.

export interface BotOptions {
  readonly stage?: number;
  readonly talents?: readonly string[];
  readonly cleared?: number;
  /** Waves instead of the Stage's own. */
  readonly waves?: readonly OriginalWave[];
  /** Families to build, in rotation; Arrow and Cannon by default. */
  readonly families?: readonly Family[];
  /** Specialisation picks by Tier 3 spec, the first option otherwise. */
  readonly specialise?: Readonly<Record<string, string>>;
  /** Call the next Wave early whenever no creep is on the Map. */
  readonly greedy?: boolean;
  /** Every command the bot sends, stamped with its tick: a replay log. */
  readonly record?: ReplayEntry[];
  readonly maxTicks?: number;
}

export interface BotResult {
  readonly phase: string;
  readonly won: boolean;
  readonly completed: number;
  readonly lives: number;
  readonly stars: number;
  readonly gold: number;
  readonly towers: number;
  readonly levels: number[];
  readonly earlyGold: number;
  readonly ticks: number;
  readonly rejected: string[];
  readonly meanStepMs: number;
  readonly state: original.OriginalGameState;
}

/** Build Spots best first: how much of every route lies within 340 of each Spot's centre. */
export function rankedSpots(map: MapSpec): number[] {
  const samples: { x: number; y: number }[] = [];
  for (let r = 0; r < (map.routes?.length ?? 1); r++) {
    const route = routeData(map, r);
    if (!route) continue;
    for (let d = 0; d < route.length; d += 32) samples.push(routePoint(route, d));
  }
  const spots = (map.buildSpots ?? []).map(([col, row], i) => {
    const cx = (col + 1) * CELL;
    const cy = (row + 1) * CELL;
    let score = 0;
    for (const p of samples) if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) <= 340 * 340) score++;
    return { i, score };
  });
  spots.sort((a, b) => b.score - a.score || a.i - b.i);
  return spots.map((s) => s.i);
}

function decide(state: original.OriginalGameState, spots: readonly number[], o: BotOptions, built: { n: number }): Command | null {
  const families = o.families ?? ['arrow', 'cannon'];
  // Fill the best empty Spot first, rotating families.
  for (const spot of spots) {
    const info = original.spotInfo(state, spot);
    if (info.tower !== 0) continue;
    const family = families[built.n % families.length]!;
    const option = info.options.find((x) => x.family === family);
    if (!option) continue;
    if (option.blocked === null) {
      built.n++;
      return { type: 'original.build', spot, spec: option.spec };
    }
    // Save up for it while Spots are scarce in towers.
    if (state.towers.length < 3) return null;
    break;
  }
  // Then the cheapest upgrade.
  let best: { command: Command; price: number } | null = null;
  for (const t of state.towers) {
    const actions = original.towerActions(state, t.id);
    if (!actions) continue;
    const pick = actions.upgrades.length > 1 ? actions.upgrades.find((u) => u.to === o.specialise?.[t.spec]) ?? actions.upgrades[0] : actions.upgrades[0];
    if (!pick || (pick.blocked !== null && !pick.blocked.endsWith(' gold'))) continue;
    if (!best || pick.price < best.price) best = { command: { type: 'original.upgrade', tower: t.id, to: pick.to }, price: pick.price };
  }
  if (best && best.price <= state.gold) return best.command;
  return null;
}

export function playStage(seed: number, difficulty: Difficulty, o: BotOptions = {}): BotResult {
  const stage = o.stage ?? 1;
  const options: Record<string, unknown> = { stage, talents: [...(o.talents ?? [])] };
  if (o.cleared !== undefined) options['cleared'] = o.cleared;
  if (o.waves !== undefined) options['waves'] = JSON.parse(JSON.stringify(o.waves));
  const state = createRun({ mode: 'original', seed, difficulty, options: options as never }) as original.OriginalGameState;
  const spots = rankedSpots(stageByNumber(stage)!.map);
  const built = { n: 0 };
  const rejected: string[] = [];
  const maxTicks = o.maxTicks ?? 30 * 60 * 40;
  let steps = 0;
  let total = 0;
  const send = (commands: Command[]): SimEvent[] => {
    for (const c of commands) o.record?.push({ tick: state.tick, command: c });
    const t0 = performance.now();
    const events = step(state, commands);
    total += performance.now() - t0;
    steps++;
    for (const e of events) if (e.type === 'rejected') rejected.push(e.reason);
    return events;
  };
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const commands: Command[] = [];
    if (state.tick % 15 === 0) {
      const status = original.originalStatus(state);
      const clear = !state.creeps.some((c) => c.hp > 0);
      if (status.sendNowBlocked === null && (status.step === 'ready' || (o.greedy && clear && status.step === 'break'))) {
        commands.push({ type: 'original.sendNow' });
      }
      const c = decide(state, spots, o, built);
      if (c) commands.push(c);
    }
    send(commands);
  }
  const towers = state.towers.map((t) => state.mode.towers[String(t.id)]!.level);
  const result = original.originalResult(state);
  return {
    phase: state.phase, won: result.won, completed: state.mode.completed, lives: state.lives, stars: result.stars, gold: state.gold,
    towers: state.towers.length, levels: towers, earlyGold: state.mode.earlyGold, ticks: state.tick, rejected,
    meanStepMs: total / Math.max(1, steps), state,
  };
}
