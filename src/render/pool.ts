import { Container, Sprite, type Texture } from 'pixi.js';

/**
 * Sprites that stay children of one container and are hidden instead of
 * removed, so a Wave of 300 creeps never creates or destroys a display object
 * once the pool has grown to fit.
 */
export class SpritePool {
  private readonly free: Sprite[] = [];

  constructor(readonly layer: Container, private readonly texture: Texture) {}

  acquire(texture: Texture = this.texture): Sprite {
    let s = this.free.pop();
    if (!s) {
      s = new Sprite(texture);
      s.anchor.set(0.5);
      this.layer.addChild(s);
    } else if (s.texture !== texture) {
      s.texture = texture;
    }
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    s.tint = 0xffffff;
    return s;
  }

  release(s: Sprite): void {
    s.visible = false;
    this.free.push(s);
  }
}

/** Plain objects reused the same way, for the per-entity records that hold the sprites. */
export class ObjectPool<T> {
  private readonly free: T[] = [];

  constructor(private readonly make: () => T) {}

  acquire(): T {
    return this.free.pop() ?? this.make();
  }

  release(item: T): void {
    this.free.push(item);
  }
}
