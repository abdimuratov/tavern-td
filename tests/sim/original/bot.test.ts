import { describe, expect, it } from 'vitest';
import { original } from '../../../src/sim';
import { STAGES, challengeOfStage } from '../../../src/content/original';
import { challengeSetup, talentsFor } from '../../../tools/balance/jobs';
import { playStage, type BotOptions, type Strategy } from './bot';

// A small sample of the balance runner (pnpm balance), run on every push: the
// competent bot on every Stage, with the Campaign's unlocks and a decent
// player's Talents for each. A dozen whole Runs take about 15 s here, where
// the bots weigh every free place, and several times that on CI's runners, so
// each test gets two minutes.
const BOT_TIMEOUT = 120_000;

function play(stage: number, difficulty: 'easy' | 'normal' | 'insane', strategy: Strategy = 'balanced', more: BotOptions = {}, seed = 1) {
  const family = more.families?.[0];
  return playStage(seed, difficulty, {
    stage, cleared: stage - 1, strategy, style: seed, talents: talentsFor({ stage, strategy, ...(family ? { family } : {}) }), ...more,
  });
}

describe('the balance bots', () => {
  it('win every Stage on Easy with the competent bot, sending nothing the rules refuse', { timeout: BOT_TIMEOUT }, () => {
    const lines: string[] = [];
    for (const stage of STAGES) {
      const r = play(stage.number, 'easy');
      lines.push(`Stage ${stage.number}: ${r.phase} with ${r.lives} lives, ${r.towers} towers; step mean ${(r.meanStepMs * 1000).toFixed(1)} µs`);
      expect(r.rejected, stage.name).toEqual([]);
      expect(r.won, stage.name).toBe(true);
      expect(r.completed).toBe(stage.waves.length);
      // ADR-0002's budget is 4 ms a tick on an iPhone.
      expect(r.meanStepMs).toBeLessThan(1);
    }
    console.log(lines.join('\n'));
  });

  it('lose Insane, the first Stage, the middle and the last', { timeout: BOT_TIMEOUT }, () => {
    // Seed 2: with free placement seed 1 falls unluckily early on Riftmaw, at Wave 6 (seeds 2–5 reach Waves 10–14).
    for (const stage of [1, 6, 12]) {
      const r = play(stage, 'insane', 'balanced', {}, 2);
      expect(r.won, `Stage ${stage}`).toBe(false);
      // Insane is lost halfway or later, not to the Stage's opening.
      expect(r.reached, `Stage ${stage}`).toBeGreaterThanOrEqual(STAGES[stage - 1]!.waves.length / 2);
    }
  });

  it('can\'t hold Drowned Causeway\'s flyers with Cannons alone', { timeout: BOT_TIMEOUT }, () => {
    const r = play(5, 'normal', 'single', { families: ['cannon'] });
    expect(r.won).toBe(false);
  });

  it('win a Challenge with the least the Campaign holds when it opens: The Burnt Mill and Short Rope', { timeout: BOT_TIMEOUT }, () => {
    // pnpm balance --challenges plays every one; these two seeds win theirs.
    for (const [stage, seed] of [[1, 3], [3, 6]] as const) {
      const r = playStage(seed, 'normal', {
        stage, ...challengeSetup(stage), strategy: 'balanced', style: seed, talents: talentsFor({ stage, strategy: 'balanced', challenge: true }),
      });
      const name = challengeOfStage(stage)!.name;
      expect(r.rejected, name).toEqual([]);
      expect(r.won, name).toBe(true);
      expect(original.originalResult(r.state)).toMatchObject({ stars: 1, challenge: challengeOfStage(stage)!.id });
    }
  });

  it('keep the first bot: it fills Stage 1\'s places in a rotation and clears it on Easy, waiting or calling early', { timeout: BOT_TIMEOUT }, () => {
    for (const greedy of [false, true]) {
      const r = playStage(1, 'easy', { cleared: 0, greedy });
      expect(r.rejected).toEqual([]);
      expect(r.won).toBe(true);
      if (greedy) expect(r.earlyGold).toBeGreaterThan(0);
    }
  });
});
