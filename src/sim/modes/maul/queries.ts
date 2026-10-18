import {
  MAUL_CREEPS, RACE_SPECS, RACES, SECOND_RACE_AFTER, TOWER_FOOTPRINT,
  type ArmorType, type AttackType, type CreepKind, type RaceId, type TowerLine,
} from '../../../content/maul';
import { difficultyHp } from '../../combat/creeps';
import { towerMods } from '../../combat/mods';
import { TICK_RATE } from '../../core/constants';
import type { Difficulty, GameState } from '../../core/state';
import { canAfford } from '../../economy';
import { getMode } from '../registry';
import { buildError, footprintAt, nextOf, sellValue, spotError, towerById, upgradeError } from './build';
import { addRaceError, sendNowError } from './rules';
import { mlState, towerSpec } from './state';
import { bountyPool, interestOn, runWaves, spawnsOf, waveBonus, waveSpec } from './waves';

// Pure questions the UI and the bots ask about a Maul Run. None of them change the state.

/** Where the Run is, from the player's side: the Break before Wave 1, a Wave on the field, a later Break, or over. */
export type MaulStep = 'ready' | 'wave' | 'break' | 'over';

export interface MaulStatus {
  readonly step: MaulStep;
  /** The Race picked at New Run, then the second if it has joined. */
  readonly races: readonly RaceId[];
  /** Races that could join now as the second; empty until Wave 15 is cleared and once one has. */
  readonly raceChoices: readonly RaceId[];
  /** The Wave whose clear opens the second Race. */
  readonly secondRaceAfter: number;
  readonly difficulty: Difficulty;
  /** Latest Wave started (0 before the first), of `total`; Waves cleared. */
  readonly wave: number;
  readonly total: number;
  readonly completed: number;
  /** The Break before `wave`: ticks left and its length; null when none is running. */
  readonly break: { readonly wave: number; readonly ticksLeft: number; readonly totalTicks: number } | null;
  readonly sendNowBlocked: string | null;
  /** Creeps of any Wave still to spawn or alive. */
  readonly creepsLeft: number;
  /** Interest the gold held now would earn if the oldest Wave on the Map were cleared now (or the next Wave, between Waves). */
  readonly interestNow: number;
  /** While true, gold spent comes back in full on a sale. */
  readonly refundOpen: boolean;
  readonly score: number;
  readonly kills: number;
  readonly leaks: number;
  /** Creeps turned around by builds and sales this Run, and the juggles that did it. */
  readonly turned: number;
  readonly juggles: number;
  readonly interestPaid: number;
}

export function maulStatus(state: GameState): MaulStatus {
  const ms = mlState(state);
  const over = state.phase === 'won' || state.phase === 'lost';
  const inBreak = !over && ms.breakUntil >= 0;
  const ticksLeft = inBreak ? Math.max(0, ms.breakUntil - state.tick) : 0;
  let left = 0;
  for (const w of state.wave.active) for (const g of w.groups) left += g.count - g.spawned;
  for (const c of state.creeps) if (c.hp > 0) left++;
  const clearing = state.wave.active[0]?.number ?? Math.min(state.wave.number + 1, state.wave.total);
  return {
    step: over ? 'over' : inBreak ? (state.wave.number === 0 ? 'ready' : 'break') : 'wave',
    races: [...ms.races],
    raceChoices: over ? [] : RACES.filter((r) => addRaceError(state, r) === null),
    secondRaceAfter: SECOND_RACE_AFTER,
    difficulty: state.difficulty,
    wave: state.wave.number,
    total: state.wave.total,
    completed: ms.completed,
    break: inBreak ? { wave: state.wave.number + 1, ticksLeft, totalTicks: ms.breakTicks } : null,
    sendNowBlocked: sendNowError(state),
    creepsLeft: left,
    interestNow: interestOn(state.gold, clearing),
    refundOpen: ms.refundOpen,
    score: ms.score,
    kills: ms.kills,
    leaks: ms.leaks,
    turned: ms.turned,
    juggles: ms.juggles,
    interestPaid: ms.interest,
  };
}

/** A tower's attack as the panel and build menu describe it. */
export interface AttackInfo {
  readonly type: AttackType;
  readonly damage: readonly [number, number];
  /** Average damage per second against one creep that takes full damage, before bonuses. */
  readonly dps: number;
  readonly range: number;
  readonly targets: 'ground' | 'air' | 'both';
}

function attackInfo(spec: string): AttackInfo | null {
  const atk = towerSpec(spec)?.attack;
  if (!atk) return null;
  return {
    type: atk.attackType as AttackType, damage: atk.damage, dps: (atk.damage[0] + atk.damage[1]) / 2 / atk.cooldown,
    range: atk.range, targets: atk.targets,
  };
}

export interface BuildOption {
  readonly spec: string;
  readonly name: string;
  readonly race: RaceId;
  readonly line: TowerLine;
  readonly cost: number;
  readonly role: string;
  readonly attack: AttackInfo | null;
  /** Why it can't be built now (gold), or null. */
  readonly blocked: string | null;
}

/** What the build menu offers: the first Race's Wall (any Wall can become any held Race's towers), then each Race's two Tier 1 towers. */
export function buildOptions(state: GameState): BuildOption[] {
  const races = mlState(state).races;
  const specs = [RACE_SPECS[races[0]!].builds[0], ...races.flatMap((r) => RACE_SPECS[r].builds.slice(1))];
  return specs.map((spec) => {
    const ts = towerSpec(spec)!;
    return {
      spec, name: ts.name, race: ts.maul.race, line: ts.maul.line, cost: ts.maul.total, role: ts.maul.role, attack: attackInfo(spec),
      blocked: buildError(state, spec),
    };
  });
}

/** The 2 × 2 cells a tower anchored at (col, row) covers (for the Ghost and the path preview), and why it can't go there now. */
export function buildSpot(state: GameState, col: number, row: number): { readonly cells: number[]; readonly error: string | null } {
  return { cells: footprintAt(state, col, row), error: spotError(state, col, row) };
}

export interface UpgradeOption {
  readonly to: string;
  readonly name: string;
  readonly tier: number;
  readonly price: number;
  readonly role: string;
  readonly attack: AttackInfo | null;
  readonly blocked: string | null;
  /** Short of gold only: it can be bought once the gold comes in. */
  readonly gold: boolean;
}

export interface TowerActions {
  readonly tower: number;
  readonly spec: string;
  readonly name: string;
  readonly line: TowerLine;
  readonly tier: number;
  readonly role: string;
  readonly attack: AttackInfo | null;
  /** Range with bonuses, for the range ring. */
  readonly range: number;
  /** Its widest aura, 0 without one. */
  readonly auraRadius: number;
  /** Attack bonuses on it right now (a Ley Shrine's). */
  readonly damageBonus: number;
  readonly speedBonus: number;
  readonly upgrades: readonly UpgradeOption[];
  readonly sellValue: number;
  /** The sale returns every gold it cost. */
  readonly fullRefund: boolean;
  readonly paid: number;
  readonly kills: number;
}

export function towerActions(state: GameState, id: number): TowerActions | null {
  const tower = towerById(state, id);
  const spec = tower ? towerSpec(tower.spec) : undefined;
  const ts = tower ? mlState(state).towers[String(tower.id)] : undefined;
  if (!tower || !spec || !ts) return null;
  const mods = towerMods(tower);
  const sale = sellValue(state, tower);
  return {
    tower: tower.id,
    spec: tower.spec,
    name: spec.name,
    line: spec.maul.line,
    tier: spec.maul.tier,
    role: spec.maul.role,
    attack: attackInfo(tower.spec),
    range: (spec.attack?.range ?? 0) + mods.range,
    auraRadius: Math.max(0, ...(spec.auras ?? []).map((a) => a.radius)),
    damageBonus: mods.damage,
    speedBonus: mods.attackSpeed,
    upgrades: nextOf(state, tower.spec).map((to) => {
      const target = towerSpec(to)!;
      const blocked = upgradeError(state, tower, to);
      return {
        to, name: target.name, tier: target.maul.tier, price: target.maul.price, role: target.maul.role, attack: attackInfo(to),
        blocked, gold: blocked !== null && !canAfford(state, target.maul.price),
      };
    }),
    sellValue: sale,
    fullRefund: sale > 0 && sale === ts.paid,
    paid: ts.paid,
    kills: tower.kills,
  };
}

export interface WavePreviewGroup {
  readonly creep: string;
  readonly name: string;
  readonly kind: CreepKind;
  readonly armorType: ArmorType;
  readonly armor: number;
  /** Creeps in all, from every gate it leaves. */
  readonly count: number;
  /** HP each, Difficulty included. */
  readonly hp: number;
  readonly flying: boolean;
  readonly boss: boolean;
  /** Lives one leak costs. */
  readonly lives: number;
  readonly hint: string;
}

export interface WavePreview {
  readonly wave: number;
  readonly groups: readonly WavePreviewGroup[];
  /** Any flyer in it: they skip the maze. */
  readonly air: boolean;
  readonly boss: boolean;
  /** Which gates send it. */
  readonly spawns: readonly number[];
  readonly bounty: number;
  readonly bonus: number;
}

/** What Wave `wave` (1-based) brings, or null past the last. */
export function wavePreview(state: GameState, wave: number): WavePreview | null {
  const spec = waveSpec(state, wave - 1);
  const row = runWaves(state)[wave - 1];
  if (!spec || !row) return null;
  const diff = difficultyHp(getMode(state.modeId), state.difficulty);
  const byCreep = new Map<string, { count: number; hp: number }>();
  for (const g of spec.groups) {
    const seen = byCreep.get(g.creep);
    if (seen) seen.count += g.count;
    else byCreep.set(g.creep, { count: g.count, hp: Math.max(1, Math.round((g.hp ?? 0) * diff)) });
  }
  const groups = [...byCreep].map(([creep, { count, hp }]): WavePreviewGroup => {
    const cs = MAUL_CREEPS[creep]!;
    return {
      creep, name: cs.name, kind: cs.maul.kind, armorType: cs.armorType, armor: cs.armor, count, hp, flying: cs.flying,
      boss: cs.maul.kind === 'boss', lives: cs.maul.lives, hint: cs.maul.hint,
    };
  });
  return {
    wave, groups, air: groups.some((g) => g.flying), boss: groups.some((g) => g.boss), spawns: spawnsOf(row),
    bounty: bountyPool(wave), bonus: waveBonus(wave),
  };
}

/** The finished (or running) Run as a Record entry. */
export interface MaulRecord {
  readonly wave: number;
  readonly won: boolean;
  readonly score: number;
  /** Seconds from Wave 1 to the last Wave cleared; null unless won. */
  readonly seconds: number | null;
  readonly races: readonly RaceId[];
}

export function maulRecord(state: GameState): MaulRecord {
  const ms = mlState(state);
  const won = state.phase === 'won';
  return {
    wave: won ? state.wave.total : state.wave.number,
    won,
    score: ms.score,
    seconds: won && ms.startTick >= 0 && ms.endTick >= 0 ? (ms.endTick - ms.startTick) / TICK_RATE : null,
    races: [...ms.races],
  };
}

/** The footprint every Maul tower covers, for the UI's ghost. */
export const FOOTPRINT = TOWER_FOOTPRINT;
