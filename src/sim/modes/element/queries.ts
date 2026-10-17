import {
  BUILDABLE, ELEMENTS, ELEMENT_TOWERS, EXPRESS_LEVEL_GATES, FULL_WAVES, INTEREST_PERIOD, INTEREST_RATE, MAX_ELEMENT_LEVEL,
  MAX_ESSENCE_BOUGHT, BOSS_TRAITS, bossId, unitName,
  type DamageElement, type Draw, type Element, type HasteHit, type Picks, type RunLength, type TargetMode, type TowerKind, type Trait,
} from '../../../content/element';
import { cooldownTicks, towerMods } from '../../combat/mods';
import { findTower } from '../../combat/targeting';
import { TICK_RATE } from '../../core/constants';
import type { Difficulty, GameState } from '../../core/state';
import type { Point } from '../../path/grid';
import { routePolyline as corePolyline } from '../../path/route';
import { buildError, footprintAt, requirementError, sellError, sellValue, spotError, upgradeError } from './build';
import { FIRE_UP, SPRING, statusValue } from './combat';
import { activeElemental, elementalHp, essenceError, summonError } from './elements';
import { sendNowError } from './rules';
import { elState, isBuilt, peekTower, towerInfoOf, towerSpec } from './state';
import { breakSeconds, clearSeconds, finalScore, fixedWaves, waveRow, waveSpec } from './waves';

// Pure questions the UI asks about an Element Run. None of them change the state.

/** Where the Run is, from the player's side. */
export type ElementStep = 'break' | 'wave' | 'over';

export interface ElementStatus {
  readonly step: ElementStep;
  readonly gold: number;
  readonly lives: number;
  readonly lumber: number;
  readonly essence: number;
  /** Pure Essence bought with Lumber, of `maxEssenceBought`. */
  readonly essenceBought: number;
  readonly maxEssenceBought: number;
  readonly levels: Readonly<Record<Element, number>>;
  /** All Pick Full: summons left that grant their level with no Elemental. */
  readonly freeElements: number;
  /** The Elemental on the lane (creep id), 0 for none. */
  readonly elemental: number;
  readonly interest: {
    readonly rate: number;
    readonly periodSeconds: number;
    /** Tick of the next payout, or null while it hasn't started, is paused or has stopped. */
    readonly nextTick: number | null;
    /** Seconds to the next payout (also while paused: what is left). */
    readonly secondsLeft: number | null;
    readonly paused: boolean;
    readonly stopped: boolean;
  };
  /** The break before `wave`: ticks left and its length; null during a Wave or when the Run is over. */
  readonly break: { readonly wave: number; readonly ticksLeft: number; readonly totalTicks: number } | null;
  /** Why "send now" is refused, or null. */
  readonly sendNowBlocked: string | null;
  /** Latest Wave started (0 before the first) and Waves cleared. */
  readonly wave: number;
  readonly completed: number;
  /** Fixed Waves: 55 (Full; the endless boss Waves follow) or 30 (Express). */
  readonly fixedWaves: number;
  /** Boss Wave number being fought or next (Full, after Wave 55), 0 before. */
  readonly bossWave: number;
  readonly length: RunLength;
  readonly picks: Picks;
  readonly difficulty: Difficulty;
  /** All Random: the draws still to come, the Wave whose clear brings each (0 = now). Empty in All Pick. */
  readonly upcomingDraws: readonly { readonly after: number; readonly pick: Draw }[];
  readonly score: number;
}

export function elementStatus(state: GameState): ElementStatus {
  const es = elState(state);
  const over = state.phase === 'won' || state.phase === 'lost';
  const it = es.interest;
  const secondsLeft = it.next >= 0 ? (it.next - state.tick) / TICK_RATE : it.left >= 0 ? it.left / TICK_RATE : null;
  const nextWave = state.wave.number + 1;
  const inBreak = !over && state.phase === 'build' && es.breakUntil >= 0;
  return {
    step: over ? 'over' : state.phase === 'wave' ? 'wave' : 'break',
    gold: state.gold,
    lives: state.lives,
    lumber: es.lumber,
    essence: es.essence,
    essenceBought: es.essenceBought,
    maxEssenceBought: MAX_ESSENCE_BOUGHT,
    levels: { ...es.levels },
    freeElements: es.freeElements,
    elemental: activeElemental(state),
    interest: {
      rate: INTEREST_RATE,
      periodSeconds: INTEREST_PERIOD,
      nextTick: it.next >= 0 ? it.next : null,
      secondsLeft,
      paused: it.left >= 0,
      stopped: it.stopped,
    },
    break: inBreak ? { wave: nextWave, ticksLeft: Math.max(0, es.breakUntil - state.tick), totalTicks: es.breakTicks } : null,
    sendNowBlocked: over ? 'the Run is over' : sendNowError(state),
    wave: state.wave.number,
    completed: es.completed,
    fixedWaves: fixedWaves(es.length),
    bossWave: es.length === 'full' ? Math.max(0, (state.phase === 'wave' ? state.wave.number : nextWave) - FULL_WAVES) : 0,
    length: es.length,
    picks: es.picks,
    difficulty: state.difficulty,
    upcomingDraws: es.draws.filter((d) => !d.done).map((d) => ({ after: d.after, pick: d.pick })),
    score: finalScore(state),
  };
}

export interface BuildOption {
  readonly spec: string;
  readonly name: string;
  readonly cost: number;
  readonly essence: number;
  /** Why it can't be built now (locked by Element levels, essence or gold), or null. */
  readonly blocked: string | null;
}

/** Everything the builder can put down from nothing, unlocked or not. */
export function buildOptions(state: GameState): BuildOption[] {
  return BUILDABLE.map((spec) => {
    const s = ELEMENT_TOWERS[spec]!;
    return { spec, name: s.name, cost: s.cost ?? 0, essence: s.element.essence, blocked: buildError(state, spec) };
  });
}

/** The 2 × 2 cells a tower anchored at (col, row) covers (for the Ghost), and why it can't go there. */
export function buildSpot(state: GameState, col: number, row: number): { readonly cells: number[]; readonly error: string | null } {
  return { cells: footprintAt(state, col, row), error: spotError(state, col, row) };
}

export interface SummonOption {
  readonly element: Element;
  readonly level: number;
  /** The level a summon brings, or null at the top. */
  readonly next: number | null;
  /** The level comes at once, with no Elemental to kill. */
  readonly instant: boolean;
  /** HP of the Elemental it would send, or null when instant or at the top. */
  readonly elementalHp: number | null;
  readonly blocked: string | null;
}

export interface SummonOptions {
  readonly lumber: number;
  readonly elements: readonly SummonOption[];
  /** Buying a Pure Essence with a Lumber. */
  readonly essence: { readonly blocked: string | null; readonly bought: number; readonly max: number };
  /** Express: cleared Waves each level needs. */
  readonly expressGates: Readonly<Record<number, number>> | null;
}

export function summonOptions(state: GameState): SummonOptions {
  const es = elState(state);
  return {
    lumber: es.lumber,
    elements: ELEMENTS.map((element) => {
      const level = es.levels[element];
      const next = level < MAX_ELEMENT_LEVEL ? level + 1 : null;
      const instant = es.length === 'express' || (es.freeElements > 0 && level < 2);
      return {
        element, level, next, instant,
        elementalHp: next !== null && !instant ? elementalHp(state, next) : null,
        blocked: summonError(state, element),
      };
    }),
    essence: { blocked: essenceError(state), bought: es.essenceBought, max: MAX_ESSENCE_BOUGHT },
    expressGates: es.length === 'express' ? EXPRESS_LEVEL_GATES : null,
  };
}

export interface UpgradeOption {
  readonly to: string;
  readonly name: string;
  readonly cost: number;
  readonly essence: number;
  /** Element levels it still needs ("needs Water 2"), or null when they are met. */
  readonly needs: string | null;
  /** Why it can't be bought now (levels, essence, gold, still building), or null. */
  readonly blocked: string | null;
}

export interface ElementTowerActions {
  readonly upgrades: readonly UpgradeOption[];
  readonly sell: { readonly gold: number; readonly essence: number; readonly blocked: string | null };
}

export function towerActions(state: GameState, id: number): ElementTowerActions | null {
  const t = findTower(state, id);
  const info = t ? towerInfoOf(t.spec) : undefined;
  if (!t || !info) return null;
  const gold = sellValue(state, t);
  return {
    upgrades: info.upgrades.map((to) => {
      const spec = towerSpec(to)!;
      return {
        to, name: spec.name, cost: spec.cost ?? 0, essence: spec.element.essence,
        needs: requirementError(state, spec.element), blocked: upgradeError(state, t, to),
      };
    }),
    sell: { gold, essence: gold > 0 ? info.essence : 0, blocked: sellError(state, t) },
  };
}

/** Stable ids for each family's abilities, for the UI to word. */
const ABILITIES: Readonly<Record<string, readonly string[]>> = {
  cannon: ['artillery'], dark: ['overkill'], earth: ['aftershock'], fire: ['blaze'], light: ['intensity'],
  nature: ['forceOfNature'], water: ['bounce'], periodic: ['elementShots'], blacksmith: ['fireUp'], well: ['springForward'],
  trickery: ['conjure'], disease: ['missingHp'], electricity: ['chainLightning'], flame: ['sunburn'],
  gunpowder: ['artillery', 'shrapnel'], hydro: ['explodeOnKill'], ice: ['ministun'], life: ['afterlife', 'lowLivesBonus'],
  magic: ['rangeDecay'], moss: ['spore'], poison: ['contamination'], quark: ['quantumStacks'], vapor: ['pulse'],
  enchantment: ['faerieFire'], ephemeral: ['phasing'], erosion: ['acid'], flamethrower: ['napalm'], flooding: ['flood'],
  gold: ['arbitrage'], hail: ['crit', 'hailStorm'], haste: ['wrath'], impulse: ['impetus'], jinx: ['maledict'],
  laser: ['instant', 'crowdPenalty'], muck: ['sludgeSlow'], nova: ['explode', 'explodeSlow'], obliteration: ['obliterate'],
  polar: ['frostbite'], quake: ['pulverize'], roots: ['gaiaLine', 'gaiaSlow'], runic: ['magicAttack'], tidal: ['splashDecay'],
  windstorm: ['tornado'],
};

export interface ElementTowerInfo {
  readonly spec: string;
  readonly name: string;
  readonly kind: TowerKind;
  readonly family: string;
  readonly level: number;
  readonly elements: readonly Element[];
  /** What its damage counts as against a creep's armour. */
  readonly damageElement: DamageElement;
  /** Damage per attack now, base-damage bonuses (Fire Up, Life, phasing) included. */
  readonly damage: number;
  readonly baseDamage: number;
  /** Seconds between attacks now, attack-speed bonuses and Haste stacks included; null for towers that don't attack. */
  readonly cooldown: number | null;
  /** Attack range now (Magic shrinks it). */
  readonly range: number;
  readonly splash: { readonly full: number; readonly half: number } | null;
  readonly target: TargetMode;
  readonly abilities: readonly string[];
  readonly kills: number;
  readonly built: boolean;
  /** Ticks until it finishes (re)building, 0 when built. */
  readonly buildTicksLeft: number;
  /** A Trickery copy: the tick it vanishes; null for a real tower. */
  readonly copyUntil: number | null;
  readonly fireUp: number;
  readonly springForward: number;
  readonly vengeanceStacks: number;
  /** Streak or stack count for the families that keep one. */
  readonly stacks: number;
  readonly totalCost: number;
}

export function towerInfo(state: GameState, id: number): ElementTowerInfo | null {
  const t = findTower(state, id);
  const spec = t ? towerSpec(t.spec) : undefined;
  if (!t || !spec) return null;
  const info = spec.element;
  const ts = peekTower(state, t);
  const mods = towerMods(t);
  const haste = info.family === 'haste' ? info.cooldown - ((spec.attack?.effects?.[0] as HasteHit | undefined)?.step ?? 0) * ts.stacks : info.cooldown;
  const attacks = spec.attack !== undefined || info.ability?.kind === 'pulse' || info.ability?.kind === 'tornado';
  return {
    spec: t.spec,
    name: spec.name,
    kind: info.kind,
    family: info.family,
    level: info.level,
    elements: info.elements,
    damageElement: info.damage,
    damage: info.baseDamage * (1 + mods.damage),
    baseDamage: info.baseDamage,
    cooldown: attacks ? cooldownTicks(haste, mods.attackSpeed) / TICK_RATE : null,
    range: info.range + mods.range,
    splash: info.splash,
    target: info.target,
    abilities: ABILITIES[info.family] ?? [],
    kills: t.kills,
    built: isBuilt(state, t),
    buildTicksLeft: Math.max(0, ts.ready - state.tick),
    copyUntil: ts.clone?.until ?? null,
    fireUp: statusValue(t.status, FIRE_UP),
    springForward: statusValue(t.status, SPRING),
    vengeanceStacks: ts.vengeance.length,
    stacks: ts.stacks,
    totalCost: info.totalCost,
  };
}

export interface WavePreview {
  /** 1-based. */
  readonly wave: number;
  readonly name: string;
  readonly element: DamageElement;
  /** The Wave's Trait; a boss Wave lists the cycle its creeps take in turn. */
  readonly traits: readonly Trait[];
  readonly count: number;
  /** HP per creep (a boss Wave: per non-bulky creep). */
  readonly hp: number;
  readonly bounty: number;
  readonly boss: boolean;
  /** Seconds of break before it. */
  readonly breakBefore: number;
  /** A Lumber arrives in the break before it. */
  readonly lumber: boolean;
  readonly essence: boolean;
}

/** Wave `index` (0-based) as the player would see it coming, or null past the end. */
export function wavePreview(state: GameState, index: number): WavePreview | null {
  if (!Number.isInteger(index) || index < 0 || index >= state.wave.total) return null;
  const es = elState(state);
  const wave = index + 1;
  const row = waveRow(es.length, wave);
  const spec = waveSpec(state, index);
  if (!spec) return null;
  if (row) {
    return {
      wave, name: unitName(row.unit), element: row.element, traits: row.trait ? [row.trait] : [], count: row.count,
      hp: row.hp[state.difficulty], bounty: row.bounty[state.difficulty], boss: false,
      breakBefore: breakSeconds(state, wave), lumber: row.lumber, essence: row.essence,
    };
  }
  const nonBulky = spec.groups.find((g) => g.creep !== bossId('bulky'));
  return {
    wave, name: unitName('icefrog'), element: 'composite', traits: BOSS_TRAITS,
    count: spec.groups.reduce((n, g) => n + g.count, 0), hp: nonBulky?.hp ?? 0, bounty: 0, boss: true,
    breakBefore: breakSeconds(state, wave), lumber: false, essence: wave === FULL_WAVES + 1,
  };
}

/** The route's corners in world units (spawn first, exit last), for the path line. */
export function routePolyline(state: GameState): Point[] {
  return corePolyline(state);
}

/** For Records (§10): Waves cleared (boss Waves count as 55 + n), the latest started, the port's score, and the clear time. */
export interface ElementRecord {
  readonly wave: number;
  readonly reached: number;
  /** Cleared every fixed Wave (Full: 55, then the boss Waves only add score; Express: 30). */
  readonly won: boolean;
  readonly score: number;
  /** Seconds from Wave 1's first spawn to the last fixed Wave's clear, or null. */
  readonly clearSeconds: number | null;
}

export function elementRecord(state: GameState): ElementRecord {
  const es = elState(state);
  return {
    wave: es.completed,
    reached: state.wave.number,
    won: es.completed >= fixedWaves(es.length),
    score: finalScore(state),
    clearSeconds: clearSeconds(state),
  };
}
