import { BASE_SLATES, GEM_TYPES, QUALITIES, typeName } from '../../../content/gem';
import { gem } from '../../../sim';
import { press, RowButton, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, type PlaySession } from '../../state';
import { extraChanceOpen } from './picks';
import { specName } from './text';

const QUALITY_NAME = QUALITIES.map((q) => q.charAt(0).toUpperCase() + q.slice(1));

/** The chance of each quality per Draft gem, Chipped on the left: what the next Gem Quality buys. */
function OddsBar({ odds }: { odds: readonly number[] }) {
  const shown = odds.map((p, i) => ({ p, i })).filter((x) => x.p > 0);
  const first = shown[0];
  const last = shown.at(-1);
  return (
    <div class="odds" data-testid="gem-odds">
      <div class="bar" role="img" aria-label={shown.map((x) => `${QUALITY_NAME[x.i]} ${Math.round(x.p * 100)}%`).join(', ')}>
        {shown.map((x) => (
          <span key={x.i} class={`q q${x.i}`} style={{ flexGrow: x.p }} title={`${QUALITY_NAME[x.i]} ${Math.round(x.p * 100)}%`}>
            {x.p >= 0.15 ? `${Math.round(x.p * 100)}%` : ''}
          </span>
        ))}
      </div>
      <div class="legend">
        <span>{first ? QUALITY_NAME[first.i] : ''}</span>
        <span>{last && last !== first ? QUALITY_NAME[last.i] : ''}</span>
      </div>
    </div>
  );
}

function targetName(target: string): string {
  return (GEM_TYPES as readonly string[]).includes(target) ? `Perfect ${typeName(target as (typeof GEM_TYPES)[number])}` : specName(target);
}

/** Pick this round's Extra Chance target: a gem type's Perfect or a base slate. */
function ExtraChancePicker({ s }: { s: PlaySession }) {
  void revision.value;
  const state = s.view.state;
  const st = gem.gemStatus(state).extraChance;
  const close = (): void => {
    extraChanceOpen.value = false;
  };
  useHotkey(s, 'escape', 'Close', close);
  const pick = (target: string): void => {
    s.view.send({ type: 'gem.extraChance', target });
    close();
  };
  const option = (target: string, label: string) => {
    const q = gem.extraChanceQuote(state, target);
    const active = st.target === target;
    return (
      <button
        key={target}
        type="button"
        class={`btn ec-option${active ? ' active' : ''}${q.blocked === 'not enough gold' ? ' dim' : ''}`}
        disabled={q.blocked !== null && q.blocked !== 'not enough gold'}
        title={q.blocked ?? `${label}: ${q.cost} gold, bonus ${q.bonus}`}
        onClick={press(s, () => pick(target))}
      >
        <span class="label">{label}</span>
        <span class="detail"><span class="coin" />{q.cost}</span>
      </button>
    );
  };
  return (
    <div class="modal-backdrop interactive" onClick={close}>
      <div class="modal ec" role="dialog" aria-label="Extra Chance" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Extra Chance</h2>
          <button type="button" class="btn icon close" aria-label="Close" onClick={press(s, close)}>×</button>
        </header>
        <p class="muted">
          {st.canChange
            ? "Bias this round's Draft toward one target. The fee comes back if you switch before placing."
            : "The target is fixed once this round's first gem is down."}
          {st.bonus > 0 && ` Bonus ${st.bonus}.`}
        </p>
        <div class="ec-grid">
          {GEM_TYPES.map((t) => option(t, `Perfect ${typeName(t)}`))}
          {BASE_SLATES.map((sl) => option(sl.id, specName(sl.id)))}
        </div>
        {st.target !== '' && st.canChange && (
          <button type="button" class="btn ec-clear" onClick={press(s, () => pick(''))}>
            Clear {targetName(st.target)} (refund {st.paid})
          </button>
        )}
      </div>
    </div>
  );
}

/** Gem Quality with its odds, and Extra Chance once Gem Quality is at its highest. */
export function GemActions({ s }: ModeHudProps) {
  void revision.value;
  const state = s.view.state;
  const st = gem.gemStatus(state);
  const max = st.nextQualityCost === null;
  const ec = st.extraChance;
  return (
    <div class="gem-actions">
      <RowButton
        s={s}
        id="quality"
        label={`Gem Quality ${st.quality}`}
        detail={max ? 'Max' : <>→ {st.quality + 1} · <span class="coin" />{st.nextQualityCost}</>}
        hotkey="q"
        blocked={max ? '' : null}
        dim={st.qualityBlocked === 'not enough gold'}
        title={max ? 'Gem Quality is at its highest' : `Raise Gem Quality to ${st.quality + 1} for ${st.nextQualityCost} gold (Q)`}
        run={() => s.view.send({ type: 'gem.buyQuality' })}
      />
      <OddsBar odds={st.odds} />
      {ec.unlocked && (
        <RowButton
          s={s}
          id="extra-chance"
          label="Extra Chance"
          detail={ec.target !== '' ? targetName(ec.target) : 'Pick a target'}
          hotkey="e"
          active={ec.target !== ''}
          run={() => {
            extraChanceOpen.value = true;
          }}
        />
      )}
      {extraChanceOpen.value && <ExtraChancePicker s={s} />}
    </div>
  );
}
