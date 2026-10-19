import { useState } from 'preact/hooks';
import { CAMPAIGN_LENGTH, CHALLENGE_DIFFICULTY, challengeOfStage, STAGES, stageByNumber, type Family, type StageSpec } from '../../../content/original';
import type { CampaignProgress } from '../../../platform/storage';
import { DIFFICULTIES, original, type Difficulty } from '../../../sim';
import { DIFFICULTY_NAME, difficultyAbout } from '../../catalog';
import { clock } from '../../format';
import { Sheet } from '../../menu/Sheet';
import type { MenuPageProps } from '../../mode-ui';
import { ReferenceSheet } from '../../reference/Reference';
import { appActions, savedRuns } from '../../state';
import {
  campaign, campaignUnlocks, challengeRecord, challengeState, MOST_STARS, setTalents, stageOpen, stageRecord, stagesCleared, starsEarned,
  starsFree,
} from './campaign';
import { FamilyIcon, StarCount, Stars } from './parts';
import { ORIGINAL_REFERENCE } from './reference';
import { FAMILY_NAME, PIN_AT, REGION_INTRO, REGION_NAME, REGIONS } from './text';

/** The Stage to show first: the earliest open one not yet won, or the last one open. */
function firstStage(): number {
  const c = campaign.value;
  const open = STAGES.filter((s) => stageOpen(c, s.number));
  return (open.find((s) => stageRecord(c, s.number) === null) ?? open[open.length - 1] ?? STAGES[0])?.number ?? 1;
}

function pinAt(n: number): { left: string; top: string } {
  const [x, y] = PIN_AT[n] ?? [50, 50];
  return { left: `${x}%`, top: `${y}%` };
}

/** The war map spread on the tavern table: the old road north through the three Regions, with a pin per Stage. */
function WarMap({ picked, pick }: { picked: number; pick(n: number): void }) {
  const c = campaign.value;
  const road = Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => PIN_AT[i + 1] ?? [50, 50]).map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <div class="war-map" data-testid="war-map">
      {[...REGIONS].reverse().map((r) => (
        <div key={r} class={`region-band ${r}`}>
          <span class="region-name">{REGION_NAME[r]}</span>
        </div>
      ))}
      <svg class="road" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={road} />
      </svg>
      {Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => i + 1).filter((n) => !stageByNumber(n)).map((n) => (
        <span key={n} class="pin-later" style={pinAt(n)} title={`Stage ${n} comes in a later version`} />
      ))}
      {STAGES.map((st) => {
        const open = stageOpen(c, st.number);
        const record = stageRecord(c, st.number);
        // A won Stage's Challenge: dark while open, gold once won; no mark before the Stage is won.
        const state = challengeState(c, st.number);
        const challenge = state === 'open' || state === 'won' ? state : null;
        const cls = ['pin', st.region, open ? '' : 'locked', record ? 'won' : '', picked === st.number ? 'picked' : ''].filter(Boolean).join(' ');
        const about = challenge === 'won' ? ' · Challenge won' : challenge === 'open' ? ' · Challenge open' : '';
        return (
          <button
            key={st.number}
            type="button"
            class={cls}
            style={pinAt(st.number)}
            aria-pressed={picked === st.number}
            title={`${st.number} · ${st.name}${open ? '' : ' (locked)'}${about}`}
            data-testid={`stage-${st.number}`}
            onClick={() => pick(st.number)}
          >
            <span class="num"><b>{st.number}</b></span>
            {challenge && <span class={`or-challenge-mark ${challenge}`} aria-hidden="true" data-testid={`challenge-mark-${st.number}`} />}
            {record && <Stars n={record.stars} />}
          </button>
        );
      })}
    </div>
  );
}

/** What the Campaign has opened, in a line: the families, the highest Tier, Specialisations. */
function Arsenal() {
  const u = campaignUnlocks(campaign.value);
  return (
    <div class="or-arsenal" data-testid="arsenal" title="What your towers can be in a Run">
      {u.families.map((f: Family) => <FamilyIcon key={f} family={f} />)}
      <span class="muted">{u.families.map((f) => FAMILY_NAME[f]).join(', ')} · Tiers 1–{u.maxTier}{u.specialisations ? ' · Specialisations' : ''}</span>
    </div>
  );
}

/** The Stage panel's line under a Challenge: what it pays and on what, its fastest win once won, or how to open it. */
export function challengeStatus(c: CampaignProgress, stage: number): string {
  const spec = challengeOfStage(stage);
  const state = challengeState(c, stage);
  if (!spec || state === null) return '';
  if (state === 'locked') return 'Win this Stage to open it';
  if (state === 'open') return `${spec.stars} Star${spec.stars === 1 ? '' : 's'} · ${DIFFICULTY_NAME[CHALLENGE_DIFFICULTY]}`;
  const fastest = challengeRecord(c, stage)?.fastest ?? null;
  return fastest === null ? 'Won' : `Won · fastest ${clock(fastest)}`;
}

/**
 * The Stage's Challenge under its Difficulty buttons: its name and rule, its
 * Star or fastest win, and Play Challenge; dimmed, without the button, until
 * the Stage is won.
 */
function ChallengeBlock({ stage, play }: { stage: number; play(): void }) {
  const c = campaign.value;
  const spec = challengeOfStage(stage);
  const state = challengeState(c, stage);
  if (!spec || state === null) return null;
  const open = state !== 'locked';
  const status = challengeStatus(c, stage);
  return (
    <section class={`or-challenge ${state}`} data-testid="challenge">
      <h3><span class={`or-challenge-mark ${state}`} aria-hidden="true" /><span data-testid="challenge-name">Challenge: {spec.name}</span></h3>
      <p class="rule" data-testid="challenge-rule">{spec.rule}</p>
      <div class="foot">
        <span class="status" data-testid="challenge-status">{status}</span>
        {open && (
          <button
            type="button"
            class={`btn${state === 'won' ? '' : ' primary'}`}
            title={`${spec.name} on ${DIFFICULTY_NAME[CHALLENGE_DIFFICULTY]}, with your Talents`}
            data-testid="challenge-start"
            onClick={play}
          >
            Play Challenge
          </button>
        )}
      </div>
    </section>
  );
}

function StageCard({ stage, start, talents }: { stage: StageSpec; start(d: Difficulty, challenge?: boolean): void; talents(): void }) {
  const c = campaign.value;
  const open = stageOpen(c, stage.number);
  const record = stageRecord(c, stage.number);
  const [intro1, intro2] = REGION_INTRO[stage.region];
  const free = starsFree(c);
  // `won` lets a short screen give the Region intro's room to the Challenge block (style.css).
  return (
    <aside class={`stage-card ${stage.region}${record ? ' won' : ''}`} data-testid="stage-card">
      <div class="region-intro" data-testid="region-intro">
        <h3>{REGION_NAME[stage.region]}</h3>
        <p>{intro1}<br />{intro2}</p>
      </div>
      <h2 data-testid="stage-name">{stage.number} · {stage.name}</h2>
      <p class="stage-line">{stage.line}</p>
      <div class="stage-record" data-testid="stage-record">
        <Stars n={record?.stars ?? 0} />
        <span class="muted">
          {record
            ? `Hardest won: ${record.hardest ? DIFFICULTY_NAME[record.hardest] : '–'} · Fastest: ${record.fastest ? clock(record.fastest) : '–'}`
            : `${stage.waves.length} Waves · up to ${original.starsFor(Number.POSITIVE_INFINITY)} Stars`}
        </span>
      </div>
      {open ? (
        <div class="difficulties compact" data-testid="stage-difficulties">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" class={`btn difficulty${d === 'normal' ? ' primary' : ''}`} title={difficultyAbout('original', d)} data-testid={`difficulty-${d}`} onClick={() => start(d)}>
              <span class="name">{DIFFICULTY_NAME[d]}</span>
              <span class="about">{difficultyAbout('original', d)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p class="locked-note" data-testid="stage-locked">Finish Stage {stage.number - 1} to march on.</p>
      )}
      <ChallengeBlock stage={stage.number} play={() => start(CHALLENGE_DIFFICULTY, true)} />
      <Arsenal />
      <div class="campaign-foot">
        <span><StarCount n={starsEarned(c)} testid="campaign-stars" /> <span class="muted">of {MOST_STARS}</span></span>
        <button type="button" class={`btn${free > 0 && campaignUnlocks(c).talents ? ' primary' : ''}`} data-testid="talents" onClick={talents}>
          Talents{free > 0 ? ` · ${free} free` : ''}
        </button>
      </div>
    </aside>
  );
}

/** One family's Talent tree: four rows bought in order, one Talent per row. */
function Tree({ family }: { family: Family }) {
  const c = campaign.value;
  const unlocks = campaignUnlocks(c);
  const earned = starsEarned(c);
  return (
    <section class="talent-tree" data-testid={`tree-${family}`}>
      <h3><FamilyIcon family={family} /> {FAMILY_NAME[family]}</h3>
      {original.treeRows(family).map((row, i) => (
        <div key={i} class="talent-row">
          <span class="cost" title={`Row ${i + 1}`}>{original.talentCost(i + 1)}★</span>
          <div class={`options n${row.length}`}>
            {row.map((t) => {
              const held = c.talents.includes(t.id);
              const why = held ? null : original.talentError(c.talents, t.id, earned, unlocks);
              return (
                <button
                  key={t.id}
                  type="button"
                  class={`btn talent${held ? ' active' : ''}`}
                  disabled={!held && why !== null}
                  aria-pressed={held}
                  title={why ? `${t.text} (${why})` : t.text}
                  data-testid={`talent-${t.id}`}
                  onClick={() => {
                    if (!held && why === null) setTalents(original.buyTalent(c.talents, t.id, earned, unlocks));
                  }}
                >
                  <span class="name">{t.name}</span>
                  <span class="text">{t.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/** The Talent screen: a tree for each family the Campaign has opened. Buying fills rows in order; a reset is free. */
function TalentsPage({ back }: { back(): void }) {
  const c = campaign.value;
  const unlocks = campaignUnlocks(c);
  const earned = starsEarned(c);
  return (
    <Sheet title="Talents" onBack={back} wide>
      <div class="talent-head">
        <span><StarCount n={starsFree(c)} testid="stars-free" /> <span class="muted">free of {earned} earned</span></span>
        <button type="button" class="btn" disabled={c.talents.length === 0} data-testid="talents-reset" onClick={() => setTalents(original.resetTalents())}>
          Reset · free
        </button>
      </div>
      {!unlocks.talents && <p class="muted" data-testid="talents-closed">Talents open once you finish Stage 1. Each tree opens with its family.</p>}
      <div class="talent-trees">
        {unlocks.families.map((f) => <Tree key={f} family={f} />)}
      </div>
      <p class="note">Rows cost 1, 2, 2 and 3 Stars and are bought in order, one Talent per row. Talents hold for a whole Run; between Runs a reset gives every Star back.</p>
    </Sheet>
  );
}

/** The Original's page in the main menu: Stage select, and from it the Talent screen and Waves & Towers on the Stage picked. */
export function StageSelect({ view, go, back, confirm }: MenuPageProps) {
  const [picked, setPicked] = useState(firstStage);
  if (view === 'talents') return <TalentsPage back={() => go('')} />;
  const stage = stageByNumber(picked) ?? STAGES[0]!;
  if (view === 'reference') {
    return (
      <ReferenceSheet
        modes={[{ id: 'original', name: 'Original', reference: ORIGINAL_REFERENCE }]}
        modeId="original"
        ctx={{ from: { stage: String(stage.number) } }}
        onBack={() => go('')}
      />
    );
  }
  // A Stage on Difficulty `d`, or its Challenge (always Normal); either asks first before replacing a saved Run.
  const start = (d: Difficulty, challenge = false): void => {
    const choices = challenge ? { stage: String(stage.number), challenge: '1' } : { stage: String(stage.number) };
    const run = (): void => appActions.value?.newRun('original', d, choices);
    const saved = savedRuns.value['original'];
    if (saved?.ok) {
      confirm({
        title: 'Start a new Run?',
        text: `Your saved Run (${[saved.options, `Wave ${saved.wave}`, DIFFICULTY_NAME[saved.difficulty]].filter(Boolean).join(', ')}) will be replaced.`,
        yes: 'Start new Run',
        run,
      });
    } else run();
  };
  return (
    <Sheet
      title="The Original · Campaign"
      onBack={back}
      wide
      actions={(
        <button type="button" class="btn" title={`Every Wave of ${stage.name}, and every tower`} data-testid="reference-button" onClick={() => go('reference')}>
          Waves &amp; Towers
        </button>
      )}
    >
      <div class="or-campaign" data-testid="campaign">
        <WarMap picked={stage.number} pick={setPicked} />
        <StageCard stage={stage} start={start} talents={() => go('talents')} />
      </div>
      <p class="note">{stagesCleared(campaign.value) >= STAGES.length && STAGES.length < CAMPAIGN_LENGTH
        ? `Stages ${STAGES.length + 1}–${CAMPAIGN_LENGTH} come in a later version.`
        : ''}</p>
    </Sheet>
  );
}
