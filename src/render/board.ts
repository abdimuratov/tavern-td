import { Application, Container, Graphics } from 'pixi.js';
import { type Camera, type Point, type Size, clamp, fitCamera, pan, screenToWorld, zoomAt } from './camera';
import { attachGestures } from './gestures';

export const CELL = 32;

export interface BoardOptions {
  cols: number;
  rows: number;
  /** Called with the grid cell under a tap, or null when the tap missed the board. */
  onTap(cell: { col: number; row: number } | null): void;
}

export interface Board {
  resize(screen: Size): void;
  destroy(): void;
}

const COLORS = {
  background: 0x12100e,
  ground: 0x2a241d,
  groundAlt: 0x2f2820,
  gridLine: 0x3b3227,
  border: 0x6b5a43,
  marker: 0xe0a64a,
};

/** An empty grid the player can pan, zoom and tap. Phase 0's stand-in for a Map. */
export async function createBoard(host: HTMLElement, opts: BoardOptions): Promise<Board> {
  const app = new Application();
  await app.init({
    background: COLORS.background,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    width: host.clientWidth,
    height: host.clientHeight,
    preference: 'webgl',
  });
  host.appendChild(app.canvas);

  const world: Size = { width: opts.cols * CELL, height: opts.rows * CELL };
  const layer = new Container();
  app.stage.addChild(layer);

  const ground = new Graphics();
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      ground.rect(c * CELL, r * CELL, CELL, CELL).fill((r + c) % 2 ? COLORS.groundAlt : COLORS.ground);
    }
  }
  for (let c = 0; c <= opts.cols; c++) ground.moveTo(c * CELL, 0).lineTo(c * CELL, world.height);
  for (let r = 0; r <= opts.rows; r++) ground.moveTo(0, r * CELL).lineTo(world.width, r * CELL);
  ground.stroke({ color: COLORS.gridLine, width: 1 });
  ground.rect(0, 0, world.width, world.height).stroke({ color: COLORS.border, width: 3 });
  layer.addChild(ground);

  const marker = new Graphics()
    .roundRect(3, 3, CELL - 6, CELL - 6, 6)
    .stroke({ color: COLORS.marker, width: 3 });
  marker.visible = false;
  layer.addChild(marker);

  let screen: Size = { width: app.screen.width, height: app.screen.height };
  let cam: Camera = fitCamera(screen, world);
  const apply = (next: Camera): void => {
    cam = clamp(next, screen, world);
    layer.position.set(cam.x, cam.y);
    layer.scale.set(cam.scale);
  };
  apply(cam);

  const detach = attachGestures(app.canvas, {
    pan: (dx, dy) => apply(pan(cam, dx, dy)),
    zoom: (anchor, factor) => apply(zoomAt(cam, anchor, factor, screen, world)),
    tap: (p: Point) => {
      const w = screenToWorld(cam, p);
      const col = Math.floor(w.x / CELL);
      const row = Math.floor(w.y / CELL);
      const inside = col >= 0 && row >= 0 && col < opts.cols && row < opts.rows;
      marker.visible = inside;
      if (inside) marker.position.set(col * CELL, row * CELL);
      opts.onTap(inside ? { col, row } : null);
    },
  });

  return {
    resize(next) {
      app.renderer.resize(next.width, next.height);
      // Keep the zoom relative to "fit", so rotating or resizing doesn't strand the view.
      const ratio = cam.scale / fitCamera(screen, world).scale;
      screen = next;
      const fit = fitCamera(screen, world);
      apply(zoomAt(fit, { x: screen.width / 2, y: screen.height / 2 }, ratio, screen, world));
    },
    destroy() {
      detach();
      app.destroy(true, { children: true });
    },
  };
}
