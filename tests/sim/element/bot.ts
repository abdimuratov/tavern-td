import { ELEMENT_MAP, ELEMENT_TOWERS, type Element } from '../../../src/content/element';
import {
  CELL, createRun, element, routePoint, routeData, step,
  type Command, type Difficulty, type ReplayEntry, type SimEvent,
} from '../../../src/sim';

// A headless Element player (All Pick). It summons Light, Water and Earth in
// turn, builds level-1 singles on the plots that see the most of the lane, and
// spends the rest on whichever upgrade buys the most damage per second per gold
// along the Light/Water/Earth tree (Ice, Quark, Hydro, then Polar). It kills its
// own Elementals with the same towers.

export interface BotOptions {
  readonly length?: 'full' | 'express';
  /** Every command the bot sends, stamped with its tick: a replay log. */
  readonly record?: ReplayEntry[];
  /** Stop after this many ticks. */
  readonly maxTicks?: number;
  /** Stop once this many Waves are cleared. */
  readonly maxWaves?: number;
}

export interface BotResult {
  readonly wave: number;
  readonly completed: number;
  readonly won: boolean;
  readonly phase: string;
  readonly ticks: number;
  readonly steps: number;
  readonly meanStepMs: number;
  readonly maxStepMs: number;
  readonly towers: number;
  readonly rejected: string[];
  readonly record: element.ElementRecord;
  readonly levels: Readonly<Record<Element, number>>;
  readonly state: element.ElementGameState;
}

const PLAN: readonly Element[] = ['light', 'light', 'light', 'water', 'water', 'water', 'earth', 'earth', 'earth', 'nature', 'dark'];
/** Towers the bot will build or upgrade into. */
const FAMILIES = new Set(['light', 'water', 'earth', 'ice', 'quark', 'hydro', 'polar']);

/** Rough damage per second of a spec: attack × splash, plus Polar's frostbite. */
function dps(spec: string): number {
  const t = ELEMENT_TOWERS[spec];
  if (!t?.attack) return 0;
  const info = t.element;
  let hit = info.baseDamage;
  if (info.splash) hit *= 1.6;
  if (info.family === 'light') hit *= 1.5;
  if (info.family === 'polar') hit *= 1.3;
  return hit / info.cooldown;
}

/** 2 × 2 anchors on the plots, best first: how much of the lane lies within range 900 of each. */
function spots(): [number, number][] {
  const route = routeData(ELEMENT_MAP)!;
  const samples: { x: number; y: number }[] = [];
  for (let d = 0; d < route.length; d += 32) samples.push(routePoint(route, d));
  const scored: { col: number; row: number; score: number }[] = [];
  const t = ELEMENT_MAP.terrain;
  for (let row = 0; row + 1 < ELEMENT_MAP.rows; row++) {
    for (let col = 0; col + 1 < ELEMENT_MAP.cols; col++) {
      if (t[row]![col] !== '.' || t[row]![col + 1] !== '.' || t[row + 1]![col] !== '.' || t[row + 1]![col + 1] !== '.') continue;
      const cx = (col + 1) * CELL;
      const cy = (row + 1) * CELL;
      let score = 0;
      for (const p of samples) if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) <= 850 * 850) score++;
      scored.push({ col, row, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
  const taken = new Set<string>();
  const out: [number, number][] = [];
  for (const s of scored) {
    const cells = [`${s.col},${s.row}`, `${s.col + 1},${s.row}`, `${s.col},${s.row + 1}`, `${s.col + 1},${s.row + 1}`];
    if (cells.some((c) => taken.has(c))) continue;
    for (const c of cells) taken.add(c);
    out.push([s.col, s.row]);
  }
  return out;
}

const SPOTS = spots();

/** Nothing stands in the way but gold. */
function onlyGold(blocked: string | null): boolean {
  return blocked === null || blocked.endsWith(' gold');
}

function decide(state: element.ElementGameState, plan: { next: number }): Command | null {
  const status = element.elementStatus(state);
  // Elements first: the next one in the plan that can be summoned.
  if (status.lumber > 0) {
    const summons = element.summonOptions(state);
    while (plan.next < PLAN.length && summons.elements.find((o) => o.element === PLAN[plan.next])!.next === null) plan.next++;
    const e = PLAN[plan.next];
    if (e && summons.elements.find((o) => o.element === e)!.blocked === null) {
      plan.next++;
      return { type: 'element.summon', element: e };
    }
  }
  // The best damage per gold among upgrades and a new single; it saves up for it rather than settle.
  let best: { command: Command; value: number; affordable: boolean } | null = null;
  const consider = (command: Command, value: number, affordable: boolean): void => {
    if (!best || value > best.value) best = { command, value, affordable };
  };
  for (const t of state.towers) {
    const actions = element.towerActions(state, t.id);
    if (!actions) continue;
    for (const u of actions.upgrades) {
      if (u.needs !== null || u.essence > 0 || !onlyGold(u.blocked) || !FAMILIES.has(ELEMENT_TOWERS[u.to]!.element.family)) continue;
      consider({ type: 'element.upgrade', tower: t.id, to: u.to }, (dps(u.to) - dps(t.spec)) / u.cost, u.blocked === null);
    }
  }
  const free = SPOTS.find(([col, row]) => element.buildSpot(state, col, row).error === null);
  if (free) {
    const unlocked = Object.values(status.levels).some((l) => l > 0);
    for (const o of element.buildOptions(state)) {
      const family = ELEMENT_TOWERS[o.spec]!.element.family;
      const usable = FAMILIES.has(family) ? onlyGold(o.blocked) : o.spec === 'basic_arrow_tower' && !unlocked;
      if (!usable || o.essence > 0) continue;
      // Spots matter more while there are few towers.
      const value = (dps(o.spec) / o.cost) * (state.towers.length < 8 ? 3 : 1);
      consider({ type: 'element.build', spec: o.spec, col: free[0], row: free[1] }, value, o.blocked === null);
    }
  }
  const chosen = best as { command: Command; value: number; affordable: boolean } | null;
  return chosen?.affordable ? chosen.command : null;
}

function over(state: element.ElementGameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

export function playRun(seed: number, difficulty: Difficulty, opts: BotOptions = {}): BotResult {
  const state = createRun({ mode: 'element', seed, difficulty, options: { picks: 'allPick', length: opts.length ?? 'full' } }) as element.ElementGameState;
  const plan = { next: 0 };
  const rejected: string[] = [];
  const maxTicks = opts.maxTicks ?? 30 * 60 * 120;
  let steps = 0;
  let total = 0;
  let max = 0;
  while (!over(state) && state.tick < maxTicks) {
    if (opts.maxWaves !== undefined && state.mode.completed >= opts.maxWaves) break;
    const commands: Command[] = [];
    // Decide twice a second; up to a few actions each time.
    if (state.tick % 15 === 0) {
      for (let i = 0; i < 4; i++) {
        const c = decide(state, plan);
        if (!c) break;
        commands.push(c);
        opts.record?.push({ tick: state.tick, command: c });
        const t0 = performance.now();
        const events: SimEvent[] = step(state, [c]);
        const dt = performance.now() - t0;
        steps++;
        total += dt;
        max = Math.max(max, dt);
        for (const e of events) if (e.type === 'rejected') rejected.push(e.reason);
        if (over(state)) break;
      }
      if (commands.length > 0) continue;
    }
    const t0 = performance.now();
    step(state, []);
    const dt = performance.now() - t0;
    steps++;
    total += dt;
    max = Math.max(max, dt);
  }
  const record = element.elementRecord(state);
  return {
    wave: state.wave.number, completed: state.mode.completed, won: record.won, phase: state.phase, ticks: state.tick, steps,
    meanStepMs: total / Math.max(1, steps), maxStepMs: max, towers: state.towers.length, rejected, record,
    levels: { ...state.mode.levels }, state,
  };
}
