import type { ComponentChildren } from 'preact';
import { LEVEL_AURA, LEVEL_DAMAGE, LEVEL_XP, TARGETINGS, type Targeting } from '../../../content/original';
import { original, type GameState } from '../../../sim';
import { num } from '../../format';
import { keyLabel, press, RowButton, useHotkey } from '../../Hud';
import type { ModePanelProps } from '../../mode-ui';
import { revision, type PlaySession } from '../../state';
import { FamilyIcon, TierPips } from './parts';
import {
  abilityLines, DAMAGE_NAME, FAMILY_NAME, rate, TARGETING_ABOUT, TARGETING_NAME, tierName, towerSpecOf, towerSummary,
} from './text';

/** Upgrade keys in the panel's order: the next Tier, or the two Specialisations. */
const UPGRADE_KEYS = ['q', 'w'] as const;

/** Locked by the Campaign, as opposed to gold that kills and Waves will bring. */
function isLock(blocked: string | null): boolean {
  return blocked !== null && !/ gold$/.test(blocked);
}

function Upgrade({ s, tower, u, i }: { s: PlaySession; tower: number; u: original.UpgradeOption; i: number }) {
  const to = towerSpecOf(u.to);
  const locked = isLock(u.blocked);
  return (
    <RowButton
      s={s}
      id={`upgrade-${u.to}`}
      label={u.name}
      detail={<><span class="coin" />{num(u.price)}</>}
      sub={to ? `${tierName(u.tier)} · ${towerSummary(to)}` : tierName(u.tier)}
      // Short of gold it stays pressable, and the refusal says so; a lock is greyed out with its reason.
      blocked={locked ? u.blocked : null}
      dim={u.blocked !== null && !locked}
      {...(UPGRADE_KEYS[i] ? { hotkey: UPGRADE_KEYS[i] } : {})}
      run={() => s.view.send({ type: 'original.upgrade', tower, to: u.to })}
    />
  );
}

function TargetingRow({ s, tower, current }: { s: PlaySession; tower: number; current: Targeting }) {
  const set = (t: Targeting): void => s.view.send({ type: 'original.target', tower, targeting: t });
  const next = (): void => set(TARGETINGS[(TARGETINGS.indexOf(current) + 1) % TARGETINGS.length]!);
  useHotkey(s, 't', 'Next targeting', next);
  return (
    <div class="or-targeting" role="group" aria-label="Targeting">
      <span class="muted">Aim <span class="key">{keyLabel('t')}</span></span>
      <div class="seg">
        {TARGETINGS.map((t) => (
          <button
            key={t}
            type="button"
            class={`btn${current === t ? ' active' : ''}`}
            aria-pressed={current === t}
            title={`${TARGETING_NAME[t]}: ${TARGETING_ABOUT[t]}`}
            data-action={`target-${t}`}
            onClick={press(s, () => set(t))}
          >
            {TARGETING_NAME[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The selected tower: what it is, its Level and XP, its upgrades, targeting, Sell, its numbers and its Perks. */
export function OriginalPanel({ s, tower }: ModePanelProps) {
  void revision.value;
  const state = s.view.state;
  const a = original.towerActions(state, tower.id);
  const sell = (): void => {
    s.view.send({ type: 'original.sell', tower: tower.id });
    s.view.select(0);
  };
  useHotkey(s, 's', 'Sell', sell, a !== null);
  const spec = towerSpecOf(tower.spec);
  if (!a || !spec) return null;
  const atk = spec.attack;
  const levelBonus = a.level - 1;
  const rows: [string, ComponentChildren][] = [];
  if (atk && spec.original.damageType) {
    const bonus = levelBonus > 0 ? ` (+${num(Math.round(levelBonus * LEVEL_DAMAGE * 100))}%)` : '';
    if (spec.original.beam) rows.push(['Damage', `${num(Math.round(atk.damage[0] / atk.cooldown))}/s${bonus}`]);
    else rows.push(['Damage', `${num(atk.damage[0])}${bonus}`]);
    if (!spec.original.beam) rows.push(['Speed', rate(atk.cooldown)]);
    rows.push(['Range', num(Math.round(a.range))]);
    rows.push(['Type', DAMAGE_NAME[spec.original.damageType]]);
    const air = atk.targets !== 'ground' || (spec.original.family === 'poison' && hitsAirByTalent(state));
    rows.push(['Hits', air ? 'Ground and air' : 'Ground only']);
  }
  if (a.auraRadius > 0) rows.push(['Aura', `${num(Math.round(a.auraRadius))}${spec.original.family === 'totem' && levelBonus > 0 ? ` · +${num(Math.round(levelBonus * LEVEL_AURA * 100))} pts` : ''}`]);
  rows.push(['Kills', num(a.kills)]);
  const lines = abilityLines(spec);
  const xpFrom = LEVEL_XP[a.level - 1] ?? 0;
  const share = a.nextXp === null ? 1 : Math.max(0, Math.min(1, (a.xp - xpFrom) / Math.max(1, a.nextXp - xpFrom)));
  return (
    <div class="or-tower" data-testid="original-panel">
      <div class="or-kind">
        <FamilyIcon family={a.family} />
        <span class="what">{FAMILY_NAME[a.family]} · {tierName(a.tier)}</span>
        <TierPips tier={a.tier} />
        <button type="button" class="btn danger or-sell" title={`Sell for ${a.sellValue} gold (S)`} data-action="sell" onClick={press(s, sell)}>
          Sell <span class="detail" data-testid="sell-value">+{num(a.sellValue)}</span>
          <span class="key">S</span>
        </button>
      </div>
      <div class={`or-xp${a.level >= 5 ? ' gold' : ''}`} title={a.nextXp === null ? 'Tower Level 10, the most' : `Kills and Assists raise the Tower Level this Run: ${a.xp} of ${a.nextXp} XP for Level ${a.level + 1}`}>
        <span class="bar" style={{ width: `${Math.round(share * 100)}%` }} />
        <span class="text"><b data-testid="tower-level">Lv {a.level}</b>{a.nextXp === null ? ' · the most' : ` · ${num(Math.floor(a.xp))} / ${a.nextXp} XP`}</span>
      </div>
      {a.upgrades.length > 0 && (
        <div class="or-upgrades" data-testid="upgrades">
          {a.upgrades.map((u, i) => <Upgrade key={u.to} s={s} tower={tower.id} u={u} i={i} />)}
        </div>
      )}
      {a.targeting !== null && <TargetingRow s={s} tower={tower.id} current={a.targeting} />}
      <dl class="or-stats">
        {rows.map(([k, v]) => <div key={k} class="row"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {lines.length > 0 && (
        <ul class="abilities">
          {lines.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      <ul class="or-perks" data-testid="perks">
        {a.perks.map((p) => (
          <li key={p.level} class={p.held ? 'held' : ''} title={p.held ? 'Held' : `At Tower Level ${p.level}`}>
            <span class="lv">Lv {p.level}</span> <b>{p.perk.name}</b>: {p.perk.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plague Wind (the Poison capstone) lets Poison towers hit flying creeps. */
function hitsAirByTalent(state: GameState): boolean {
  return original.runTalents(state).families.poison.hitsAir;
}
