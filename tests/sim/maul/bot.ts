import { MAUL_TOWERS, RACE_SPECS, type MaulWave, type RaceId } from '../../../src/content/maul';
import {
  CELL, airRoute, allRouteCells, cellCol, cellRow, createRun, maul, previewAllRoutes, step,
  type Command, type Difficulty, type GameState, type ReplayEntry, type SimEvent, type Tower,
} from '../../../src/sim';

// A headless Maul player. It builds a serpentine of Walls across the lower
// field, which every creep from both gates crosses, so each block lengthens the
// path at once. A share of all its gold goes to Walls; the rest goes to the
// upgrade that adds the most damage per gold where the routes (and, for towers
// that hit air, the air lines) pass closest. It sends each Wave as soon as it
// has nothing left to buy.

export interface BotOptions {
  readonly race?: RaceId;
  /** Lines its Walls become, in rotation: A then B by default. */
  readonly lines?: readonly ('a' | 'b')[];
  /** Fork picks by Tier 2 spec; the first fork otherwise. */
  readonly forks?: Readonly<Record<string, string>>;
  /** Share of all gold earned that goes to Walls, 0.35 by default. */
  readonly wallShare?: number;
  /** Tier 1 towers it builds before any Wall, 4 by default. */
  readonly opening?: number;
  /** Waves instead of the 40. */
  readonly waves?: readonly MaulWave[];
  /** Starting gold instead of the Run's. */
  readonly gold?: number;
  /** Every command the bot sends, stamped with its tick: a replay log. */
  readonly record?: ReplayEntry[];
  readonly maxTicks?: number;
}

export interface BotResult {
  readonly phase: string;
  readonly won: boolean;
  readonly wave: number;
  readonly completed: number;
  readonly lives: number;
  readonly gold: number;
  readonly towers: number;
  readonly walls: number;
  readonly tiers: number[];
  readonly routeLength: number;
  readonly leaks: number;
  readonly interest: number;
  readonly ticks: number;
  readonly rejected: string[];
  readonly meanStepMs: number;
  readonly state: maul.MaulGameState;
}

/** Default forks: the single-target or crowd fork that suits a bot that never retargets. */
const FORKS: Readonly<Record<string, string>> = {
  heavy_ballista: 'repeater', siege_mortar: 'thunder_mortar',
  frost_lance: 'glacier_spike', rime_totem: 'blizzard_totem',
  viper_tower: 'asp_spire', plague_pod: 'blight_pod',
  storm_rune: 'chain_rune', sigil: 'nova_circle',
};

/**
 * The maze: three Walls of 2 × 2 blocks across the lower field, open at
 * alternate ends, so the walk from the Ford to the West Post snakes across the
 * field three times before the Posts send it along the south edge and back.
 * Each Wall grows from its closed end toward its gap, so every block
 * lengthens the path at once.
 */
export function mazeBlueprint(): [number, number][] {
  const out: [number, number][] = [];
  [15, 19, 23].forEach((row, i) => {
    const gapEast = i % 2 === 0;
    const cols: number[] = [];
    for (let c = gapEast ? 1 : 3; c <= (gapEast ? 43 : 45); c += 2) cols.push(c);
    if (!gapEast) cols.reverse();
    for (const c of cols) out.push([c, row]);
  });
  return out;
}

function dps(spec: string): number {
  const t = MAUL_TOWERS[spec];
  const a = t?.attack;
  let value = 0;
  if (a) {
    value = (a.damage[0] + a.damage[1]) / 2 / a.cooldown;
    for (const e of a.effects ?? []) {
      const x = e as { kind: string; count?: number; dps?: number; jumps?: number; chance?: number; multiplier?: number };
      if (x.kind === 'multishot' && x.count) value *= 1 + (x.count - 1) * 0.5;
      if (x.kind === 'splash') value *= 2;
      if (x.kind === 'maul.venom' && x.dps) value += x.dps;
      if (x.kind === 'maul.spread' && x.dps) value += x.dps * 2.5;
      if (x.kind === 'maul.chain' && x.jumps) value *= 1 + x.jumps * 0.5;
      if (x.kind === 'crit' && x.chance && x.multiplier) value *= 1 + x.chance * (x.multiplier - 1);
      if (x.kind === 'slow') value *= 1.2;
    }
  }
  for (const aura of t?.auras ?? []) {
    if (aura.kind === 'poison') value += aura.value * 3;
    if (aura.kind === 'slow') value += 10 * aura.value * 4;
    if (aura.kind === 'armor') value += aura.value * 3;
    if (aura.kind === 'damage') value += 40 * aura.value;
  }
  return value;
}

interface Cover {
  readonly ground: { x: number; y: number }[];
  readonly air: { x: number; y: number }[];
}

function coverOf(state: GameState): Cover {
  const ground = allRouteCells(state).flat().map((c) => ({ x: (cellCol(state.map, c) + 0.5) * CELL, y: (cellRow(state.map, c) + 0.5) * CELL }));
  const air: { x: number; y: number }[] = [];
  for (let spawn = 0; spawn < (state.map.spawns?.length ?? 1); spawn++) {
    const line = airRoute(state, spawn);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const n = Math.max(1, Math.round(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) / CELL));
      for (let k = 0; k < n; k++) air.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return { ground, air };
}

/** How much of the routes (and, for air-hitting towers, the air lines) a tower of `spec` at (x, y) would see. */
function coverage(cover: Cover, spec: string, x: number, y: number): number {
  const t = MAUL_TOWERS[spec];
  const range = Math.max(t?.attack?.range ?? 0, ...(t?.auras ?? []).map((a) => a.radius));
  const r2 = range * range;
  const layer = t?.attack?.targets ?? 'ground';
  let n = 0;
  if (layer !== 'air') for (const p of cover.ground) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) n++;
  if (layer !== 'ground') for (const p of cover.air) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) n += 2;
  return n;
}

function nextFor(tower: Tower, o: BotOptions, upgraded: number): string | null {
  const info = MAUL_TOWERS[tower.spec]!.maul;
  if (info.next.length === 0) return null;
  if (info.tier === 0) {
    const lines = o.lines ?? ['a', 'b'];
    const line = lines[upgraded % lines.length]!;
    return info.next.find((n) => MAUL_TOWERS[n]!.maul.line === line) ?? info.next[0]!;
  }
  if (info.next.length > 1) return info.next.find((n) => n === (o.forks ?? FORKS)[tower.spec]) ?? info.next[0]!;
  return info.next[0]!;
}

/** Every 2 × 2 anchor on the even grid whose cells are all open ground: where the bot may stand a tower. */
function anchors(state: GameState): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r + 1 < state.map.rows; r += 1) {
    for (let c = 0; c + 1 < state.map.cols; c += 1) {
      const t = state.map.terrain;
      if (t[r]![c] === '.' && t[r]![c + 1] === '.' && t[r + 1]![c] === '.' && t[r + 1]![c + 1] === '.') out.push([c, r]);
    }
  }
  return out;
}

function routeLength(state: GameState, cells: readonly number[]): number {
  const routes = previewAllRoutes(state, cells);
  return routes ? routes.reduce((n, r) => n + r.length, 0) : -1;
}

/** Of the next few blueprint blocks that can go down, the one that lengthens the walk most (the first on a tie). */
function nextWall(state: maul.MaulGameState, plan: readonly [number, number][]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestLen = -1;
  let tried = 0;
  for (const [c, r] of plan) {
    const spot = maul.buildSpot(state, c, r);
    if (spot.error !== null) continue;
    const len = routeLength(state, spot.cells);
    if (len > bestLen) {
      best = [c, r];
      bestLen = len;
    }
    if (++tried >= 8) break;
  }
  return best;
}

function decide(state: maul.MaulGameState, plan: readonly [number, number][], o: BotOptions, cover: Cover, spots: readonly [number, number][]): Command | null {
  const race = RACE_SPECS[state.mode.races[0]!];
  const [wall, a1, b1] = race.builds;
  const wallCost = MAUL_TOWERS[wall]!.cost;
  const fighters = state.towers.filter((t) => MAUL_TOWERS[t.spec]!.maul.tier > 0).length;
  // Open with Tier 1 towers where the creeps walk most, before any maze pays off.
  if (fighters < (o.opening ?? 4)) {
    const lineup = o.lines ?? ['a', 'b'];
    const spec = lineup[fighters % lineup.length] === 'b' ? b1 : a1;
    if (state.gold < MAUL_TOWERS[spec]!.cost) return null;
    let best: [number, number] | null = null;
    let bestScore = 0;
    for (const [c, r] of spots) {
      const score = coverage(cover, spec, (c + 1) * CELL, (r + 1) * CELL);
      if (score <= bestScore || maul.buildSpot(state, c, r).error !== null) continue;
      best = [c, r];
      bestScore = score;
    }
    if (best) return { type: 'maul.build', spec, col: best[0], row: best[1] };
  }
  // Walls get a share of everything earned so far, so the maze grows with the Run.
  let spent = 0;
  for (const ts of Object.values(state.mode.towers)) spent += ts.paid;
  const wallShare = o.wallShare ?? 0.35;
  const walls = state.towers.length - fighters;
  if (walls * wallCost < wallShare * (spent + state.gold) && state.gold >= wallCost) {
    const at = nextWall(state, plan);
    if (at) return { type: 'maul.build', spec: wall, col: at[0], row: at[1] };
  }
  let best: { command: Command; value: number; price: number } | null = null;
  for (const t of state.towers) {
    const to = nextFor(t, o, fighters);
    if (!to) continue;
    const price = MAUL_TOWERS[to]!.maul.price;
    const gain = (dps(to) - dps(t.spec)) * coverage(cover, to, t.x, t.y);
    const value = gain / price;
    if (!best || value > best.value) best = { command: { type: 'maul.upgrade', tower: t.id, to }, value, price };
  }
  if (best && best.price <= state.gold) return best.command;
  return null;
}

export function playRun(seed: number, difficulty: Difficulty, o: BotOptions = {}): BotResult {
  const options: Record<string, unknown> = { race: o.race ?? 'ironclad' };
  if (o.waves) options['waves'] = JSON.parse(JSON.stringify(o.waves));
  if (o.gold !== undefined) options['gold'] = o.gold;
  const state = createRun({ mode: 'maul', seed, difficulty, options: options as never }) as maul.MaulGameState;
  const plan = mazeBlueprint();
  const spots = anchors(state);
  const rejected: string[] = [];
  const maxTicks = o.maxTicks ?? 30 * 60 * 60;
  let steps = 0;
  let total = 0;
  let cover = coverOf(state);
  let version = state.pathVersion;
  const send = (commands: Command[]): SimEvent[] => {
    for (const c of commands) o.record?.push({ tick: state.tick, command: c });
    const t0 = performance.now();
    const events = step(state, commands);
    total += performance.now() - t0;
    steps++;
    for (const e of events) if (e.type === 'rejected') rejected.push(`${String(e.command.type)}: ${e.reason}`);
    return events;
  };
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const commands: Command[] = [];
    if (state.tick % 15 === 0) {
      if (state.pathVersion !== version) {
        cover = coverOf(state);
        version = state.pathVersion;
      }
      const c = decide(state, plan, o, cover, spots);
      if (c) commands.push(c);
      // Nothing left to buy: send the next Wave rather than wait out the Break.
      if (!c && state.phase === 'build') commands.push({ type: 'maul.sendNow' });
    }
    send(commands);
  }
  const routes = allRouteCells(state);
  return {
    phase: state.phase, won: state.phase === 'won', wave: state.wave.number, completed: state.mode.completed, lives: state.lives,
    gold: state.gold, towers: state.towers.length,
    walls: state.towers.filter((t) => MAUL_TOWERS[t.spec]!.maul.tier === 0).length,
    tiers: [1, 2, 3].map((tier) => state.towers.filter((t) => MAUL_TOWERS[t.spec]!.maul.tier === tier).length),
    routeLength: Math.max(...routes.map((r) => r.length)),
    leaks: state.mode.leaks, interest: state.mode.interest, ticks: state.tick, rejected,
    meanStepMs: total / Math.max(1, steps), state,
  };
}
