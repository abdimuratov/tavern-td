import { ORIGINAL_CREEPS, STAGES, challengeOfStage, type Family, type OriginalWave } from '../../src/content/original';
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
  /** Plays the Stage's Challenge instead of the Stage: on Normal, with what the Campaign holds when it opens. */
  readonly challenge?: boolean;
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
export function talentsFor(job: Pick<Job, 'stage' | 'strategy' | 'family' | 'challenge'>): string[] {
  // A Challenge opens once its Stage is won: the Talents of a player about to play the next Stage.
  const stage = job.challenge ? job.stage + 1 : job.stage;
  if (job.strategy === 'single' && job.family) return decentTalents(stage, { order: [job.family], focus: true });
  return decentTalents(stage, { focus: true });
}

/**
 * What a Challenge's Run takes, at the least a player can hold when it opens:
 * the unlocks from finishing its Stage (cleared = Stage), and the Talents a
 * decent player holds with the Stars the Stages up to it paid, none from
 * other Challenges. Undefined when the Stage has no Challenge.
 */
export function challengeSetup(stage: number): { readonly challenge: string; readonly cleared: number } | undefined {
  const c = challengeOfStage(stage);
  return c ? { challenge: c.id, cleared: stage } : undefined;
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
    ...(job.challenge ? challengeSetup(job.stage) : {}),
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
