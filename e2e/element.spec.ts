import { expect, test } from '@playwright/test';
import { buildTower, finishWave, newElementRun, towerSpecs } from './app';

// An Element Run as a player plays it: menu → Element → New Run (All Pick,
// Express, Normal), an Arrow on a plot, Send now, a Wave at 3×, then a reload
// and Continue. The Wave itself is run to its end through the debug handle;
// everything before it goes through the UI.

// Each test plays a whole Wave through the debug handle, which takes most of
// the default 30 s on CI's single slow worker.
test.describe.configure({ timeout: 60_000 });

test('an Element Run builds, sends a Wave, autosaves and continues paused', async ({ page }) => {
  await page.goto('./');
  await newElementRun(page, { picks: 'allPick', length: 'express', difficulty: 'normal' });
  await expect(page.getByTestId('wave')).toHaveText('0/30');
  await expect(page.getByTestId('lives')).toHaveText('50');
  await expect(page.getByTestId('lumber')).toHaveText('2');
  await expect(page.getByTestId('wave-preview')).toContainText('Forest Wolf');

  await buildTower(page, 'arrow', 17, 18);
  expect(await towerSpecs(page)).toEqual(['basic_arrow_tower']);
  await expect(page.getByTestId('gold')).toHaveText('500');

  await expect(page.getByTestId('send-now')).toContainText('Wave 1 in');
  await page.getByTestId('send-now').click();
  await expect(page.getByTestId('wave')).toHaveText('1/30');
  await expect(page.getByTestId('wave-info')).toContainText('Wave 1');

  await page.getByTestId('speed-3').click();
  await expect(page.getByTestId('speed-3')).toHaveAttribute('aria-pressed', 'true');
  const saved = await finishWave(page);
  // The Wave is over: the next Break counts down to Wave 2.
  await expect(page.getByTestId('send-now')).toContainText('Wave 2 in');
  expect(await page.evaluate(() => window.tavern!.controller.state.phase)).toBe('build');

  await page.reload();
  const cont = page.getByTestId('mode-element').getByTestId('continue');
  await expect(cont).toContainText('Wave 1 · Express · Normal');
  await cont.click();
  await expect(page.getByTestId('wave')).toHaveText('1/30');
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => ({
    tick: window.tavern!.controller.state.tick,
    gold: window.tavern!.controller.state.gold,
    paused: window.tavern!.controller.paused,
  }));
  expect(resumed).toEqual({ ...saved, paused: true });
  expect(await towerSpecs(page)).toEqual(['basic_arrow_tower']);
});

test('an Element save code exported mid-Wave imports back to the same Run', async ({ page }) => {
  await page.goto('./');
  await newElementRun(page, { picks: 'allRandom', length: 'full', difficulty: 'hard' });
  await buildTower(page, 'cannon', 17, 22);
  await page.getByTestId('send-now').click();
  await page.evaluate(() => window.tavern!.controller.fastForward(300));

  await page.getByTestId('menu-button').click();
  await page.getByTestId('export').click();
  const box = page.getByTestId('export-code');
  await expect(box).toHaveValue(/^TTD1\./);
  const code = await box.inputValue();
  const before = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));

  await page.keyboard.press('Escape');
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.getByTestId('import').click();
  await page.getByTestId('import-code').fill(code);
  await page.getByTestId('import-load').click();
  await expect(page.getByTestId('import-continue')).toContainText('Element · Wave 1 · Full · All Random · Hard');
  await page.getByTestId('import-continue').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  const after = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));
  expect(after).toBe(before);
  await expect(page.getByTestId('element-status')).toBeVisible();
});
