import { expect, test } from './fixtures';
import { draftCount, newGemRun, OPEN_SPOTS, placeDraft, spotCorner, tapAt, touch, worldPoint } from './app';

// The app boots into the main menu. These check the play screen itself on a
// fresh Gem Run: taps and clicks, ghosts, pan, the HUD, hotkeys, and the shell.

test('the main menu lists the four Game Modes, every one playable', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('mode-gem')).toContainText('Gem TD');
  await expect(page.getByTestId('mode-element')).toContainText('Element TD');
  await expect(page.getByTestId('mode-element').getByTestId('new-run')).toBeVisible();
  await expect(page.getByTestId('mode-original').getByTestId('mode-page')).toHaveText('Campaign');
  await expect(page.getByTestId('mode-maul')).toContainText('Wintermaul');
  await expect(page.getByTestId('mode-maul').getByTestId('new-run')).toBeVisible();
  await expect(page.getByText('Coming later')).toHaveCount(0);
  await expect(page.getByTestId('continue')).toBeHidden();
});

test('a tap on the field places a Draft gem on its 2×2 spot', async ({ page }) => {
  await page.goto('./');
  await newGemRun(page);
  const [col, row] = OPEN_SPOTS[0]!;
  await placeDraft(page, col, row);
  const cells = await page.evaluate(() => window.tavern!.controller.state.towers.map((t) => t.cells));
  expect(cells).toEqual([[row * 95 + col, row * 95 + col + 1, (row + 1) * 95 + col, (row + 1) * 95 + col + 1]]);
  await expect(page.getByTestId('gem-step')).toHaveText(/Place gem 2 of 5/);
  // A tap on the new gem selects it.
  const p = await worldPoint(page, (col + 0.5) * 64, (row + 0.5) * 64);
  await tapAt(page, p.x, p.y);
  await expect(page.getByTestId('tower-panel')).toContainText('Draft gem 1 of 5');
});

test('a ghost on ground that can not be built on is red and says why', async ({ page }) => {
  await page.goto('./');
  await newGemRun(page);
  // The spawn lane along the top is walkable but unbuildable.
  const [wx, wy] = spotCorner(10, 11);
  const p = await worldPoint(page, wx, wy);
  if (touch()) {
    await tapAt(page, p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText('Unbuildable');
    await tapAt(page, p.x, p.y);
  } else {
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText('Unbuildable');
    await page.mouse.click(p.x, p.y);
  }
  await page.waitForTimeout(150);
  expect(await draftCount(page)).toBe(0);
});

test('a drag pans instead of tapping', async ({ page, browserName }) => {
  test.skip(touch(), 'mouse drag only');
  test.skip(browserName === 'webkit', 'WebKit wheel/drag emulation is flaky');
  await page.goto('./');
  await newGemRun(page);
  const box = (await page.locator('#board canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  // Zoom in first, so there's room to pan.
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await draftCount(page)).toBe(0);
});

test('the HUD pauses and changes speed, and hides what Gem has no use for', async ({ page }) => {
  await page.goto('./');
  await newGemRun(page);
  await expect(page.getByTestId('wave')).toHaveText('0/50');
  await expect(page.getByTestId('lives')).toBeHidden();
  await expect(page.getByTestId('start-wave')).toBeHidden();
  await expect(page.getByTestId('wave-preview')).toContainText('Cellar Rat');
  await expect(page.getByTestId('leak-rule')).toHaveText('Leaks are free until Wave 10');

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

test('hotkeys drive pause, speed, Gem Quality and the menu', async ({ page }) => {
  test.skip(touch(), 'keyboard only');
  await page.goto('./');
  await newGemRun(page);
  await page.keyboard.press('p');
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByTestId('paused')).toBeHidden();
  await page.keyboard.press('2');
  await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');
  // 10 gold can't buy Gem Quality 1 (20), and the game says so. The message
  // flashes for 1.8 s, which a busy CI runner can miss between polls, so
  // record every text the hint shows instead.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { hintsSeen: string[] }).hintsSeen = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="hint"]')?.textContent;
      if (text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const tickBefore = await page.evaluate(() => window.tavern!.controller.state.tick);
  await page.keyboard.press('q');
  try {
    await expect.poll(() => page.evaluate(() => (window as unknown as { hintsSeen: string[] }).hintsSeen), { timeout: 15_000 })
      .toContain('Not enough gold');
  } catch (err) {
    // CI has missed this twice while it passes locally: say whether ticks ran and the key reached the game.
    const seen = await page.evaluate(() => {
      const c = window.tavern!.controller;
      return {
        tickNow: c.state.tick, paused: c.paused, speed: c.speed, visibility: document.visibilityState,
        lastCommands: c.log.slice(-3).map((l) => l.command.type),
      };
    });
    throw new Error(`${(err as Error).message}\n${JSON.stringify({ tickBefore, ...seen })}`, { cause: err });
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('run-menu')).toBeVisible();
  // Keys don't reach the game while the menu is open.
  await page.keyboard.press('3');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('run-menu')).toBeHidden();
  await expect(page.getByTestId('paused')).toBeHidden();
  await expect(page.getByTestId('speed-2')).toHaveAttribute('aria-pressed', 'true');
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
  await newGemRun(page);
  const [col, row] = OPEN_SPOTS[0]!;
  await placeDraft(page, col, row);
});
