import { expect, test } from '@playwright/test';
import { buildOnSpot, newOriginalRun, spotPoint, tapAt, touch, towerSpecs } from './app';

// The Original as a player plays it: menu → Campaign → Stage 1 → Normal, a
// tower built through the ring on a Build Spot, Send Wave 1, then a reload and
// Continue; and a won Stage that stores its Stars and opens Talents. Waves are
// run to their end through the debug handle; everything else goes through the UI.

// Each test plays Waves through the debug handle, which takes most of the default 30 s on CI's single slow worker.
test.describe.configure({ timeout: 90_000 });

test('an Original Run builds through the ring, sends a Wave, autosaves and continues paused', async ({ page }) => {
  await page.goto('./');
  await newOriginalRun(page, 'normal');
  await expect(page.getByTestId('wave')).toHaveText('0/12');
  await expect(page.getByTestId('lives')).toHaveText('20');
  await expect(page.getByTestId('gold')).toHaveText('250');
  await expect(page.getByTestId('threat')).toHaveText('Threat 1');
  await expect(page.getByTestId('wave-preview')).toContainText('Ghoul');

  await buildOnSpot(page, 0, 'arrow');
  expect(await towerSpecs(page)).toEqual(['arrow_tower']);
  await expect(page.getByTestId('gold')).toHaveText('180');

  // A tap on the tower opens its panel: Upgrade, targeting, Sell and its Tower Level.
  const p = await spotPoint(page, 0);
  await tapAt(page, p.x, p.y);
  await expect(page.getByTestId('original-panel')).toContainText('Longbow Tower');
  await expect(page.getByTestId('tower-level')).toHaveText('Lv 1');
  await page.locator('[data-action="target-strong"]').click();
  await expect(page.locator('[data-action="target-strong"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sell-value')).toHaveText('+70');
  await page.getByRole('button', { name: 'Deselect' }).click();

  await expect(page.getByTestId('send-now')).toContainText('Send Wave 1');
  await page.getByTestId('send-now').click();
  await expect(page.getByTestId('wave')).toHaveText('1/12');
  await page.getByTestId('speed-3').click();
  // Wave 1's Break runs once its last Ghoul is on the road; Send now pays for the seconds it skips.
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    for (let i = 0; i < 30 * 30 && (c.state.mode as { breakUntil: number }).breakUntil < 0; i++) c.fastForward(1);
  });
  await expect(page.getByTestId('early-call')).toContainText(/\+\d+ gold/);
  await expect(page.getByTestId('break')).toContainText('Wave 2 in');

  const saved = await page.evaluate(async () => {
    const c = window.tavern!.controller;
    for (let i = 0; i < 30 * 60 * 5 && (c.state.mode as { completed: number }).completed < 1; i++) c.fastForward(1);
    const out = { tick: c.state.tick, gold: c.state.gold, wave: c.state.wave.number };
    await window.tavern!.flush();
    return out;
  });

  await page.reload();
  const cont = page.getByTestId('mode-original').getByTestId('continue');
  await expect(cont).toContainText(`Wave ${saved.wave} · The Mill Road · Normal`);
  await cont.click();
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => ({
    tick: window.tavern!.controller.state.tick,
    gold: window.tavern!.controller.state.gold,
    paused: window.tavern!.controller.paused,
  }));
  expect(resumed).toEqual({ tick: saved.tick, gold: saved.gold, paused: true });
  expect(await towerSpecs(page)).toEqual(['arrow_tower']);
});

test('a won Stage stores its Stars in the Campaign and opens Talents', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('mode-original').getByTestId('mode-page')).toHaveText('Campaign');
  await newOriginalRun(page, 'easy');
  // Win through the debug handle: Tier 2 Arrows and Cannons on every Spot, then each Wave in turn.
  await page.evaluate(async () => {
    const c = window.tavern!.controller;
    c.state.gold = 5000;
    for (let spot = 0; spot < 8; spot++) c.send({ type: 'original.build', spot, spec: spot % 2 ? 'cannon_tower' : 'arrow_tower' });
    c.fastForward(1);
    for (const t of c.state.towers) c.send({ type: 'original.upgrade', tower: t.id, to: t.spec === 'arrow_tower' ? 'longbow_tower' : 'bombard' });
    c.send({ type: 'original.sendNow' });
    for (let i = 0; i < 30 * 60 * 15 && c.state.phase !== 'won' && c.state.phase !== 'lost'; i++) c.fastForward(1);
  });
  await expect(page.getByTestId('run-over')).toBeVisible();
  await expect(page.getByTestId('end-summary')).toContainText('The Mill Road held on Easy');
  await expect(page.getByTestId('end-stars')).toHaveAttribute('aria-label', '3 of 3 Stars');
  await expect(page.getByTestId('stars-gained')).toContainText('+3 to the Campaign');
  await expect(page.getByTestId('opened')).toContainText('Frost towers');
  await page.getByTestId('end-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();

  // The Campaign outlives a reload, and a won Stage keeps nothing to Continue.
  await page.reload();
  await expect(page.getByTestId('mode-original').getByTestId('continue')).toBeHidden();
  await page.getByTestId('mode-original').getByTestId('mode-page').click();
  await expect(page.getByTestId('stage-1')).toHaveClass(/won/);
  await expect(page.getByTestId('campaign-stars')).toHaveText('★3');
  await expect(page.getByTestId('stage-record')).toContainText('Hardest won: Easy');
  await expect(page.getByTestId('arsenal')).toContainText('Frost');

  await page.getByTestId('talents').click();
  await expect(page.getByTestId('stars-free')).toHaveText('★3');
  await page.getByTestId('talent-fletching').click();
  await expect(page.getByTestId('talent-fletching')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('stars-free')).toHaveText('★2');
  // One Talent per row: Long Draw is out until a free reset.
  await expect(page.getByTestId('talent-long-draw')).toBeDisabled();
  await page.getByTestId('talents-reset').click();
  await expect(page.getByTestId('stars-free')).toHaveText('★3');
  await expect(page.getByTestId('talent-long-draw')).toBeEnabled();
});

test('Mac hotkeys pick the ring\'s families in order and build', async ({ page }) => {
  test.skip(touch(), 'keyboard only');
  await page.goto('./');
  await newOriginalRun(page, 'normal');
  const p = await spotPoint(page, 4);
  await tapAt(page, p.x, p.y);
  await expect(page.getByTestId('build-ring')).toBeVisible();
  await page.keyboard.press('w');
  await expect(page.locator('[data-action="ring-cannon"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('w');
  await expect.poll(() => towerSpecs(page)).toEqual(['cannon_tower']);
  await tapAt(page, p.x, p.y);
  await expect(page.getByTestId('original-panel')).toBeVisible();
  await page.keyboard.press('s');
  await expect.poll(() => towerSpecs(page)).toEqual([]);
  await expect(page.getByTestId('gold')).toHaveText('250');
});

test('an Original save code exported mid-Wave imports back to the same Run', async ({ page }) => {
  await page.goto('./');
  await newOriginalRun(page, 'hard');
  await buildOnSpot(page, 5, 'cannon');
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
  await expect(page.getByTestId('import-continue')).toContainText('Original · Wave 1 · The Mill Road · Hard');
  await page.getByTestId('import-continue').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  const after = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));
  expect(after).toBe(before);
  await expect(page.getByTestId('original-status')).toBeVisible();
});
