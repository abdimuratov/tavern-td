import type { ComponentChildren } from 'preact';
import type { AttackType } from '../../../content/maul';
import { linewars, towerMods } from '../../../sim';
import { num } from '../../format';
import { hex, press, RowButton, useHotkey } from '../../Hud';
import type { ModePanelProps } from '../../mode-ui';
import { revision, type PlaySession } from '../../state';
import { RACE_COLOR } from '../maul/look';
import { abilityLines, ATTACK_NAME, raceName, rate, tierName, towerSpecOf, towerSummary } from '../maul/text';

/** Upgrade keys in the panel's order: a Wall's lines, the next Tier, or the two forks. */
const UPGRADE_KEYS = ['q', 'w', 'e', 'r'] as const;

function Upgrade({ s, tower, u, i }: { s: PlaySession; tower: number; u: linewars.LwUpgradeOption; i: number }) {
  const to = towerSpecOf(u.to);
  return (
    <RowButton
      s={s}
      id={`upgrade-${u.to}`}
      label={u.name}
      detail={<><span class="coin" />{num(u.price)}</>}
      sub={to ? `${tierName(u.tier)} · ${towerSummary(to)}` : tierName(u.tier)}
      // Short of gold it stays pressable, and the refusal says so.
      dim={u.blocked !== null}
      {...(UPGRADE_KEYS[i] ? { hotkey: UPGRADE_KEYS[i] } : {})}
      run={() => s.view.send({ type: 'lw.upgrade', side: 0, tower, to: u.to })}
    />
  );
}

/**
 * The selected tower: what it is, and for one of yours its upgrades with both
 * forks and Sell with its value. A Rival's tower shows read-only.
 */
export function LwPanel({ s, tower }: ModePanelProps) {
  void revision.value;
  const state = s.view.state;
  const a = linewars.towerActions(state, 0, tower.id);
  const sell = (): void => {
    s.view.send({ type: 'lw.sell', side: 0, tower: tower.id });
    s.view.select(0);
  };
  useHotkey(s, 's', 'Sell', sell, a?.mine === true);
  const spec = towerSpecOf(tower.spec);
  if (!a || !spec) return null;
  const mods = towerMods(tower);
  const rows: [string, ComponentChildren][] = [];
  const atk = spec.attack;
  if (atk) {
    const bonus = mods.damage > 0 ? ` (+${Math.round(mods.damage * 100)}%)` : '';
    rows.push(['Damage', `${num(atk.damage[0])}–${num(atk.damage[1])}${bonus}`]);
    rows.push(['Speed', `${rate(atk.cooldown)}${mods.attackSpeed > 0 ? ` (+${Math.round(mods.attackSpeed * 100)}%)` : ''}`]);
    rows.push(['Range', num(Math.round(a.range))]);
    rows.push(['Type', ATTACK_NAME[atk.attackType as AttackType]]);
    rows.push(['Hits', atk.targets === 'both' ? 'Ground, air' : atk.targets === 'ground' ? 'Ground' : 'Air']);
  }
  const aura = Math.max(0, ...(spec.auras ?? []).map((x) => x.radius));
  if (aura > 0) rows.push(['Aura', num(aura)]);
  rows.push(['Kills', num(a.kills)]);
  const lines = abilityLines(spec);
  return (
    <div class={`or-tower ml-tower lw-tower${a.mine ? '' : ' theirs'}`} data-testid="lw-panel">
      <div class="or-kind">
        <span class="swatch" style={{ background: hex(RACE_COLOR[spec.maul.race]) }} />
        <span class="what">{raceName(spec.maul.race)} · {tierName(a.tier)}</span>
        {a.mine ? (
          <button
            type="button"
            class="btn danger or-sell"
            title={`Sell for ${a.sellValue} gold${a.fullRefund ? ', all it cost, until 0:20' : ''} (S)`}
            data-action="sell"
            onClick={press(s, sell)}
          >
            Sell <span class="detail" data-testid="sell-value">+{num(a.sellValue)}</span>
            <span class="key">S</span>
          </button>
        ) : (
          <span class="lw-theirs" data-testid="rival-tower">Rival's tower</span>
        )}
      </div>
      <div class="ml-role muted">{a.role}{a.fullRefund ? ' · sells back in full until 0:20' : ''}</div>
      {a.upgrades.length > 0 && (
        <div class="or-upgrades" data-testid="upgrades">
          {a.upgrades.map((u, i) => <Upgrade key={u.to} s={s} tower={tower.id} u={u} i={i} />)}
        </div>
      )}
      <dl class="or-stats">
        {rows.map(([k, v]) => <div key={k} class="row"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {lines.length > 0 && (
        <ul class="abilities">
          {lines.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
    </div>
  );
}
