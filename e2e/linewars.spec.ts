import { expect, test } from './fixtures';
import { buildInField, fieldSpecs, newLineWarsRun, spotCorner, tapAt, touch, worldPoint } from './app';

// Line Wars as a player plays it: menu → Line Wars → New Run (Rimeborn against
// an Ironclad Rival, Normal), the HUD's gold, Income, both lives and the
// clock, a Wall and a Frost Spire built in your Field by tap-to-confirm, the
// Wall upgraded in its panel, a Send by tap and one by hotkey, the Rival's
// creeps in "In your Field", then a checkpoint autosave, a reload and
// Continue. Time is moved on through the debug handle (window.tavern) with the
// Run paused, so the opening's clock holds while the test plays; everything
// else goes through the UI.

// Each test runs minutes of a Run through the debug handle, which takes a while on CI's single slow worker.
test.describe.configure({ timeout: 90_000 });

type Sides = { sides: { gold: number; lives: number }[] };

test('a Line Wars Run builds, upgrades and sends through the HUD, meets the Rival\'s Sends, autosaves and continues paused', async ({ page }) => {
  await page.goto('./');
  await newLineWarsRun(page, 'rimeborn', 'ironclad');
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  await expect(page.getByTestId('gold')).toHaveText('150');
  await expect(page.getByTestId('income-value')).toHaveText('+10');
  await expect(page.getByTestId('income-in')).toHaveText(/^in \d+ s$/);
  await expect(page.getByTestId('lives-you')).toHaveText('30');
  await expect(page.getByTestId('lives-rival')).toHaveText('30');
  await expect(page.getByTestId('rival')).toHaveText('Ironclad · +10 ×1');
  await expect(page.getByTestId('clock')).toHaveText(/^Sudden Death in 1[45]:\d\d$/);
  await expect(page.getByTestId('in-field')).toContainText('Nothing yet');
  await expect(page.getByTestId('next-unlock')).toContainText('Snowlings in 0:');
  // The shared HUD's Wave counter, lives and Send Wave button stay out of a mode without Waves.
  await expect(page.getByTestId('wave')).toHaveCount(0);
  await expect(page.getByTestId('lives')).toHaveCount(0);
  await expect(page.getByTestId('start-wave')).toHaveCount(0);

  await buildInField(page, 'wall', 30, 10);
  await buildInField(page, 'frost-spire', 34, 10);
  expect(await fieldSpecs(page, 0)).toEqual(['rime_wall', 'frost_spire']);
  await expect(page.getByTestId('gold')).toHaveText('90');
  // Esc drops the build choice, so the next tap selects instead of building.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="build-frost-spire"]')).toHaveAttribute('aria-pressed', 'false');

  // A tap on the Wall opens its panel with both lines; a sale before 0:20 returns all it cost.
  const [wx, wy] = spotCorner(30, 10);
  const wall = await worldPoint(page, wx, wy);
  await tapAt(page, wall.x, wall.y);
  await expect(page.getByTestId('lw-panel')).toContainText('Rimeborn · Wall');
  await expect(page.getByTestId('sell-value')).toHaveText('+10');
  await expect(page.locator('[data-action="upgrade-chill_totem"]')).toBeVisible();
  await page.locator('[data-action="upgrade-frost_spire"]').click();
  await expect.poll(() => fieldSpecs(page, 0)).toEqual(['frost_spire', 'frost_spire']);
  await expect(page.getByTestId('tower-panel')).toContainText('Frost Spire');
  await expect(page.getByTestId('gold')).toHaveText('50');
  await page.getByRole('button', { name: 'Deselect' }).click();

  // Snowlings unlock at 0:20: one tap buys a pack, and your Income rises at once.
  await expect(page.locator('[data-action="send-snowlings"]')).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.fastForward(20 * 30 + 1 - c.state.tick);
  });
  await expect(page.getByTestId('stock-snowlings')).toHaveText('1');
  await page.locator('[data-action="send-snowlings"]').click();
  await expect(page.getByTestId('income-value')).toHaveText('+12');
  await expect(page.getByTestId('live')).toHaveText('Live 3/40');
  await expect(page.getByTestId('stock-snowlings')).toHaveText('0');

  // The Brawler unlocks at 0:40, and X sends it on a Mac (a phone has no keys, so a tap there).
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.fastForward(41 * 30 - c.state.tick);
  });
  await expect(page.getByTestId('stock-brawler')).toHaveText('1');
  if (touch()) await page.locator('[data-action="send-brawler"]').click();
  else await page.keyboard.press('x');
  await expect(page.getByTestId('income-value')).toHaveText('+15');

  // On until the Rival has built and its Sends walk your Field: "In your Field" lists them.
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    const inMine = (): boolean => c.state.creeps.some((k) => (k.spawn ?? 0) < 16 && k.hp > 0);
    for (let i = 0; i < 30 * 180 && !inMine(); i++) c.fastForward(1);
  });
  expect((await fieldSpecs(page, 1)).length).toBeGreaterThan(0);
  await expect(page.getByTestId('in-field')).toContainText('×');
  await expect(page.getByTestId('in-field')).not.toContainText('Nothing yet');

  // The next once-a-minute checkpoint autosaves.
  const saved = await page.evaluate(async () => {
    const c = window.tavern!.controller;
    const checkpoint = Math.ceil(c.state.tick / 1800) * 1800;
    c.fastForward(checkpoint + 1 - c.state.tick);
    const out = { tick: c.state.tick, gold: c.state.gold };
    await window.tavern!.flush();
    return out;
  });

  await page.reload();
  const cont = page.getByTestId('mode-linewars').getByTestId('continue');
  await expect(cont).toContainText(/\d+:00 in · Rimeborn vs Ironclad · Normal/);
  await cont.click();
  await expect(page.getByTestId('lw-status')).toBeVisible();
  await expect(page.getByTestId('paused')).toBeVisible();
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => ({
    tick: window.tavern!.controller.state.tick,
    gold: window.tavern!.controller.state.gold,
    paused: window.tavern!.controller.paused,
  }));
  expect(resumed).toEqual({ ...saved, paused: true });
  expect(await fieldSpecs(page, 0)).toEqual(['frost_spire', 'frost_spire']);
});

test('Mac hotkeys pick a build, upgrade and sell your selected tower, send, and Space repeats the last Send', async ({ page }) => {
  test.skip(touch(), 'keyboard only');
  await page.goto('./');
  await newLineWarsRun(page, 'ironclad', 'rimeborn');
  await page.getByTestId('pause').click();
  await page.keyboard.press('w');
  await expect(page.locator('[data-action="build-ballista"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('q');
  await expect(page.locator('[data-action="build-wall"]')).toHaveAttribute('aria-pressed', 'true');
  const [wx, wy] = spotCorner(30, 10);
  const wall = await worldPoint(page, wx, wy);
  await tapAt(page, wall.x, wall.y);
  await expect.poll(() => fieldSpecs(page, 0)).toEqual(['bulwark']);
  // The pick stays picked until Esc, then a click selects the Wall.
  await expect(page.locator('[data-action="build-wall"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await tapAt(page, wall.x, wall.y);
  await expect(page.getByTestId('lw-panel')).toBeVisible();
  // With your tower selected, Q W E R pick its upgrades in the panel's order: W is the Mortar.
  await page.keyboard.press('w');
  await expect.poll(() => fieldSpecs(page, 0)).toEqual(['mortar']);
  await expect(page.getByTestId('gold')).toHaveText('90');
  // S sells, and before 0:20 a sale returns all it cost.
  await page.keyboard.press('s');
  await expect.poll(() => fieldSpecs(page, 0)).toEqual([]);
  await expect(page.getByTestId('gold')).toHaveText('150');

  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.fastForward(20 * 30 + 1 - c.state.tick);
  });
  await page.keyboard.press('z');
  await expect(page.getByTestId('income-value')).toHaveText('+12');
  await expect(page.getByTestId('send-menu')).toContainText('Space: Snowlings');
  // Once the Stock has refilled, 5 s later, Space sends the same again.
  await page.evaluate(() => window.tavern!.controller.fastForward(6 * 30));
  await page.keyboard.press('Space');
  await expect(page.getByTestId('income-value')).toHaveText('+14');
});

test('a Line Wars Run refuses a Block and a build in the Rival\'s Field, each with its reason', async ({ page }) => {
  await page.goto('./');
  await newLineWarsRun(page, 'ironclad', 'random', 'hard');
  await page.getByTestId('pause').click();
  // Wall off row 16 of your Field from its west edge up to the last gap, then try to close it.
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    (c.state.mode as Sides).sides[0]!.gold = 1000;
    for (let col = 28; col <= 40; col += 2) c.send({ type: 'lw.build', side: 0, spec: 'bulwark', col, row: 16 });
  });
  await expect.poll(async () => (await fieldSpecs(page, 0)).length).toBe(7);
  await page.locator('[data-action="build-wall"]').click();
  const [gx, gy] = spotCorner(42, 16);
  const gap = await worldPoint(page, gx, gy);
  await tapAt(page, gap.x, gap.y);
  await expect(page.getByTestId('hint')).toHaveText(/block the path/i);
  expect((await fieldSpecs(page, 0)).length).toBe(7);

  const [rx, ry] = spotCorner(4, 10);
  const theirs = await worldPoint(page, rx, ry);
  await tapAt(page, theirs.x, theirs.y);
  await expect(page.getByTestId('hint')).toHaveText(/Rival's Field/);
  expect((await fieldSpecs(page, 0)).length).toBe(7);
});

test('a Line Wars save code exported mid-Run imports back', async ({ page }) => {
  await page.goto('./');
  await newLineWarsRun(page, 'mirefolk', 'runecasters', 'hard');
  await page.getByTestId('pause').click();
  await page.evaluate(() => {
    const c = window.tavern!.controller;
    c.fastForward(45 * 30 - c.state.tick);
  });
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
  await expect(page.getByTestId('import-continue')).toContainText('Line Wars · 0:45 in · Mirefolk vs Runecasters · Hard');
  await page.getByTestId('import-continue').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('paused')).toBeVisible();
  const after = await page.evaluate(() => JSON.stringify(window.tavern!.controller.state));
  expect(after).toBe(before);
  await expect(page.getByTestId('lw-status')).toBeVisible();
});

test('a Line Wars Run won through the debug handle shows the end card, and Records show its best steal', async ({ page }) => {
  await page.goto('./');
  await newLineWarsRun(page, 'ironclad', 'rimeborn', 'easy');
  await page.getByTestId('pause').click();
  await page.evaluate(() => {
    const m = window.tavern!.controller.state.mode as Sides;
    m.sides[0]!.gold = 2000;
    m.sides[1]!.lives = 3;
  });
  // The Rival's purse is kept empty, so its Field stays open and your Snowlings get through.
  const play = (ticks: number): Promise<boolean> => page.evaluate((n) => {
    const c = window.tavern!.controller;
    const rival = (c.state.mode as Sides).sides[1]!;
    const over = (): boolean => c.state.phase === 'won' || c.state.phase === 'lost';
    for (let i = 0; i < n && !over(); i++) {
      rival.gold = 0;
      c.fastForward(1);
    }
    return over();
  }, ticks);
  await play(20 * 30 + 1);
  for (let i = 0; i < 12; i++) {
    await page.locator('[data-action="send-snowlings"]').click();
    if (await play(30 * 8)) break;
  }
  await expect(page.getByTestId('run-over')).toBeVisible();
  await expect(page.getByTestId('end-title')).toHaveText('Victory');
  await expect(page.getByTestId('end-summary')).toHaveText('You took the Rival\'s last life on Easy');
  // The Record is merged once "New best" shows.
  await expect(page.getByTestId('end-stolen')).toHaveText(/^3\s*New best$/);
  await expect(page.getByTestId('end-time')).toContainText(':');

  await page.getByTestId('end-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.getByTestId('records').click();
  const table = page.getByTestId('records-linewars');
  await expect(table.locator('thead')).toContainText('Best steal');
  const easy = table.locator('tbody tr').first();
  await expect(easy.locator('th')).toHaveText('Easy');
  await expect(easy.locator('td').nth(0)).toHaveText('3');
  await expect(easy.locator('td').nth(3)).toHaveText('1');
  await expect(easy.locator('td').nth(4)).toHaveText('1');
  await page.getByTestId('back').click();
  await page.getByTestId('mode-linewars').getByTestId('new-run').click();
  await expect(page.getByTestId('difficulty-easy')).toContainText('Best steal: 3 lives');
  await expect(page.getByTestId('difficulty-easy')).toContainText("Rival's income ×0.85");
});
