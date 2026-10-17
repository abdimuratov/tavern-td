import { signal } from '@preact/signals';
import { CAMPAIGN_LENGTH, stageByNumber, type Family } from '../../../content/original';
import { EMPTY_CAMPAIGN, loadCampaign, updateCampaign, type CampaignProgress } from '../../../platform/storage';
import { original, type GameState } from '../../../sim';
import { FAMILY_NAME } from './text';

// The Campaign as the Stage-select screen and the end card see it: Stage
// Records, Stars, Stages finished and the Talents held. It lives in storage
// apart from Run saves (docs/original-design.md §13); this module keeps the
// copy the screens read and folds each finished Run into it.

type StageRecord = original.StageRecord;
type StageResult = original.StageResult;

/** The Campaign as last read or written. */
export const campaign = signal<CampaignProgress>({ stages: {}, talents: [] });

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

/** Stars earned in all: each Stage's best. */
export function starsEarned(c: CampaignProgress): number {
  let total = 0;
  for (const r of Object.values(c.stages)) total += r.stars;
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

/** What a finished Run did to the Campaign, for the end card. */
export interface StageOutcome {
  readonly stage: number;
  readonly won: boolean;
  /** Stars this Run won, 0–3. */
  readonly stars: number;
  /** Stars it added to the Campaign: only what beats the Stage's old best. */
  readonly gained: number;
  /** Stars earned in all, after it. */
  readonly total: number;
  readonly record: StageRecord | null;
  readonly newBest: { readonly stars: boolean; readonly hardest: boolean; readonly fastest: boolean };
  /** What the win opened, in a few words each, such as "Frost towers". */
  readonly opened: readonly string[];
  /** False if the Campaign couldn't be written. */
  readonly saved: boolean;
}

/** The Run's outcome against the Campaign before and after it. */
export function describeOutcome(before: CampaignProgress, after: CampaignProgress, stage: number, result: StageResult, saved: boolean): StageOutcome {
  const old = stageRecord(before, stage);
  const now = stageRecord(after, stage);
  const won = result.won;
  return {
    stage,
    won,
    stars: result.stars,
    gained: won ? original.starsGained(old?.stars ?? 0, result.stars) : 0,
    total: starsEarned(after),
    record: now,
    newBest: {
      stars: won && result.stars > (old?.stars ?? 0),
      hardest: won && now?.hardest !== old?.hardest,
      fastest: won && now?.fastest !== null && now?.fastest !== old?.fastest,
    },
    opened: opened(before, after),
    saved,
  };
}

/** What the unlocks gained between two Campaigns, in order: towers, Tiers, Talents, then the next Stage. */
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
  return out;
}

/** The latest finished Run's outcome, for the end card; null before the first. */
export const outcome = signal<StageOutcome | null>(null);

/** Folds a finished Run into the Campaign: the end card shows the outcome at once, then again once it is stored. */
export async function recordRun(state: GameState): Promise<void> {
  const r = original.originalResult(state);
  const apply = (c: CampaignProgress): CampaignProgress => withResult(c, r.stage, r);
  const before = campaign.value;
  const after = apply(before);
  campaign.value = after;
  outcome.value = describeOutcome(before, after, r.stage, r, true);
  const update = await updateCampaign(apply);
  campaign.value = update.after;
  outcome.value = describeOutcome(update.before, update.after, r.stage, r, update.saved);
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
