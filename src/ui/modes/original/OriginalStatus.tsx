import { challengeById, STAR_LIVES, stageByNumber } from '../../../content/original';
import { original } from '../../../sim';
import type { ModeHudProps } from '../../mode-ui';
import { revision } from '../../state';
import { campaign, challengeLines, challengeWon } from './campaign';
import { Stars } from './parts';

const STAR_RULE = STAR_LIVES.map((r) => `${r.stars} for ${r.lives} or more`).join(', ');

/**
 * Under the speed controls: the Stage, its Threat, and the Stars a win would
 * bring with the lives left. A Challenge's Run names the Challenge instead, with
 * its Star for any win and its rule as chips.
 */
export function OriginalStatus({ s }: ModeHudProps) {
  void revision.value;
  const st = original.originalStatus(s.view.state);
  if (st.step === 'over') return null;
  const stage = stageByNumber(st.stage);
  const stageName = stage ? stage.name : `Stage ${st.stage}`;
  const challenge = st.challenge === null ? undefined : challengeById(st.challenge);
  if (challenge) {
    const paid = challengeWon(campaign.value, st.stage);
    const star = paid ? 'Already won: a win pays no more Stars' : `A win with any lives left pays ${challenge.stars} Star${challenge.stars === 1 ? '' : 's'}`;
    return (
      <section class="mode-status or-status challenge" data-testid="original-status">
        <div class="step">
          {/* The diamond is the Challenge's mark, as on the war map; the phone HUD has no room for the word. */}
          <span class="or-stage" title={`Challenge: ${challenge.name}, on ${stageName}`} data-testid="run-challenge">
            <span class={`or-challenge-mark ${paid ? 'won' : 'open'}`} aria-hidden="true" />{challenge.name}
          </span>
          <span class="or-threat" title="Threat sets the next Wave's creep HP, bounty and bonus" data-testid="threat">Threat {st.threat}</span>
        </div>
        <div class="or-rules" title={`${challenge.rule} ${star}.`} data-testid="challenge-rules">
          <Stars n={st.stars} of={challenge.stars} testid="run-stars" />
          {challengeLines(challenge).map((line) => <span key={line} class="or-rule">{line}</span>)}
        </div>
      </section>
    );
  }
  // Lives that can still leak before these Stars drop to the next row.
  const floor = STAR_LIVES.find((r) => st.lives >= r.lives)?.lives ?? 1;
  const spare = Math.max(0, st.lives - floor);
  return (
    <section class="mode-status or-status" data-testid="original-status">
      <div class="step">
        <span class="or-stage">{stageName}</span>
        <span class="or-threat" title="Threat sets the next Wave's creep HP, bounty and bonus" data-testid="threat">Threat {st.threat}</span>
      </div>
      <div class="or-run-stars" title={`Stars for a win by lives left: ${STAR_RULE}`}>
        <Stars n={st.stars} testid="run-stars" />
        <span class="muted">{spare} {spare === 1 ? 'life' : 'lives'} to spare</span>
      </div>
    </section>
  );
}
