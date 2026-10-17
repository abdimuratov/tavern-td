import type { Family } from '../../../content/original';
import { hex } from '../../Hud';
import { FAMILY_COLOR } from './look';
import { FAMILY_NAME } from './text';

// Small pieces the Original's screens share: a family's shape in its colour,
// Stars, and Tier pips.

/** A family's shape, as its towers wear it on the board: triangle, circle, hexagon, diamond, drop, pillar. */
export function FamilyIcon({ family }: { family: Family }) {
  return <span class={`or-family ${family}`} style={{ background: hex(FAMILY_COLOR[family]) }} title={FAMILY_NAME[family]} aria-hidden="true" />;
}

/** `n` of `of` Stars, filled then hollow. */
export function Stars({ n, of = 3, testid }: { n: number; of?: number; testid?: string }) {
  return (
    <span class="or-stars" aria-label={`${n} of ${of} Stars`} data-testid={testid}>
      {Array.from({ length: of }, (_, i) => <span key={i} class={i < n ? 'on' : ''}>★</span>)}
    </span>
  );
}

/** A Star with a count beside it, for totals. */
export function StarCount({ n, testid }: { n: number; testid?: string }) {
  return <span class="or-star-count" data-testid={testid}><span class="star">★</span>{n}</span>;
}

/** Three pips, `tier` of them lit; a Specialisation shows a crest instead. */
export function TierPips({ tier }: { tier: number }) {
  if (tier >= 4) return <span class="or-crest" title="Specialisation">Specialisation</span>;
  return (
    <span class="pips" aria-label={`Tier ${tier} of 3`}>
      {[1, 2, 3].map((t) => <span key={t} class={t <= tier ? 'on' : ''} />)}
    </span>
  );
}
