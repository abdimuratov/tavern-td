import { Container, Graphics, Sprite } from 'pixi.js';
import { CELL, type MapSpec, type Point } from '../sim';
import { ATLAS_UNIT, type Atlas } from './atlas';
import type { Box } from './footprint';
import type { TowerLook } from './look';

/** `current` is the route creeps walk now; `preview` is the route a ghost's placement would make. */
export type RouteStyle = 'current' | 'preview';

export interface GhostView {
  readonly box: Box;
  readonly valid: boolean;
  /** The tower being placed, or null for a generic marker. */
  readonly look: Pick<TowerLook, 'shape' | 'color' | 'size' | 'plate'> | null;
  /** Attack range in world units, 0 for none. */
  readonly range: number;
}

export interface SelectionView {
  readonly x: number;
  readonly y: number;
  /** World units across the footprint. */
  readonly span: number;
  readonly range: number;
}

const ROUTE = {
  current: { color: 0xe0a64a, alpha: 0.55, width: 7 },
  preview: { color: 0x7fe8a8, alpha: 0.9, width: 8 },
};
const VALID = 0x6fdc5a;
const INVALID = 0xf0503c;
const WHITE = 8;
/** An arrowhead every this many route cells shows which way creeps walk. */
const ARROW_EVERY = 4;
/** On a fixed route, an arrowhead every this many world units. */
const ARROW_SPACING = ARROW_EVERY * CELL;

/**
 * The placement and selection layer: the route line, range circles, the ghost
 * and the selection ring. Graphics here redraw only when what they show
 * changes (a new hovered cell, a new route), never per frame.
 */
export class Overlay {
  readonly under = new Container();
  readonly over = new Container();
  private readonly route = new Graphics();
  private readonly range = new Graphics();
  private readonly ghostRange = new Graphics();
  private readonly ghostArea: Sprite;
  private readonly ghostPlate: Sprite;
  private readonly ghostTop: Sprite;
  private readonly ring: Sprite;

  constructor(private readonly atlas: Atlas) {
    this.under.addChild(this.route, this.range, this.ghostRange);
    this.ghostArea = new Sprite(atlas.glyph('white'));
    this.ghostPlate = new Sprite(atlas.glyph('plate'));
    this.ghostTop = new Sprite(atlas.shape('square'));
    this.ring = new Sprite(atlas.glyph('ring'));
    for (const s of [this.ghostPlate, this.ghostTop, this.ring]) s.anchor.set(0.5);
    this.ghostArea.alpha = 0.3;
    this.ghostPlate.alpha = 0.7;
    this.ghostTop.alpha = 0.8;
    this.ring.tint = 0xffe7a8;
    this.over.addChild(this.ghostArea, this.ghostPlate, this.ghostTop, this.ring);
    this.setGhost(null);
    this.setSelection(null);
  }

  setRoute(map: MapSpec, cells: readonly number[] | null, style: RouteStyle): void {
    const g = this.route;
    g.clear();
    if (!cells || cells.length < 2) return;
    const { color, alpha, width } = ROUTE[style];
    const x = (cell: number): number => ((cell % map.cols) + 0.5) * CELL;
    const y = (cell: number): number => (Math.floor(cell / map.cols) + 0.5) * CELL;
    g.moveTo(x(cells[0]!), y(cells[0]!));
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1]!;
      const cell = cells[i]!;
      const next = cells[i + 1];
      // Skip points in the middle of a straight run: fewer vertices, cleaner joins.
      if (next !== undefined && cell - prev === next - cell) continue;
      g.lineTo(x(cell), y(cell));
    }
    g.stroke({ color, alpha, width, cap: 'round', join: 'round' });
    for (let i = ARROW_EVERY; i < cells.length - 1; i += ARROW_EVERY) {
      const ax = x(cells[i]!);
      const ay = y(cells[i]!);
      const dx = x(cells[i + 1]!) - ax;
      const dy = y(cells[i + 1]!) - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const s = width * 1.5;
      g.poly([ax + ux * s, ay + uy * s, ax - ux * s - uy * s, ay - uy * s + ux * s, ax - ux * s + uy * s, ay - uy * s - ux * s]);
    }
    g.fill({ color, alpha: Math.min(1, alpha + 0.15) });
  }

  /** A fixed route through world points: the same line and arrowheads, spaced by distance along it. */
  setRoutePath(points: readonly Point[], style: RouteStyle): void {
    const g = this.route;
    g.clear();
    if (points.length < 2) return;
    const { color, alpha, width } = ROUTE[style];
    g.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
    g.stroke({ color, alpha, width, cap: 'round', join: 'round' });
    const s = width * 1.5;
    let next = ARROW_SPACING / 2;
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
      if (len === 0) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      for (; next <= walked + len; next += ARROW_SPACING) {
        const ax = a.x + ux * (next - walked);
        const ay = a.y + uy * (next - walked);
        g.poly([ax + ux * s, ay + uy * s, ax - ux * s - uy * s, ay - uy * s + ux * s, ax - ux * s + uy * s, ay - uy * s - ux * s]);
      }
      walked += len;
    }
    g.fill({ color, alpha: Math.min(1, alpha + 0.15) });
  }

  setGhost(ghost: GhostView | null): void {
    const show = ghost !== null;
    this.ghostArea.visible = show;
    this.ghostPlate.visible = show && !!ghost.look?.plate;
    this.ghostTop.visible = show;
    if (!ghost) {
      this.ghostRange.clear();
      return;
    }
    const { box, valid, look } = ghost;
    const cx = (box.col + box.w / 2) * CELL;
    const cy = (box.row + box.h / 2) * CELL;
    const span = Math.min(box.w, box.h) * CELL;
    const tint = valid ? VALID : INVALID;
    this.ghostArea.position.set(box.col * CELL, box.row * CELL);
    this.ghostArea.scale.set((box.w * CELL) / WHITE, (box.h * CELL) / WHITE);
    this.ghostArea.tint = tint;
    this.ghostPlate.position.set(cx, cy);
    this.ghostPlate.scale.set((span * 0.9) / ATLAS_UNIT);
    this.ghostPlate.tint = 0x3a3027;
    this.ghostTop.texture = this.atlas.shape(look?.shape ?? 'square');
    this.ghostTop.position.set(cx, cy);
    this.ghostTop.scale.set((span * (look?.size ?? 0.5)) / ATLAS_UNIT);
    this.ghostTop.tint = valid ? (look?.color ?? 0xffffff) : INVALID;
    drawRange(this.ghostRange, cx, cy, ghost.range, tint);
  }

  setSelection(sel: SelectionView | null): void {
    this.ring.visible = sel !== null;
    if (!sel) {
      this.range.clear();
      return;
    }
    this.ring.position.set(sel.x, sel.y);
    this.ring.scale.set((sel.span * 1.05) / ATLAS_UNIT);
    drawRange(this.range, sel.x, sel.y, sel.range, 0xffe7a8);
  }
}

function drawRange(g: Graphics, x: number, y: number, r: number, color: number): void {
  g.clear();
  if (r <= 0) return;
  g.circle(x, y, r).fill({ color, alpha: 0.07 }).stroke({ color, width: 3, alpha: 0.6 });
}
