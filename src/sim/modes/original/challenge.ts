import {
  CHALLENGE_DIFFICULTY, challengeById, stageByNumber,
  type ChallengeModifiers, type ChallengeSpec, type StageSpec,
} from '../../../content/original';
import type { MapSpec } from '../../core/specs';
import type { GameState } from '../../core/state';
import { unlocksFor, type Unlocks } from './progression';
import { orState } from './state';

// Challenges (docs/original-design.md §16): a Stage played again under its
// own rule. A Challenge is a Run setting: the Run's state names it, and its
// modifiers come from the content table. What they change at the start
// (lives, gold, Burnt ground, Talents) setup bakes into the state; the rest
// (the Tower cap among them) the rules read here as they go. A Stage's own Run
// names none, so it plays and hashes exactly as before Challenges.

const NONE: ChallengeModifiers = {};

/** The Run's Challenge, or null when it plays the Stage itself. */
export function runChallenge(state: GameState): ChallengeSpec | null {
  const id = orState(state).challenge;
  return id === undefined ? null : challengeById(id) ?? null;
}

/** What the Run's Challenge changes; nothing for a Stage's own Run. */
export function runModifiers(state: GameState): ChallengeModifiers {
  const id = orState(state).challenge;
  return id === undefined ? NONE : challengeById(id)?.modifiers ?? NONE;
}

/**
 * Why `challenge` can't be played as Stage `stage` on `difficulty`, or null:
 * it must exist, belong to that Stage and play Normal.
 */
export function challengeProblem(challenge: unknown, stage: number, difficulty: string): string | null {
  if (typeof challenge !== 'string') return 'challenge must be a Challenge id';
  const spec = challengeById(challenge);
  if (!spec) return `no Challenge ${challenge}`;
  if (spec.stage !== stage) return `the Challenge ${challenge} is played on Stage ${spec.stage}, not ${stage}`;
  if (difficulty !== CHALLENGE_DIFFICULTY) return `a Challenge plays on ${CHALLENGE_DIFFICULTY}`;
  return null;
}

/** The unlocks after `cleared` Stages, narrowed by a Challenge's modifiers. */
export function challengeUnlocks(cleared: number, mods: ChallengeModifiers): Unlocks {
  const open = unlocksFor(cleared);
  if (mods === NONE) return open;
  const allowed = mods.families;
  return {
    families: allowed ? open.families.filter((f) => allowed.includes(f)) : open.families,
    maxTier: mods.maxTier !== undefined && mods.maxTier < open.maxTier ? mods.maxTier : open.maxTier,
    specialisations: open.specialisations && !mods.noSpecialisations,
    talents: open.talents,
  };
}

const maps = new Map<string, MapSpec>();

/**
 * The Map a Challenge plays: its Stage's, with its Burnt ground painted over
 * Open ground only (road and the Stage's own Scenery stay as they are) and
 * added to the Map's Scenery as `burnt`. Built once per Challenge.
 */
export function challengeMap(challenge: ChallengeSpec): MapSpec {
  const stage = stageByNumber(challenge.stage);
  if (!stage) throw new Error(`The Original has no Stage ${challenge.stage}`);
  const burnt = challenge.modifiers.burnt;
  if (!burnt) return stage.map;
  const known = maps.get(challenge.id);
  if (known) return known;
  const rows = stage.map.terrain.map((r) => r.split(''));
  for (const [col, row, w, h] of burnt.rects) {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (rows[r]?.[c] === '.') rows[r]![c] = '#';
  }
  const map: MapSpec = {
    ...stage.map,
    terrain: rows.map((r) => r.join('')),
    scenery: [...stage.map.scenery ?? [], { kind: 'burnt', name: burnt.name, at: burnt.at, rects: burnt.rects }],
  };
  maps.set(challenge.id, map);
  return map;
}

/** The Map a Run plays: its Challenge's, or its Stage's own. */
export function runMap(stage: StageSpec, challenge: ChallengeSpec | null): MapSpec {
  return challenge ? challengeMap(challenge) : stage.map;
}
