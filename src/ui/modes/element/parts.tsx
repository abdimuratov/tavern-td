import { elementName, type DamageElement, type Element } from '../../../content/element';
import { hex } from '../../Hud';
import { damageName } from './text';
import { ELEMENT_COLOR, ELEMENT_LETTER } from './look';

// Small pieces the Element HUD shares: an Element's dot with its letter, level
// pips, the needs of a locked tower, and the Lumber and Pure Essence icons.

/** An Element's colour with its letter on it, so it reads without telling colours apart. */
export function Dot({ e }: { e: DamageElement }) {
  return (
    <span class={`el-dot${e === 'composite' ? ' composite' : ''}`} style={{ background: hex(ELEMENT_COLOR[e]) }} title={damageName(e)}>
      {e === 'composite' ? '' : ELEMENT_LETTER[e]}
    </span>
  );
}

/** Three pips, `level` of them lit. */
export function Pips({ level, of = 3 }: { level: number; of?: number }) {
  return (
    <span class="el-pips" aria-label={`level ${level} of ${of}`}>
      {Array.from({ length: of }, (_, i) => <span key={i} class={i < level ? 'on' : ''} />)}
    </span>
  );
}

/** "needs Water 2 and Earth 2" as dots with the level each needs. */
export function Needs({ pairs }: { pairs: readonly (readonly [Element, number])[] }) {
  return (
    <span class="el-needs" title={`needs ${pairs.map(([e, l]) => `${elementName(e)} ${l}`).join(' and ')}`}>
      {pairs.map(([e, l]) => (
        <span key={e} class="need"><Dot e={e} />{l}</span>
      ))}
    </span>
  );
}

export function LumberIcon() {
  return <span class="lumber" aria-hidden="true" />;
}

export function EssenceIcon() {
  return <span class="essence" aria-hidden="true" />;
}

/** A small padlock, for towers an Element level still locks. */
export function Lock() {
  return (
    <svg class="lock" viewBox="0 0 12 14" aria-hidden="true">
      <path d="M3 6V4.2a3 3 0 0 1 6 0V6" fill="none" stroke="currentColor" stroke-width="1.6" />
      <rect x="1.5" y="6" width="9" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}
