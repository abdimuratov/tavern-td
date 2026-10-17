import { CAMPAIGN_LENGTH } from '../../../content/original';
import { original } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import { clock } from '../../format';
import type { ModeEndProps } from '../../mode-ui';
import { campaign, outcome, starsEarned } from './campaign';
import { Stars } from './parts';

function Best({ on }: { on: boolean | undefined }) {
  return on ? <span class="best">New best</span> : null;
}

/** The end card's middle: the Stars won, what they added to the Campaign, the Stage's Record and what the win opened. */
export function OriginalEnd({ s, end }: ModeEndProps) {
  const o = outcome.value;
  // From Wave 1 to the win, as the Stage's Record counts it.
  const seconds = original.originalResult(s.view.state).seconds;
  const total = o?.total ?? starsEarned(campaign.value);
  const most = CAMPAIGN_LENGTH * 3;
  if (!end.won) {
    return (
      <dl class="results" data-testid="original-end">
        <div>
          <dt>Wave reached</dt>
          <dd data-testid="end-wave">{end.wave}</dd>
        </div>
        <div>
          <dt>Campaign</dt>
          <dd><span data-testid="campaign-stars">{total}</span> of {most} Stars</dd>
        </div>
      </dl>
    );
  }
  const stars = o?.stars ?? 0;
  return (
    <div class="or-end" data-testid="original-end">
      <Stars n={stars} testid="end-stars" />
      <dl class="results">
        <div>
          <dt>Stars</dt>
          <dd data-testid="stars-gained">{o ? (o.gained > 0 ? `+${o.gained} to the Campaign` : 'No more than your best') : '…'}<Best on={o?.newBest.stars} /></dd>
        </div>
        <div>
          <dt>Campaign</dt>
          <dd><span data-testid="campaign-stars">{total}</span> of {most} Stars</dd>
        </div>
        {o?.record?.hardest && (
          <div>
            <dt>Hardest won</dt>
            <dd>{DIFFICULTY_NAME[o.record.hardest]}<Best on={o.newBest.hardest} /></dd>
          </div>
        )}
        {seconds !== null && (
          <div>
            <dt>Time</dt>
            <dd>{clock(seconds)}<Best on={o?.newBest.fastest} /></dd>
          </div>
        )}
      </dl>
      {o && o.opened.length > 0 && <p class="or-opened" data-testid="opened">Opened: {o.opened.join(' · ')}</p>}
      {o && !o.saved && <p class="error">The Campaign could not be saved on this device.</p>}
    </div>
  );
}
