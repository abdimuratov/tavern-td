import { expect, type Page, test } from '@playwright/test';

// The app boots into the dev sandbox: a 20×12 Map of the test Game Mode with
// 400 gold and Arrow (10 gold) picked in the build menu.
const START_GOLD = '400';
const AFTER_ARROW = '390';

const touch = (): boolean => !!test.info().project.use.hasTouch;

async function boardBox(page: Page) {
  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no box');
  return box;
}

async function tapAt(page: Page, x: number, y: number) {
  if (touch()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Where a cell's centre is on the page, from the app's debug handle. */
async function cellPoint(page: Page, col: number, row: number) {
  await page.waitForFunction(() => !!window.tavern);
  return page.evaluate(([c, r]) => window.tavern!.worldToClient((c + 0.5) * 64, (r + 0.5) * 64), [col, row] as const);
}

/** Builds the picked Arrow on a cell: one click with a mouse, tap then tap again on a phone. */
async function buildAt(page: Page, col: number, row: number) {
  await boardBox(page);
  const { x, y } = await cellPoint(page, col, row);
  await expect(page.getByTestId('gold')).toHaveText(START_GOLD);
  if (touch()) {
    await tapAt(page, x, y);
    await expect(page.getByTestId('hint')).toHaveText(/tap again to build/);
    await expect(page.getByTestId('gold')).toHaveText(START_GOLD);
  }
  await tapAt(page, x, y);
  await expect(page.getByTestId('gold')).toHaveText(AFTER_ARROW);
}

test('a tap on the board registers its cell and builds there', async ({ page }) => {
  await page.goto('./');
  await buildAt(page, 10, 6);
  expect(await page.evaluate(() => window.tavern!.controller.state.towers.map((t) => [t.spec, t.cell]))).toEqual([['arrow', 6 * 20 + 10]]);
  // A tap on the new tower selects it.
  const p = await cellPoint(page, 10, 6);
  await tapAt(page, p.x, p.y);
  await expect(page.getByTestId('tower-panel')).toContainText('Arrow');
});

test('a ghost on terrain that can not be built on is red and says why', async ({ page }) => {
  await page.goto('./');
  const p = await cellPoint(page, 4, 2);
  if (touch()) {
    await tapAt(page, p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText('Unbuildable');
    await tapAt(page, p.x, p.y);
  } else {
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText('Unbuildable');
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId('gold')).toHaveText(START_GOLD);
});

test('a drag pans instead of tapping', async ({ page, browserName }) => {
  test.skip(touch(), 'mouse drag only');
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
  await page.waitForTimeout(200);
  await expect(page.getByTestId('gold')).toHaveText(START_GOLD);
  expect(await page.evaluate(() => window.tavern!.controller.state.towers.length)).toBe(0);
});

test('the HUD starts a Wave, pauses and changes speed', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('wave')).toHaveText('0/12');
  await expect(page.getByTestId('wave-preview')).toContainText('Grunt');
  await page.getByTestId('start-wave').click();
  await expect(page.getByTestId('wave')).toHaveText('1/12');
  await expect(page.getByTestId('start-wave')).toBeDisabled();

  await page.getByTestId('speed-3').click();
  await expect(page.getByTestId('speed-3')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  const tick = await page.evaluate(() => window.tavern!.controller.state.tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.tavern!.controller.state.tick)).toBe(tick);
  await page.getByTestId('paused').click();
  await expect(page.getByTestId('paused')).toBeHidden();
});

test('hotkeys drive pause, speed and the build menu', async ({ page }) => {
  test.skip(touch(), 'keyboard only');
  await page.goto('./');
  await page.waitForFunction(() => !!window.tavern);
  await page.keyboard.press('p');
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByTestId('paused')).toBeHidden();
  await page.keyboard.press('2');
  await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(page.locator('[data-action="cannon"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="cannon"]')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('wave')).toHaveText('1/12');
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
  // The sandbox is a lazily loaded chunk, so this also proves the precache holds it.
  await buildAt(page, 10, 6);
});
