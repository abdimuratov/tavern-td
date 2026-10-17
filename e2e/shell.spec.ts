import { expect, type Page, test } from '@playwright/test';

async function boardBox(page: Page) {
  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no box');
  return box;
}

async function tapAt(page: Page, x: number, y: number) {
  const touch = test.info().project.use.hasTouch;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test('a tap on the board registers its cell', async ({ page }) => {
  await page.goto('./');
  const box = await boardBox(page);
  await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('tap-count')).toHaveText('1');
  await expect(page.getByTestId('tap-cell')).toHaveText(/^\d+,\d+$/);
});

test('a drag pans instead of tapping', async ({ page, browserName }) => {
  test.skip(!!test.info().project.use.hasTouch, 'mouse drag only');
  test.skip(browserName === 'webkit', 'WebKit wheel/drag emulation is flaky');
  await page.goto('./');
  const box = await boardBox(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  // Zoom in first, so there's room to pan.
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('tap-count')).toHaveText('0');
});

test('portrait shows the rotate screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByTestId('rotate')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId('rotate')).toBeHidden();
});

test('the manifest makes it installable', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(new URL(href!, page.url()).href)).json();
  expect(manifest).toMatchObject({ name: 'Tavern TD', display: 'standalone', start_url: '/tavern-td/' });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('opens offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('./');
  // The first install announces itself: an installed app that never got this far can't open offline.
  await expect(page.getByTestId('offline-ready')).toHaveText('Ready to play offline.');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled and the precache is complete.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.getByTestId('offline-ready')).toBeHidden();

  await context.setOffline(true);
  await page.reload();
  const box = await boardBox(page);
  await tapAt(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('tap-count')).toHaveText('1');
});
