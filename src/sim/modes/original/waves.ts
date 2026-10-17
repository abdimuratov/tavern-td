import {
  BOUNTY_POOL, EARLY_CALL, GHOUL_HP, ORIGINAL_CREEPS, WAVE_BONUS, stageByNumber,
  type OriginalWave, type StageSpec,
} from '../../../content/original';
import { difficultyHp } from '../../combat/creeps';
import { powDet } from '../../core/math';
import type { WaveGroup, WaveSpec } from '../../core/specs';
import type { GameState } from '../../core/state';
import { getMode } from '../registry';
import { orState, threatOf } from './state';

// Threat and the curves it drives (docs/original-design.md §10). A Wave's
// Threat is the Stage's first Threat plus the Wave number minus one, so the
// curves carry across the Campaign instead of restarting each Stage.

/** A Ghoul's HP at Threat T, before Difficulty: 20 × 1.10^(T−1). */
export function ghoulHp(threat: number): number {
  return GHOUL_HP.base * powDet(GHOUL_HP.growth, Math.max(0, threat - 1));
}

/** A Ghoul's HP at Threat T in this Run: Difficulty included. Shields and dropped creeps scale with it. */
export function runGhoulHp(state: GameState, threat: number): number {
  return ghoulHp(threat) * difficultyHp(getMode(state.modeId), state.difficulty);
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
 * Wave `index` (0-based) as core groups. HP is the creep's multiple of a
 * Ghoul's HP at the Wave's Threat (the core applies Difficulty). The bounty
 * pool is split by each creep's share of the Wave's HP, to the hundredth of a
 * gold (assumed; kill() pays whole gold as it adds up).
 */
export function waveSpec(state: GameState, index: number): WaveSpec | undefined {
  const wave = runWaves(state)[index];
  if (!wave) return undefined;
  const threat = threatOf(state, index + 1);
  const ghoul = ghoulHp(threat);
  let total = 0;
  for (const g of wave.groups) total += g.count * (ORIGINAL_CREEPS[g.creep]?.original.hpMult ?? 0);
  const pool = bountyPool(threat);
  const starts = groupStarts(wave);
  const groups = wave.groups.map((g, i): WaveGroup => {
    const mult = ORIGINAL_CREEPS[g.creep]?.original.hpMult ?? 1;
    const gap = g.gap ?? ORIGINAL_CREEPS[g.creep]?.original.gap ?? 1;
    const bounty = total > 0 ? Math.round((pool * mult * 100) / total) / 100 : 0;
    const group: WaveGroup = { creep: g.creep, count: g.count, interval: gap, delay: starts[i]!, hp: ghoul * mult, bounty };
    return g.route === undefined ? group : { ...group, route: g.route };
  });
  return { groups };
}
