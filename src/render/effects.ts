import type { Container, Sprite } from 'pixi.js';
import { ATLAS_UNIT, type Atlas } from './atlas';
import { ObjectPool, SpritePool } from './pool';

interface Effect {
  sprite: Sprite | null;
  pool: SpritePool | null;
  /** Milliseconds elapsed and total. */
  t: number;
  dur: number;
  /** Scale at the start and the end; for beams only y changes. */
  s0: number;
  s1: number;
  a0: number;
  /** World units per millisecond, for shards. */
  vx: number;
  vy: number;
  beam: boolean;
}

/** Past this many live effects new ones are dropped: a 300-creep splash Wave mustn't cost frames. */
const MAX_EFFECTS = 600;
const SHARDS = 5;
const WHITE = 8;

/**
 * Short-lived hit, kill and splash effects from tick events. Each is a pooled
 * sprite that scales and fades on its own clock, in real time, so effects
 * look the same at 1× and 3×.
 */
export class Effects {
  private active: Effect[] = [];
  private readonly records = new ObjectPool<Effect>(() => ({
    sprite: null, pool: null, t: 0, dur: 1, s0: 1, s1: 1, a0: 1, vx: 0, vy: 0, beam: false,
  }));
  private readonly glows: SpritePool;
  private readonly rings: SpritePool;
  private readonly shards: SpritePool;
  private readonly beams: SpritePool;

  constructor(atlas: Atlas, layer: Container, under: Container) {
    this.glows = new SpritePool(layer, atlas.glyph('glow'));
    this.shards = new SpritePool(layer, atlas.shape('diamond'));
    this.beams = new SpritePool(layer, atlas.glyph('white'));
    this.rings = new SpritePool(under, atlas.glyph('ring'));
  }

  clear(): void {
    for (const e of this.active) this.finish(e);
    this.active.length = 0;
  }

  /** A hit: a quick glow. */
  flash(x: number, y: number, color: number, size: number, dur = 140): void {
    const e = this.spawn(this.glows, x, y, color, dur, (size * 0.6) / ATLAS_UNIT, size / ATLAS_UNIT, 1);
    if (e) e.sprite!.blendMode = 'add';
  }

  /** A splash or a leak: a ring growing to `radius`. */
  ring(x: number, y: number, color: number, radius: number, dur = 260, alpha = 0.85): void {
    this.spawn(this.rings, x, y, color, dur, (radius * 0.5) / ATLAS_UNIT, (radius * 2) / ATLAS_UNIT, alpha);
  }

  /** A kill: a flash and shards flying out. */
  burst(x: number, y: number, color: number, size: number): void {
    this.flash(x, y, color, size * 1.8, 220);
    const turn = Math.random() * Math.PI * 2;
    for (let i = 0; i < SHARDS; i++) {
      const e = this.spawn(this.shards, x, y, color, 320, (size * 0.32) / ATLAS_UNIT, (size * 0.12) / ATLAS_UNIT, 1);
      if (!e) return;
      const a = turn + (i * Math.PI * 2) / SHARDS;
      const speed = (size * 1.6) / 320;
      e.vx = Math.cos(a) * speed;
      e.vy = Math.sin(a) * speed;
      e.sprite!.rotation = a;
    }
  }

  /** An instant attack: a line from tower to target that fades. */
  beam(x0: number, y0: number, x1: number, y1: number, color: number, width = 6, dur = 160): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const e = this.spawn(this.beams, x0, y0, color, dur, width / WHITE, width / WHITE / 3, 0.9);
    if (!e) return;
    const s = e.sprite!;
    s.anchor.set(0, 0.5);
    s.rotation = Math.atan2(dy, dx);
    s.scale.x = Math.sqrt(dx * dx + dy * dy) / WHITE;
    s.blendMode = 'add';
    e.beam = true;
  }

  update(dt: number): void {
    const list = this.active;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      e.t += dt;
      if (e.t >= e.dur) {
        this.finish(e);
        continue;
      }
      const k = e.t / e.dur;
      const s = e.sprite!;
      const scale = e.s0 + (e.s1 - e.s0) * k;
      if (e.beam) s.scale.y = scale;
      else s.scale.set(scale);
      s.alpha = e.a0 * (1 - k * k);
      if (e.vx !== 0 || e.vy !== 0) s.position.set(s.x + e.vx * dt, s.y + e.vy * dt);
      list[w++] = e;
    }
    list.length = w;
  }

  private spawn(pool: SpritePool, x: number, y: number, color: number, dur: number, s0: number, s1: number, a0: number): Effect | null {
    if (this.active.length >= MAX_EFFECTS) return null;
    const e = this.records.acquire();
    const s = pool.acquire();
    s.position.set(x, y);
    s.tint = color;
    s.scale.set(s0);
    s.alpha = a0;
    s.blendMode = 'normal';
    e.sprite = s;
    e.pool = pool;
    e.t = 0;
    e.dur = dur;
    e.s0 = s0;
    e.s1 = s1;
    e.a0 = a0;
    e.vx = 0;
    e.vy = 0;
    e.beam = false;
    this.active.push(e);
    return e;
  }

  private finish(e: Effect): void {
    if (e.sprite && e.pool) {
      if (e.beam) e.sprite.anchor.set(0.5);
      e.pool.release(e.sprite);
    }
    e.sprite = null;
    e.pool = null;
    this.records.release(e);
  }
}
