import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { newOriginalRun, touch } from './app';

// Waves & Towers as a player opens it: from the main menu on the Original's
// tab, from the war map on the Stage picked there, and from the in-Run menu,
// where it marks the Wave being fought and the Run stays paused.

/** The list scrolls inside the sheet: its rows and both tabs fit the screen, a phone on its side too. */
async function expectFits(page: Page): Promise<void> {
  await expect(page.getByTestId('ref-tab-waves')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('ref-tab-towers')).toBeInViewport({ ratio: 1 });
  const list = await page.locator('.ref-list').boundingBox();
  expect(list!.height).toBeGreaterThan(150);
  expect(list!.y + list!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

test('Waves & Towers from the main menu: the Original\'s Waves with Best against, its Challenge, and its towers', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('reference-button').click();
  await page.getByTestId('reference-mode-original').click();
  await expect(page.getByTestId('reference')).toBeVisible();
  await expect(page.getByTestId('ref-tab-waves')).toHaveAttribute('aria-selected', 'true');
  await expectFits(page);

  // Stage 1's twelve Waves, one line each; a tap opens one.
  await expect(page.getByTestId('ref-filter-stage')).toHaveValue('1');
  await expect(page.getByTestId('ref-waves').locator('.ref-row')).toHaveCount(12);
  await expect(page.getByTestId('ref-row-wave-1')).toContainText('7 Ghoul');
  const row = page.getByTestId('ref-row-wave-6');
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  const detail = page.getByTestId('ref-detail-wave-6');
  await expect(detail).toContainText('9 × Hound');
  await expect(detail).toContainText('Best against');
  await expect(detail).toContainText('Families');

  // Hard raises the HP; the Challenge plays Normal under its own rule.
  const hp = async (): Promise<string> => (await detail.locator('.ref-facts dd').nth(5).textContent()) ?? '';
  const normal = await hp();
  await page.getByTestId('ref-filter-difficulty-hard').click();
  await expect.poll(hp).not.toBe(normal);
  await page.getByTestId('ref-filter-challenge').click();
  await expect(page.getByTestId('ref-filter-challenge')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ref-note')).toContainText('The Burnt Mill');
  await expect(page.getByTestId('ref-intro')).toContainText('Tower cap 4');
  await expect(page.getByTestId('ref-filter-difficulty')).toHaveAttribute('data-locked', 'true');
  await expect.poll(hp).toBe(normal);

  // Another Stage, then the Towers tab: every family, a tower opened.
  await page.getByTestId('ref-filter-stage').selectOption('5');
  await expect(page.getByTestId('ref-waves').locator('.ref-row')).toHaveCount(15);
  await page.getByTestId('ref-tab-towers').click();
  await expect(page.getByTestId('ref-tab-towers')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('ref-towers').locator('.ref-group')).toHaveCount(6);
  // Wardbreakers keeps Frost and Arcane out.
  await expect(page.getByTestId('ref-row-family-frost')).toHaveAttribute('title', 'Not allowed in Wardbreakers');
  const tower = page.getByTestId('ref-row-tower-arrow_tower');
  await tower.click();
  await expect(tower).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('ref-detail-tower-arrow_tower')).toContainText('70 gold');
  await expect(page.getByTestId('ref-detail-tower-arrow_tower')).toContainText('Weak against');
  await page.getByTestId('ref-row-family-cannon').click();
  await expect(page.getByTestId('ref-detail-family-cannon')).toContainText('Double Charge');

  // On the Mac the arrows switch the tabs, Enter opens a row and Esc goes back to the menu.
  if (!touch()) {
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('ref-tab-waves')).toHaveAttribute('aria-selected', 'true');
    const first = page.getByTestId('ref-row-wave-1');
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('ref-tab-towers')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
  } else {
    await page.getByTestId('back').click();
  }
  await expect(page.getByTestId('mode-original')).toBeVisible();
});

test('Waves & Towers for Maul and Line Wars: their Waves and Sends, and their towers', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('reference-button').click();

  // Maul: 40 Waves, the Race and Difficulty filters, a Harpy Wave's Best against.
  await page.getByTestId('reference-mode-maul').click();
  await expect(page.getByTestId('ref-tab-waves')).toHaveText('Waves');
  await expectFits(page);
  await expect(page.getByTestId('ref-waves').locator('.ref-row')).toHaveCount(40);
  await expect(page.getByTestId('ref-filter-race')).toHaveValue('all');
  const harpies = page.getByTestId('ref-row-wave-5');
  await harpies.click();
  await expect(harpies).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('ref-detail-wave-5')).toContainText('16 × Harpy');
  await expect(page.getByTestId('ref-detail-wave-5')).toContainText('Can\'t hit air: Siege');
  await page.getByTestId('ref-tab-towers').click();
  await expect(page.getByTestId('ref-towers').locator('.ref-group')).toHaveCount(4);
  await page.getByTestId('ref-filter-race').selectOption('rimeborn');
  await expect(page.getByTestId('ref-towers').locator('.ref-group')).toHaveCount(1);
  await page.getByTestId('ref-row-tower-frost_spire').click();
  await expect(page.getByTestId('ref-detail-tower-frost_spire')).toContainText('Slows don\'t stack');

  // Line Wars: the first tab is Sends, ten of them, and a Send opens with its Stock and Sudden Death HP.
  await page.getByTestId('reference-mode-linewars').click();
  await expect(page.getByTestId('ref-tab-waves')).toHaveText('Sends');
  await expect(page.getByTestId('ref-tab-towers')).toBeVisible();
  await expectFits(page);
  await expect(page.getByTestId('ref-waves').locator('.ref-row')).toHaveCount(10);
  const golem = page.getByTestId('ref-row-send-ice_golem');
  await golem.click();
  await expect(golem).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('ref-detail-send-ice_golem')).toContainText('up to 3');
  await expect(page.getByTestId('ref-detail-send-ice_golem')).toContainText('Sudden Death HP');
  await page.getByTestId('ref-tab-towers').click();
  await expect(page.getByTestId('ref-towers').locator('.ref-group')).toHaveCount(4);
  await expect(page.getByTestId('ref-row-race-ironclad')).toBeVisible();
});

test('Waves & Towers from the war map opens on the Stage picked there', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('mode-original').getByTestId('mode-page').click();
  await page.getByTestId('stage-3').click();
  await page.getByTestId('reference-button').click();
  await expect(page.getByTestId('ref-filter-stage')).toHaveValue('3');
  await expect(page.getByTestId('ref-intro')).toContainText('Threat');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('war-map')).toBeVisible();
  await expect(page.getByTestId('stage-name')).toHaveText(/^3 · /);
});

test('Waves & Towers in a Run marks the Wave being fought and keeps the Run paused', async ({ page }) => {
  await page.goto('./');
  await newOriginalRun(page, 'hard');
  await page.getByTestId('send-now').click();
  await expect(page.getByTestId('wave')).toHaveText('1/12');

  await page.getByTestId('menu-button').click();
  await page.getByTestId('reference-button').click();
  await expect(page.getByTestId('reference')).toBeVisible();
  await expectFits(page);
  const now = page.getByTestId('ref-row-wave-1');
  const next = page.getByTestId('ref-row-wave-2');
  await expect(now).toHaveAttribute('data-mark', 'now');
  await expect(now).toContainText('Now');
  await expect(next).toHaveAttribute('data-mark', 'next');
  await expect(now).toHaveAttribute('aria-expanded', 'true');
  await expect(next).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('ref-row-wave-3')).toHaveAttribute('aria-expanded', 'false');
  await expect(now).toBeInViewport();
  // The Run's own Difficulty, fixed.
  await expect(page.getByTestId('ref-filter-difficulty')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('ref-filter-difficulty')).toContainText('Hard');

  const tick = (): Promise<{ tick: number; paused: boolean }> => page.evaluate(() => ({
    tick: window.tavern!.controller.state.tick, paused: window.tavern!.controller.paused,
  }));
  const before = await tick();
  expect(before.paused).toBe(true);
  await page.getByTestId('ref-tab-towers').click();
  await expect(page.getByTestId('ref-towers').locator('.ref-group')).toHaveCount(6);
  await page.getByTestId('ref-tab-waves').click();
  await expect(page.getByTestId('ref-waves')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await tick()).toEqual(before);

  // Back returns to the paused menu, not to the Run.
  if (touch()) await page.getByRole('button', { name: 'Back' }).click();
  else await page.keyboard.press('Escape');
  await expect(page.getByTestId('resume')).toBeVisible();
  expect(await tick()).toEqual(before);
});
