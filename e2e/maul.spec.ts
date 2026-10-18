import { expect, test } from './fixtures';
import { buildTower, finishWave, newMaulRun, spotCorner, tapAt, towerSpecs, worldPoint } from './app';

// A Maul Run as a player plays it: menu → Maul → New Run (Mirefolk, Normal), a
// Wall and a Dart Tower on open ground below the Ford, the Wall upgraded in its
// panel, Send Wave 1, then a reload and Continue; and a save code that imports
// back. Waves are run to their end through the debug handle; everything else
// goes through the UI.

// Each test plays a Wave through the debug handle, which takes most of the default 30 s on CI's single slow worker.
test.describe.configure({ timeout: 90_000 });

test('a Maul Run builds and upgrades on open ground, sends a Wave, autosaves and continues paused', async ({ page }) => {
  await page.goto('./');
  await newMaulRun(page, 'mirefolk');
  await expect(page.getByTestId('wave')).toHaveText('0/40');
  await expect(page.getByTestId('lives')).toHaveText('20');
  await expect(page.getByTestId('gold')).toHaveText('300');
  await expect(page.getByTestId('races')).toHaveText('Mirefolk');
  await expect(page.getByTestId('wave-preview')).toContainText('Brawler');

  await buildTower(page, 'wall', 20, 16);
  await buildTower(page, 'dart-tower', 24, 16);
  expect(await towerSpecs(page)).toEqual(['bramble', 'dart_tower']);
  await expect(page.getByTestId('gold')).toHaveText('240');
  // Esc drops the build choice, so the next tap selects instead of building.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="build-dart-tower"]')).toHaveAttribute('aria-pressed', 'false');

  // A tap on the Wall opens its panel with both lines, and a sale this Break would return all it cost.
  const [wx, wy] = spotCorner(20, 16);
  const wall = await worldPoint(page, wx, wy);
  await tapAt(page, wall.x, wall.y);
  await expect(page.getByTestId('maul-panel')).toContainText('Mirefolk · Wall');
  await expect(page.getByTestId('sell-value')).toHaveText('+10');
  await page.locator('[data-action="upgrade-spore_pod"]').click();
  await expect.poll(() => towerSpecs(page)).toEqual(['spore_pod', 'dart_tower']);
  await expect(page.getByTestId('maul-panel')).toContainText('Plague Pod');
  await page.getByRole('button', { name: 'Deselect' }).click();

  await expect(page.getByTestId('send-now')).toContainText('Send Wave 1');
  await expect(page.getByTestId('break')).toContainText('Wave 1 in');
  await page.getByTestId('send-now').click();
  await expect(page.getByTestId('wave')).toHaveText('1/40');
  await expect(page.getByTestId('wave-info')).toContainText('Wave 1');
  await page.getByTestId('speed-3').click();
  const saved = await finishWave(page);
  // The Wave is cleared: a 30 s Break counts down to Wave 2.
  await expect(page.getByTestId('break')).toContainText('Wave 2 in');

  await page.reload();
  const cont = page.getByTestId('mode-maul').getByTestId('continue');
  await expect(cont).toContainText('Wave 1 · Mirefolk · Normal');
  await cont.click();
  await expect(page.getByTestId('wave')).toHaveText('1/40');
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => ({
    tick: window.tavern!.controller.state.tick,
    gold: window.tavern!.controller.state.gold,
    paused: window.tavern!.controller.paused,
  }));
  expect(resumed).toEqual({ ...saved, paused: true });
  expect(await towerSpecs(page)).toEqual(['spore_pod', 'dart_tower']);
});

test('a Maul Run refuses a Block with its reason, and its save code imports back mid-Wave', async ({ page }) => {
  await page.goto('./');
  await newMaulRun(page, 'ironclad', 'hard');
  // Wall off the lower field from the west edge up to the last gap, then try to close it.
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.state.gold = 1000;
    for (let col = 1; col <= 43; col += 2) c.send({ type: 'maul.build', spec: 'bulwark', col, row: 16 });
  });
  await expect.poll(async () => (await towerSpecs(page)).length).toBe(22);
  await page.locator('[data-action="build-wall"]').click();
  const [gx, gy] = spotCorner(45, 16);
  const gap = await worldPoint(page, gx, gy);
  await tapAt(page, gap.x, gap.y);
  await expect(page.getByTestId('hint')).toHaveText(/block the path/i);
  expect((await towerSpecs(page)).length).toBe(22);

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
  await expect(page.getByTestId('import-continue')).toContainText('Maul · Wave 1 · Ironclad · Hard');
  await page.getByTestId('import-continue').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  const after = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));
  expect(after).toBe(before);
  await expect(page.getByTestId('maul-status')).toBeVisible();
});
