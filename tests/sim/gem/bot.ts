import { GEM_CREEPS, GEM_DAMAGE_TABLE, SPECIAL_LINES, waveCreepId, type GemTowerSpec } from '../../../src/content/gem';
import {
  cellCol, cellOf, cellRow, createRun, footprintCells, gem, routeCells, step,
  type Command, type Difficulty, type GameState, type ReplayEntry, type SimEvent,
} from '../../../src/sim';

// A headless Gem player. Each build phase it buys Gem Quality, drops its five
// Draft gems on the next slots of a fixed maze, and keeps whichever choice
// (keep, merge, Recipe) makes the strongest tower against the next few Waves
// for its spot; it also keeps the missing parts of a few early Recipes. During
// Waves it fuses field Recipes and buys cheap special upgrades before Gem Quality.

export interface BotOptions {
  /** Every command the bot sends, stamped with its tick: a replay log. */
  readonly record?: ReplayEntry[];
  /** Called after every step, for diagnostics. */
  readonly probe?: (state: gem.GemGameState, events: readonly SimEvent[]) => void;
}

export interface BotResult {
  readonly wave: number;
  readonly won: boolean;
  readonly phase: string;
  readonly ticks: number;
  readonly steps: number;
  /** Mean wall-clock milliseconds per step(). */
  readonly meanStepMs: number;
  readonly maxStepMs: number;
  readonly towers: number;
  readonly rejected: string[];
  readonly record: gem.GemRecord;
  readonly routeLength: number;
  readonly state: gem.GemGameState;
}

const CELL = 64;
/** Recipes whose parts the bot collects: their parts are early gems and their first upgrades are cheap. */
const RECIPES = ['silver', 'malachite', 'jade'];

const towers: Readonly<Record<string, GemTowerSpec>> = gem.GEM_TOWERS;

/**
 * The bot's maze. The field's west edge (unbuildable stripes, the spawn lane)
 * and south edge (the exit lane) can never be closed, so walls only pay when
 * they close against the cliffs in the east or against each other:
 * 1. A wall right across the field at row 24. Checkpoints 1→2, 3→4 and 5→6
 *    have to go round its west end and back. Slots run outward from
 *    checkpoint 5–6's lane, so the first kept gems stand where routes meet.
 * 2. A wall hanging from it at col 44 down to just above the exit lane, so
 *    checkpoints 2→3 and 3→4 go down to the exit lane and back.
 */
export function mazeBlueprint(): [number, number][] {
  const wall: number[] = [];
  for (let c = 73; c >= 19; c -= 2) wall.push(c);
  wall.sort((a, b) => Math.abs(a - 53) - Math.abs(b - 53) || a - b);
  const out: [number, number][] = wall.map((c) => [c, 24]);
  for (let r = 26; r <= 66; r += 2) out.push([44, r]);
  return out;
}

/** Attack damage per second, crits, splash and frost roughly priced in. */
function attackDps(spec: string): number {
  const a = towers[spec]?.attack;
  if (!a) return 0;
  let hit = (a.damage[0] + a.damage[1]) / 2;
  for (const e of a.effects ?? []) {
    const x = e as { kind: string; chance?: number; multiplier?: number };
    if (x.kind === 'crit' && x.chance !== undefined && x.multiplier !== undefined) hit *= 1 + x.chance * (x.multiplier - 1);
    if (x.kind === 'splash') hit *= 1.4;
    if (x.kind === 'gem.frost') hit *= 1.15;
  }
  return hit / a.cooldown;
}

/** Damage per second from everything but the attack: poison, Barrage, burns, auras. */
function otherDps(spec: string): number {
  const t = towers[spec];
  if (!t) return 0;
  let dps = 0;
  for (const e of t.attack?.effects ?? []) {
    const x = e as { kind: string; dps?: number };
    if (x.kind === 'gem.poison' && x.dps !== undefined) dps += x.dps;
  }
  const b = t.gem.barrage;
  if (b) dps += (b.damage * (b.targets === 0 ? 4 : Math.min(b.targets, 4))) / b.cooldown;
  if (t.gem.burn) dps += t.gem.burn.dps * 1.5;
  for (const aura of t.auras ?? []) dps += (aura.to === 'towers' ? 30 : 4) * aura.value;
  return dps;
}

/** Damage per second against the next few Waves' creeps (the next weighs most), by damage table and armor. */
export function upcomingDps(spec: string, nextWave: number): number {
  const t = towers[spec];
  if (!t) return 0;
  let total = 0;
  let weight = 0;
  for (let w = nextWave; w < nextWave + 4 && w <= 50; w++) {
    const cs = GEM_CREEPS[waveCreepId(w)]!;
    const k = w === nextWave ? 3 : 1;
    const layer = t.attack?.targets ?? 'both';
    const reaches = layer === 'both' || (layer === 'air') === cs.flying;
    const factor = (GEM_DAMAGE_TABLE[t.attack?.attackType ?? 'spells']?.[cs.armorType] ?? 1) / (1 + 0.06 * cs.armor);
    total += k * ((reaches ? attackDps(spec) * factor : 0) + otherDps(spec) * (GEM_DAMAGE_TABLE['spells']?.[cs.armorType] ?? 1));
    weight += k;
  }
  return total / weight;
}

function rangeOf(spec: string): number {
  const t = towers[spec];
  return Math.max(t?.attack?.range ?? 0, t?.gem.barrage?.radius ?? 0, t?.gem.burn?.radius ?? 0, 300);
}

/** Route cells within `range` of (x, y), counting a cell once per pass. */
function coverage(state: GameState, route: readonly number[], x: number, y: number, range: number): number {
  const r2 = range * range;
  let n = 0;
  for (const c of route) {
    const dx = (cellCol(state.map, c) + 0.5) * CELL - x;
    const dy = (cellRow(state.map, c) + 0.5) * CELL - y;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}

/** Every anchor whose 2 × 2 footprint is all buildable terrain. */
function anchors(state: GameState): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r + 1 < state.map.rows; r++) {
    for (let c = 0; c + 1 < state.map.cols; c++) {
      const cells = footprintCells(state.map, cellOf(state.map, c, r), 2);
      if (cells.every((i) => state.map.terrain[cellRow(state.map, i)]![cellCol(state.map, i)] === '.')) out.push([c, r]);
    }
  }
  return out;
}

type Tick = (commands: Command[]) => SimEvent[];

function buyQuality(state: gem.GemGameState, tick: Tick): void {
  while (gem.gemStatus(state).qualityBlocked === null) tick([{ type: 'gem.buyQuality' }]);
}

function placeDraft(state: gem.GemGameState, plan: readonly [number, number][], spots: readonly [number, number][], tick: Tick): void {
  while (state.phase === 'build' && state.mode.draft.length < gem.DRAFT_SIZE) {
    let best = plan.find(([c, r]) => gem.draftSpot(state, c, r).error === null) ?? null;
    if (!best) {
      // The maze is done: the best-covered free spot.
      const route = routeCells(state);
      let bestScore = -1;
      for (const [c, r] of spots) {
        const score = coverage(state, route, (c + 1) * CELL, (r + 1) * CELL, 700);
        if (score <= bestScore || gem.draftSpot(state, c, r).error !== null) continue;
        best = [c, r];
        bestScore = score;
      }
    }
    if (!best) throw new Error('bot found nowhere to place a Draft gem');
    tick([{ type: 'gem.placeDraft', col: best[0], row: best[1] }]);
  }
}

function choose(state: gem.GemGameState, tick: Tick): void {
  if (state.phase !== 'build') return;
  const route = routeCells(state);
  const next = state.wave.number + 1;
  const kept = new Set(state.towers.filter((t) => !state.mode.draft.includes(t.id)).map((t) => t.spec));
  let best: Command | null = null;
  let bestScore = -Infinity;
  const consider = (command: Command, spec: string, x: number, y: number): void => {
    let value = upcomingDps(spec, next);
    // A missing part of a Recipe it is collecting is worth much of the special.
    const line = SPECIAL_LINES.find((l) => l.parts.includes(spec));
    if (line && RECIPES.includes(line.id) && !kept.has(spec) && !state.towers.some((t) => towers[t.spec]?.gem.family === line.id)) {
      value = Math.max(value, upcomingDps(line.tiers[1] ?? line.tiers[0]!, next));
    }
    const score = value * (1 + coverage(state, route, x, y, rangeOf(spec)));
    if (score > bestScore) {
      best = command;
      bestScore = score;
    }
  };
  for (const choice of gem.draftChoices(state)) {
    const t = state.towers.find((u) => u.id === choice.tower)!;
    consider({ type: 'gem.keep', tower: t.id }, choice.spec, t.x, t.y);
    for (const count of [2, 3, 4] as const) {
      const result = choice.merge[count];
      if (result) consider({ type: 'gem.merge', tower: t.id, count }, result, t.x, t.y);
    }
    if (choice.recipe) consider({ type: 'gem.combineRecipe', tower: t.id }, choice.recipe, t.x, t.y);
  }
  if (!best) throw new Error('bot had no Draft choice');
  tick([best]);
}

/** What to do mid-Wave: fuse ready Recipes, then a cheap upgrade or Gem Quality, whichever costs less. */
function waveCommands(state: gem.GemGameState): Command[] {
  const commands: Command[] = [];
  for (const t of state.towers) {
    const combine = gem.towerActions(state, t.id).combineRecipe;
    if (combine && combine.blocked === null) commands.push(combine.command);
  }
  const ups = state.towers
    .map((t) => gem.towerActions(state, t.id).upgrade)
    .filter((u): u is NonNullable<typeof u> => u !== undefined && u.blocked === null)
    .sort((p, q) => p.cost - q.cost);
  const status = gem.gemStatus(state);
  const up = ups[0];
  if (up && (status.nextQualityCost === null || up.cost <= status.nextQualityCost)) commands.push(up.command);
  else if (status.qualityBlocked === null) commands.push({ type: 'gem.buyQuality' });
  else if (up && state.mode.quality >= 6) commands.push(up.command);
  return commands;
}

/** Plays a Run until it is won or lost, or `maxTicks` pass. */
export function playRun(seed: number, difficulty: Difficulty = 'normal', maxTicks = 30 * 60 * 120, opts: BotOptions = {}): BotResult {
  const state = createRun({ mode: 'gem', seed, difficulty }) as gem.GemGameState;
  const plan = mazeBlueprint();
  const spots = anchors(state);
  const rejected: string[] = [];
  let steps = 0;
  let total = 0;
  let worst = 0;
  const tick: Tick = (commands) => {
    if (opts.record) for (const command of commands) opts.record.push({ tick: state.tick, command });
    const t0 = performance.now();
    const events = step(state, commands);
    const dt = performance.now() - t0;
    total += dt;
    worst = Math.max(worst, dt);
    steps++;
    for (const e of events) if (e.type === 'rejected') rejected.push(`${String(e.command.type)}: ${e.reason}`);
    opts.probe?.(state, events);
    return events;
  };

  while (state.tick < maxTicks && state.phase !== 'won' && state.phase !== 'lost') {
    if (state.phase === 'build') {
      buyQuality(state, tick);
      placeDraft(state, plan, spots, tick);
      choose(state, tick);
    } else {
      tick(state.tick % 15 === 0 ? waveCommands(state) : []);
    }
  }
  return {
    wave: state.wave.number,
    won: state.phase === 'won',
    phase: state.phase,
    ticks: state.tick,
    steps,
    meanStepMs: total / Math.max(1, steps),
    maxStepMs: worst,
    towers: state.towers.length,
    rejected,
    record: gem.gemRecord(state),
    routeLength: routeCells(state).length,
    state,
  };
}
