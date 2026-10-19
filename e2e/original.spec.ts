import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { buildAt, newOriginalRun, placePoint, tapAt, touch, towerSpecs, worldPoint } from './app';

// The Original as a player plays it: menu → Campaign → Stage 1 → Normal, a
// tower built through the ring on Open ground, Send Wave 1, then a reload and
// Continue; the phone's taps and the Mac's pointer-following Ghost; a red
// Ghost on the road; a won Stage that stores its Stars and opens Talents; and
// its Challenge, opened by that win, whose Tower cap refuses a fifth tower,
// won for one more Star. Waves are run to their end through the debug handle;
// everything else goes through the UI.

/**
 * Wins the Run through the debug handle: Tier 2 Arrows and Cannons on eight
 * places by the Mill Road's bends (its old Build Spots), then each Wave in
 * turn. The Burnt Mill takes the first four: the rest are burnt, and its Tower cap is 4.
 */
async function winRun(page: Page): Promise<void> {
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.state.gold = 5000;
    const places = [[19, 4], [23, 4], [19, 6], [23, 6], [7, 10], [11, 10], [7, 12], [11, 12]];
    places.forEach(([col, row], i) => c.send({ type: 'original.build', col, row, spec: i % 2 ? 'cannon_tower' : 'arrow_tower' }));
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

  // Open ground that was never a Build Spot, beside the road's last bend.
  await buildAt(page, 22, 11, 'arrow');
  expect(await towerSpecs(page)).toEqual(['arrow_tower']);
  await expect(page.getByTestId('gold')).toHaveText('180');

  // A tap on the tower opens its panel: Upgrade, targeting, Sell and its Tower Level.
  const p = await placePoint(page, 22, 11);
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
  await expect(page.getByTestId('challenge-rule')).toContainText('4 towers at most');
  // A won Stage's panel fits a phone on its side too; there the Region intro gives its room to the Challenge.
  await expect(page.getByTestId('challenge-start')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('talents')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('region-intro')).toBeVisible({ visible: page.viewportSize()!.height > 520 });
  await page.getByTestId('challenge-start').click();

  // A Challenge Run: Normal, its lower bend and the mill's west burnt, 4 towers at most, with its name, Star and rule on the HUD.
  await expect(page.getByTestId('run-challenge')).toHaveText('The Burnt Mill');
  await expect(page.getByTestId('run-challenge')).toHaveAttribute('title', 'Challenge: The Burnt Mill, on The Mill Road');
  await expect(page.getByTestId('challenge-rules')).toContainText('Lower bend and west burnt');
  await expect(page.getByTestId('challenge-rules')).toContainText('4 towers at most');
  await expect(page.getByTestId('run-stars')).toHaveAttribute('aria-label', '1 of 1 Stars');
  await page.waitForFunction(() => !!window.tavern);
  const run = () => page.evaluate(() => {
    const s = window.tavern!.controller.state;
    const burnt = s.map.scenery?.find((p) => p.kind === 'burnt')?.name ?? null;
    return { difficulty: s.difficulty, challenge: (s.mode as { challenge?: string }).challenge, burnt, wave: s.wave.number };
  });
  expect(await run()).toEqual({ difficulty: 'normal', challenge: 'burnt-mill', burnt: 'Lower bend and west burnt', wave: 0 });

  // Its Tower cap: with four towers standing (where winRun puts them), the ring dims every family and refuses a fifth.
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.state.gold = 5000;
    [[19, 4], [23, 4], [19, 6], [23, 6]].forEach(([col, row], i) => c.send({ type: 'original.build', col, row, spec: i % 2 ? 'cannon_tower' : 'arrow_tower' }));
    c.fastForward(1);
  });
  expect(await towerSpecs(page)).toHaveLength(4);
  const cap = '4 towers stand: the most in this Challenge';
  const fifth = await placePoint(page, 28, 5);
  await tapAt(page, fifth.x, fifth.y);
  await expect(page.getByTestId('build-ring')).toBeVisible();
  await expect(page.locator('[data-action="ring-arrow"]')).toHaveClass(/dim/);
  await expect(page.locator('[data-action="ring-arrow"]')).toHaveAttribute('title', new RegExp(cap));
  await expect(page.getByTestId('hint')).toHaveText(cap);
  await page.locator('[data-action="ring-arrow"]').click();
  await expect(page.getByTestId('hint')).toHaveText(cap);
  await tapAt(page, fifth.x, fifth.y);
  await page.evaluate(() => window.tavern!.controller.fastForward(2));
  expect(await towerSpecs(page)).toHaveLength(4);
  await expect(page.getByTestId('build-ring')).toBeVisible();
  // Burnt ground says why and closes the ring.
  const burnt = await worldPoint(page, 2.5 * 64, 12.5 * 64);
  await tapAt(page, burnt.x, burnt.y);
  await expect(page.getByTestId('hint')).toHaveText('Nothing stands on burnt ground');
  await expect(page.getByTestId('build-ring')).toBeHidden();
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
  await expect.poll(run).toEqual({ difficulty: 'normal', challenge: 'burnt-mill', burnt: 'Lower bend and west burnt', wave: 0 });
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

test('on a phone a tap opens the ring, a family shows its Ghost, another tap builds, and the ring moves with its family', async ({ page }) => {
  test.skip(!touch(), 'touch only');
  await page.goto('./');
  await newOriginalRun(page, 'normal');
  const ring = page.getByTestId('build-ring');
  const arrow = page.locator('[data-action="ring-arrow"]');
  const first = await placePoint(page, 22, 11);
  await tapAt(page, first.x, first.y);
  await expect(ring).toBeVisible();
  await expect(page.getByTestId('hint')).toHaveText('Pick a tower family for this place');
  await arrow.click();
  await expect(arrow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hint')).toHaveText('Arrow Tower · 70 gold: tap again to build');

  // Other Open ground moves the ring there, Arrow still picked; nothing is built.
  const second = await placePoint(page, 2, 0);
  await tapAt(page, second.x, second.y);
  await expect(arrow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hint')).toHaveText(/tap again to build/);
  expect(await towerSpecs(page)).toEqual([]);
  // The family tapped again builds where the ring now stands, and the ring closes.
  await arrow.click();
  await expect.poll(() => towerSpecs(page)).toEqual(['arrow_tower']);
  expect(await page.evaluate(() => window.tavern!.controller.state.towers[0]!.cell)).toBe(2);
  await expect(ring).toBeHidden();

  // A tap on the road says why and closes the ring.
  await tapAt(page, first.x, first.y);
  await expect(ring).toBeVisible();
  const road = await worldPoint(page, 9.5 * 64, 3.5 * 64);
  await tapAt(page, road.x, road.y);
  await expect(page.getByTestId('hint')).toHaveText('Not on the road');
  await expect(ring).toBeHidden();
  expect(await towerSpecs(page)).toEqual(['arrow_tower']);
});

test('a red Ghost says why where a tower can\'t stand, and nothing is built', async ({ page }) => {
  await page.goto('./');
  await newOriginalRun(page, 'normal');
  // Two towers below the road's last leg leave one Open column between them.
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.send({ type: 'original.build', col: 5, row: 16, spec: 'arrow_tower' });
    c.send({ type: 'original.build', col: 8, row: 16, spec: 'arrow_tower' });
    c.fastForward(1);
  });
  expect(await towerSpecs(page)).toHaveLength(2);
  const p = await placePoint(page, 22, 11);
  await tapAt(page, p.x, p.y);
  await page.locator('[data-action="ring-arrow"]').click();
  // Just under the road in that column, the Ghost snaps to the 2 × 2 nearest: half of it on the road.
  const gap = await worldPoint(page, 7.5 * 64, 16.15 * 64);
  if (touch()) await tapAt(page, gap.x, gap.y);
  else await page.mouse.move(gap.x, gap.y);
  await expect(page.getByTestId('hint')).toHaveText('On the road');
  // Building there is refused, with the same reason.
  await tapAt(page, gap.x, gap.y);
  await expect(page.getByTestId('hint')).toHaveText('On the road');
  await page.evaluate(() => window.tavern!.controller.fastForward(2));
  expect(await towerSpecs(page)).toHaveLength(2);
});

test('on the Mac the ring\'s hotkeys pick and build, and the picked Ghost follows the pointer', async ({ page }) => {
  test.skip(touch(), 'mouse and keyboard only');
  await page.goto('./');
  await newOriginalRun(page, 'normal');
  const ring = page.getByTestId('build-ring');
  const hint = page.getByTestId('hint');
  // Q W E R T Y pick the ring's families in order, and the same key again builds.
  const p = await placePoint(page, 7, 10);
  await tapAt(page, p.x, p.y);
  await expect(ring).toBeVisible();
  await page.keyboard.press('w');
  await expect(page.locator('[data-action="ring-cannon"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('w');
  await expect.poll(() => towerSpecs(page)).toEqual(['cannon_tower']);
  await tapAt(page, p.x, p.y);
  await expect(page.getByTestId('original-panel')).toBeVisible();
  await page.keyboard.press('s');
  await expect.poll(() => towerSpecs(page)).toEqual([]);
  await expect(page.getByTestId('gold')).toHaveText('250');

  // Once a family is picked, its Ghost follows the mouse, red where it can't go.
  const home = await placePoint(page, 2, 0);
  await tapAt(page, home.x, home.y);
  await page.keyboard.press('q');
  const far = await placePoint(page, 22, 11);
  await page.mouse.move(far.x, far.y);
  await expect(hint).toHaveText('Arrow Tower · 70 gold: click again to build');
  const road = await worldPoint(page, 9.5 * 64, 3.5 * 64);
  await page.mouse.move(road.x, road.y);
  await expect(hint).toHaveText('On the road');
  const mill = await worldPoint(page, 14.5 * 64, 5.5 * 64);
  await page.mouse.move(mill.x, mill.y);
  await expect(hint).toHaveText('On the mill');
  // The same key over the mill is refused there; over Open ground it builds where the Ghost stands, not on the ring's 2 × 2.
  await page.keyboard.press('q');
  await expect(hint).toHaveText('On the mill');
  await page.mouse.move(far.x, far.y);
  await page.keyboard.press('q');
  await expect.poll(() => towerSpecs(page)).toEqual(['arrow_tower']);
  expect(await page.evaluate(() => window.tavern!.controller.state.towers[0]!.cell)).toBe(11 * 32 + 22);
  await expect(ring).toBeHidden();

  // A click on Open ground builds where the Ghost stands too.
  await tapAt(page, home.x, home.y);
  await page.keyboard.press('w');
  const there = await placePoint(page, 28, 11);
  await page.mouse.move(there.x, there.y);
  await expect(hint).toHaveText('Cannon Tower · 90 gold: click again to build');
  await page.mouse.click(there.x, there.y);
  await expect.poll(() => towerSpecs(page)).toEqual(['arrow_tower', 'cannon_tower']);
  expect(await page.evaluate(() => window.tavern!.controller.state.towers[1]!.cell)).toBe(11 * 32 + 28);

  // Esc and right-click close the ring.
  await tapAt(page, home.x, home.y);
  await expect(ring).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ring).toBeHidden();
  await tapAt(page, home.x, home.y);
  await expect(ring).toBeVisible();
  await page.mouse.click(home.x, home.y, { button: 'right' });
  await expect(ring).toBeHidden();
  expect(await towerSpecs(page)).toEqual(['arrow_tower', 'cannon_tower']);
});

test('an Original save code exported mid-Wave imports back to the same Run', async ({ page }) => {
  await page.goto('./');
  await newOriginalRun(page, 'hard');
  await buildAt(page, 11, 10, 'cannon');
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
