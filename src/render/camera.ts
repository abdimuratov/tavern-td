/**
 * Screen-space view of the board: screen = view × scale + (x, y). The view is
 * the world itself, or, on a mirrored board (a Versus Guest's, so its Field is
 * on the right), the world flipped left to right about its width. Fitting,
 * panning, zooming and clamping all work on the view, so they behave the same
 * either way; only the conversions to and from world points take `mirror`.
 */
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

/** A view x as a world x, or back: the flip about `mirror` is its own inverse. 0 for a board that isn't mirrored. */
function flipX(x: number, mirror: number): number {
  return mirror > 0 ? mirror - x : x;
}

/** The world point under screen point `p`. `mirror` is the world's width on a mirrored board, 0 otherwise. */
export function screenToWorld(cam: Camera, p: Point, mirror = 0): Point {
  return { x: flipX((p.x - cam.x) / cam.scale, mirror), y: (p.y - cam.y) / cam.scale };
}

/** Where world point `p` is on screen; the inverse of screenToWorld. */
export function worldToScreen(cam: Camera, p: Point, mirror = 0): Point {
  return { x: cam.x + flipX(p.x, mirror) * cam.scale, y: cam.y + p.y * cam.scale };
}

/**
 * The world container's position and scale for this camera: on a mirrored
 * board the x scale is negative and the origin sits at the world's right
 * edge, so screen = position + world × scale matches worldToScreen.
 */
export function worldTransform(cam: Camera, mirror = 0): { x: number; y: number; scaleX: number; scaleY: number } {
  return mirror > 0
    ? { x: cam.x + mirror * cam.scale, y: cam.y, scaleX: -cam.scale, scaleY: cam.scale }
    : { x: cam.x, y: cam.y, scaleX: cam.scale, scaleY: cam.scale };
}

export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/**
 * Zoom by `factor`, keeping the point under `anchor` fixed on screen.
 * Zoom stops at 4× fit, or at `maxScale` if that is further: a big Map on a
 * phone needs more than 4× before a cell is large enough to tap.
 */
export function zoomAt(cam: Camera, anchor: Point, factor: number, screen: Size, world: Size, maxScale = 0): Camera {
  const min = fitScale(screen, world);
  const max = Math.max(min * MAX_ZOOM_OVER_FIT, maxScale);
  const scale = Math.min(max, Math.max(min, cam.scale * factor));
  // In view space: the same view point stays under the anchor, so the same world point does, mirrored or not.
  const v = screenToWorld(cam, anchor);
  return { scale, x: anchor.x - v.x * scale, y: anchor.y - v.y * scale };
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
