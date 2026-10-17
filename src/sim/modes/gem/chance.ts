import {
  BASE_SLATES, EXTRA_CHANCE, GEM_TYPES, QUALITIES, QUALITY_WEIGHTS, gemId,
  type GemType,
} from '../../../content/gem';
import { powDet } from '../../core/math';
import { nextFloat, nextInt, type RngState } from '../../core/rng';
import type { GameState } from '../../core/state';
import { baseSlate, gemState, type ExtraChanceState } from './state';

// Rolling Draft gems: Gem Quality weights (src/gem/chance.j) and Extra Chance
// (src/gem/extra-chance.j), all from the Run's seeded RNG.

/** A weighted draw over all 48 gems: each type gets the Gem Quality's weights, so the type is uniform. */
export function rollGem(rng: RngState, quality: number): string {
  const weights = QUALITY_WEIGHTS[Math.max(0, Math.min(QUALITY_WEIGHTS.length - 1, quality))]!;
  let total = 0;
  for (const w of weights) total += w;
  let r = nextFloat(rng) * total * GEM_TYPES.length;
  for (const type of GEM_TYPES) {
    for (let q = 0; q < QUALITIES.length; q++) {
      r -= weights[q]!;
      if (r < 0) return gemId(type, QUALITIES[q]!);
    }
  }
  return gemId(GEM_TYPES[GEM_TYPES.length - 1]!, QUALITIES[0]!);
}

/** Probability of each gem quality at a Gem Quality, Chipped to Great. */
export function qualityOdds(quality: number): number[] {
  const weights = QUALITY_WEIGHTS[Math.max(0, Math.min(QUALITY_WEIGHTS.length - 1, quality))]!;
  let total = 0;
  for (const w of weights) total += w;
  return weights.map((w) => w / total);
}

export function isTypeTarget(target: string): target is GemType {
  return (GEM_TYPES as readonly string[]).includes(target);
}

export function isSlateTarget(target: string): boolean {
  return BASE_SLATES.some((s) => s.id === target);
}

export function extraChanceCost(target: string): number {
  return isTypeTarget(target) ? EXTRA_CHANCE.typeCost : EXTRA_CHANCE.slateCost;
}

/** The bonus a new target would start with, from last round's target and bonus. */
export function nextBonus(extra: ExtraChanceState, target: string): number {
  if (extra.previous === '') return 0;
  const sameClass = isTypeTarget(target) === isTypeTarget(extra.previous);
  return sameClass ? Math.min(extra.previousBonus + 1, EXTRA_CHANCE.maxBonus) : extra.previousBonus;
}

/** base^(bonus − 10) for bonus ≤ 10, by whole powers only. */
function bias(base: number, bonus: number): number {
  return 1 / powDet(base, EXTRA_CHANCE.maxBonus - bonus);
}

function typeRolls(rng: RngState, type: GemType, bonus: number): string[] {
  const weight = bonus >= EXTRA_CHANCE.thresholdBonus
    ? 1
    : (EXTRA_CHANCE.typeInitial + ((EXTRA_CHANCE.totalWeight - EXTRA_CHANCE.typeInitial) / EXTRA_CHANCE.thresholdBonus) * bonus) / EXTRA_CHANCE.totalWeight;
  const lucky = bias(EXTRA_CHANCE.typeBias, bonus);
  const odds = EXTRA_CHANCE.typeQuality;
  const out: string[] = [];
  for (let k = 0; k < EXTRA_CHANCE.rolls; k++) {
    let roll = nextFloat(rng);
    let quality = -1;
    if (roll <= lucky) {
      quality = roll < odds[0] ? 0 : 4;
    } else if (roll <= weight) {
      roll /= weight;
      quality = 4;
      for (let q = 0; q < 4; q++) {
        if (roll < odds[q]!) {
          quality = q;
          break;
        }
        roll -= odds[q]!;
      }
    }
    out.push(quality < 0 ? '' : gemId(type, QUALITIES[quality]!));
  }
  return out;
}

function slateRolls(rng: RngState, target: string, bonus: number): string[] {
  const slate = baseSlate(target)!;
  const rolls: number[] = [];
  let lucky = false;
  const luck = bias(EXTRA_CHANCE.slateBias, bonus);
  for (let k = 0; k < EXTRA_CHANCE.rolls; k++) {
    rolls.push(nextFloat(rng));
    lucky = lucky || rolls[k]! <= luck;
  }
  const weight = lucky || bonus >= EXTRA_CHANCE.thresholdBonus
    ? 1
    : (EXTRA_CHANCE.slateInitial + ((EXTRA_CHANCE.totalWeight - EXTRA_CHANCE.slateInitial) / EXTRA_CHANCE.thresholdBonus) * bonus) / EXTRA_CHANCE.totalWeight;
  const out: string[] = [];
  let open: string | null = null;
  for (let k = 0; k < EXTRA_CHANCE.rolls; k++) {
    let roll = rolls[k]!;
    let gem = '';
    if (roll <= weight) {
      roll /= weight;
      if (open === null) {
        // A lucky round hands out the target's pieces, then its partner's.
        if (lucky && k < 4) roll = Math.floor(k / 2);
        const chance = slate.flawed.length === 2 ? EXTRA_CHANCE.slateTwo : EXTRA_CHANCE.slateThree;
        const pick = roll < chance ? slate : baseSlate(slate.partner)!;
        gem = pick.normal;
        open = pick.id;
      } else {
        const pick = baseSlate(open)!;
        const n = pick.flawed.length;
        const at = roll * n;
        gem = pick.flawed[at <= 1 ? 0 : at <= 2 ? 1 : Math.min(2, n - 1)]!;
        open = null;
      }
    }
    out.push(gem);
  }
  // Gem TD+'s shuffle: positions 4, 3 and 2 each swap with a random lower-or-equal one.
  for (let i = EXTRA_CHANCE.rolls - 1; i > 1; i--) {
    const j = nextInt(rng, 0, i);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/**
 * The round's first Draft gem: with a target, roll its five placements; without
 * one, last round's bonus fades by 1 (a skipped round).
 */
export function startRound(state: GameState): void {
  const extra = gemState(state).extra;
  if (extra.target !== '') {
    extra.rolls = isTypeTarget(extra.target)
      ? typeRolls(state.rng, extra.target, extra.bonus)
      : slateRolls(state.rng, extra.target, extra.bonus);
    return;
  }
  if (extra.previousBonus === 0) extra.previous = '';
  else extra.previousBonus--;
}

/** After the Draft's fifth gem: a hit spends 4 bonus (or clears it), a miss carries target and bonus over. */
export function finishRound(state: GameState, hit: boolean): void {
  const extra = gemState(state).extra;
  if (extra.target === '') return;
  if (hit) {
    extra.previous = extra.bonus > 3 ? extra.target : '';
    extra.previousBonus = extra.bonus > 3 ? extra.bonus - 4 : 0;
  } else {
    extra.previous = extra.target;
    extra.previousBonus = extra.bonus;
  }
  extra.target = '';
  extra.bonus = 0;
  extra.rolls = [];
}
