import { ELEMENTS, elementName, type Draw } from '../../../content/element';
import { element } from '../../../sim';
import { num } from '../../format';
import { press, RowButton, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock, type PlaySession } from '../../state';
import { Dot, EssenceIcon, LumberIcon, Pips } from './parts';
import { elementsOpen } from './picks';
import { countdown } from './text';

function DrawChip({ pick, after }: { pick: Draw; after: number }) {
  return (
    <span class="draw" title={`${pick === 'pure' ? 'A Pure Essence' : elementName(pick)} ${after === 0 ? 'now' : `after Wave ${after}`}`}>
      {pick === 'pure' ? <EssenceIcon /> : <Dot e={pick} />}
      <span class="after">{after === 0 ? 'now' : after}</span>
    </span>
  );
}

/** Interest: its rate, what the next payout brings and when, or why none is coming. */
function interestText(st: element.ElementStatus): { text: string; paused: boolean } {
  const it = st.interest;
  const rate = `${Math.round(it.rate * 100)}%`;
  if (it.stopped) return { text: 'Interest is over for this Run', paused: false };
  if (it.paused) return { text: `Interest ${rate} · paused by a Leak`, paused: true };
  if (it.secondsLeft === null) return { text: `Interest ${rate} starts with Wave 1`, paused: false };
  return { text: `Interest ${rate} · +${num(Math.floor(st.gold * it.rate))} in ${countdown(it.secondsLeft)}`, paused: false };
}

/**
 * Under the speed controls: interest, and the six Element levels on one
 * button that opens the Elements panel, with Lumber and Pure Essence beside
 * them (or, in All Random, the next draws).
 */
export function ElementStatus({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const st = element.elementStatus(s.view.state);
  const open = (): void => {
    elementsOpen.value = !elementsOpen.value;
  };
  useHotkey(s, 'q', 'Elements', open, !elementsOpen.value && st.step !== 'over');
  if (st.step === 'over') return null;
  const interest = interestText(st);
  const random = st.picks === 'allRandom';
  const ready = !random && st.lumber > 0;
  return (
    <section class="mode-status el-status" data-testid="element-status">
      <div class={`el-interest${interest.paused ? ' paused' : ''}`} data-testid="interest">{interest.text}</div>
      <button
        type="button"
        class={`btn el-elements${ready ? ' ready' : ''}`}
        title={random ? 'Elements and the draws to come (Q)' : 'Elements: spend Lumber to raise them (Q)'}
        data-testid="elements-button"
        onClick={press(s, open)}
      >
        <span class="chips">
          {ELEMENTS.map((e) => (
            <span key={e} class={`chip${st.levels[e] > 0 ? ' on' : ''}`}>
              <Dot e={e} />
              <Pips level={st.levels[e]} />
            </span>
          ))}
        </span>
        <span class="res">
          {random
            ? st.upcomingDraws.slice(0, 1).map((d, i) => <DrawChip key={i} pick={d.pick} after={d.after} />)
            : <span class="count" data-testid="lumber"><LumberIcon />{st.lumber}</span>}
          <span class="count" data-testid="essence"><EssenceIcon />{st.essence}</span>
        </span>
        <span class="key">Q</span>
      </button>
      {elementsOpen.value && <ElementsPanel s={s} />}
    </section>
  );
}

function SummonButton({ s, o }: { s: PlaySession; o: element.SummonOption }) {
  const key = o.element.charAt(0);
  // Without a Lumber it stays pressable, so the press says why.
  const noLumber = o.blocked === 'needs a Lumber';
  const run = (): void => {
    s.view.send({ type: 'element.summon', element: o.element });
    if (o.blocked === null) elementsOpen.value = false;
  };
  useHotkey(s, key, `Summon ${elementName(o.element)}`, run, o.blocked === null || noLumber);
  const what = o.next === null
    ? 'At its top level'
    : o.blocked && !noLumber ? o.blocked : o.instant ? `Level ${o.next} at once` : `Elemental · ${num(o.elementalHp ?? 0)} HP`;
  return (
    <button
      type="button"
      class={`btn el-summon-btn${noLumber ? ' dim' : ''}`}
      disabled={o.blocked !== null && !noLumber}
      title={`${elementName(o.element)}: ${what}`}
      data-action={`summon-${o.element}`}
      onClick={press(s, run)}
    >
      <span class="line">
        <Dot e={o.element} />
        <span class="label">{elementName(o.element)}</span>
        <Pips level={o.level} />
      </span>
      <span class={`sub${o.blocked && !noLumber ? ' why' : ''}`}>{what}</span>
      <span class="key">{key.toUpperCase()}</span>
    </button>
  );
}

/** Spend Lumber: summon an Element's Elemental (or its level at once), or buy a Pure Essence. All Random shows its draws instead. */
function ElementsPanel({ s }: { s: PlaySession }) {
  void revision.value;
  const state = s.view.state;
  const st = element.elementStatus(state);
  const so = element.summonOptions(state);
  const random = st.picks === 'allRandom';
  const close = (): void => {
    elementsOpen.value = false;
  };
  useHotkey(s, 'escape', 'Close', close);
  useHotkey(s, 'q', 'Close', close);
  let lead: string;
  if (random) lead = 'All Random spends each Lumber for you as it arrives, in this order.';
  else if (st.length === 'express') lead = 'Each Lumber raises an Element one level at once.';
  else lead = `Each Lumber sends an Elemental down the Lane. Kill it to raise its Element a level.${st.freeElements > 0 ? ' Your first Element comes at once.' : ''}`;
  const essence = so.essence;
  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="modal el-panel-modal" role="dialog" aria-label="Elements" data-testid="elements-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Elements</h2>
          <span class="el-res">
            {!random && <span class="count"><LumberIcon />{st.lumber} Lumber</span>}
            <span class="count"><EssenceIcon />{st.essence} Pure Essence</span>
          </span>
          <button type="button" class="btn icon close" aria-label="Close" onClick={press(s, close)}>×</button>
        </header>
        <p class="muted">{lead}</p>
        {!random && (
          <div class="el-summon-grid">
            {so.elements.map((o) => <SummonButton key={o.element} s={s} o={o} />)}
          </div>
        )}
        {random && (
          <ol class="el-draws" data-testid="draws">
            {st.upcomingDraws.length === 0 && <li class="muted">No draws left.</li>}
            {st.upcomingDraws.map((d, i) => (
              <li key={i}>
                <span class="when">{d.after === 0 ? 'Now' : `After Wave ${d.after}`}</span>
                {d.pick === 'pure' ? <><EssenceIcon /> Pure Essence</> : <><Dot e={d.pick} /> {elementName(d.pick)}</>}
              </li>
            ))}
          </ol>
        )}
        {!random && (
          <RowButton
            s={s}
            id="buy-essence"
            label="Buy Pure Essence"
            detail={<><LumberIcon />1</>}
            sub={essence.blocked === 'needs a Lumber' ? `${essence.bought} of ${essence.max} bought` : essence.blocked ?? `${essence.bought} of ${essence.max} bought`}
            blocked={essence.blocked === null || essence.blocked === 'needs a Lumber' ? null : essence.blocked}
            dim={essence.blocked === 'needs a Lumber'}
            hotkey="b"
            run={() => s.view.send({ type: 'element.buyEssence' })}
          />
        )}
        <p class="el-cycle">
          {ELEMENTS.map((e) => <span key={e}><Dot e={e} /><span class="arrow">›</span></span>)}
          <Dot e="water" />
          <span class="muted"> Each deals double to the next, half to the one before.</span>
        </p>
      </div>
    </div>
  );
}
