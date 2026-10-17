import { ELEMENTS, type Element } from '../../../content/element';
import { element } from '../../../sim';
import { hex, keyLabel, press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, selected, type PlaySession } from '../../state';
import { ELEMENT_COLOR } from './look';
import { Lock } from './parts';
import { building, elementsOpen } from './picks';
import { damageName, specOf } from './text';

/** WC3-style letters: A Arrow, C Cannon, each Element's initial for its tower, X for the Sixfold Core. */
export const BUILD_KEY: Readonly<Record<string, string>> = {
  basic_arrow_tower: 'a', basic_cannon_tower: 'c', periodic_tower: 'x',
  ...Object.fromEntries(ELEMENTS.map((e) => [`${e}_tower`, e.charAt(0)])),
};

/** The button's word: the Element for a single, since that's how players think of it. */
function shortName(spec: string): string {
  if (spec === 'basic_arrow_tower') return 'Arrow';
  if (spec === 'basic_cannon_tower') return 'Cannon';
  if (spec === 'periodic_tower') return 'Sixfold';
  const e = ELEMENTS.find((x) => spec === `${x}_tower`);
  return e ? damageName(e) : spec;
}

/** Locked by Element levels or Pure Essence, as opposed to gold that interest and kills will bring. */
function isLock(blocked: string | null): boolean {
  return blocked !== null && !/ gold$/.test(blocked);
}

function BuildButton({ s, o, keys }: { s: PlaySession; o: element.BuildOption; keys: boolean }) {
  const spec = specOf(o.spec)!;
  const info = spec.element;
  const locked = isLock(o.blocked);
  const active = building.value === o.spec;
  const key = BUILD_KEY[o.spec];
  const run = (): void => {
    if (locked) {
      const how = info.kind === 'single' && element.elementStatus(s.view.state).picks === 'allPick' ? ': spend a Lumber in Elements' : '';
      s.view.say(`${o.blocked}${how}`, 'error', 2600);
      return;
    }
    building.value = active ? null : o.spec;
    s.view.refresh();
  };
  useHotkey(s, key, `Build ${o.name}`, run, keys);
  const color = info.kind === 'single' ? ELEMENT_COLOR[info.damage] : info.kind === 'periodic' ? 0xfff2c8 : ELEMENT_COLOR.composite;
  const cls = ['btn', 'el-build-btn', active && 'active', locked && 'locked', !locked && o.blocked && 'dim', info.kind].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      class={cls}
      aria-pressed={active}
      title={`${o.name} · ${o.cost} gold${o.essence ? ' and a Pure Essence' : ''}${o.blocked ? ` · ${o.blocked}` : ''}${key ? ` (${keyLabel(key)})` : ''}`}
      data-action={`build-${shortName(o.spec).toLowerCase()}`}
      onClick={press(s, run)}
    >
      <span class="swatch" style={{ background: hex(color) }} />
      <span class="label">{shortName(o.spec)}</span>
      <span class="detail">{locked ? <Lock /> : o.cost}</span>
      {key && keys && <span class="key">{keyLabel(key)}</span>}
    </button>
  );
}

function sixfoldShown(levels: Readonly<Record<Element, number>>): boolean {
  return ELEMENTS.every((e) => levels[e] >= 1);
}

/**
 * The build menu: Arrow and Cannon, then one tower per Element, locked until
 * that Element has a level. The Sixfold Core joins once all six do. Its keys
 * step aside while a tower is selected, so the letters can mean upgrades.
 */
export function BuildMenu({ s }: ModeHudProps) {
  void revision.value;
  void building.value;
  const state = s.view.state;
  const levels = element.elementStatus(state).levels;
  const keys = selected.value === 0 && !elementsOpen.value;
  const options = element.buildOptions(state).filter((o) => o.spec !== 'periodic_tower' || sixfoldShown(levels));
  return (
    <div class="el-build" data-testid="build-menu" role="group" aria-label="Build">
      {options.map((o) => <BuildButton key={o.spec} s={s} o={o} keys={keys} />)}
    </div>
  );
}
