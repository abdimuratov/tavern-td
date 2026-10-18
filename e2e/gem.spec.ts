import { expect, test } from './fixtures';
import { finishWave, newGemRun, OPEN_SPOTS, placeDraft } from './app';

// A Gem Run as a player plays it: menu → New Run → Normal, five Draft gems,
// Keep, a Wave at 3×, then a reload and Continue. The Wave itself is run to
// its end through the debug handle; everything before it goes through the UI.

test('a Gem Run drafts, keeps, plays a Wave, autosaves and continues paused', async ({ page }) => {
  await page.goto('./');
  await newGemRun(page, 'normal');

  for (const [i, [col, row]] of OPEN_SPOTS.entries()) {
    await expect(page.getByTestId('gem-step')).toHaveText(new RegExp(`Place gem ${i + 1} of 5`));
    await placeDraft(page, col, row);
  }
  // The fifth gem opens its choices; choosing starts the Wave.
  await expect(page.getByTestId('gem-step')).toHaveText('Pick a gem to keep');
  await expect(page.getByTestId('draft-choices')).toContainText('it starts Wave 1');
  await page.locator('[data-action="keep"]').click();
  await expect(page.getByTestId('wave')).toHaveText('1/50');
  await expect(page.getByTestId('gem-step')).toHaveText(/Wave 1 · \d+ creeps? left/);
  const towers = await page.evaluate(() => window.tavern!.controller.state.towers.map((t) => t.spec));
  expect(towers.filter((s) => s === 'rock')).toHaveLength(4);

  await page.getByTestId('speed-3').click();
  await expect(page.getByTestId('speed-3')).toHaveAttribute('aria-pressed', 'true');
  const saved = await finishWave(page);
  await expect(page.getByTestId('gem-step')).toHaveText(/Place gem 1 of 5/);

  await page.reload();
  await expect(page.getByTestId('continue')).toContainText('Wave 1 · Normal');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('wave')).toHaveText('1/50');
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => ({
    tick: window.tavern!.controller.state.tick,
    gold: window.tavern!.controller.state.gold,
    paused: window.tavern!.controller.paused,
  }));
  expect(resumed).toEqual({ ...saved, paused: true });
  await expect(page.getByTestId('gold')).toHaveText(String(saved.gold));
});

test('a save code exported mid-Run imports back to the same Run', async ({ page }) => {
  await page.goto('./');
  await newGemRun(page, 'hard');
  for (const [col, row] of OPEN_SPOTS.slice(0, 2)) await placeDraft(page, col, row);

  await page.getByTestId('menu-button').click();
  await expect(page.getByTestId('run-menu')).toBeVisible();
  await page.getByTestId('export').click();
  const box = page.getByTestId('export-code');
  await expect(box).toHaveValue(/^TTD1\./);
  const code = await box.inputValue();
  const before = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));

  await page.keyboard.press('Escape');
  await page.getByTestId('quit').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('continue')).toContainText('Hard');

  await page.getByTestId('import').click();
  await page.getByTestId('import-code').fill('TTD1.0000.nope');
  await page.getByTestId('import-load').click();
  await expect(page.getByTestId('import-error')).toContainText('damaged');

  await page.getByTestId('import-code').fill(code);
  await page.getByTestId('import-load').click();
  await page.getByTestId('import-continue').click();
  // The Run that Quit saved would be replaced, so the menu asks first.
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  const after = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));
  expect(after).toBe(before);
  await expect(page.getByTestId('gem-step')).toHaveText(/Place gem 3 of 5/);
});
