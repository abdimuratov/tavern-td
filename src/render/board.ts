import { Application, Container, Text } from 'pixi.js';
import {
  CELL, findTower, getMode, type GameModeRules, type GameState, type Point, type SimEvent, type SplashEffect,
} from '../sim';
import { createAtlas } from './atlas';
import { type Camera, type Size, clamp, fitCamera, pan, screenToWorld, worldToScreen, worldTransform, zoomAt } from './camera';
import { Effects } from './effects';
import { Entities } from './entities';
import { attachGestures, type PointerKind } from './gestures';
import { Extras } from './extras';
import { createLookCache, type LookCache, type ModeLook } from './look';
import { Marks, type BoardMark } from './marks';
import { Overlay, type GhostView, type RouteStyle, type SelectionView } from './overlay';
import { buildTerrain, TERRAIN_COLORS, type Terrain } from './terrain';

export interface BoardOptions {
  /** A tap or click, at a world position (it may be off the Map). */
  onTap(p: Point, kind: PointerKind): void;
  /** The mouse over the board at a world position, or null when it leaves. Re-sent when the camera moves under it. */
  onHover?(p: Point | null): void;
  /** A right-click at a world position. */
  onSecondary?(p: Point): void;
  /**
   * Draws the Map flipped left to right, as a Versus Guest sees it, so its
   * Field is on the right beside the HUD. Taps still arrive as world points,
   * and the board's text is turned back so it reads.
   */
  readonly mirror?: boolean;
}

export interface Board {
  /** Shows a Run: draws its Map and drops every view of the last one. */
  setRun(state: GameState, look?: Partial<ModeLook>): void;
  /** After every tick, before the state moves on: effects from its events, then the views catch up. */
  afterStep(state: GameState, events: readonly SimEvent[]): void;
  /** Once per display frame. `alpha` is how far between the last two ticks to draw; `dt` is real milliseconds. */
  render(alpha: number, dt: number): void;
  setRoute(cells: readonly number[] | null, style: RouteStyle): void;
  /** Several routes as cells, such as one from each gate of a mazing Map, and any drawn faint under them. */
  setRoutes(routes: readonly (readonly number[])[], style: RouteStyle, faint?: readonly (readonly number[])[]): void;
  /** The routes as lines through world points, for Maps whose creeps walk fixed routes. */
  setRoutePaths(lines: readonly (readonly Point[])[], style: RouteStyle): void;
  setGhost(ghost: GhostView | null): void;
  setSelection(sel: SelectionView | null): void;
  /** The Game Mode's marks on structures; the list replaces the last one. */
  setMarks(marks: readonly BoardMark[]): void;
  /** The cell grid lines (the Show grid setting). They still fade out when zoomed far out. */
  setShowGrid(show: boolean): void;
  readonly looks: LookCache;
  /** Where a world point is on the page, in CSS pixels: for tests and debugging. */
  worldToClient(p: Point): Point;
  destroy(): void;
}

/** However big the Map, zoom goes at least until a cell is this many CSS pixels: a 2×2 gem then spans ~2 thumbs. */
const MAX_CELL_PX = 64;

/**
 * Turns every Text under `root` back the right way round inside a mirrored
 * world: its own x scale undoes the world's, and its rotation is reversed so
 * a word running up a banner still runs up.
 */
function unmirrorText(root: Container): void {
  for (const child of root.children) {
    if (child instanceof Text) {
      child.scale.x = -child.scale.x;
      child.rotation = -child.rotation;
    } else if (child instanceof Container) {
      unmirrorText(child);
    }
  }
}

/**
 * The Pixi view of a Run: the Map, its towers, creeps, projectiles and
 * effects, under a pan-and-zoom camera that fits the board to its host
 * element. It never steps the game; the Run controller drives it.
 */
export async function createBoard(host: HTMLElement, opts: BoardOptions): Promise<Board> {
  const app = new Application();
  await app.init({
    background: TERRAIN_COLORS.background,
    antialias: true,
    autoDensity: true,
    autoStart: false,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
    preference: 'webgl',
    // Our own gestures handle input; Pixi's hit-testing would only cost time.
    eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
  });
  app.ticker.stop();
  app.stage.eventMode = 'none';
  app.stage.interactiveChildren = false;
  host.appendChild(app.canvas);

  const atlas = createAtlas();
  const world = new Container();
  app.stage.addChild(world);
  const terrainLayer = new Container();
  const overlay = new Overlay(atlas);
  const layers = {
    halos: new Container(),
    plates: new Container(),
    rings: new Container(),
    towers: new Container(),
    pips: new Container(),
    ground: new Container(),
    creepMarks: new Container(),
    projectiles: new Container(),
    labels: new Container(),
    shadows: new Container(),
    air: new Container(),
    barBacks: new Container(),
    bars: new Container(),
  };
  const effectsUnder = new Container();
  const effectsOver = new Container();
  const marksLayer = new Container();
  const extrasLayer = new Container();
  world.addChild(
    terrainLayer, overlay.under, effectsUnder, layers.halos, layers.plates, layers.rings, layers.towers, layers.pips, layers.labels, marksLayer,
    overlay.over, layers.ground, layers.creepMarks, layers.projectiles, layers.shadows, layers.air, extrasLayer,
    layers.barBacks, layers.bars, effectsOver,
  );
  const marks = new Marks(atlas, marksLayer);
  const extras = new Extras(atlas, extrasLayer);
  let showGrid = true;

  let rules: GameModeRules | null = null;
  let looks: LookCache = createLookCache({ id: '', towers: {}, creeps: {}, damageTable: {}, setup() {} });
  let map: GameState['map'] | null = null;
  let terrain: Terrain | null = null;
  /** The terrain look it was drawn with, so a new Run on the same Map with other banners (Line Wars' Races) redraws it. */
  let terrainKey = '';
  const mirrored = opts.mirror === true;
  const entities = new Entities(atlas, layers, looks, mirrored);
  const effects = new Effects(atlas, effectsOver, effectsUnder);

  let worldSize: Size = { width: 1, height: 1 };
  let screen: Size = { width: app.screen.width, height: app.screen.height };
  let cam: Camera = fitCamera(screen, worldSize);
  let hover: Point | null = null;
  const maxScale = MAX_CELL_PX / CELL;
  /** The width the world flips about, 0 when it doesn't: what the camera's conversions take. */
  const mirror = (): number => (mirrored ? worldSize.width : 0);
  const toWorld = (p: Point): Point => screenToWorld(cam, p, mirror());

  const apply = (next: Camera): void => {
    cam = clamp(next, screen, worldSize);
    const t = worldTransform(cam, mirror());
    world.position.set(t.x, t.y);
    world.scale.set(t.scaleX, t.scaleY);
    if (terrain) {
      terrain.grid.alpha = Math.min(1, Math.max(0, (cam.scale * CELL - 9) / 12));
      terrain.grid.visible = showGrid;
    }
    if (hover) opts.onHover?.(toWorld(hover));
  };

  const resize = (next: Size): void => {
    if (next.width < 1 || next.height < 1) return;
    if (next.width === screen.width && next.height === screen.height) return;
    app.renderer.resize(next.width, next.height);
    // Keep the zoom relative to "fit", so rotating or resizing doesn't strand the view.
    const ratio = cam.scale / fitCamera(screen, worldSize).scale;
    screen = next;
    const fit = fitCamera(screen, worldSize);
    apply(zoomAt(fit, { x: screen.width / 2, y: screen.height / 2 }, ratio, screen, worldSize, maxScale));
    app.render();
  };
  const observer = new ResizeObserver(() => resize({ width: host.clientWidth, height: host.clientHeight }));
  observer.observe(host);

  const detach = attachGestures(app.canvas, {
    pan: (dx, dy) => apply(pan(cam, dx, dy)),
    zoom: (anchor, factor) => apply(zoomAt(cam, anchor, factor, screen, worldSize, maxScale)),
    tap: (p, kind) => opts.onTap(toWorld(p), kind),
    hover: (p) => {
      hover = p;
      opts.onHover?.(p ? toWorld(p) : null);
    },
    secondary: (p) => opts.onSecondary?.(toWorld(p)),
  });

  function splashRadius(spec: string): number {
    const own = looks.tower(spec).splash;
    if (own !== undefined) return own;
    const effects = rules?.towers[spec]?.attack?.effects;
    if (!effects) return 0;
    let r = 0;
    for (const e of effects) {
      if (e.kind !== 'splash') continue;
      for (const [radius] of (e as SplashEffect).bands) r = Math.max(r, radius);
    }
    return r;
  }

  function showEvents(state: GameState, events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'fire': {
          if (e.projectile !== 0) break;
          // Instant attacks have no projectile to watch, so draw the shot as a beam.
          const t = findTower(state, e.tower);
          const c = entities.creepPosition(e.target);
          if (!t || !c) break;
          const look = looks.tower(t.spec);
          if (look.nova) {
            effects.ring(t.x, t.y, look.shot, rules?.towers[t.spec]?.attack?.range ?? CELL * 4, 320, 0.6);
            break;
          }
          effects.beam(t.x, t.y, c.x, c.y, look.shot);
          effects.flash(c.x, c.y, look.shot, 30);
          const r = splashRadius(t.spec);
          if (r > 0) effects.ring(c.x, c.y, look.shot, r);
          break;
        }
        case 'impact': {
          const spec = entities.shotSpec(e.projectile);
          const look = spec ? looks.tower(spec) : null;
          effects.flash(e.x, e.y, look?.shot ?? 0xffffff, 30);
          const r = spec ? splashRadius(spec) : 0;
          if (r > 0) effects.ring(e.x, e.y, look?.shot ?? 0xffffff, r);
          break;
        }
        case 'hit': {
          if (e.kind !== 'crit') break;
          const c = entities.creepPosition(e.creep);
          if (c) effects.flash(c.x, c.y, 0xffe066, 70, 240);
          break;
        }
        case 'kill': {
          const spec = entities.creepSpec(e.creep);
          effects.burst(e.x, e.y, spec ? looks.creep(spec).color : 0xffffff, CELL * 0.45);
          break;
        }
        case 'leak': {
          const c = entities.creepPosition(e.creep);
          if (c) effects.ring(c.x, c.y, 0xf0503c, CELL * 0.8, 420, 1);
          break;
        }
        case 'placed': {
          const t = findTower(state, e.tower);
          if (t) effects.ring(t.x, t.y, 0xfff2d0, CELL * 0.6, 260, 0.7);
          break;
        }
        case 'changed': {
          const t = findTower(state, e.tower);
          if (t) effects.flash(t.x, t.y, looks.tower(e.spec).color, CELL * 1.4, 320);
          break;
        }
        case 'mode': {
          for (const cue of looks.effects(e, state) ?? []) {
            if (cue.kind === 'ring') effects.ring(cue.x, cue.y, cue.color, cue.size, cue.ms, cue.alpha);
            else if (cue.kind === 'flash') effects.flash(cue.x, cue.y, cue.color, cue.size, cue.ms);
            else if (cue.kind === 'beam') effects.beam(cue.x, cue.y, cue.x2 ?? cue.x, cue.y2 ?? cue.y, cue.color, cue.size, cue.ms);
            else if (cue.kind === 'arc') effects.arc(cue.x, cue.y, cue.x2 ?? cue.x, cue.y2 ?? cue.y, cue.color, cue.size, cue.shape ?? 'circle', cue.lift ?? 0, cue.ms);
            else effects.burst(cue.x, cue.y, cue.color, cue.size);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return {
    get looks() {
      return looks;
    },
    setRun(state, look) {
      rules = getMode(state.modeId);
      looks = createLookCache(rules, look);
      entities.reset(looks);
      effects.clear();
      const terrainLook = looks.terrain(state);
      const key = JSON.stringify(terrainLook);
      if (state.map !== map || !terrain || key !== terrainKey) {
        const newMap = state.map !== map;
        map = state.map;
        terrainKey = key;
        if (terrain) {
          terrainLayer.removeChild(terrain.root);
          terrain.root.destroy({ children: true });
        }
        terrain = buildTerrain(state, terrainLook);
        if (mirrored) unmirrorText(terrain.root);
        terrainLayer.addChild(terrain.root);
        if (newMap) {
          worldSize = { width: map.cols * CELL, height: map.rows * CELL };
          apply(fitCamera(screen, worldSize));
        }
      }
      terrain.grid.visible = showGrid;
      overlay.setGhost(null);
      overlay.setSelection(null);
      marks.set([]);
      entities.sync(state);
      extras.set(looks.extras(state));
    },
    afterStep(state, events) {
      showEvents(state, events);
      entities.sync(state);
      extras.set(looks.extras(state));
    },
    render(alpha, dt) {
      entities.draw(alpha);
      effects.update(dt);
      marks.update(dt);
      extras.update(dt);
      app.render();
    },
    setRoute(cells, style) {
      if (map) overlay.setRoute(map, cells, style);
    },
    setRoutes(routes, style, faint) {
      if (map) overlay.setRoutes(map, routes, style, faint);
    },
    setRoutePaths: (lines, style) => overlay.setRoutePaths(lines, style),
    worldToClient(p) {
      const r = app.canvas.getBoundingClientRect();
      const q = worldToScreen(cam, p, mirror());
      return { x: r.left + q.x, y: r.top + q.y };
    },
    setGhost: (ghost) => overlay.setGhost(ghost),
    setSelection: (sel) => overlay.setSelection(sel),
    setMarks: (list) => marks.set(list),
    setShowGrid(show) {
      showGrid = show;
      if (terrain) terrain.grid.visible = show;
    },
    destroy() {
      observer.disconnect();
      detach();
      atlas.destroy();
      app.destroy(true, { children: true });
    },
  };
}
