import type { Family, OriginalWave } from '../../src/content/original';
import {
  createRun, original, routeCount, step,
  type Command, type Difficulty, type ReplayEntry, type SimEvent,
} from '../../src/sim';
import { baseline, gain, gainAdding, ghoulStreams, makePlanner, placedTowers, prepare, streamsAhead, type Planner } from './value';
import { layPlaces, mapView, type MapView, type Place } from './view';

export { rankedPlaces } from './view';

// A headless Original player for the balance runner and the tests
// (docs/PLAN.md §4). It plays one of these strategies:
// - rotation: fills the places that see the most route, rotating through the
//   families it's given, then buys the cheapest upgrade. The first, simple bot.
// - greedy: buys whatever adds the most raw damage per gold, as if every creep
//   were a Ghoul. It ignores armor, wards, Shields and flyers.
// - balanced: the competent player. It values each purchase against the
//   creeps of the next few Waves (armor and damage types, Shields, flyers,
//   crowds), counts slows and auras, and picks Specialisations to match. It
//   builds around a core family, Arrow by default, and adds another family's
//   tower only where it's clearly worth more.
// - single: balanced, but with only one family (`families: [f]`).
// Before Wave 1 each player lays out the places it builds on (view.ts, by
// docs/original-design.md §17's rule), which stand in for the Build Spots it
// once had. `style` seeds a player's quirks: a little noise in how it scores
// places and ranks purchases, and whether it calls Waves early. Seeds then
// play like different competent players, so a win rate over seeds means something.

export type Strategy = 'rotation' | 'greedy' | 'balanced' | 'single';

export interface BotOptions {
  readonly stage?: number;
  /** The Challenge to play on the Stage, by id; it plays on Normal. */
  readonly challenge?: string;
  readonly talents?: readonly string[];
  readonly cleared?: number;
  /** Waves instead of the Stage's own. */
  readonly waves?: readonly OriginalWave[];
  /** Starting gold instead of the Stage's. */
  readonly gold?: number;
  readonly strategy?: Strategy;
  /** Families it may build: in rotation for `rotation` (Arrow and Cannon by default), the one family for `single`. Every unlocked one otherwise. */
  readonly families?: readonly Family[];
  /** Rotation only: Specialisation picks by Tier 3 spec, the first option otherwise. */
  readonly specialise?: Readonly<Record<string, string>>;
  /** Call the next Wave early whenever no creep is on the Map. The style decides when unset. */
  readonly greedy?: boolean;
  /** Seeds the player's quirks; 0 (the default) for none. */
  readonly style?: number;
  /** Balanced: the family it builds around; Arrow by default. */
  readonly core?: Family;
  /** Every command the bot sends, stamped with its tick: a replay log. */
  readonly record?: ReplayEntry[];
  /** Called after every tick with its events, before the bot looks at the state again (diagnostics). */
  readonly observe?: (state: original.OriginalGameState, events: readonly SimEvent[]) => void;
  readonly maxTicks?: number;
}

export interface BotResult {
  readonly phase: string;
  readonly won: boolean;
  readonly completed: number;
  /** The latest Wave sent. */
  readonly reached: number;
  readonly lives: number;
  readonly stars: number;
  readonly gold: number;
  readonly towers: number;
  readonly levels: number[];
  /** Towers standing at the end, by spec. */
  readonly built: Readonly<Record<string, number>>;
  /** At each Wave's start: lives, gold in hand and gold spent on towers so far. */
  readonly trace: readonly { readonly wave: number; readonly lives: number; readonly gold: number; readonly spent: number; readonly towers: number }[];
  readonly earlyGold: number;
  readonly ticks: number;
  readonly rejected: string[];
  readonly meanStepMs: number;
  readonly state: original.OriginalGameState;
}

// --- Talents a decent player holds ----------------------------------------------

/** Stars a decent player holds on reaching Stage `stage`: 2.5 a Stage before it, rounded down. assumed. */
export function decentStars(stage: number): number {
  return Math.min(36, Math.floor(2.5 * (stage - 1)));
}

/** The Talent each row of a tree takes, for the bots. */
const TALENT_PICKS: Readonly<Record<Family, readonly string[]>> = {
  arrow: ['fletching', 'quick-nock', 'eagle-feathers', 'hawkeye'],
  cannon: ['black-powder', 'quick-reload', 'long-barrels', 'concussion'],
  frost: ['deep-chill', 'brittle', 'hard-frost', 'shatter'],
  arcane: ['focus', 'spellbreaker', 'echo', 'leyline'],
  poison: ['potency', 'corrode', 'antivenom', 'plague-wind'],
  totem: ['drumbeat', 'cheap-carving', 'hex', 'elder-spirits'],
};

/** The order a player fills Talent trees: Arrow, Arcane and Frost first, as the families that hit air. */
const TALENT_ORDER: readonly Family[] = ['arrow', 'arcane', 'frost', 'cannon', 'poison', 'totem'];

/**
 * The Talents a decent player brings to Stage `stage`, spending `stars` on the
 * open trees in `order`. A focused player (`focus`) fills one tree before the
 * next; otherwise it buys row 1 of every tree, then row 2, and so on.
 */
export function decentTalents(stage: number, o: { readonly order?: readonly Family[]; readonly focus?: boolean; readonly stars?: number } = {}): string[] {
  const unlocks = original.unlocksFor(stage - 1);
  const stars = o.stars ?? decentStars(stage);
  const order = o.order ?? TALENT_ORDER;
  const families = [...order, ...TALENT_ORDER.filter((f) => !order.includes(f))].filter((f) => unlocks.families.includes(f));
  let held: string[] = [];
  const buy = (id: string): boolean => {
    if (original.talentError(held, id, stars, unlocks) !== null) return false;
    held = original.buyTalent(held, id, stars, unlocks);
    return true;
  };
  if (o.focus) {
    for (const family of families) for (const id of TALENT_PICKS[family]) if (!buy(id)) break;
  } else {
    for (let row = 0; row < 4; row++) for (const family of families) buy(TALENT_PICKS[family][row]!);
  }
  return held;
}

// --- A player's quirks ----------------------------------------------------------

/** A small seeded generator for the bot's own choices (mulberry32); the game's RNG stays the game's. */
function styleRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Style {
  /** How much each purchase's value is jittered, ±. */
  readonly noise: number;
  /** Null for a player without quirks. */
  readonly rand: (() => number) | null;
  /** Calls Waves early once the field is clear. */
  readonly callsEarly: boolean;
}

function makeStyle(seed: number, greedy: boolean | undefined): Style {
  if (seed === 0) return { noise: 0, rand: null, callsEarly: greedy ?? false };
  const rand = styleRng(seed * 2654435761);
  const callsEarly = greedy ?? rand() < 0.5;
  // The places it lays out take their ±20% from the same seed (view.ts).
  return { noise: 0.15, rand, callsEarly };
}

// --- Choosing a purchase --------------------------------------------------------

interface Purchase {
  readonly command: Command;
  /** A second command for the next tick: the build after a sale that clears its place. */
  readonly then?: Command;
  /** Gold it needs on top of what a sale returns. */
  readonly price: number;
  /** Value gained per gold, after the player's noise. */
  readonly ratio: number;
}

/** What a family's purchases count for beside the core family's: another family's tower must be worth this much more. assumed. */
const OFF_CORE = 0.9;

function purchases(p: Planner, families: readonly Family[], style: Style, core: Family | null): Purchase[] {
  const out: Purchase[] = [];
  const rand = style.rand ?? ((): number => 0.5);
  const jitter = (): number => 1 + style.noise * (rand() - 0.5) * 2;
  const bias = (family: Family): number => (core === null || family === core ? 1 : OFF_CORE);
  const towers = placedTowers(p.state);
  const now = baseline(p, towers);
  const set = prepare(p, towers);
  let free = 0;
  // Every free place offers the same families at the same prices, so the ring is read once.
  let ring: readonly original.BuildOption[] | null = null;
  for (const { col, row } of p.view.places) {
    if (original.placeError(p.state, col, row) !== null) continue;
    free++;
    ring ??= original.placeInfo(p.state, col, row).options;
    for (const option of ring) {
      if (!families.includes(option.family) || (option.blocked !== null && !option.blocked.endsWith(' gold'))) continue;
      const value = gainAdding(p, now, set, { id: -1, col, row, spec: option.spec }) * bias(option.family);
      if (value > 0) out.push({ command: { type: 'original.build', col, row, spec: option.spec }, price: option.price, ratio: (value / option.price) * jitter() });
    }
  }
  // At a Challenge's Tower cap no place takes another tower.
  const capped = original.capError(p.state) !== null;
  for (const t of towers) {
    const actions = original.towerActions(p.state, t.id);
    if (!actions) continue;
    for (const u of actions.upgrades) {
      if (u.blocked !== null && !u.blocked.endsWith(' gold')) continue;
      const value = gain(p, now, towers.map((o) => (o.id === t.id ? { ...o, spec: u.to } : o))) * bias(actions.family);
      if (value > 0) out.push({ command: { type: 'original.upgrade', tower: t.id, to: u.to }, price: u.price, ratio: (value / u.price) * jitter() });
    }
    // With every place taken, or the Tower cap reached, a Tier 1 tower can make way for another family's.
    if ((free > 0 && !capped) || actions.tier !== 1) continue;
    const rest = towers.filter((o) => o.id !== t.id);
    for (const option of original.placeInfo(p.state, t.col, t.row).options) {
      if (option.family === actions.family || !families.includes(option.family)) continue;
      const net = Math.max(20, option.price - actions.sellValue);
      const value = gain(p, now, [...rest, { id: -1, col: t.col, row: t.row, spec: option.spec }]) * bias(option.family);
      if (value > 0) {
        out.push({
          command: { type: 'original.sell', tower: t.id }, then: { type: 'original.build', col: t.col, row: t.row, spec: option.spec },
          price: option.price - actions.sellValue, ratio: (value / net) * jitter(),
        });
      }
    }
  }
  return out;
}

/** The purchase to make now, or null to save up: the best value per gold, or one nearly as good that's affordable now. */
function choose(state: original.OriginalGameState, options: readonly Purchase[]): Purchase | null {
  if (options.length === 0) return null;
  let best = options[0]!;
  for (const o of options) if (o.ratio > best.ratio) best = o;
  if (best.price <= state.gold) return best;
  let fallback: Purchase | null = null;
  for (const o of options) if (o.price <= state.gold && o.ratio >= 0.75 * best.ratio && (!fallback || o.ratio > fallback.ratio)) fallback = o;
  return fallback;
}

/** The rotation bot's pick: the next free place with the next family, then the cheapest upgrade. */
function rotationPick(state: original.OriginalGameState, places: readonly Place[], o: BotOptions, built: { n: number }): Command | null {
  const families = o.families ?? ['arrow', 'cannon'];
  for (const { col, row } of places) {
    if (original.placeError(state, col, row) !== null) continue;
    const family = families[built.n % families.length]!;
    const option = original.placeInfo(state, col, row).options.find((x) => x.family === family);
    if (!option) continue;
    if (option.blocked === null) {
      built.n++;
      return { type: 'original.build', col, row, spec: option.spec };
    }
    // Save up for it while the places are scarce in towers.
    if (state.towers.length < 3) return null;
    break;
  }
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

// --- Playing a Stage --------------------------------------------------------------

export function playStage(seed: number, difficulty: Difficulty, o: BotOptions = {}): BotResult {
  const stage = o.stage ?? 1;
  const strategy = o.strategy ?? 'rotation';
  const options: Record<string, unknown> = { stage, talents: [...(o.talents ?? [])] };
  if (o.challenge !== undefined) options['challenge'] = o.challenge;
  if (o.cleared !== undefined) options['cleared'] = o.cleared;
  if (o.waves !== undefined) options['waves'] = JSON.parse(JSON.stringify(o.waves));
  if (o.gold !== undefined) options['gold'] = o.gold;
  const state = createRun({ mode: 'original', seed, difficulty, options: options as never }) as original.OriginalGameState;
  // The places come from the Run's own Map: a Challenge's Burnt ground takes some away.
  const style = strategy === 'rotation' ? { noise: 0, rand: null, callsEarly: o.greedy ?? false } : makeStyle(o.style ?? 0, o.greedy);
  const view: MapView = mapView(state.map, layPlaces(state.map, style.rand));
  const unlocked = original.runUnlocks(state).families;
  const families = strategy === 'rotation' ? [] : unlocked.filter((f) => (strategy === 'single' ? (o.families ?? []).includes(f) : !o.families || o.families.includes(f)));
  const routes = routeCount(state.map);
  // A Challenge whose Send now pays nothing: a competent player waits the Breaks out.
  const callsEarly = style.callsEarly && !original.runModifiers(state).noEarlyCall;
  const built = { n: 0 };
  const rejected: string[] = [];
  const maxTicks = o.maxTicks ?? 30 * 60 * 40;
  let steps = 0;
  let total = 0;
  let acted = false;
  let pending: Command | null = null;
  const trace: { wave: number; lives: number; gold: number; spent: number; towers: number }[] = [];
  const send = (commands: Command[]): void => {
    for (const c of commands) o.record?.push({ tick: state.tick, command: c });
    const t0 = performance.now();
    const events: SimEvent[] = step(state, commands);
    total += performance.now() - t0;
    steps++;
    o.observe?.(state, events);
    for (const e of events) {
      if (e.type === 'rejected') rejected.push(e.reason);
      if (e.type === 'waveStart') {
        let spent = 0;
        for (const ts of Object.values(state.mode.towers)) spent += ts.spent;
        trace.push({ wave: state.wave.number, lives: state.lives, gold: state.gold, spent, towers: state.towers.length });
      }
    }
  };
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < maxTicks) {
    const commands: Command[] = [];
    if (strategy === 'rotation') {
      if (state.tick % 15 === 0) {
        const status = original.originalStatus(state);
        const clear = !state.creeps.some((c) => c.hp > 0);
        if (status.sendNowBlocked === null && (status.step === 'ready' || (callsEarly && clear && status.step === 'break'))) {
          commands.push({ type: 'original.sendNow' });
        }
        const c = rotationPick(state, view.places, o, built);
        if (c) commands.push(c);
      }
    } else if (pending) {
      commands.push(pending);
      pending = null;
      acted = true;
    } else if (acted || state.tick % 15 === 0) {
      // Buy one thing a tick while there's something worth buying, then look again every half second.
      const streams = strategy === 'greedy' ? ghoulStreams(state, routes) : streamsAhead(state, routes);
      const core = strategy === 'balanced' ? o.core ?? 'arrow' : null;
      const pick = choose(state, purchases(makePlanner(state, view, streams, strategy === 'greedy'), families, style, core));
      acted = pick !== null;
      if (pick) {
        commands.push(pick.command);
        pending = pick.then ?? null;
      }
      else {
        const status = original.originalStatus(state);
        const clear = !state.creeps.some((cr) => cr.hp > 0);
        if (status.sendNowBlocked === null && (status.step === 'ready' || (callsEarly && clear && status.step === 'break'))) {
          commands.push({ type: 'original.sendNow' });
        }
      }
    }
    send(commands);
  }
  const levels = state.towers.map((t) => state.mode.towers[String(t.id)]!.level);
  const counts: Record<string, number> = {};
  for (const t of state.towers) counts[t.spec] = (counts[t.spec] ?? 0) + 1;
  const result = original.originalResult(state);
  return {
    phase: state.phase, won: result.won, completed: state.mode.completed, reached: state.wave.number, lives: state.lives, stars: result.stars,
    gold: state.gold, towers: state.towers.length, levels, built: counts, trace, earlyGold: state.mode.earlyGold, ticks: state.tick, rejected,
    meanStepMs: total / Math.max(1, steps), state,
  };
}
