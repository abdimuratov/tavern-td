import type { Shape } from '../../../render/look';
import { hex } from '../../Hud';
import { sendLook } from './look';

// A Send's creep as the board draws it, small enough for a button: its shape
// in its colour with its dark mark, one copy per creep for a pack.

const R = 46;

function regular(n: number, r: number, turn: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = turn + (i * 2 * Math.PI) / n;
    pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

const UP = -Math.PI / 2;

/** The atlas's shapes as SVG, pointing up where they point. */
function body(shape: Shape, r: number, fill: string, stroke: string, width: number) {
  const common = { fill, stroke, 'stroke-width': width, 'stroke-linejoin': 'round' as const };
  switch (shape) {
    case 'square': return <rect x={-r * 0.86} y={-r * 0.86} width={r * 1.72} height={r * 1.72} rx={r * 0.2} {...common} />;
    case 'diamond': return <polygon points={regular(4, r, UP)} {...common} />;
    case 'octagon': return <polygon points={regular(8, r, Math.PI / 8)} {...common} />;
    case 'star': return <polygon points={star(r)} {...common} />;
    case 'cross': return <polygon points={cross(r)} {...common} />;
    case 'chevron': return <polygon points={`0,${-r} ${-r * 0.66},${r * 0.8} 0,${r * 0.3} ${r * 0.66},${r * 0.8}`} {...common} />;
    default: return <circle r={r * 0.96} {...common} />;
  }
}

function star(r: number): string {
  const out: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = UP + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : r * 0.46;
    out.push(`${(Math.cos(a) * k).toFixed(1)},${(Math.sin(a) * k).toFixed(1)}`);
  }
  return out.join(' ');
}

function cross(r: number): string {
  const a = r * 0.34;
  const b = r * 0.92;
  return [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]].map(([x, y]) => `${x},${y}`).join(' ');
}

/** `creep` is a Maul creep id, as a Send's spec names it; `count` draws a pack as that many, up to three. */
export function CreepIcon({ creep, count = 1 }: { creep: string; count?: number }) {
  const look = sendLook(creep);
  const n = Math.max(1, Math.min(3, count));
  // Bigger creeps read bigger, but the smallest stays visible.
  const scale = (0.62 + 0.38 * Math.min(1, look.size / 0.86)) * (n > 1 ? 0.62 : 1);
  const step = 62 * 0.62;
  return (
    <svg class="lw-creep" viewBox="-60 -50 120 100" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${((i - (n - 1) / 2) * step).toFixed(1)} ${n === 3 && i === 1 ? -10 : n > 1 ? 6 : 0}) scale(${scale.toFixed(3)})`}>
          {body(look.shape, R, hex(look.color), 'rgba(10, 8, 6, 0.85)', 7)}
          {look.mark && <g transform="scale(0.5)">{body(look.mark, R, '#17110c', 'none', 0)}</g>}
        </g>
      ))}
    </svg>
  );
}
