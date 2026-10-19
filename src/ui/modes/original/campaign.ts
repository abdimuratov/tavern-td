import { signal } from '@preact/signals';
import { CAMPAIGN_LENGTH, challengeOfStage, FAMILIES, stageByNumber, type ChallengeSpec, type Family } from '../../../content/original';
import { EMPTY_CAMPAIGN, loadCampaign, updateCampaign, type CampaignProgress } from '../../../platform/storage';
import { original, type GameState } from '../../../sim';
import { FAMILY_NAME } from './text';

// The Campaign as the Stage-select screen and the end card see it: Stage and
// Challenge Records, Stars, Stages finished and the Talents held. It lives in
// storage apart from Run saves (docs/original-design.md §13, §16); this module
// keeps the copy the screens read and folds each finished Run into it.

type StageRecord = original.StageRecord;
type StageResult = original.StageResult;
type ChallengeRecord = original.ChallengeRecord;

/** Most Stars the Campaign holds: 36 from the Stages and 12 from the Challenges, enough for all six Talent trees. */
export const MOST_STARS = original.maxStars();

/** The Campaign as last read or written. */
export const campaign = signal<CampaignProgress>({ stages: {}, challenges: {}, talents: [] });

export async function loadCampaignProgress(): Promise<void> {
  campaign.value = await loadCampaign();
}

export function stageRecord(c: CampaignProgress, stage: number): StageRecord | null {
  const key = String(stage);
  return Object.hasOwn(c.stages, key) ? c.stages[key]! : null;
}

/** Stages finished in order from the first: what sets the unlocks and which Stages are open. */
export function stagesCleared(c: CampaignProgress): number {
  let n = 0;
  while (n < CAMPAIGN_LENGTH && stageRecord(c, n + 1) !== null) n++;
  return n;
}

/** Stars earned in all: each Stage's best, and each won Challenge's Stars. They are the Talent budget. */
export function starsEarned(c: CampaignProgress): number {
  let total = 0;
  for (const r of Object.values(c.stages)) total += r.stars;
  return total + challengeStarsEarned(c);
}

/** Stars the won Challenges paid, each once. */
export function challengeStarsEarned(c: CampaignProgress): number {
  let total = 0;
  for (const key of Object.keys(c.challenges)) total += challengeOfStage(Number(key))?.stars ?? 0;
  return total;
}

/** Stars not spent on Talents. */
export function starsFree(c: CampaignProgress): number {
  return starsEarned(c) - original.starsSpent(c.talents);
}

export function campaignUnlocks(c: CampaignProgress): original.Unlocks {
  return original.unlocksFor(stagesCleared(c));
}

/** Whether Stage `stage` can be played: it is built, and the one before it is finished. */
export function stageOpen(c: CampaignProgress, stage: number): boolean {
  return stageByNumber(stage) !== undefined && stage <= stagesCleared(c) + 1;
}

/** The Campaign after a Run of Stage `stage`; a loss changes nothing. Folding the same Run in twice changes nothing more. */
export function withResult(c: CampaignProgress, stage: number, result: StageResult): CampaignProgress {
  if (!result.won) return c;
  return { ...c, stages: { ...c.stages, [String(stage)]: original.mergeStageRecord(stageRecord(c, stage), result) } };
}

// --- Challenges (docs/original-design.md §16) --------------------------------------

/** Stage `stage`'s Challenge Record, or null until its Challenge is won. */
export function challengeRecord(c: CampaignProgress, stage: number): ChallengeRecord | null {
  const key = String(stage);
  return Object.hasOwn(c.challenges, key) ? c.challenges[key]! : null;
}

/** Whether Stage `stage`'s Challenge has been won, and its Stars paid. */
export function challengeWon(c: CampaignProgress, stage: number): boolean {
  return challengeRecord(c, stage) !== null;
}

/** Whether Stage `stage`'s Challenge can be played: the Stage has one, and the Stage is won. */
export function challengeOpen(c: CampaignProgress, stage: number): boolean {
  return challengeOfStage(stage) !== undefined && stageRecord(c, stage) !== null;
}

/**
 * Where Stage `stage`'s Challenge stands, as the war map and the Stage panel
 * mark it: 'locked' until the Stage is won, then 'open', then 'won'; null for
 * a Stage without one.
 */
export function challengeState(c: CampaignProgress, stage: number): 'locked' | 'open' | 'won' | null {
  if (!challengeOfStage(stage)) return null;
  if (!challengeOpen(c, stage)) return 'locked';
  return challengeWon(c, stage) ? 'won' : 'open';
}

/** Challenges won, of those built. */
export function challengesWon(c: CampaignProgress): number {
  let n = 0;
  for (const key of Object.keys(c.challenges)) if (challengeOfStage(Number(key))) n++;
  return n;
}

/** Names in a list: "Arrow", "Frost and Arcane", "Arrow, Cannon and Frost" ("or" in place of "and" if asked). */
function listOf(names: readonly string[], and = 'and'): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]!}`;
}

/**
 * A Challenge's rule as short lines, one per modifier, for the HUD's chips
 * ("Cannon and Frost only", "No Arrow towers", "+30% creep HP"). A family rule
 * names the shorter side: the families left out when it allows most of them.
 * Its `rule` is the one sentence for the Stage panel.
 */
export function challengeLines(spec: ChallengeSpec): string[] {
  const m = spec.modifiers;
  const out: string[] = [];
  if (m.families) {
    const allowed = m.families;
    const barred = FAMILIES.filter((f) => !allowed.includes(f));
    out.push(barred.length < allowed.length
      ? `No ${listOf(barred.map((f) => FAMILY_NAME[f]), 'or')} towers`
      : `${listOf(allowed.map((f) => FAMILY_NAME[f]))} only`);
  }
  if (m.spots) out.push(`${m.spots.length} Build Spots`);
  if (m.maxTier !== undefined) out.push(`Tiers 1–${m.maxTier}`);
  if (m.noSpecialisations) out.push('No Specialisations');
  if (m.hp !== undefined) out.push(`+${Math.round((m.hp - 1) * 100)}% creep HP`);
  if (m.lives !== undefined) out.push(`${m.lives} lives`);
  if (m.gold !== undefined) out.push(`${m.gold} gold to start`);
  if (m.noEarlyCall) out.push('Send now pays no gold');
  if (m.breakSeconds !== undefined) out.push(`${m.breakSeconds} s Breaks`);
  return out;
}

/**
 * The Campaign after a Run of Stage `stage`'s Challenge: a first win creates
 * its Record (paying its Stars, once), a faster one lowers its fastest win,
 * and a loss changes nothing. The Stage's own Record is never touched.
 */
export function withChallengeResult(c: CampaignProgress, stage: number, result: StageResult): CampaignProgress {
  const record = original.mergeChallengeRecord(challengeRecord(c, stage), result);
  if (!result.won || record === null) return c;
  return { ...c, challenges: { ...c.challenges, [String(stage)]: record } };
}

/** The Campaign after any finished Run: a Challenge's goes to its Challenge Record, a Stage's to its Stage Record. */
export function withRun(c: CampaignProgress, r: StageResult & { readonly stage: number; readonly challenge: string | null }): CampaignProgress {
  return r.challenge === null ? withResult(c, r.stage, r) : withChallengeResult(c, r.stage, r);
}

/** What a finished Run did to the Campaign, for the end card. */
export interface StageOutcome {
  readonly stage: number;
  /** The Challenge played, by id, or null for the Stage itself. */
  readonly challenge: string | null;
  readonly won: boolean;
  /** Stars this Run won: 0–3 by lives left for a Stage, the Challenge's Stars for a Challenge won. */
  readonly stars: number;
  /** Stars it added to the Campaign: what beats the Stage's old best, or a Challenge's Stars on its first win. */
  readonly gained: number;
  /** Stars earned in all, after it. */
  readonly total: number;
  /** The Stage's Record after a Stage's Run; null after a Challenge's, which leaves it alone. */
  readonly record: StageRecord | null;
  /** The Challenge's Record after a Challenge's Run (null if it is still unwon); null after a Stage's. */
  readonly challengeRecord: ChallengeRecord | null;
  /** For a Challenge: `stars` is its first win, `hardest` never, `fastest` its fastest win. */
  readonly newBest: { readonly stars: boolean; readonly hardest: boolean; readonly fastest: boolean };
  /** What the win opened, in a few words each, such as "Frost towers"; a Challenge opens nothing. */
  readonly opened: readonly string[];
  /** False if the Campaign couldn't be written. */
  readonly saved: boolean;
}

/** The Run's outcome against the Campaign before and after it. `challenge` names the Challenge played, if any. */
export function describeOutcome(
  before: CampaignProgress, after: CampaignProgress, stage: number, result: StageResult, saved: boolean, challenge: string | null = null,
): StageOutcome {
  const won = result.won;
  if (challenge !== null) {
    const old = challengeRecord(before, stage);
    const now = challengeRecord(after, stage);
    return {
      stage,
      challenge,
      won,
      stars: result.stars,
      gained: original.challengeStarsGained(old, result, challengeOfStage(stage)?.stars ?? 0),
      total: starsEarned(after),
      record: null,
      challengeRecord: now,
      newBest: {
        stars: won && old === null,
        hardest: false,
        fastest: won && now !== null && now.fastest !== null && now.fastest !== (old?.fastest ?? null),
      },
      opened: [],
      saved,
    };
  }
  const old = stageRecord(before, stage);
  const now = stageRecord(after, stage);
  return {
    stage,
    challenge: null,
    won,
    stars: result.stars,
    gained: won ? original.starsGained(old?.stars ?? 0, result.stars) : 0,
    total: starsEarned(after),
    record: now,
    challengeRecord: null,
    newBest: {
      stars: won && result.stars > (old?.stars ?? 0),
      hardest: won && now?.hardest !== old?.hardest,
      fastest: won && now?.fastest !== null && now?.fastest !== old?.fastest,
    },
    opened: opened(before, after),
    saved,
  };
}

/** What the unlocks gained between two Campaigns, in order: towers, Tiers, Talents, the next Stage, then Challenges. */
export function opened(before: CampaignProgress, after: CampaignProgress): string[] {
  const a = campaignUnlocks(before);
  const b = campaignUnlocks(after);
  const out: string[] = [];
  for (const f of b.families) if (!a.families.includes(f)) out.push(`${FAMILY_NAME[f as Family]} towers`);
  if (b.maxTier > a.maxTier) out.push(`Tier ${b.maxTier}`);
  if (b.specialisations && !a.specialisations) out.push('Specialisations');
  if (b.talents && !a.talents) out.push('Talents');
  const was = stagesCleared(before);
  const now = stagesCleared(after);
  if (now > was && now < CAMPAIGN_LENGTH) {
    const next = stageByNumber(now + 1);
    out.push(next ? `Stage ${now + 1}, ${next.name}` : `Stage ${now + 1}, in a later version`);
  }
  for (let stage = 1; stage <= CAMPAIGN_LENGTH; stage++) {
    const challenge = challengeOfStage(stage);
    if (challenge && challengeOpen(after, stage) && !challengeOpen(before, stage)) out.push(`Challenge: ${challenge.name}`);
  }
  return out;
}

/** The latest finished Run's outcome, for the end card; null before the first. */
export const outcome = signal<StageOutcome | null>(null);

/**
 * Folds a finished Run into the Campaign, a Stage's or a Challenge's: the end
 * card shows the outcome at once, then again once it is stored. Quit waits for this.
 */
export async function recordRun(state: GameState): Promise<void> {
  const r = original.originalResult(state);
  const apply = (c: CampaignProgress): CampaignProgress => withRun(c, r);
  const before = campaign.value;
  const after = apply(before);
  campaign.value = after;
  outcome.value = describeOutcome(before, after, r.stage, r, true, r.challenge);
  const update = await updateCampaign(apply);
  campaign.value = update.after;
  outcome.value = describeOutcome(update.before, update.after, r.stage, r, update.saved, r.challenge);
}

/** Holds these Talents from now on; the next Run starts with them. */
export function setTalents(talents: readonly string[]): void {
  const next = [...talents];
  campaign.value = { ...campaign.value, talents: next };
  void updateCampaign((c) => ({ ...c, talents: next })).then((u) => {
    if (u.saved) campaign.value = u.after;
  });
}

/** The Talents a new Run takes: those held, if they still read right (a damaged store drops them). */
export function runTalents(c: CampaignProgress): string[] {
  return original.talentsProblem(c.talents) === null ? [...c.talents] : [...EMPTY_CAMPAIGN.talents];
}
