import { linewars } from '../../../sim';
import { num } from '../../format';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock } from '../../state';
import { raceName } from '../maul/text';
import { factorText, incomeSeconds, suddenText } from './text';

/** Beside gold: your Income and a ring that fills toward the next Income tick, "+42 in 6 s". */
export function IncomeTick({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const st = linewars.lwStatus(s.view.state);
  if (st.over) return null;
  const me = st.sides[0];
  const k = Math.min(1, Math.max(0, 1 - st.incomeIn / st.incomeTicks));
  const secs = incomeSeconds(st.incomeIn);
  const C = 2 * Math.PI * 7;
  return (
    <span class="stat lw-income" title={`Your Income: +${me.pay} gold every Income tick, every 10 s`} data-testid="income">
      <svg class="lw-ring" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="7" class="track" />
        <circle cx="9" cy="9" r="7" class="fill" stroke-dasharray={`${(C * k).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 9 9)" />
      </svg>
      <span data-testid="income-value">+{num(me.pay)}</span>
      <span class="muted" data-testid="income-in">in {secs} s</span>
    </span>
  );
}

/**
 * Under the speed controls: the lives as one tug-of-war bar, the Rival's Race
 * and Income with its Difficulty factor, and the Sudden Death clock.
 */
export function LwStatus({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const st = linewars.lwStatus(s.view.state);
  const [me, rival] = st.sides;
  const total = me.lives + rival.lives;
  const share = total > 0 ? me.lives / total : 0.5;
  return (
    <section class="mode-status lw-status" data-testid="lw-status">
      <div class="lw-tug" title="Lives: a Leak moves them from the Side it leaks out of to the Side that sent it">
        <span class="who">You <b data-testid="lives-you">{me.lives}</b></span>
        <span class="bar" aria-hidden="true"><span class="mine" style={{ width: `${(share * 100).toFixed(1)}%` }} /></span>
        <span class="who"><b data-testid="lives-rival">{rival.lives}</b> Rival</span>
      </div>
      <div class="lw-line">
        <span class="lw-rival" title="The Rival's Race, and its Income with its Difficulty factor" data-testid="rival">
          {raceName(rival.race)} · +{num(rival.income)} {factorText(rival.factor)}
        </span>
        <span class={`lw-clock${st.sudden ? ' sudden' : ''}`} data-testid="clock">{suddenText(st)}</span>
      </div>
    </section>
  );
}
