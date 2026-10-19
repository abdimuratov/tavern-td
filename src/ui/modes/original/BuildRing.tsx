import { useEffect, useRef } from 'preact/hooks';
import { CELL, original } from '../../../sim';
import { keyLabel, press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, type PlaySession } from '../../state';
import { FamilyIcon } from './parts';
import { pickFamily, placeCentre, ring, RING_KEYS } from './ring';
import { FAMILY_NAME } from './text';

/** How far the buttons sit from the place's middle, at least: past the 2 × 2 itself at any zoom. */
const MIN_RADIUS = 64;
/** Room kept between the ring and the board's edge. */
const EDGE = 30;

function RingButton({ s, o, i, n, picked }: { s: PlaySession; o: original.BuildOption; i: number; n: number; picked: boolean }) {
  const key = RING_KEYS[i];
  const run = (): void => pickFamily(s.view, o.family);
  useHotkey(s, key, picked ? `Build ${o.name}` : FAMILY_NAME[o.family], run);
  // Clockwise from the upper left, so the first two sit side by side and the hotkeys read round the ring in order.
  const turn = -Math.PI / 2 - Math.PI / n + (i * Math.PI * 2) / n;
  // Dimmed but still pressable for gold, the Tower cap or the ground, as its Ghost then shows red with the reason.
  const dim = o.blocked !== null;
  return (
    <button
      type="button"
      class={`btn ring-btn${picked ? ' active' : ''}${dim ? ' dim' : ''}`}
      style={{ '--dx': Math.cos(turn).toFixed(3), '--dy': Math.sin(turn).toFixed(3) }}
      aria-pressed={picked}
      title={`${o.name} · ${o.price} gold${o.blocked ? ` · ${o.blocked}` : ''}${key ? ` (${keyLabel(key)})` : ''}`}
      data-action={`ring-${o.family}`}
      onClick={press(s, run)}
    >
      <FamilyIcon family={o.family} />
      <span class="label">{picked ? 'Build' : FAMILY_NAME[o.family]}</span>
      <span class="detail"><span class="coin" />{o.price}</span>
      {key && <span class="key">{keyLabel(key)}</span>}
    </button>
  );
}

/**
 * Around a 2 × 2 of Open ground: the families it can take, with their prices,
 * dimmed with the reason when gold, the Tower cap or something in the way
 * refuses them. It follows the place as the board pans and zooms, kept inside the board.
 */
export function BuildRing({ s }: ModeHudProps) {
  void revision.value;
  const r = ring.value;
  const root = useRef<HTMLDivElement>(null);
  const state = s.view.state;
  const info = r ? original.placeInfo(state, r.place.col, r.place.row) : null;
  const open = r !== null && info !== null && info.cells.length > 0;

  useEffect(() => {
    if (!open || !r) return;
    let frame = 0;
    const place = (): void => {
      const el = root.current;
      const centre = placeCentre(r.place);
      const host = el?.parentElement?.getBoundingClientRect();
      if (el && host && s.view.toScreen) {
        const c = s.view.toScreen(centre);
        // A place is two cells across, so it reaches one cell from its middle.
        const half = Math.abs(s.view.toScreen({ x: centre.x + CELL, y: centre.y }).x - c.x);
        const radius = Math.max(MIN_RADIUS, half + 30);
        const reach = radius + EDGE;
        const x = Math.min(Math.max(c.x - host.left, reach), Math.max(reach, host.width - reach));
        const y = Math.min(Math.max(c.y - host.top, reach), Math.max(reach, host.height - reach));
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        el.style.setProperty('--r', `${radius.toFixed(1)}px`);
        el.style.setProperty('--place', `${(half * 2).toFixed(1)}px`);
        // Near the board's edge the ring moves inward; the outline stays on the place.
        el.style.setProperty('--ox', `${(c.x - host.left - x).toFixed(1)}px`);
        el.style.setProperty('--oy', `${(c.y - host.top - y).toFixed(1)}px`);
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [open, r?.place.col, r?.place.row, s]);

  if (!open || !r || !info) return null;
  return (
    <div ref={root} class="build-ring" data-testid="build-ring" role="group" aria-label="Build">
      <span class="ring-place" />
      {info.options.map((o, i) => <RingButton key={o.family} s={s} o={o} i={i} n={info.options.length} picked={r.family === o.family} />)}
    </div>
  );
}
