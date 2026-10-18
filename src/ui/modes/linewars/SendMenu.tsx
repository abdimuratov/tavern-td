import { useRef } from 'preact/hooks';
import { LW_SENDS, type SendId } from '../../../content/linewars';
import { linewars, TICK_RATE } from '../../../sim';
import { num } from '../../format';
import { keyLabel, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock, type PlaySession } from '../../state';
import { countdown } from '../maul/text';
import { CreepIcon } from './CreepIcon';
import { lastSend } from './picks';
import { sendAbout, sendTags, sendWhy } from './text';

/** A press held this long says what the Send is, or why it's dim, instead of buying it. */
const LONG_PRESS_MS = 450;

/**
 * Buys a Send for the Rival's Field, or says why it can't be bought. It asks
 * the Run as it is now, not as the menu last drew it, so a key pressed the
 * tick a Send unlocks or refills already buys it.
 */
export function trySend(s: PlaySession, send: SendId): void {
  const state = s.view.state;
  const o = linewars.sendOptions(state, 0).find((x) => x.send === send);
  if (!o) return;
  if (o.blocked !== null) {
    const me = linewars.lwStatus(state).sides[0];
    s.view.say(`${o.name}: ${sendWhy(o, me.gold, me.live, me.cap) ?? o.blocked}`, 'error', 2200);
    return;
  }
  s.view.send({ type: 'lw.send', side: 0, send });
  lastSend.value = { seed: state.seed, send };
}

function SendButton({ s, o, why }: { s: PlaySession; o: linewars.SendOption; why: string | null }) {
  const key = o.key.toLowerCase();
  const run = (): void => trySend(s, o.send);
  useHotkey(s, key, `Send ${o.name}`, run);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const locked = o.unlockIn > 0;
  const tags = sendTags(o.send);
  const details = `${o.name} · ${o.price} gold · +${o.income} Income · ${sendAbout(o.send, o.hp)}`;
  const stop = (): void => clearTimeout(timer.current);
  const filling = !locked && o.stock < o.cap && o.restockTicks > 0 && o.restockIn > 0;
  const restock = filling ? Math.min(1, Math.max(0, 1 - o.restockIn / o.restockTicks)) : o.stock >= o.cap ? 1 : 0;
  const cls = ['btn', 'lw-send', o.blocked !== null && 'dim', locked && 'locked', tags.includes('Air') && 'air', tags.includes('Boss') && 'boss']
    .filter(Boolean).join(' ');
  return (
    <button
      type="button"
      class={cls}
      aria-disabled={o.blocked !== null}
      aria-label={`Send ${o.name}, ${o.price} gold${why ? `: ${why}` : ''}`}
      title={`${details}${why ? ` · ${why}` : ` · ${o.stock}/${o.cap} in Stock`} (${keyLabel(key)})`}
      data-action={`send-${o.send}`}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        held.current = false;
        stop();
        timer.current = setTimeout(() => {
          held.current = true;
          s.view.say(why ? `${o.name}: ${why}` : details, why ? 'error' : 'info', 3200);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        (e.currentTarget as HTMLElement).blur();
        stop();
        if (held.current) {
          held.current = false;
          return;
        }
        s.tap();
        run();
      }}
    >
      {!locked && <span class="stock" data-testid={`stock-${o.send}`} title="In Stock">{o.stock}</span>}
      <CreepIcon creep={o.creep} count={o.count} />
      <span class="price">{locked ? countdown(o.unlockIn / TICK_RATE) : num(o.price)}</span>
      <span class="inc">+{num(o.income)}</span>
      <span class="restock" aria-hidden="true"><span style={{ width: `${(restock * 100).toFixed(0)}%` }} /></span>
      <span class="key">{keyLabel(key)}</span>
    </button>
  );
}

/**
 * At the bottom of the HUD, where it stays when a tower is selected: the ten
 * Sends in a 5 × 2 grid, cheapest first, and how many of yours are out.
 * Space repeats your last Send.
 */
export function SendMenu({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const state = s.view.state;
  const st = linewars.lwStatus(state);
  const me = st.sides[0];
  const options = linewars.sendOptions(state, 0);
  const last = lastSend.value?.seed === state.seed ? lastSend.value.send : null;
  const again = (): void => {
    const repeat = lastSend.value?.seed === s.view.state.seed ? lastSend.value.send : null;
    if (repeat) trySend(s, repeat);
    else s.view.say('Space sends your last Send again', 'info', 1800);
  };
  // Space starts a Wave in other modes; Line Wars has none, so it repeats your last Send.
  useHotkey(s, 'space', 'Repeat your last Send', again, !st.over);
  if (st.over) return null;
  return (
    <section class="lw-sends" data-testid="send-menu">
      <div class="lw-send-grid" role="group" aria-label="Send">
        {options.map((o) => <SendButton key={o.send} s={s} o={o} why={sendWhy(o, me.gold, me.live, me.cap)} />)}
      </div>
      <div class="lw-live">
        <span data-testid="live" title="Your creeps out in the Rival's Field, of the most you can have at once">Live {me.live}/{me.cap}</span>
        {last && <span class="muted lw-again">Space: {LW_SENDS[last].name}</span>}
      </div>
    </section>
  );
}
