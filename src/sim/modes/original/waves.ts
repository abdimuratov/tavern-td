import {
  BOUNTY_POOL, EARLY_CALL, GHOUL_HP, ORIGINAL_CREEPS, WAVE_BONUS, stageByNumber,
  type ChallengeModifiers, type OriginalWave, type StageSpec,
} from '../../../content/original';
import { difficultyHp } from '../../combat/creeps';
import { powDet } from '../../core/math';
import type { WaveGroup, WaveSpec } from '../../core/specs';
import type { Difficulty, GameState } from '../../core/state';
import { getMode } from '../registry';
import { runModifiers } from './challenge';
import { ORIGINAL_MODE_ID, orState, threatOf } from './state';

// Threat and the curves it drives (docs/original-design.md §10). A Wave's
// Threat is the Stage's first Threat plus the Wave number minus one, so the
// curves carry across the Campaign instead of restarting each Stage.

/** A Ghoul's HP at Threat T, before Difficulty: 20 × 1.10^(T−1). */
export function ghoulHp(threat: number): number {
  return GHOUL_HP.base * powDet(GHOUL_HP.growth, Math.max(0, threat - 1));
}

/** A Ghoul's HP at Threat T in this Run: Difficulty and a Challenge's HP included. Shields and dropped creeps scale with it. */
export function runGhoulHp(state: GameState, threat: number): number {
  return ghoulHp(threat) * runHpScale(state);
}

/** What this Run multiplies creep HP by: its Difficulty, times its Challenge's HP if it has one. */
export function runHpScale(state: GameState): number {
  return hpScaleFor(state.difficulty, runModifiers(state));
}

/**
 * What creep HP is multiplied by on `difficulty` under a Challenge's
 * modifiers (pass `{}` for a Stage's own Run): the Difficulty, times the
 * Challenge's HP if it sets one. A Run's runHpScale, or the Waves tab's with no Run.
 */
export function hpScaleFor(difficulty: Difficulty, mods: ChallengeModifiers): number {
  const diff = difficultyHp(getMode(ORIGINAL_MODE_ID), difficulty);
  const hp = mods.hp;
  return hp === undefined ? diff : diff * hp;
}

/** A Shield of `share` × a Ghoul's HP at Threat T, with creep HP times `hpScale`: what a Shieldbearer spawns with. */
export function shieldAt(share: number, threat: number, hpScale: number): number {
  return Math.round(share * (ghoulHp(threat) * hpScale));
}

/** The gold a Wave's creeps carry between them: 10 × (1 + ⌊T/4⌋). */
export function bountyPool(threat: number): number {
  return BOUNTY_POOL.base * (1 + Math.floor(threat / BOUNTY_POOL.every));
}

/** The end-of-Wave bonus, paid when the Wave is cleared: 20 + 4T. */
export function waveBonus(threat: number): number {
  return WAVE_BONUS.base + WAVE_BONUS.perThreat * threat;
}

/** Gold for calling a Wave of Threat T early with `secondsLeft` of its Break unused: ⌊0.4 × s × (1 + T/10)⌋. */
export function earlyCallGold(threat: number, secondsLeft: number): number {
  if (!(secondsLeft > 0)) return 0;
  return Math.floor(EARLY_CALL.perSecond * secondsLeft * (1 + threat * EARLY_CALL.perThreat));
}

/** The Run's Stage. */
export function stageOf(state: GameState): StageSpec {
  const stage = stageByNumber(orState(state).stage);
  if (!stage) throw new Error(`The Original has no Stage ${orState(state).stage}`);
  return stage;
}

/** The Waves this Run plays: its custom ones, or its Stage's. */
export function runWaves(state: GameState): readonly OriginalWave[] {
  return orState(state).waves ?? stageOf(state).waves;
}

/** When each group of a Wave starts, in seconds after the Wave: `at`, or one gap after the group before ends. */
export function groupStarts(wave: OriginalWave): number[] {
  const starts: number[] = [];
  let next = 0;
  for (const g of wave.groups) {
    const gap = g.gap ?? ORIGINAL_CREEPS[g.creep]?.original.gap ?? 1;
    const at = g.at ?? next;
    starts.push(at);
    next = at + Math.max(0, g.count - 1) * gap + gap;
  }
  return starts;
}

/**
 * Each group's creep at Threat T, before Difficulty and a Challenge: its HP (its
 * multiple of a Ghoul's HP at T) and its bounty, the pool split by each creep's
 * share of the Wave's HP, to the hundredth of a gold. waveSpec builds a Run's
 * Waves from it, and the Waves tab its rows.
 */
export function groupNumbers(wave: OriginalWave, threat: number): { readonly hp: number; readonly bounty: number }[] {
  const ghoul = ghoulHp(threat);
  let total = 0;
  for (const g of wave.groups) total += g.count * (ORIGINAL_CREEPS[g.creep]?.original.hpMult ?? 0);
  const pool = bountyPool(threat);
  return wave.groups.map((g) => {
    const mult = ORIGINAL_CREEPS[g.creep]?.original.hpMult ?? 1;
    return { hp: ghoul * mult, bounty: total > 0 ? Math.round((pool * mult * 100) / total) / 100 : 0 };
  });
}

/**
 * Wave `index` (0-based) as core groups. HP is the creep's multiple of a
 * Ghoul's HP at the Wave's Threat (the core applies Difficulty). The bounty
 * pool is split by each creep's share of the Wave's HP, to the hundredth of a
 * gold (assumed; kill() pays whole gold as it adds up).
 */
export function waveSpec(state: GameState, index: number): WaveSpec | undefined {
  const wave = runWaves(state)[index];
  if (!wave) return undefined;
  const numbers = groupNumbers(wave, threatOf(state, index + 1));
  const starts = groupStarts(wave);
  const groups = wave.groups.map((g, i): WaveGroup => {
    const gap = g.gap ?? ORIGINAL_CREEPS[g.creep]?.original.gap ?? 1;
    const { hp, bounty } = numbers[i]!;
    const group: WaveGroup = { creep: g.creep, count: g.count, interval: gap, delay: starts[i]!, hp, bounty };
    return g.route === undefined ? group : { ...group, route: g.route };
  });
  // A Challenge's tougher creeps; the core multiplies it in with the Difficulty.
  const hp = runModifiers(state).hp;
  return hp === undefined ? { groups } : { groups, hpMult: hp };
}
