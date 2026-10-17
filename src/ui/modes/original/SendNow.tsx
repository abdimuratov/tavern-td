import { original, TICK_RATE, type GameState } from '../../../sim';
import { press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock } from '../../state';
import { countdown } from './text';

/** Creeps of every Wave on the road, still to spawn or alive. */
function creepsLeft(state: GameState): number {
  let n = 0;
  for (const w of state.wave.active) for (const g of w.groups) n += g.count - g.spawned;
  for (const c of state.creeps) if (c.hp > 0) n++;
  return n;
}

/**
 * At the bottom of the HUD. Before Wave 1, Send Wave 1. In a Break, Send now
 * with the early-call gold it pays and the countdown to the next Wave. While a
 * Wave is still arriving, how many creeps are on the road.
 */
export function SendNow({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const state = s.view.state;
  const st = original.originalStatus(state);
  const send = (): void => s.view.send({ type: 'original.sendNow' });
  const brk = st.break;
  useHotkey(s, 'space', 'Send now', send, st.sendNowBlocked === null && st.step !== 'over');
  if (st.step === 'over') return null;
  if (st.step === 'ready') {
    return (
      <button type="button" class="btn primary start or-send" title="Send Wave 1 (Space)" data-testid="send-now" onClick={press(s, send)}>
        <span class="label">Send Wave 1</span>
        <span class="key">Space</span>
      </button>
    );
  }
  if (brk) {
    return (
      <button
        type="button"
        class="btn primary start or-send"
        disabled={st.sendNowBlocked !== null}
        title={st.sendNowBlocked ?? `Send Wave ${brk.wave} now for ${st.earlyCall} gold (Space). The sooner, the more it pays.`}
        data-testid="send-now"
        onClick={press(s, send)}
      >
        <span class="label">Send now</span>
        <span class="detail"><span class="early" data-testid="early-call">+{st.earlyCall} gold</span> · <span data-testid="break">Wave {brk.wave} in {countdown(brk.ticksLeft / TICK_RATE)}</span></span>
        <span class="key">Space</span>
      </button>
    );
  }
  const left = creepsLeft(state);
  return (
    <div class="el-wave-info start" data-testid="wave-info">
      <span>Wave {st.wave} arriving</span>
      <span class="muted">{left} creep{left === 1 ? '' : 's'} on the road</span>
    </div>
  );
}
