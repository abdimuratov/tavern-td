import type { Container, Sprite } from 'pixi.js';
import { CELL, type Creep, type GameState, type Projectile, type Tower } from '../sim';
import { ATLAS_UNIT, type Atlas } from './atlas';
import { cellsBox, towerCells } from './footprint';
import type { CreepLook, LookCache, TowerLook } from './look';
import { ObjectPool, SpritePool } from './pool';

/**
 * The layers entities draw into, bottom to top. Each pool owns one layer: a
 * recycled sprite keeps its old place among its siblings, so two kinds of
 * sprite sharing a layer could swap order (a bar's fill under its back).
 */
export interface EntityLayers {
  halos: Container;
  plates: Container;
  towers: Container;
  ground: Container;
  projectiles: Container;
  shadows: Container;
  air: Container;
  barBacks: Container;
  bars: Container;
}

interface CreepView {
  id: number;
  spec: string;
  look: CreepLook;
  air: boolean;
  /** Positions at the previous and the latest tick, for smoothing between them. */
  px: number;
  py: number;
  x: number;
  y: number;
  /** World units across. */
  size: number;
  /** Last HP fraction and status shown, so sprites change only when they do. */
  hp: number;
  status: number;
  body: Sprite | null;
  shadow: Sprite | null;
  barBack: Sprite | null;
  barFill: Sprite | null;
}

interface TowerView {
  id: number;
  spec: string;
  halo: Sprite | null;
  plate: Sprite | null;
  top: Sprite | null;
}

interface ShotView {
  id: number;
  spec: string;
  px: number;
  py: number;
  x: number;
  y: number;
  sprite: Sprite | null;
}

/** A creep that moves further than this in one tick was sent back to the spawn: jump, don't glide. */
const TELEPORT = CELL * 2;
const BAR_W = 34;
const BAR_H = 5;
const WHITE = 8;
const SHADOW_DROP = 14;

const STATUS_NONE = 0;
const STATUS_SLOW = 1;
const STATUS_POISON = 2;
const STATUS_STUN = 3;
const STATUS_TINT = [0xffffff, 0x8fd0ff, 0x9de07a, 0xffe27a];

function statusOf(c: Creep): number {
  let out = STATUS_NONE;
  for (let i = 0; i < c.status.length; i++) {
    const kind = c.status[i]!.kind;
    if (kind === 'stun') return STATUS_STUN;
    if (kind === 'slow') out = STATUS_SLOW;
    else if (kind === 'poison' && out === STATUS_NONE) out = STATUS_POISON;
  }
  return out;
}

/** Halfway between a creep's colour and its status colour, so a slowed creep reads blue whatever its own colour. */
function mix(a: number, b: number): number {
  const r = (((a >> 16) & 255) + ((b >> 16) & 255)) >> 1;
  const g = (((a >> 8) & 255) + ((b >> 8) & 255)) >> 1;
  const bl = ((a & 255) + (b & 255)) >> 1;
  return (r << 16) | (g << 8) | bl;
}

function hpColour(frac: number): number {
  return frac > 0.5 ? 0x6fdc5a : frac > 0.25 ? 0xf2c14e : 0xf0503c;
}

/**
 * Sprites for every creep, tower and projectile. `sync` runs after each tick
 * and walks the state's id-sorted lists against the views in step, so it
 * needs no lookups and allocates nothing in steady play; `draw` runs each
 * frame and only moves sprites.
 */
export class Entities {
  private creeps: CreepView[] = [];
  private creepsNext: CreepView[] = [];
  private towers: TowerView[] = [];
  private towersNext: TowerView[] = [];
  private shots: ShotView[] = [];
  private shotsNext: ShotView[] = [];

  private readonly creepViews = new ObjectPool<CreepView>(() => ({
    id: 0, spec: '', look: { shape: 'circle', color: 0, size: 0 }, air: false,
    px: 0, py: 0, x: 0, y: 0, size: 0, hp: 1, status: 0, body: null, shadow: null, barBack: null, barFill: null,
  }));
  private readonly towerViews = new ObjectPool<TowerView>(() => ({ id: 0, spec: '', halo: null, plate: null, top: null }));
  private readonly shotViews = new ObjectPool<ShotView>(() => ({ id: 0, spec: '', px: 0, py: 0, x: 0, y: 0, sprite: null }));

  private readonly ground: SpritePool;
  private readonly air: SpritePool;
  private readonly shadows: SpritePool;
  private readonly barBacks: SpritePool;
  private readonly bars: SpritePool;
  private readonly halos: SpritePool;
  private readonly plates: SpritePool;
  private readonly tops: SpritePool;
  private readonly projectiles: SpritePool;

  constructor(private readonly atlas: Atlas, layers: EntityLayers, private looks: LookCache) {
    this.ground = new SpritePool(layers.ground, atlas.shape('circle'));
    this.air = new SpritePool(layers.air, atlas.shape('chevron'));
    this.shadows = new SpritePool(layers.shadows, atlas.glyph('shadow'));
    this.barBacks = new SpritePool(layers.barBacks, atlas.glyph('white'));
    this.bars = new SpritePool(layers.bars, atlas.glyph('white'));
    this.halos = new SpritePool(layers.halos, atlas.glyph('glow'));
    this.plates = new SpritePool(layers.plates, atlas.glyph('plate'));
    this.tops = new SpritePool(layers.towers, atlas.shape('square'));
    this.projectiles = new SpritePool(layers.projectiles, atlas.glyph('glow'));
  }

  /** Drops every view, for a new Run. */
  reset(looks: LookCache): void {
    for (const v of this.creeps) this.releaseCreep(v);
    for (const v of this.towers) this.releaseTower(v);
    for (const v of this.shots) this.releaseShot(v);
    this.creeps.length = 0;
    this.towers.length = 0;
    this.shots.length = 0;
    this.looks = looks;
  }

  /** Where a creep was at the last tick, for effects on creeps the tick just removed. */
  creepPosition(id: number): { readonly x: number; readonly y: number } | null {
    return byId(this.creeps, id) ?? null;
  }

  creepSpec(id: number): string | null {
    return byId(this.creeps, id)?.spec ?? null;
  }

  /** The tower spec that fired a projectile, which may outlive its tower. */
  shotSpec(id: number): string | null {
    return byId(this.shots, id)?.spec ?? null;
  }

  sync(state: GameState): void {
    this.syncCreeps(state.creeps);
    this.syncTowers(state);
    this.syncShots(state.projectiles);
  }

  draw(alpha: number): void {
    for (let i = 0; i < this.creeps.length; i++) {
      const v = this.creeps[i]!;
      const x = v.px + (v.x - v.px) * alpha;
      const y = v.py + (v.y - v.py) * alpha;
      v.body!.position.set(x, y);
      if (v.shadow) v.shadow.position.set(x + SHADOW_DROP * 0.6, y + SHADOW_DROP);
      if (v.barBack) {
        const top = y - v.size * 0.62 - (v.air ? 6 : 0);
        v.barBack.position.set(x, top);
        v.barFill!.position.set(x - BAR_W / 2, top);
      }
    }
    for (let i = 0; i < this.shots.length; i++) {
      const v = this.shots[i]!;
      v.sprite!.position.set(v.px + (v.x - v.px) * alpha, v.py + (v.y - v.py) * alpha);
    }
  }

  private syncCreeps(list: readonly Creep[]): void {
    const views = this.creeps;
    const out = this.creepsNext;
    let j = 0;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      while (j < views.length && views[j]!.id < c.id) this.releaseCreep(views[j++]!);
      let v: CreepView;
      if (j < views.length && views[j]!.id === c.id) {
        v = views[j++]!;
        const dx = c.x - v.x;
        const dy = c.y - v.y;
        const far = dx * dx + dy * dy > TELEPORT * TELEPORT;
        v.px = far ? c.x : v.x;
        v.py = far ? c.y : v.y;
        v.x = c.x;
        v.y = c.y;
        if (v.air && (dx !== 0 || dy !== 0) && !far) v.body!.rotation = Math.atan2(dy, dx);
      } else {
        v = this.addCreep(c);
      }
      this.updateCreep(v, c);
      out[w++] = v;
    }
    while (j < views.length) this.releaseCreep(views[j++]!);
    out.length = w;
    this.creepsNext = views;
    this.creeps = out;
  }

  private addCreep(c: Creep): CreepView {
    const v = this.creepViews.acquire();
    const look = this.looks.creep(c.spec);
    v.id = c.id;
    v.spec = c.spec;
    v.look = look;
    v.air = c.air;
    v.px = v.x = c.x;
    v.py = v.y = c.y;
    v.size = look.size * CELL;
    v.hp = 1;
    v.status = STATUS_NONE;
    const body = (c.air ? this.air : this.ground).acquire(this.atlas.shape(look.shape));
    body.tint = look.color;
    body.scale.set(v.size / ATLAS_UNIT);
    body.position.set(c.x, c.y);
    v.body = body;
    if (c.air) {
      const shadow = this.shadows.acquire();
      shadow.scale.set((v.size * 0.9) / ATLAS_UNIT);
      shadow.position.set(c.x, c.y + SHADOW_DROP);
      v.shadow = shadow;
    }
    return v;
  }

  private updateCreep(v: CreepView, c: Creep): void {
    const frac = c.maxHp > 0 ? Math.max(0, c.hp / c.maxHp) : 0;
    // Bars appear once a creep is hurt; a full-health Wave stays uncluttered.
    if (frac < 0.999) {
      if (!v.barBack) {
        v.barBack = this.barBacks.acquire();
        v.barBack.tint = 0x15110d;
        v.barBack.scale.set((BAR_W + 2) / WHITE, (BAR_H + 2) / WHITE);
        v.barFill = this.bars.acquire();
        v.barFill.anchor.set(0, 0.5);
        v.barFill.scale.y = BAR_H / WHITE;
        v.hp = 1;
      }
      if (Math.abs(frac - v.hp) > 0.004 || v.barFill!.tint === 0xffffff) this.setBar(v, frac);
    } else if (v.barFill && v.hp < 0.999) {
      // Regenerated to full: show it full rather than stuck where it was.
      this.setBar(v, 1);
    }
    const status = c.status.length === 0 ? STATUS_NONE : statusOf(c);
    if (status !== v.status) {
      v.status = status;
      v.body!.tint = status === STATUS_NONE ? v.look.color : mix(v.look.color, STATUS_TINT[status]!);
    }
  }

  private setBar(v: CreepView, frac: number): void {
    v.barFill!.scale.x = (BAR_W * frac) / WHITE;
    v.barFill!.tint = hpColour(frac);
    v.hp = frac;
  }

  private releaseCreep(v: CreepView): void {
    if (v.body) (v.air ? this.air : this.ground).release(v.body);
    if (v.shadow) this.shadows.release(v.shadow);
    if (v.barBack) {
      this.barBacks.release(v.barBack);
      v.barFill!.anchor.set(0.5);
      this.bars.release(v.barFill!);
    }
    v.body = v.shadow = v.barBack = v.barFill = null;
    this.creepViews.release(v);
  }

  private syncTowers(state: GameState): void {
    const list = state.towers;
    const views = this.towers;
    const out = this.towersNext;
    let j = 0;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      while (j < views.length && views[j]!.id < t.id) this.releaseTower(views[j++]!);
      let v: TowerView;
      if (j < views.length && views[j]!.id === t.id) {
        v = views[j++]!;
        if (v.spec !== t.spec || v.top!.x !== t.x || v.top!.y !== t.y) {
          // A new spec, or a swap or slate move put it somewhere else.
          this.releaseSprites(v);
          this.dressTower(v, t, state);
        }
      } else {
        v = this.towerViews.acquire();
        v.id = t.id;
        this.dressTower(v, t, state);
      }
      out[w++] = v;
    }
    while (j < views.length) this.releaseTower(views[j++]!);
    out.length = w;
    this.towersNext = views;
    this.towers = out;
  }

  private dressTower(v: TowerView, t: Tower, state: GameState): void {
    const look: TowerLook = this.looks.tower(t.spec);
    const box = cellsBox(state.map, towerCells(t));
    const span = Math.min(box.w, box.h) * CELL;
    v.spec = t.spec;
    if (look.halo !== undefined) {
      const halo = this.halos.acquire();
      halo.tint = look.halo;
      halo.alpha = 0.55;
      halo.scale.set((span * 1.5) / ATLAS_UNIT);
      halo.position.set(t.x, t.y);
      v.halo = halo;
    }
    if (look.plate) {
      const plate = this.plates.acquire();
      plate.tint = look.plateColor ?? 0x3a3027;
      plate.scale.set((span * 0.9) / ATLAS_UNIT);
      plate.position.set(t.x, t.y);
      v.plate = plate;
    }
    const top = this.tops.acquire(this.atlas.shape(look.shape));
    top.tint = look.color;
    top.scale.set((span * look.size) / ATLAS_UNIT);
    top.position.set(t.x, t.y);
    v.top = top;
  }

  private releaseSprites(v: TowerView): void {
    if (v.halo) this.halos.release(v.halo);
    if (v.plate) this.plates.release(v.plate);
    if (v.top) this.tops.release(v.top);
    v.halo = v.plate = v.top = null;
  }

  private releaseTower(v: TowerView): void {
    this.releaseSprites(v);
    this.towerViews.release(v);
  }

  private syncShots(list: readonly Projectile[]): void {
    const views = this.shots;
    const out = this.shotsNext;
    let j = 0;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      while (j < views.length && views[j]!.id < p.id) this.releaseShot(views[j++]!);
      let v: ShotView;
      if (j < views.length && views[j]!.id === p.id) {
        v = views[j++]!;
        v.px = v.x;
        v.py = v.y;
      } else {
        v = this.shotViews.acquire();
        v.id = p.id;
        v.spec = p.spec;
        // A new shot starts at its tower; smoothing from there hides the first tick's jump.
        v.px = v.x = p.x;
        v.py = v.y = p.y;
        const look = this.looks.tower(p.spec);
        const s = this.projectiles.acquire();
        s.tint = look.shot;
        s.blendMode = 'add';
        s.scale.set(20 / ATLAS_UNIT);
        v.sprite = s;
      }
      v.x = p.x;
      v.y = p.y;
      out[w++] = v;
    }
    while (j < views.length) this.releaseShot(views[j++]!);
    out.length = w;
    this.shotsNext = views;
    this.shots = out;
  }

  private releaseShot(v: ShotView): void {
    if (v.sprite) this.projectiles.release(v.sprite);
    v.sprite = null;
    this.shotViews.release(v);
  }
}

function byId<T extends { id: number }>(list: readonly T[], id: number): T | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = list[mid]!;
    if (item.id === id) return item;
    if (item.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}
