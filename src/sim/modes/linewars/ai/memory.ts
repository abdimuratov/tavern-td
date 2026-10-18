import { AI_PROFILES, ROW_WALLS, SALVO_JITTER, type SkillId } from '../../../../content/linewars';
import { createRng, nextFloat } from '../../../core/rng';
import type { GameState } from '../../../core/state';
import { ticks, type LwAi, type SideId } from '../state';

// The AI's memory (docs/line-wars-design.md §11.1): plain JSON in
// `state.mode.ai`, with its own RNG stream seeded from the Run's seed and its
// Side by integer ops, so it never draws from the Run's RNG.

/** The seed of a Side's AI stream: the Run's seed and the Side mixed with integer multiplies. */
export function aiSeed(seed: number, side: SideId): number {
  return (Math.imul(seed ^ 0x2c1b3c6d, 0x297a2d39) + Math.imul(side + 1, 0x9e3779b1)) >>> 0;
}

/** A fresh memory for an AI Side, with its seeded variations drawn: the maze's flip, Easy's skipped Walls and the salvo time. */
export function newAi(state: GameState, side: SideId, skill: SkillId): LwAi {
  const rng = createRng(aiSeed(state.seed, side));
  const profile = AI_PROFILES[skill];
  const flip = nextFloat(rng) < 0.5;
  const skip: number[] = [];
  for (let i = 0; i < profile.rows * ROW_WALLS; i++) if (profile.skip > 0 && nextFloat(rng) < profile.skip) skip.push(i);
  const jitter = (nextFloat(rng) * 2 - 1) * SALVO_JITTER;
  return {
    skill, rng, flip, skip,
    salvoTick: profile.salvoFrom === null ? -1 : ticks(profile.salvoFrom + jitter),
    salvo: [], salvoCreeps: [], salvoStolen: 0, repeat: [], bank: 0, earnedSeen: 0,
    boost: 0, boostTick: 0, leaksSeen: 0, first: 0, applied: 0,
  };
}
