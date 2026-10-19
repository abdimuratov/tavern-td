import { describe, expect, it } from 'vitest';
import { clamp, fitCamera, fitScale, pan, screenToWorld, worldToScreen, worldTransform, zoomAt } from '../src/render/camera';

const screen = { width: 800, height: 400 };
const world = { width: 768, height: 448 };

describe('camera', () => {
  it('fits the whole board and centres it', () => {
    const cam = fitCamera(screen, world);
    expect(world.width * cam.scale).toBeLessThanOrEqual(screen.width);
    expect(world.height * cam.scale).toBeLessThanOrEqual(screen.height);
    expect(cam.x * 2 + world.width * cam.scale).toBeCloseTo(screen.width);
  });

  it('keeps the world point under the anchor fixed while zooming', () => {
    const cam = fitCamera(screen, world);
    const anchor = { x: 300, y: 150 };
    const before = screenToWorld(cam, anchor);
    const after = screenToWorld(zoomAt(cam, anchor, 2, screen, world), anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('never zooms out past fit or in past 4× fit', () => {
    const cam = fitCamera(screen, world);
    const min = fitScale(screen, world);
    expect(zoomAt(cam, { x: 0, y: 0 }, 0.01, screen, world).scale).toBeCloseTo(min);
    expect(zoomAt(cam, { x: 0, y: 0 }, 100, screen, world).scale).toBeCloseTo(min * 4);
  });

  it('stops the board from being dragged off screen', () => {
    const zoomed = zoomAt(fitCamera(screen, world), { x: 400, y: 200 }, 3, screen, world);
    const flung = clamp({ ...zoomed, x: 5000, y: -5000 }, screen, world);
    expect(flung.x).toBeLessThanOrEqual(16);
    expect(flung.y + world.height * flung.scale).toBeGreaterThanOrEqual(screen.height - 16);
  });
});

describe('the mirrored camera (a Versus Guest\'s board)', () => {
  const W = world.width;
  const points = [{ x: 0, y: 0 }, { x: 100, y: 37 }, { x: W, y: world.height }, { x: 512.5, y: 300 }];
  const zoomed = zoomAt(fitCamera(screen, world), { x: 300, y: 150 }, 2.5, screen, world);

  it('round-trips world and screen points both ways, mirrored or not', () => {
    for (const cam of [fitCamera(screen, world), zoomed]) {
      for (const mirror of [0, W]) {
        for (const p of points) {
          const back = screenToWorld(cam, worldToScreen(cam, p, mirror), mirror);
          expect(back.x).toBeCloseTo(p.x);
          expect(back.y).toBeCloseTo(p.y);
        }
        const s = { x: 123, y: 45 };
        const again = worldToScreen(cam, screenToWorld(cam, s, mirror), mirror);
        expect(again.x).toBeCloseTo(s.x);
        expect(again.y).toBeCloseTo(s.y);
      }
    }
  });

  it('draws the world\'s left edge on the right and keeps y as it is', () => {
    const cam = fitCamera(screen, world);
    const plain = { left: worldToScreen(cam, { x: 0, y: 50 }), right: worldToScreen(cam, { x: W, y: 50 }) };
    const mirrored = { left: worldToScreen(cam, { x: 0, y: 50 }, W), right: worldToScreen(cam, { x: W, y: 50 }, W) };
    expect(mirrored.left.x).toBeCloseTo(plain.right.x);
    expect(mirrored.right.x).toBeCloseTo(plain.left.x);
    expect(mirrored.left.y).toBeCloseTo(plain.left.y);
    // A point a quarter in from the left is a quarter in from the right.
    expect(worldToScreen(cam, { x: W / 4, y: 0 }, W).x).toBeCloseTo(worldToScreen(cam, { x: (3 * W) / 4, y: 0 }).x);
  });

  it('places the world container to match: position + world × scale is worldToScreen', () => {
    for (const cam of [fitCamera(screen, world), zoomed]) {
      for (const mirror of [0, W]) {
        const t = worldTransform(cam, mirror);
        expect(Math.sign(t.scaleX)).toBe(mirror > 0 ? -1 : 1);
        expect(t.scaleY).toBeCloseTo(cam.scale);
        for (const p of points) {
          const s = worldToScreen(cam, p, mirror);
          expect(t.x + p.x * t.scaleX).toBeCloseTo(s.x);
          expect(t.y + p.y * t.scaleY).toBeCloseTo(s.y);
        }
      }
    }
  });

  it('keeps the world point under a pinch or wheel fixed while zooming, mirrored', () => {
    const anchor = { x: 610, y: 120 };
    const before = screenToWorld(zoomed, anchor, W);
    const after = screenToWorld(zoomAt(zoomed, anchor, 1.7, screen, world), anchor, W);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('moves the board with the finger: a drag right moves every world point right on screen', () => {
    const p = { x: 200, y: 100 };
    for (const mirror of [0, W]) {
      const before = worldToScreen(zoomed, p, mirror);
      const after = worldToScreen(pan(zoomed, 30, -12), p, mirror);
      expect(after.x - before.x).toBeCloseTo(30);
      expect(after.y - before.y).toBeCloseTo(-12);
    }
  });
});
