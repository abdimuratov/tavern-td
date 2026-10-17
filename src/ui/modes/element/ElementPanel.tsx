import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ELEMENTS, type ElementTowerSpec } from '../../../content/element';
import { element, TICK_RATE, type Tower } from '../../../sim';
import { num } from '../../format';
import { keyLabel, press, useHotkey } from '../../Hud';
import type { ModePanelProps } from '../../mode-ui';
import { revision, runClock, type PlaySession } from '../../state';
import { ELEMENT_LETTER } from './look';
import { Dot, EssenceIcon, Needs, Pips } from './parts';
import { abilityLines, addedElement, damageName, kindText, kindWord, needsOf, rate, specOf } from './text';

interface Choice {
  readonly u: element.UpgradeOption;
  readonly to: ElementTowerSpec;
  /** U for a level up the same line; the added Element's letter for a branch. */
  readonly key: string;
  /** Sort: level up first, then by the Element added, in cycle order. */
  readonly order: number;
}

function choicesFor(from: ElementTowerSpec, upgrades: readonly element.UpgradeOption[]): Choice[] {
  return upgrades
    .map((u) => {
      const to = specOf(u.to)!;
      const add = addedElement(from, to);
      return { u, to, key: add ? ELEMENT_LETTER[add].toLowerCase() : 'u', order: add ? 1 + ELEMENTS.indexOf(add) : 0 };
    })
    .sort((a, b) => a.order - b.order);
}

/** An upgrade whose Element levels are met: a button with its cost, dim while gold or a build is short. */
function UpgradeButton({ s, tower, c }: { s: PlaySession; tower: Tower; c: Choice }) {
  const { u, to } = c;
  // Pressable whatever blocks it: the game's refusal then says why, with the error sound.
  const run = (): void => s.view.send({ type: 'element.upgrade', tower: tower.id, to: u.to });
  useHotkey(s, c.key, `Upgrade to ${to.name}`, run);
  let cost: ComponentChildren;
  if (u.blocked === 'still building') cost = <span class="muted">Building</span>;
  else if (u.blocked === 'needs a Pure Essence') cost = <span class="why"><EssenceIcon /> needed</span>;
  else cost = <><span class="coin" />{num(u.cost)}{u.essence > 0 && <> + <EssenceIcon /></>}</>;
  return (
    <button
      type="button"
      class={`btn el-up${u.blocked !== null ? ' dim' : ''}`}
      title={`${to.name}: ${kindText(to)} · ${u.cost} gold${u.essence ? ' and a Pure Essence' : ''}${u.blocked ? ` · ${u.blocked}` : ''} (${keyLabel(c.key)})`}
      data-action={`upgrade-${u.to}`}
      onClick={press(s, run)}
    >
      <span class="line">
        <span class="dots">{to.element.elements.map((e) => <Dot key={e} e={e} />)}</span>
        <span class="detail">{cost}</span>
      </span>
      <span class="label">{to.name}</span>
      <span class="key">{keyLabel(c.key)}</span>
    </button>
  );
}

/** Upgrades an Element level still locks: small chips with what each needs, so they don't crowd out the ones on offer. */
function Locked({ choices, levels }: { choices: readonly Choice[]; levels: element.ElementStatus['levels'] }) {
  return (
    <div class="el-locked" data-testid="locked-upgrades">
      <span class="muted">Locked</span>
      {choices.map((c) => (
        <span key={c.u.to} class="chip" title={`${c.to.name}: ${c.u.cost} gold, ${c.u.needs}`} data-locked={c.u.to}>
          <span class="name">{c.to.name}</span>
          <Needs pairs={needsOf(c.to, levels)} />
        </span>
      ))}
    </div>
  );
}

function Stats({ info, spec }: { info: element.ElementTowerInfo; spec: ElementTowerSpec }) {
  const rows: [string, ComponentChildren][] = [];
  const short: string[] = [];
  if (info.baseDamage > 0) {
    const bonus = info.damage > info.baseDamage + 0.5 ? ` (+${Math.round((info.damage / info.baseDamage - 1) * 100)}%)` : '';
    rows.push(['Damage', `${num(Math.round(info.damage))}${bonus}`]);
    short.push(`${num(Math.round(info.damage))} dmg`);
  }
  if (info.cooldown !== null) {
    rows.push(['Speed', rate(info.cooldown)]);
    short.push(rate(info.cooldown));
  }
  rows.push(['Range', num(info.range)]);
  short.push(`range ${num(info.range)}`);
  rows.push(['Deals', <><Dot e={info.damageElement} /> {damageName(info.damageElement)}</>]);
  if (info.splash) rows.push(['Splash', `${num(info.splash.full)}/${num(info.splash.half)}`]);
  rows.push(['Kills', num(info.kills)]);
  if (info.fireUp > 0) rows.push(['Fire Up', `+${Math.round(info.fireUp * 100)}% damage`]);
  if (info.springForward > 0) rows.push(['Spring', `+${Math.round(info.springForward * 100)}% speed`]);
  if (info.vengeanceStacks > 0) rows.push(['Vengeance', `−${info.vengeanceStacks * 10}% damage`]);
  const lines = abilityLines(spec);
  return (
    <>
      <dl class="el-stats">
        {rows.map(([k, v]) => <div key={k} class="row"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {/* A short screen gets the numbers on one line. */}
      <div class="el-statline">{short.join(' · ')}</div>
      {lines.length > 0 && (
        <ul class="abilities">
          {lines.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
    </>
  );
}

/** The selected tower: what it is, its build progress, the upgrades it can take, Sell, and its numbers. */
export function ElementPanel({ s, tower }: ModePanelProps) {
  void revision.value;
  void runClock.value;
  const state = s.view.state;
  const spec = specOf(tower.spec);
  const info = element.towerInfo(state, tower.id);
  const acts = element.towerActions(state, tower.id);
  const sell = acts?.sell;
  const sellNow = (): void => {
    s.view.send({ type: 'element.sell', tower: tower.id });
    s.view.select(0);
  };
  useHotkey(s, 's', 'Sell', sellNow, !!sell && sell.blocked === null);
  // A short screen shows either the upgrades or the details; a new tower starts on its upgrades.
  const [details, setDetails] = useState(false);
  useEffect(() => setDetails(false), [tower.id]);
  if (!spec || !info || !acts || !sell) return null;
  const levels = element.elementStatus(state).levels;
  const copy = info.copyUntil !== null;
  const choices = copy ? [] : choicesFor(spec, acts.upgrades);
  const open = choices.filter((c) => c.u.needs === null);
  const locked = choices.filter((c) => c.u.needs !== null);
  const total = spec.element.buildTime * TICK_RATE;
  const leveled = info.kind === 'single' || info.kind === 'dual' || info.kind === 'triple';
  return (
    <div class={`el-tower${open.length >= 5 ? ' many' : ''}${details ? ' details' : ''}`} data-testid="element-panel">
      <div class="el-kind">
        <button
          type="button"
          class="what"
          aria-pressed={details}
          title={`${copy ? 'A copy made by a Mirror' : kindText(spec)}: tap for ${details ? 'upgrades' : 'details'}`}
          data-action="details"
          onClick={press(s, () => setDetails(!details))}
        >
          <span class="dots">{info.elements.map((e) => <Dot key={e} e={e} />)}</span>
          {copy ? `Copy · ${Math.max(0, Math.ceil((info.copyUntil! - state.tick) / TICK_RATE))} s` : kindWord(spec)}
          {leveled && !copy && <Pips level={info.level} />}
          <span class="info" aria-hidden="true">i</span>
        </button>
        <button
          type="button"
          class="btn danger el-sell"
          disabled={sell.blocked !== null}
          title={sell.blocked ?? `Sell for ${sell.gold} gold${sell.essence ? ' and a Pure Essence' : ''} (S)`}
          data-action="sell"
          onClick={press(s, sellNow)}
        >
          Sell <span class="detail">+{num(sell.gold)}{sell.essence > 0 && <> <EssenceIcon /></>}</span>
          <span class="key">S</span>
        </button>
      </div>
      {!info.built && (
        <div class="el-progress" data-testid="build-progress" title="Building">
          <span class="bar" style={{ width: `${Math.round((1 - info.buildTicksLeft / total) * 100)}%` }} />
          <span class="text">Building · {num(Math.ceil((info.buildTicksLeft / TICK_RATE) * 10) / 10)} s</span>
        </div>
      )}
      {open.length > 0 && (
        <div class="el-upgrades" data-testid="upgrades">
          {open.map((c) => <UpgradeButton key={c.u.to} s={s} tower={tower} c={c} />)}
        </div>
      )}
      {locked.length > 0 && <Locked choices={locked} levels={levels} />}
      <Stats info={info} spec={spec} />
    </div>
  );
}
