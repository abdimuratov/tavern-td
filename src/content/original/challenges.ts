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
    rule: 'Fire took the lower bend: only the upper bend\'s 4 Build Spots stand.',
    modifiers: { spots: [0, 1, 2, 3] },
  },
  {
    stage: 2, id: 'cold-water', name: 'Cold Water', stars: 1,
    rule: 'Cannon and Frost towers only, and creeps have 30% more HP.',
    modifiers: { families: ['cannon', 'frost'], hp: 1.3 },
  },
  {
    stage: 3, id: 'short-rope', name: 'Short Rope', stars: 1,
    rule: 'Towers stop at Tier 2.',
    modifiers: { maxTier: 2 },
  },
  {
    stage: 4, id: 'gravelords-host', name: 'The Gravelord\'s Host', stars: 1,
    rule: 'Creeps have 15% more HP.',
    modifiers: { hp: 1.15 },
  },
  // Blightfen.
  {
    stage: 5, id: 'wardbreakers', name: 'Wardbreakers', stars: 1,
    rule: 'No Frost or Arcane towers, and you start with 15 lives.',
    modifiers: { families: ['arrow', 'cannon', 'poison', 'totem'], lives: 15 },
  },
  {
    stage: 6, id: 'old-rites', name: 'The Old Rites', stars: 1,
    rule: 'No Specialisations, and you start with 350 gold.',
    modifiers: { noSpecialisations: true, gold: 350 },
  },
  {
    stage: 7, id: 'no-rest', name: 'No Rest at the Fords', stars: 1,
    rule: 'Breaks last 8 s.',
    modifiers: { breakSeconds: 8 },
  },
  {
    stage: 8, id: 'short-supply', name: 'Short Supply', stars: 1,
    rule: 'Start with 450 gold, and Send now pays no gold.',
    modifiers: { gold: 450, noEarlyCall: true },
  },
  // Rift.
  {
    stage: 9, id: 'glass-slope', name: 'Glass Slope', stars: 1,
    rule: 'The middle row burned to glass: 8 Build Spots stand.',
    modifiers: { spots: [0, 1, 2, 3, 8, 9, 10, 11] },
  },
  {
    stage: 10, id: 'stone-wings', name: 'Stone Wings', stars: 1,
    rule: 'No Arrow towers, and creeps have 10% more HP.',
    modifiers: { families: ['cannon', 'frost', 'arcane', 'poison', 'totem'], hp: 1.1 },
  },
  {
    stage: 11, id: 'three-hordes', name: 'Three Hordes', stars: 1,
    rule: 'Breaks last 18 s: the hordes don\'t wait for each other.',
    modifiers: { breakSeconds: 18 },
  },
  {
    stage: 12, id: 'last-stand', name: 'The Last Stand', stars: 1,
    rule: 'Start with 13 lives.',
    modifiers: { lives: 13 },
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
