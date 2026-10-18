import { ORIGINAL_CREEPS, STAGES, type Family, type OriginalWave } from '../../src/content/original';
import type { Difficulty } from '../../src/sim';
import { decentTalents, playStage, type Strategy } from './bot';

// One Run of the balance runner, and what it reports.

export interface Job {
  readonly id: number;
  readonly stage: number;
  readonly difficulty: Difficulty;
  readonly strategy: Strategy;
  /** The family of a single-family Run. */
  readonly family?: Family;
  readonly seed: number;
  /** Scales every group's count, bosses aside, from the first Wave's share to the last's: a tuning aid. [1, 1] plays the Stage as it is. */
  readonly scale: readonly [number, number];
}

export interface Outcome {
  readonly id: number;
  readonly won: boolean;
  /** The latest Wave sent, and the Waves cleared. */
  readonly reached: number;
  readonly completed: number;
  readonly lives: number;
  readonly stars: number;
  readonly earlyGold: number;
  /** Lives at the start of each Wave. */
  readonly livesByWave: readonly number[];
}

/**
 * The Talents each strategy brings. Every player fills the trees of the
 * families it leans on, one tree at a time: a single-family player its own
 * family's, the others Arrow, then Arcane, then the rest.
 */
export function talentsFor(job: Pick<Job, 'stage' | 'strategy' | 'family'>): string[] {
  if (job.strategy === 'single' && job.family) return decentTalents(job.stage, { order: [job.family], focus: true });
  return decentTalents(job.stage, { focus: true });
}

/**
 * The Stage's Waves with every group but a boss scaled: `from` times as many
 * creeps in Wave 1, rising evenly to `to` times in the last, each group's
 * creeps that much closer together so it still takes as long to arrive. That
 * is close to scaling their HP. At least one creep a group.
 */
export function scaledWaves(stage: number, [from, to]: readonly [number, number]): OriginalWave[] {
  const waves = STAGES[stage - 1]!.waves;
  return waves.map((w, i) => {
    const scale = from + ((to - from) * i) / Math.max(1, waves.length - 1);
    return {
      groups: w.groups.map((g) => {
        const creep = ORIGINAL_CREEPS[g.creep];
        if (!creep || creep.original.boss) return g;
        const count = Math.max(1, Math.round(g.count * scale));
        return { ...g, count, gap: ((g.gap ?? creep.original.gap) * g.count) / count };
      }),
    };
  });
}

export function playJob(job: Job): Outcome {
  const r = playStage(job.seed, job.difficulty, {
    stage: job.stage,
    ...(job.scale[0] !== 1 || job.scale[1] !== 1 ? { waves: scaledWaves(job.stage, job.scale) } : {}),
    cleared: job.stage - 1,
    strategy: job.strategy,
    ...(job.family ? { families: [job.family] } : {}),
    talents: talentsFor(job),
    style: job.seed,
  });
  return {
    id: job.id, won: r.won, reached: r.reached, completed: r.completed, lives: r.lives, stars: r.stars, earlyGold: r.earlyGold,
    livesByWave: r.trace.map((t) => t.lives),
  };
}
