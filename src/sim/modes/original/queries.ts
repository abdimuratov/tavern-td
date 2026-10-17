import {
  FAMILY_BASE, LEVEL_XP, MAX_LEVEL, ORIGINAL_CREEPS, PERKS,
  type Family, type PerkSpec, type Targeting,
} from '../../../content/original';
import { difficultyHp } from '../../combat/creeps';
import { TICK_RATE } from '../../core/constants';
import type { Difficulty, GameState } from '../../core/state';
import { getMode } from '../registry';
import { attackRange, auraRadius } from './auras';
import { buildError, priceOf, runUnlocks, sellValue, spotError, towerById, towerOnSpot, upgradeError } from './build';
import { starsFor, type StageResult, type Unlocks } from './progression';
import { sendNowError } from './rules';
import { orState, peekTower, threatOf, towerInfo, towerSpec } from './state';
import { earlyCallGold, ghoulHp, groupStarts, runWaves, waveBonus, waveSpec } from './waves';

// Pure questions the UI and the bots ask about an Original Run. None of them change the state.

/** Where the Run is, from the player's side: waiting to send Wave 1, a Wave arriving, a Break running, or over. */
export type OriginalStep = 'ready' | 'wave' | 'break' | 'over';

export interface OriginalStatus {
  readonly step: OriginalStep;
  readonly stage: number;
  readonly difficulty: Difficulty;
  readonly gold: number;
  readonly lives: number;
  /** Latest Wave started (0 before the first), of `total`; Waves cleared. */
  readonly wave: number;
  readonly total: number;
  readonly completed: number;
  /** Threat of the next Wave to send, or of the last one once all are sent. */
  readonly threat: number;
  /** The Break before `wave`: ticks left and its length; null when none is running. */
  readonly break: { readonly wave: number; readonly ticksLeft: number; readonly totalTicks: number } | null;
  /** Gold Send now would pay right now (0 outside a Break). */
  readonly earlyCall: number;
  /** Why Send now is refused, or null. */
  readonly sendNowBlocked: string | null;
  /** Stars the Run has won, or would win with the lives left. */
  readonly stars: number;
  readonly unlocks: Unlocks;
  readonly talents: readonly string[];
}

export function originalStatus(state: GameState): OriginalStatus {
  const es = orState(state);
  const over = state.phase === 'won' || state.phase === 'lost';
  const next = Math.min(state.wave.number + 1, state.wave.total);
  const inBreak = !over && es.breakUntil >= 0;
  const ticksLeft = inBreak ? Math.max(0, es.breakUntil - state.tick) : 0;
  return {
    step: over ? 'over' : inBreak ? 'break' : state.wave.number === 0 ? 'ready' : 'wave',
    stage: es.stage,
    difficulty: state.difficulty,
    gold: state.gold,
    lives: state.lives,
    wave: state.wave.number,
    total: state.wave.total,
    completed: es.completed,
    threat: threatOf(state, next),
    break: inBreak ? { wave: state.wave.number + 1, ticksLeft, totalTicks: es.breakTicks } : null,
    earlyCall: inBreak ? earlyCallGold(threatOf(state, state.wave.number + 1), ticksLeft / TICK_RATE) : 0,
    sendNowBlocked: sendNowError(state),
    stars: state.phase === 'lost' ? 0 : starsFor(state.lives),
    unlocks: runUnlocks(state),
    talents: [...es.talents],
  };
}

export interface BuildOption {
  readonly spec: string;
  readonly name: string;
  readonly family: Family;
  readonly price: number;
  /** Why it can't be built now (locked, or gold), or null. */
  readonly blocked: string | null;
}

export interface SpotInfo {
  readonly spot: number;
  /** The tower on it, 0 for none. */
  readonly tower: number;
  /** The ring of families a tap shows on an empty Spot, unlocked ones only, in unlock order. */
  readonly options: readonly BuildOption[];
  /** Why it can't take a tower, or null. */
  readonly error: string | null;
}

export function spotInfo(state: GameState, spot: number): SpotInfo {
  const tower = towerOnSpot(state, spot);
  const error = spotError(state, spot);
  const options = runUnlocks(state).families.map((family): BuildOption => {
    const spec = FAMILY_BASE[family];
    return { spec, name: towerSpec(spec)!.name, family, price: priceOf(state, spec), blocked: error ?? buildError(state, spec) };
  });
  return { spot, tower: tower?.id ?? 0, options, error };
}

export interface UpgradeOption {
  readonly to: string;
  readonly name: string;
  readonly tier: number;
  readonly price: number;
  readonly blocked: string | null;
}

export interface TowerActions {
  readonly tower: number;
  readonly spec: string;
  readonly name: string;
  readonly family: Family;
  /** 1–3, or 4 for a Specialisation. */
  readonly tier: number;
  readonly level: number;
  readonly xp: number;
  /** XP the next Tower Level needs, null at Level 10. */
  readonly nextXp: number | null;
  /** Null for a Totem that doesn't attack. */
  readonly targeting: Targeting | null;
  readonly range: number;
  /** A Totem's (or Blizzard Spire's) aura reach, 0 without one. */
  readonly auraRadius: number;
  readonly upgrades: readonly UpgradeOption[];
  readonly sellValue: number;
  /** Its family's Perks and whether it holds each. */
  readonly perks: readonly { readonly level: number; readonly perk: PerkSpec; readonly held: boolean }[];
  readonly kills: number;
}

export function towerActions(state: GameState, id: number): TowerActions | null {
  const tower = towerById(state, id);
  const info = tower ? towerInfo(tower.spec) : undefined;
  const ts = tower ? peekTower(state, tower.id) : undefined;
  if (!tower || !info || !ts) return null;
  const attacks = towerSpec(tower.spec)?.attack !== undefined;
  return {
    tower: tower.id,
    spec: tower.spec,
    name: towerSpec(tower.spec)!.name,
    family: info.family,
    tier: info.tier,
    level: ts.level,
    xp: ts.xp,
    nextXp: ts.level >= MAX_LEVEL ? null : LEVEL_XP[ts.level]!,
    targeting: attacks ? ts.targeting : null,
    range: attackRange(state, tower),
    auraRadius: auraRadius(state, tower),
    upgrades: info.next.map((to) => ({
      to, name: towerSpec(to)!.name, tier: towerInfo(to)!.tier, price: priceOf(state, to), blocked: upgradeError(state, tower, to),
    })),
    sellValue: sellValue(state, tower),
    perks: PERKS[info.family].map((perk, i) => ({ level: i === 0 ? 5 : 10, perk, held: ts.level >= (i === 0 ? 5 : 10) })),
    kills: tower.kills,
  };
}

export interface WavePreview {
  readonly wave: number;
  readonly threat: number;
  /** A Ghoul's HP at this Threat, Difficulty included. */
  readonly ghoulHp: number;
  readonly bonus: number;
  readonly groups: readonly {
    readonly creep: string;
    readonly name: string;
    readonly count: number;
    readonly route: number;
    /** Seconds after the Wave starts. */
    readonly at: number;
    readonly hp: number;
    readonly bounty: number;
    readonly flying: boolean;
  }[];
}

/** What Wave `wave` (1-based) brings, or null past the last. */
export function wavePreview(state: GameState, wave: number): WavePreview | null {
  const spec = waveSpec(state, wave - 1);
  const source = runWaves(state)[wave - 1];
  if (!spec || !source) return null;
  const threat = threatOf(state, wave);
  const diff = difficultyHp(getMode(state.modeId), state.difficulty);
  const starts = groupStarts(source);
  return {
    wave,
    threat,
    ghoulHp: Math.round(ghoulHp(threat) * diff),
    bonus: waveBonus(threat),
    groups: spec.groups.map((g, i) => ({
      creep: g.creep,
      name: ORIGINAL_CREEPS[g.creep]?.name ?? g.creep,
      count: g.count,
      route: g.route ?? 0,
      at: starts[i]!,
      hp: Math.max(1, Math.round((g.hp ?? 0) * diff)),
      bounty: g.bounty ?? 0,
      flying: ORIGINAL_CREEPS[g.creep]?.flying ?? false,
    })),
  };
}

/** How the Run ended, for the Stage's Record and the Campaign's Stars; `won` false while it runs. */
export function originalResult(state: GameState): StageResult & { readonly lives: number; readonly stage: number } {
  const es = orState(state);
  const won = state.phase === 'won';
  return {
    won,
    stars: won ? starsFor(state.lives) : 0,
    difficulty: state.difficulty,
    seconds: won && es.startTick >= 0 && es.endTick >= 0 ? (es.endTick - es.startTick) / TICK_RATE : null,
    lives: state.lives,
    stage: es.stage,
  };
}
