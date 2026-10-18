import { maul, TICK_RATE } from '../../../sim';
import { press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock } from '../../state';
import { countdown } from './text';

/** At the bottom of the HUD: in a Break, Send now with the countdown to the next Wave; during one, what's left of it. */
export function SendNow({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const st = maul.maulStatus(s.view.state);
  const send = (): void => s.view.send({ type: 'maul.sendNow' });
  const brk = st.break;
  useHotkey(s, 'space', 'Send now', send, brk !== null && st.sendNowBlocked === null);
  if (st.step === 'over') return null;
  if (brk) {
    return (
      <button
        type="button"
        class="btn primary start or-send"
        disabled={st.sendNowBlocked !== null}
        title={st.sendNowBlocked ?? `Send Wave ${brk.wave} now (Space). Sending early pays nothing.`}
        data-testid="send-now"
        onClick={press(s, send)}
      >
        <span class="label">{st.step === 'ready' ? 'Send Wave 1' : 'Send now'}</span>
        <span class="detail" data-testid="break">Wave {brk.wave} in {countdown(brk.ticksLeft / TICK_RATE)}</span>
        <span class="key">Space</span>
      </button>
    );
  }
  return (
    <div class="el-wave-info start" data-testid="wave-info">
      <span>Wave {st.wave}</span>
      <span class="muted">{st.creepsLeft} creep{st.creepsLeft === 1 ? '' : 's'} left</span>
    </div>
  );
}
