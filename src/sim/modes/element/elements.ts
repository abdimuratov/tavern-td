import {
  DIFFICULTY_HP, DRAW_LIMITS, DRAW_POOL, ELEMENTAL_HP, ELEMENTAL_HP_GROWTH, ELEMENTS, EXPRESS_LEVEL_GATES, LUMBER_AFTER,
  MAX_ELEMENT_LEVEL, MAX_ESSENCE_BOUGHT, START, elementName, elementalId,
  type Draw, type Element, type RunLength,
} from '../../../content/element';
import { spawnCreep } from '../../combat/creeps';
import type { SimEvent } from '../../core/events';
import { nextInt, type RngState } from '../../core/rng';
import type { GameState } from '../../core/state';
import { creepSpec, elState, modeEvent, type ElementDraw } from './state';

// Elements, Lumber, Elementals and Pure Essence (docs/research/element-td-rules.md
// §4, §9): summoner.lua, resources.lua, playerdata.lua and random.lua.

export function isElement(v: unknown): v is Element {
  return typeof v === 'string' && (ELEMENTS as readonly string[]).includes(v);
}

/** The Elemental on the lane, if any (only one at a time in All Pick). */
export function activeElemental(state: GameState): number {
  for (const c of state.creeps) if (c.hp > 0 && creepSpec(c.spec)?.elemental) return c.id;
  return 0;
}

/** The Wave the player is waiting for or fighting: what Elemental HP scales with. */
export function nextWave(state: GameState): number {
  return state.phase === 'wave' ? state.wave.number : state.wave.number + 1;
}

/** HP of the Elemental that would raise `element` to `level` now: base × 1.5^⌊next Wave / 5⌋ × Difficulty, floored. */
export function elementalHp(state: GameState, level: number): number {
  let growth = 1;
  for (let i = Math.floor(nextWave(state) / 5); i > 0; i--) growth *= ELEMENTAL_HP_GROWTH;
  return Math.floor(ELEMENTAL_HP[level - 1]! * growth * DIFFICULTY_HP[state.difficulty]);
}

/** A summon right now grants the level with no Elemental to kill: always in Express, and All Pick's free first Element. */
function instantSummon(state: GameState, element: Element): boolean {
  const es = elState(state);
  return es.length === 'express' || (es.freeElements > 0 && es.levels[element] < 2);
}

/** Why `element` can't be summoned now, or null. */
export function summonError(state: GameState, element: Element): string | null {
  const es = elState(state);
  if (es.picks === 'allRandom') return 'All Random picks your Elements';
  const level = es.levels[element];
  if (level >= MAX_ELEMENT_LEVEL) return `${elementName(element)} is at level ${MAX_ELEMENT_LEVEL}`;
  if (es.lumber < 1) return 'needs a Lumber';
  if (es.length === 'express') {
    const gate = EXPRESS_LEVEL_GATES[level + 1];
    if (gate !== undefined && es.completed < gate) return `level ${level + 1} opens after Wave ${gate}`;
    return null;
  }
  if (activeElemental(state) !== 0) return 'an Elemental is already on the lane';
  return null;
}

/** One Lumber: the level at once, or an Elemental to kill for it (SummonElemental). */
export function summon(state: GameState, element: Element, events: SimEvent[]): void {
  const es = elState(state);
  es.lumber--;
  if (instantSummon(state, element)) {
    es.freeElements = Math.max(0, es.freeElements - 1);
    raise(state, element, events);
    return;
  }
  spawnElemental(state, element, events);
}

function raise(state: GameState, element: Element, events: SimEvent[]): void {
  const es = elState(state);
  es.levels[element] = Math.min(MAX_ELEMENT_LEVEL, es.levels[element] + 1);
  modeEvent(events, 'element.levelUp', { element, level: es.levels[element], creep: 0 });
}

function spawnElemental(state: GameState, element: Element, events: SimEvent[]): void {
  const level = Math.min(MAX_ELEMENT_LEVEL, elState(state).levels[element] + 1);
  const creep = spawnCreep(state, elementalId(element, level), { wave: 0, hp: elementalHp(state, level), bounty: 0 }, events);
  modeEvent(events, 'element.summoned', { element, level, creep: creep.id, hp: creep.maxHp });
}

/** Why a Pure Essence can't be bought now, or null (CanPlayerBuyPureEssence; two at most). */
export function essenceError(state: GameState): string | null {
  const es = elState(state);
  if (es.picks === 'allRandom') return 'All Random can\'t buy Pure Essence';
  if (es.essenceBought >= MAX_ESSENCE_BOUGHT) return `only ${MAX_ESSENCE_BOUGHT} can be bought`;
  if (es.lumber < 1) return 'needs a Lumber';
  const levels = ELEMENTS.map((e) => es.levels[e]);
  if (!levels.some((l) => l >= MAX_ELEMENT_LEVEL) && !levels.every((l) => l >= 1)) return 'needs an Element at level 3 or all six at level 1';
  return null;
}

export function buyEssence(state: GameState, events: SimEvent[]): void {
  const es = elState(state);
  es.lumber--;
  es.essence++;
  es.essenceBought++;
  modeEvent(events, 'element.essence', { essence: es.essence, bought: true });
}

// --- All Random --------------------------------------------------------------------

/** How many tries one draw gets before it falls back (assumed: the port re-draws forever). */
const DRAW_TRIES = 1000;

/**
 * The whole All Random order, drawn once at setup with the Run's RNG
 * (random.lua getRandomElementOrder): one per starting Lumber, then one per
 * Lumber Wave. Each pick is uniform over the six Elements and "pure", re-drawn
 * until the port's rules allow it.
 */
export function drawOrder(rng: RngState, length: RunLength): ElementDraw[] {
  const used: Record<Draw, number> = { water: 0, fire: 0, earth: 0, nature: 0, dark: 0, light: 0, pure: 0 };
  const draws: ElementDraw[] = [];
  for (let i = 0; i < START[length].lumber; i++) draws.push({ after: 0, pick: drawOne(rng, used, 0, length), done: false });
  for (const w of LUMBER_AFTER[length]) draws.push({ after: w, pick: drawOne(rng, used, w, length), done: false });
  return draws;
}

function allowed(used: Record<Draw, number>, pick: Draw, wave: number, length: RunLength): boolean {
  if (pick === 'pure' && used.pure < 2) {
    // The port scans every entry, "pure" included: the first pure needs an Element at 3, a second one passes once all six are at 1.
    const values = DRAW_POOL.map((d) => used[d]);
    return values.some((v) => v === 3) || values.every((v) => v !== 0);
  }
  const u = used[pick];
  const limits = DRAW_LIMITS[length];
  if (u >= 3) return false;
  if (wave < limits.level2 && u === 1) return false;
  if (wave < limits.level3 && u === 2) return false;
  if (limits.noNew !== null && wave >= limits.noNew && u === 0) return false;
  return true;
}

function drawOne(rng: RngState, used: Record<Draw, number>, wave: number, length: RunLength): Draw {
  for (let i = 0; i < DRAW_TRIES; i++) {
    const pick = DRAW_POOL[nextInt(rng, 0, DRAW_POOL.length - 1)]!;
    if (allowed(used, pick, wave, length)) {
      used[pick]++;
      return pick;
    }
  }
  // Nothing allowed: the first that ignores the Wave limits, else an essence (assumed; the port would hang).
  const pick = DRAW_POOL.find((d) => d !== 'pure' && used[d] < 3) ?? 'pure';
  used[pick]++;
  return pick;
}

/** Spends the Lumber on this break's draw: a Pure Essence, or the Element (an Elemental in Full, instant in Express). */
export function applyDraw(state: GameState, draw: ElementDraw, events: SimEvent[], atStart: boolean): void {
  const es = elState(state);
  draw.done = true;
  if (es.lumber < 1) return;
  es.lumber--;
  if (draw.pick === 'pure') {
    es.essence++;
    modeEvent(events, 'element.essence', { essence: es.essence, bought: false });
    return;
  }
  // The starting Lumber buys its Elements outright (gamesettings.lua SetElementOrder → BuyElement).
  if (atStart || es.length === 'express') raise(state, draw.pick, events);
  else spawnElemental(state, draw.pick, events);
}
