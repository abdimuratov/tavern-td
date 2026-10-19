import { challengeById } from '../../../content/original';
import { original } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import { clock } from '../../format';
import type { ModeEndProps } from '../../mode-ui';
import { campaign, MOST_STARS, outcome, starsEarned, type StageOutcome } from './campaign';
import { Stars } from './parts';

function Best({ on }: { on: boolean | undefined }) {
  return on ? <span class="best">New best</span> : null;
}

function CampaignTotal({ total }: { total: number }) {
  return (
    <div>
      <dt>Campaign</dt>
      <dd><span data-testid="campaign-stars">{total}</span> of {MOST_STARS} Stars</dd>
    </div>
  );
}

/** What the Run's Stars did to the Campaign: added some, or nothing past what was already won. */
function gainedText(o: StageOutcome | null): string {
  if (!o) return '…';
  if (o.gained > 0) return `+${o.gained} to the Campaign`;
  return o.challenge === null ? 'No more than your best' : 'Already won: no more Stars';
}

/**
 * The end card's middle: the Stars won, what they added to the Campaign, the
 * Stage's Record and what the win opened. A Challenge's shows its one Star,
 * whether this was its first win, and its fastest win.
 */
export function OriginalEnd({ s, end }: ModeEndProps) {
  const o = outcome.value;
  const r = original.originalResult(s.view.state);
  // From Wave 1 to the win, as the Stage's and the Challenge's Records count it.
  const seconds = r.seconds;
  const total = o?.total ?? starsEarned(campaign.value);
  if (!end.won) {
    return (
      <dl class="results" data-testid="original-end">
        <div>
          <dt>Wave reached</dt>
          <dd data-testid="end-wave">{end.wave}</dd>
        </div>
        <CampaignTotal total={total} />
      </dl>
    );
  }
  const challenge = r.challenge === null ? undefined : challengeById(r.challenge);
  const stars = o?.stars ?? 0;
  return (
    <div class="or-end" data-testid="original-end">
      <Stars n={stars} of={challenge ? challenge.stars : 3} testid="end-stars" />
      <dl class="results">
        <div>
          <dt>{challenge ? 'Star' : 'Stars'}</dt>
          <dd data-testid="stars-gained">{gainedText(o)}{!challenge && <Best on={o?.newBest.stars} />}</dd>
        </div>
        <CampaignTotal total={total} />
        {o?.record?.hardest && (
          <div>
            <dt>Hardest won</dt>
            <dd>{DIFFICULTY_NAME[o.record.hardest]}<Best on={o.newBest.hardest} /></dd>
          </div>
        )}
        {seconds !== null && (
          <div>
            <dt>Time</dt>
            <dd data-testid="end-time">{clock(seconds)}<Best on={o?.newBest.fastest} /></dd>
          </div>
        )}
      </dl>
      {o && o.opened.length > 0 && <p class="or-opened" data-testid="opened">Opened: {o.opened.join(' · ')}</p>}
      {o && !o.saved && <p class="error">The Campaign could not be saved on this device.</p>}
    </div>
  );
}
