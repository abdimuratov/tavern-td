import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { SHAPES, type Shape } from './look';

/** Extra sprites besides the tintable shapes. */
export type Glyph = 'plate' | 'shadow' | 'glow' | 'ring' | 'white' | 'brackets' | 'arc2' | 'arc3' | 'arc6' | 'swirl';

/** The ring segment glyph for a ring split into `n` colours; segment i is the glyph turned by i/n of a turn. */
export function arcGlyph(n: number): Glyph {
  return n <= 1 ? 'ring' : n === 2 ? 'arc2' : n === 3 ? 'arc3' : 'arc6';
}

export interface Atlas {
  shape(s: Shape): Texture;
  glyph(g: Glyph): Texture;
  destroy(): void;
}

/** Pixels per atlas slot; shapes are drawn with a diameter of ATLAS_UNIT inside it, the rest is padding for mipmaps. */
const SLOT = 144;
/** A shape's nominal diameter in atlas pixels: scale a sprite by worldSize / ATLAS_UNIT. */
export const ATLAS_UNIT = 112;
const R = ATLAS_UNIT / 2;
const PER_ROW = 7;
const OUTLINE = 'rgba(10, 8, 6, 0.85)';

type Draw = (g: CanvasRenderingContext2D) => void;

function regular(n: number, radius: number, rotation: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rotation + (i * 2 * Math.PI) / n;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

function path(g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}

/** White with a soft top-left light and a dark outline: a tint becomes the colour, the outline stays dark. */
function solid(g: CanvasRenderingContext2D, outline = 7): void {
  const grad = g.createLinearGradient(-R, -R, R, R);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#bdbdbd');
  g.fillStyle = grad;
  g.fill();
  g.lineJoin = 'round';
  g.lineWidth = outline;
  g.strokeStyle = OUTLINE;
  g.stroke();
}

const UP = -Math.PI / 2;

/** One of `n` segments of a thick ring, starting at the top and running clockwise, with a hair of gap to the next. */
function arc(n: number): Draw {
  return (g) => {
    const gap = n >= 6 ? 0.1 : 0.07;
    const a0 = UP + gap / 2;
    const a1 = UP + (Math.PI * 2) / n - gap / 2;
    g.beginPath();
    g.arc(0, 0, R * 0.98, a0, a1);
    g.arc(0, 0, R * 0.7, a1, a0, true);
    g.closePath();
    solid(g, 4);
  };
}
const ROCK = [1, 0.86, 0.97, 0.8, 0.95, 0.88, 1, 0.83, 0.92];

/** A cut gem from above: an n-sided girdle, a table in the middle and a facet line from each table corner. */
function cut(n: number): Draw {
  // Odd cuts and the four-facet one point up, so none reads as a plain square; the rest sit flat.
  const turn = n % 2 === 1 || n === 4 ? UP : Math.PI / n;
  return (g) => {
    const girdle = regular(n, R * (n === 3 ? 1.04 : 0.98), turn);
    const table = regular(n, R * (n === 3 ? 0.42 : 0.5), turn);
    path(g, n === 3 ? girdle.map(([x, y]) => [x, y + R * 0.14]) : girdle);
    solid(g);
    g.beginPath();
    const dy = n === 3 ? R * 0.14 : 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = table[i]!;
      const [gx, gy] = girdle[i]!;
      g.moveTo(x, y + dy);
      g.lineTo(gx, gy + dy);
    }
    path(g, table.map(([x, y]) => [x, y + dy]));
    g.lineWidth = 3.5;
    g.strokeStyle = 'rgba(10, 8, 6, 0.42)';
    g.stroke();
  };
}

const SHAPE_DRAW: Readonly<Record<Shape, Draw>> = {
  circle: (g) => {
    g.beginPath();
    g.arc(0, 0, R * 0.96, 0, Math.PI * 2);
    solid(g);
  },
  square: (g) => {
    g.beginPath();
    g.roundRect(-R * 0.84, -R * 0.84, R * 1.68, R * 1.68, R * 0.2);
    solid(g);
  },
  diamond: (g) => { path(g, regular(4, R, UP)); solid(g); },
  triangle: (g) => { path(g, regular(3, R, UP).map(([x, y]) => [x, y + R * 0.14])); solid(g); },
  pentagon: (g) => { path(g, regular(5, R * 0.98, UP)); solid(g); },
  hexagon: (g) => { path(g, regular(6, R * 0.96, 0)); solid(g); },
  octagon: (g) => { path(g, regular(8, R * 0.96, Math.PI / 8)); solid(g); },
  star: (g) => {
    const outer = regular(5, R, UP);
    const inner = regular(5, R * 0.46, UP + Math.PI / 5);
    path(g, outer.flatMap((p, i) => [p, inner[i]!]));
    solid(g, 6);
  },
  cross: (g) => {
    const a = R * 0.34;
    const b = R * 0.92;
    path(g, [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]]);
    solid(g, 6);
  },
  gem: (g) => {
    // A brilliant cut seen from above: an octagon table with facet lines to the girdle.
    const girdle = regular(8, R * 0.98, Math.PI / 8);
    const table = regular(8, R * 0.5, Math.PI / 8);
    path(g, girdle);
    solid(g);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const [x, y] = table[i]!;
      const [gx, gy] = girdle[i]!;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
      g.moveTo(x, y);
      g.lineTo(gx, gy);
      g.moveTo(x, y);
    }
    g.lineTo(table[0]![0], table[0]![1]);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(10, 8, 6, 0.4)';
    g.stroke();
  },
  rock: (g) => {
    path(g, regular(ROCK.length, R, 0.3).map(([x, y], i) => [x * ROCK[i]!, y * ROCK[i]! * 0.92]));
    solid(g);
  },
  cut3: cut(3),
  cut4: cut(4),
  cut5: cut(5),
  cut6: cut(6),
  cut8: cut(8),
  tile: (g) => {
    // Flat and square, with an engraved inner line, so it reads as floor rather than wall.
    g.beginPath();
    g.roundRect(-R * 0.92, -R * 0.92, R * 1.84, R * 1.84, R * 0.16);
    solid(g, 5);
    g.beginPath();
    g.roundRect(-R * 0.6, -R * 0.6, R * 1.2, R * 1.2, R * 0.1);
    g.moveTo(0, -R * 0.6);
    g.lineTo(0, R * 0.6);
    g.moveTo(-R * 0.6, 0);
    g.lineTo(R * 0.6, 0);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(10, 8, 6, 0.38)';
    g.stroke();
  },
  burst: (g) => {
    const outer = regular(12, R, UP);
    const inner = regular(12, R * 0.68, UP + Math.PI / 12);
    path(g, outer.flatMap((p, i) => [p, inner[i]!]));
    solid(g, 6);
    g.beginPath();
    g.arc(0, 0, R * 0.34, 0, Math.PI * 2);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(10, 8, 6, 0.4)';
    g.stroke();
  },
  chevron: (g) => {
    // Points along +x, so a sprite's rotation is its heading.
    // Longer than it is wide, so the heading reads at a glance.
    path(g, [[R, 0], [-R * 0.8, -R * 0.66], [-R * 0.3, 0], [-R * 0.8, R * 0.66]]);
    solid(g, 6);
  },
};

const GLYPH_DRAW: Readonly<Record<Glyph, Draw>> = {
  plate: (g) => {
    g.beginPath();
    g.roundRect(-R * 0.96, -R * 0.96, R * 1.92, R * 1.92, R * 0.28);
    solid(g, 5);
  },
  shadow: (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(-R, -R, R * 2, R * 2);
  },
  glow: (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(-R, -R, R * 2, R * 2);
  },
  ring: (g) => {
    g.beginPath();
    g.arc(0, 0, R * 0.9, 0, Math.PI * 2);
    g.lineWidth = R * 0.16;
    g.strokeStyle = '#ffffff';
    g.stroke();
  },
  white: (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(-SLOT / 2, -SLOT / 2, SLOT, SLOT);
  },
  brackets: (g) => {
    // Four corner marks: something placed but not settled yet.
    const a = R * 0.92;
    const b = R * 0.42;
    g.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      g.moveTo(sx * a, sy * (a - b));
      g.lineTo(sx * a, sy * a);
      g.lineTo(sx * (a - b), sy * a);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = R * 0.16;
    g.strokeStyle = '#ffffff';
    g.stroke();
  },
  arc2: arc(2),
  arc3: arc(3),
  arc6: arc(6),
  swirl: (g) => {
    // Three curved arms around an eye: a whirlwind seen from above.
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const turn = (k * Math.PI * 2) / 3;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const a = turn + t * Math.PI * 1.25;
        const r = R * (0.18 + 0.78 * t);
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.lineWidth = R * 0.2;
      g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      g.stroke();
    }
  },
};

/**
 * Every shape and glyph drawn once into one canvas texture, so all entity
 * sprites share a single GPU texture and batch into few draw calls.
 */
export function createAtlas(): Atlas {
  const entries: [string, Draw][] = [
    ...SHAPES.map((s): [string, Draw] => [s, SHAPE_DRAW[s]]),
    ...(Object.keys(GLYPH_DRAW) as Glyph[]).map((k): [string, Draw] => [k, GLYPH_DRAW[k]]),
  ];
  const rows = Math.ceil(entries.length / PER_ROW);
  const canvas = document.createElement('canvas');
  canvas.width = SLOT * PER_ROW;
  canvas.height = SLOT * rows;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas is unavailable');

  const frames = new Map<string, Rectangle>();
  entries.forEach(([name, draw], i) => {
    const x = (i % PER_ROW) * SLOT;
    const y = Math.floor(i / PER_ROW) * SLOT;
    g.save();
    g.translate(x + SLOT / 2, y + SLOT / 2);
    draw(g);
    g.restore();
    // The solid block is sampled from its middle only, so filtering never reaches a neighbour.
    frames.set(name, name === 'white' ? new Rectangle(x + SLOT / 2 - 4, y + SLOT / 2 - 4, 8, 8) : new Rectangle(x, y, SLOT, SLOT));
  });

  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
  const textures = new Map<string, Texture>();
  for (const [name, frame] of frames) textures.set(name, new Texture({ source, frame }));
  const get = (name: string): Texture => textures.get(name)!;
  return {
    shape: get,
    glyph: get,
    destroy() {
      for (const t of textures.values()) t.destroy();
      source.destroy();
    },
  };
}
