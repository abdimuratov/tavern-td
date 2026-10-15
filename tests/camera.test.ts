import { describe, expect, it } from 'vitest';
import { clamp, fitCamera, fitScale, screenToWorld, zoomAt } from '../src/render/camera';

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
