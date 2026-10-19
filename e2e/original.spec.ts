import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildOnSpot, newOriginalRun, spotPoint, tapAt, touch, towerSpecs } from './app';

// The Original as a player plays it: menu → Campaign → Stage 1 → Normal, a
// tower built through the ring on a Build Spot, Send Wave 1, then a reload and
// Continue; a won Stage that stores its Stars and opens Talents; and its
// Challenge, opened by that win and won for one more Star. Waves are run to
// their end through the debug handle; everything else goes through the UI.

/** Wins the Run through the debug handle: Tier 2 Arrows and Cannons on every Build Spot, then each Wave in turn. */
async function winRun(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.state.gold = 5000;
    for (let spot = 0; spot < c.state.map.buildSpots!.length; spot++) c.send({ type: 'original.build', spot, spec: spot % 2 ? 'cannon_tower' : 'arrow_tower' });
    c.fastForward(1);
    for (const t of c.state.towers) c.send({ type: 'original.upgrade', tower: t.id, to: t.spec === 'arrow_tower' ? 'longbow_tower' : 'bombard' });
    c.send({ type: 'original.sendNow' });
    for (let i = 0; i < 30 * 60 * 15 && c.state.phase !== 'won' && c.state.phase !== 'lost'; i++) c.fastForward(1);
  });
  await expect(page.getByTestId('run-over')).toBeVisible();
}

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
  await winRun(page);
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
  // Winning Stage 1 opens Stage 2, and the war map turns to it.
  await expect(page.getByTestId('stage-2')).not.toHaveClass(/locked/);
  await expect(page.getByTestId('stage-name')).toHaveText('2 · Greyriver Crossing');
  await page.getByTestId('stage-1').click();
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

test('a won Stage opens its Challenge, whose first win pays one more Star toward 48', async ({ page }) => {
  await page.goto('./');
  const card = page.getByTestId('mode-original');
  await card.getByTestId('mode-page').click();
  // Before Stage 1 is won, its Challenge shows dimmed, with no way in and no mark on the pin.
  await expect(page.getByTestId('stage-name')).toHaveText('1 · The Mill Road');
  await expect(page.getByTestId('challenge-name')).toHaveText('Challenge: The Burnt Mill');
  await expect(page.getByTestId('challenge-status')).toHaveText('Win this Stage to open it');
  await expect(page.getByTestId('challenge-start')).toHaveCount(0);
  await expect(page.getByTestId('challenge-mark-1')).toHaveCount(0);
  await expect(page.getByTestId('stage-card').locator('.campaign-foot')).toContainText('of 48');
  // On a phone on its side too, an unwon Stage keeps its Region intro, with every Difficulty in view.
  await expect(page.getByTestId('region-intro')).toBeVisible();
  for (const d of ['easy', 'normal', 'hard', 'insane']) await expect(page.getByTestId(`difficulty-${d}`)).toBeInViewport({ ratio: 1 });

  // Win Stage 1: the end card lists its Challenge under Opened.
  await page.getByTestId('difficulty-easy').click();
  await page.waitForFunction(() => !!window.tavern);
  await winRun(page);
  await expect(page.getByTestId('opened')).toContainText('Challenge: The Burnt Mill');
  await page.getByTestId('end-menu').click();

  // The won Stage's pin carries an open Challenge, and its panel offers it on Normal.
  await card.getByTestId('mode-page').click();
  await expect(page.getByTestId('challenge-mark-1')).toHaveClass(/open/);
  await page.getByTestId('talents').click();
  await expect(page.getByTestId('stars-free')).toHaveText('★3');
  await page.getByTestId('back').click();
  await page.getByTestId('stage-1').click();
  await expect(page.getByTestId('challenge-status')).toHaveText('1 Star · Normal');
  await expect(page.getByTestId('challenge-rule')).toContainText('4 Build Spots');
  // A won Stage's panel fits a phone on its side too; there the Region intro gives its room to the Challenge.
  await expect(page.getByTestId('challenge-start')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('talents')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('region-intro')).toBeVisible({ visible: page.viewportSize()!.height > 520 });
  await page.getByTestId('challenge-start').click();

  // A Challenge Run: Normal, on the Burnt Mill's 4 Build Spots, with its name, Star and rule on the HUD.
  await expect(page.getByTestId('run-challenge')).toHaveText('The Burnt Mill');
  await expect(page.getByTestId('run-challenge')).toHaveAttribute('title', 'Challenge: The Burnt Mill, on The Mill Road');
  await expect(page.getByTestId('challenge-rules')).toContainText('4 Build Spots');
  await expect(page.getByTestId('run-stars')).toHaveAttribute('aria-label', '1 of 1 Stars');
  await page.waitForFunction(() => !!window.tavern);
  const run = () => page.evaluate(() => {
    const s = window.tavern!.controller.state;
    return { difficulty: s.difficulty, challenge: (s.mode as { challenge?: string }).challenge, spots: s.map.buildSpots!.length, wave: s.wave.number };
  });
  expect(await run()).toEqual({ difficulty: 'normal', challenge: 'burnt-mill', spots: 4, wave: 0 });
  await winRun(page);

  // The end card: the Challenge's Star, added to the Campaign's 48, and its time as a new best.
  await expect(page.getByTestId('end-summary')).toContainText('Challenge won: The Burnt Mill');
  await expect(page.getByTestId('end-stars')).toHaveAttribute('aria-label', '1 of 1 Stars');
  await expect(page.getByTestId('stars-gained')).toHaveText('+1 to the Campaign');
  await expect(page.getByTestId('original-end')).toContainText('4 of 48 Stars');
  await expect(page.getByTestId('end-time')).toContainText('New best');
  await expect(page.getByTestId('opened')).toHaveCount(0);
  await expect(page.getByTestId('play-again')).toHaveText('Play again · Challenge: The Burnt Mill · The Mill Road · Normal');
  await expect(page.getByTestId('end-menu')).toBeInViewport({ ratio: 1 });

  // Play again restarts the Challenge, and Continue keeps it one.
  await page.getByTestId('play-again').click();
  await expect(page.getByTestId('run-challenge')).toHaveText('The Burnt Mill');
  await expect.poll(run).toEqual({ difficulty: 'normal', challenge: 'burnt-mill', spots: 4, wave: 0 });
  await page.getByTestId('menu-button').click();
  await page.getByTestId('quit').click();
  await expect(card.getByTestId('continue')).toContainText('Challenge: The Burnt Mill · The Mill Road · Normal');

  // The pin's mark turns gold, the panel shows the fastest win, and the Talent budget grew by its Star.
  await card.getByTestId('mode-page').click();
  await expect(page.getByTestId('challenge-mark-1')).toHaveClass(/won/);
  await page.getByTestId('stage-1').click();
  await expect(page.getByTestId('challenge-status')).toHaveText(/^Won · fastest \d+:\d\d$/);
  await expect(page.getByTestId('campaign-stars')).toHaveText('★4');
  await page.getByTestId('talents').click();
  await expect(page.getByTestId('stars-free')).toHaveText('★4');
  await page.getByTestId('back').click();
  await page.getByTestId('back').click();

  // Records: a Challenge column, and the Challenges won beside the Stars.
  await page.getByTestId('records').click();
  await expect(page.getByTestId('records-original-total')).toHaveText('4 of 48 Stars earned · 1 of 12 Challenges won');
  await expect(page.getByTestId('records-original').locator('thead')).toContainText('Challenge');
  await expect(page.getByTestId('records-challenge-1')).toHaveText(/^\d+:\d\d$/);
  await expect(page.getByTestId('records-challenge-2')).toHaveText('–');
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
