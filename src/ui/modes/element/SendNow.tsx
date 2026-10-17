import { element, TICK_RATE, type GameState } from '../../../sim';
import { press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock } from '../../state';
import { countdown } from './text';

/** Creeps of the Wave being fought still to spawn or alive; an Elemental isn't one. */
function creepsLeft(state: GameState): number {
  let n = 0;
  for (const w of state.wave.active) for (const g of w.groups) n += g.count - g.spawned;
  for (const c of state.creeps) if (c.wave === state.wave.number && c.hp > 0) n++;
  return n;
}

/** "Wave 12", or "Boss Wave 3" past Full's 55. */
export function waveName(st: element.ElementStatus, wave: number): string {
  return wave > st.fixedWaves ? `Boss Wave ${wave - st.fixedWaves}` : `Wave ${wave}`;
}

/** At the bottom of the HUD: in a Break, Send now with the countdown to the next Wave; during one, what's left of it. */
export function SendNow({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const state = s.view.state;
  const st = element.elementStatus(state);
  const send = (): void => s.view.send({ type: 'element.sendNow' });
  const brk = st.break;
  useHotkey(s, 'space', 'Send now', send, brk !== null && st.sendNowBlocked === null);
  if (st.step === 'over') return null;
  if (brk) {
    return (
      <button
        type="button"
        class="btn primary start el-send"
        disabled={st.sendNowBlocked !== null}
        title={st.sendNowBlocked ?? `Start ${waveName(st, brk.wave)} now (Space). Sending early pays no bonus.`}
        data-testid="send-now"
        onClick={press(s, send)}
      >
        <span class="label">Send now</span>
        <span class="detail" data-testid="break">{waveName(st, brk.wave)} in {countdown(brk.ticksLeft / TICK_RATE)}</span>
        <span class="key">Space</span>
      </button>
    );
  }
  const left = creepsLeft(state);
  return (
    <div class="el-wave-info start" data-testid="wave-info">
      <span>{waveName(st, st.wave)}</span>
      <span class="muted">{left} creep{left === 1 ? '' : 's'} left</span>
    </div>
  );
}
