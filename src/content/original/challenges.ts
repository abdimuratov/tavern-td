import type { Difficulty } from '../../sim';
import type { ChallengeSpec } from './types';

// The Campaign's Challenges (docs/original-design.md §16): each Stage played
// again under one named rule, themed to what that Stage teaches. A Challenge
// opens once its Stage is won, always plays Normal with the Talents held, and
// its first win pays one Star, so the Campaign's 36 Stars and the Challenges'
// 12 fill all six Talent trees. The bots tuned every number (§16).

/** Every Challenge plays this Difficulty. */
export const CHALLENGE_DIFFICULTY: Difficulty = 'normal';

/** Every Challenge, in Campaign order: one per Stage. */
export const CHALLENGES: readonly ChallengeSpec[] = [
  // Ashfield: each Challenge withholds what its Stage leaned on or brought.
  {
    stage: 1, id: 'burnt-mill', name: 'The Burnt Mill', stars: 1,
    rule: 'Fire took the lower bend and west of the mill: 4 towers at most.',
    // Every cell south of the middle road, and west of the mill above it.
    modifiers: { burnt: { name: 'Lower bend and west burnt', at: 'on burnt ground', rects: [[0, 10, 32, 8], [0, 4, 13, 6]] }, maxTowers: 4 },
  },
  {
    stage: 2, id: 'cold-water', name: 'Cold Water', stars: 1,
    rule: 'Cannon and Frost towers only, and creeps have 44% more HP.',
    modifiers: { families: ['cannon', 'frost'], hp: 1.44 },
  },
  {
    stage: 3, id: 'short-rope', name: 'Short Rope', stars: 1,
    rule: 'Towers stop at Tier 2, and you start with 10 lives.',
    modifiers: { maxTier: 2, lives: 10 },
  },
  {
    stage: 4, id: 'gravelords-host', name: 'The Gravelord\'s Host', stars: 1,
    rule: 'Creeps have 10% more HP.',
    modifiers: { hp: 1.1 },
  },
  // Blightfen.
  {
    stage: 5, id: 'wardbreakers', name: 'Wardbreakers', stars: 1,
    rule: 'No Frost or Arcane towers, and you start with 16 lives.',
    modifiers: { families: ['arrow', 'cannon', 'poison', 'totem'], lives: 16 },
  },
  {
    stage: 6, id: 'old-rites', name: 'The Old Rites', stars: 1,
    rule: 'No Specialisations, and you start with 350 gold.',
    modifiers: { noSpecialisations: true, gold: 350 },
  },
  {
    stage: 7, id: 'no-rest', name: 'No Rest at the Fords', stars: 1,
    rule: 'Breaks last 8 s, and you start with 17 lives.',
    modifiers: { breakSeconds: 8, lives: 17 },
  },
  {
    stage: 8, id: 'short-supply', name: 'Short Supply', stars: 1,
    rule: 'Start with 430 gold, and Send now pays no gold.',
    modifiers: { gold: 430, noEarlyCall: true },
  },
  // Rift.
  {
    stage: 9, id: 'glass-slope', name: 'Glass Slope', stars: 1,
    rule: 'The middle row burned to glass: nothing stands on it, and 8 towers at most.',
    // The strip between the two middle legs.
    modifiers: { burnt: { name: 'Middle row burnt', at: 'on the glass', rects: [[7, 9, 20, 2]] }, maxTowers: 8 },
  },
  {
    stage: 10, id: 'stone-wings', name: 'Stone Wings', stars: 1,
    rule: 'No Arrow towers, and creeps have 8% more HP.',
    modifiers: { families: ['cannon', 'frost', 'arcane', 'poison', 'totem'], hp: 1.08 },
  },
  {
    stage: 11, id: 'three-hordes', name: 'Three Hordes', stars: 1,
    rule: 'Breaks last 18 s: the hordes don\'t wait for each other.',
    modifiers: { breakSeconds: 18 },
  },
  {
    stage: 12, id: 'last-stand', name: 'The Last Stand', stars: 1,
    rule: 'Start with 11 lives.',
    modifiers: { lives: 11 },
  },
];

/** The Challenge played on Stage `stage`, or undefined. */
export function challengeOfStage(stage: number): ChallengeSpec | undefined {
  return CHALLENGES.find((c) => c.stage === stage);
}

/** A Challenge by id, or undefined. */
export function challengeById(id: string): ChallengeSpec | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
