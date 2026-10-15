/** Screen-space view of the board: screen = world × scale + (x, y). */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const MAX_ZOOM_OVER_FIT = 4;

/** The scale at which the whole board just fits the screen, minus a margin. */
export function fitScale(screen: Size, world: Size, margin = 16): number {
  const w = Math.max(1, screen.width - margin * 2);
  const h = Math.max(1, screen.height - margin * 2);
  return Math.min(w / world.width, h / world.height);
}

export function fitCamera(screen: Size, world: Size, margin = 16): Camera {
  const scale = fitScale(screen, world, margin);
  return {
    scale,
    x: (screen.width - world.width * scale) / 2,
    y: (screen.height - world.height * scale) / 2,
  };
}

export function screenToWorld(cam: Camera, p: Point): Point {
  return { x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale };
}

export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Zoom by `factor`, keeping the world point under `anchor` fixed on screen. */
export function zoomAt(cam: Camera, anchor: Point, factor: number, screen: Size, world: Size): Camera {
  const min = fitScale(screen, world);
  const scale = Math.min(min * MAX_ZOOM_OVER_FIT, Math.max(min, cam.scale * factor));
  const w = screenToWorld(cam, anchor);
  return { scale, x: anchor.x - w.x * scale, y: anchor.y - w.y * scale };
}

/**
 * Keep the board on screen. Along an axis where the board is smaller than the
 * screen it is centred; where it is larger, no gap may open at either edge.
 */
export function clamp(cam: Camera, screen: Size, world: Size, margin = 16): Camera {
  const axis = (pos: number, screenLen: number, worldLen: number): number => {
    const len = worldLen * cam.scale;
    if (len + margin * 2 <= screenLen) return (screenLen - len) / 2;
    return Math.min(margin, Math.max(screenLen - len - margin, pos));
  };
  return {
    scale: cam.scale,
    x: axis(cam.x, screen.width, world.width),
    y: axis(cam.y, screen.height, world.height),
  };
}
