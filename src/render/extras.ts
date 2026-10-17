import type { Container, Sprite } from 'pixi.js';
import { ATLAS_UNIT, type Atlas } from './atlas';
import type { BoardExtra } from './look';
import { SpritePool } from './pool';

/**
 * What a Game Mode draws besides towers and creeps, such as Element's
 * tornadoes. The list is replaced after every tick; a spin turns on the
 * display clock, so it looks the same at 1× and 3×.
 */
export class Extras {
  private readonly pool: SpritePool;
  private live: { sprite: Sprite; spin: number }[] = [];

  constructor(private readonly atlas: Atlas, layer: Container) {
    this.pool = new SpritePool(layer, atlas.glyph('glow'));
  }

  set(list: readonly BoardExtra[]): void {
    if (list.length === 0 && this.live.length === 0) return;
    // Keep each sprite's angle when the list keeps its order, so a swirl doesn't jump every tick.
    const angles = this.live.map((l) => l.sprite.rotation);
    for (const l of this.live) this.pool.release(l.sprite);
    this.live = list.map((x, i) => {
      const texture = x.glyph === 'ring' || x.glyph === 'glow' || x.glyph === 'swirl' ? this.atlas.glyph(x.glyph) : this.atlas.shape(x.glyph);
      const sprite = this.pool.acquire(texture);
      sprite.tint = x.color;
      sprite.alpha = x.alpha;
      sprite.scale.set(x.size / ATLAS_UNIT);
      sprite.position.set(x.x, x.y);
      sprite.rotation = angles[i] ?? 0;
      return { sprite, spin: x.spin ?? 0 };
    });
  }

  update(dt: number): void {
    for (const l of this.live) if (l.spin !== 0) l.sprite.rotation += (l.spin * Math.PI * 2 * dt) / 1000;
  }
}
