import type { Container, Sprite } from 'pixi.js';
import { ATLAS_UNIT, type Atlas } from './atlas';
import { SpritePool } from './pool';

/** A sign on one structure that it wants attention: a Draft gem not yet settled, one that can merge, a Recipe ready to fuse. */
export interface BoardMark {
  readonly x: number;
  readonly y: number;
  /** World units across the footprint. */
  readonly span: number;
  readonly color: number;
  /** Corner brackets for "not settled yet", a ring for "look here". */
  readonly style: 'brackets' | 'ring';
  /** Breathes, so it catches the eye. */
  readonly pulse?: boolean;
}

const PULSE_MS = 1100;

/** Marks drawn over the towers. They're rebuilt only when the Game Mode's marks change; a pulse just moves alpha and scale. */
export class Marks {
  private readonly rings: SpritePool;
  private readonly brackets: SpritePool;
  private live: { sprite: Sprite; pool: SpritePool; pulse: boolean; base: number }[] = [];
  private t = 0;

  constructor(atlas: Atlas, layer: Container) {
    this.rings = new SpritePool(layer, atlas.glyph('ring'));
    this.brackets = new SpritePool(layer, atlas.glyph('brackets'));
  }

  set(marks: readonly BoardMark[]): void {
    for (const m of this.live) m.pool.release(m.sprite);
    this.live = marks.map((m) => {
      const pool = m.style === 'ring' ? this.rings : this.brackets;
      const sprite = pool.acquire();
      const base = (m.span * (m.style === 'ring' ? 1.28 : 0.98)) / ATLAS_UNIT;
      sprite.tint = m.color;
      sprite.position.set(m.x, m.y);
      sprite.scale.set(base);
      sprite.alpha = m.style === 'ring' ? 0.9 : 0.75;
      return { sprite, pool, pulse: m.pulse ?? false, base };
    });
  }

  update(dt: number): void {
    if (this.live.length === 0) return;
    this.t = (this.t + dt) % PULSE_MS;
    // A smooth 0→1→0 without trigonometry: a parabola over the period.
    const k = this.t / PULSE_MS;
    const wave = 4 * k * (1 - k);
    for (const m of this.live) {
      if (!m.pulse) continue;
      m.sprite.alpha = 0.45 + 0.55 * wave;
      m.sprite.scale.set(m.base * (1 + 0.1 * wave));
    }
  }
}
