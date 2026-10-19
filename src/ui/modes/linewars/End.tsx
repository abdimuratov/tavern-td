import { linewars, TICK_RATE } from '../../../sim';
import { clock, num } from '../../format';
import type { ModeEndProps } from '../../mode-ui';
import { sidesFrom } from './text';

function Best({ on }: { on: boolean | undefined }) {
  return on ? <span class="best">New best</span> : null;
}

/**
 * The end card's results from the Viewer Side: both Sides' lives, the lives
 * you stole, your score and the time, with "New best" on each Record beaten.
 */
export function LwEnd({ s, end }: ModeEndProps) {
  const state = s.view.state;
  const r = linewars.lwRecord(state, s.view.side);
  const [me, rival] = sidesFrom(linewars.lwStatus(state), s.view.side);
  const imp = end.update?.improved;
  const seconds = r.seconds ?? state.tick / TICK_RATE;
  return (
    <dl class="results" data-testid="lw-end">
      <div>
        <dt>Lives left</dt>
        <dd data-testid="end-lives">You {me.lives} · Rival {rival.lives}</dd>
      </div>
      <div>
        <dt>Lives stolen</dt>
        <dd data-testid="end-stolen">{r.wave}<Best on={imp?.bestWave} /></dd>
      </div>
      <div>
        <dt>Score</dt>
        <dd data-testid="end-score">{num(r.score)}<Best on={imp?.bestScore} /></dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd data-testid="end-time">{clock(seconds)}<Best on={r.won && imp?.fastestWin} /></dd>
      </div>
    </dl>
  );
}
