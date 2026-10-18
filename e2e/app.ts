import { expect, type Page, test } from '@playwright/test';

// Driving the app the way a player does: menus by button, the board by tap or
// click at a cell's position, which the app's debug handle (window.tavern) gives.

/** Gem's open field: five 2×2 Draft spots by their top-left cell, well away from every lane. */
export const OPEN_SPOTS: readonly (readonly [number, number])[] = [[20, 40], [24, 40], [28, 40], [20, 44], [24, 44]];

export const touch = (): boolean => !!test.info().project.use.hasTouch;

export async function tapAt(page: Page, x: number, y: number): Promise<void> {
  if (touch()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Where a world point is on the page. */
export async function worldPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  await page.waitForFunction(() => !!window.tavern);
  await expect(page.locator('#board canvas')).toBeVisible();
  return page.evaluate(([wx, wy]) => window.tavern!.worldToClient(wx, wy), [x, y] as const);
}

/** The grid corner a 2×2 footprint with top-left (col, row) centres on. */
export function spotCorner(col: number, row: number): [number, number] {
  return [(col + 1) * 64, (row + 1) * 64];
}

export async function draftCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.tavern!.controller.state.mode as { draft: number[] }).draft.length);
}

/** From the main menu into a fresh Gem Run. */
export async function newGemRun(page: Page, difficulty: 'easy' | 'normal' | 'hard' | 'insane' = 'normal'): Promise<void> {
  await page.getByTestId('mode-gem').getByTestId('new-run').click();
  await page.getByTestId(`difficulty-${difficulty}`).click();
  await expect(page.getByTestId('gem-step')).toHaveText(/Place gem 1 of 5/);
  await page.waitForFunction(() => !!window.tavern);
}

/** Places the next Draft gem with its top-left at (col, row): one click with a mouse, tap then tap again on a phone. */
export async function placeDraft(page: Page, col: number, row: number): Promise<void> {
  const before = await draftCount(page);
  const [wx, wy] = spotCorner(col, row);
  const p = await worldPoint(page, wx, wy);
  if (touch()) {
    await tapAt(page, p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText(/tap again to build/);
    expect(await draftCount(page)).toBe(before);
  }
  await tapAt(page, p.x, p.y);
  await expect.poll(() => draftCount(page)).toBe(before + 1);
}

/** Runs the Wave being fought to its end at once and waits for its autosave; resolves to the tick and gold it saved. */
export async function finishWave(page: Page): Promise<{ tick: number; gold: number }> {
  return page.evaluate(async () => {
    const c = window.tavern!.controller;
    for (let i = 0; i < 30 * 60 * 10 && c.state.phase === 'wave'; i++) c.fastForward(1);
    const saved = { tick: c.state.tick, gold: c.state.gold };
    await window.tavern!.flush();
    return saved;
  });
}

/** From the main menu into a fresh Element Run with these choices. */
export async function newElementRun(
  page: Page,
  o: { picks: 'allPick' | 'allRandom'; length: 'full' | 'express'; difficulty: 'easy' | 'normal' | 'hard' | 'insane' },
): Promise<void> {
  await page.getByTestId('mode-element').getByTestId('new-run').click();
  await page.getByTestId(`option-picks-${o.picks}`).click();
  await page.getByTestId(`option-length-${o.length}`).click();
  await page.getByTestId(`difficulty-${o.difficulty}`).click();
  await expect(page.getByTestId('element-status')).toBeVisible();
  await page.waitForFunction(() => !!window.tavern);
}

export async function towerSpecs(page: Page): Promise<string[]> {
  return page.evaluate(() => window.tavern!.controller.state.towers.map((t) => t.spec));
}

/** Picks a tower in the build menu and builds it with its top-left at (col, row): a click, or tap then tap again. */
export async function buildTower(page: Page, action: string, col: number, row: number): Promise<void> {
  const before = (await towerSpecs(page)).length;
  const button = page.locator(`[data-action="build-${action}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const [wx, wy] = spotCorner(col, row);
  const p = await worldPoint(page, wx, wy);
  if (touch()) {
    await tapAt(page, p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText(/tap again to build/);
  }
  await tapAt(page, p.x, p.y);
  await expect.poll(async () => (await towerSpecs(page)).length).toBe(before + 1);
}

/** From the main menu through the Campaign's Stage select into a fresh Run of Stage `stage`. */
export async function newOriginalRun(page: Page, difficulty: 'easy' | 'normal' | 'hard' | 'insane' = 'normal', stage = 1): Promise<void> {
  await page.getByTestId('mode-original').getByTestId('mode-page').click();
  await expect(page.getByTestId('war-map')).toBeVisible();
  await page.getByTestId(`stage-${stage}`).click();
  await page.getByTestId(`difficulty-${difficulty}`).click();
  await expect(page.getByTestId('original-status')).toBeVisible();
  await page.waitForFunction(() => !!window.tavern);
}

/** The middle of Build Spot `spot`, from the Map's own list. */
export async function spotPoint(page: Page, spot: number): Promise<{ x: number; y: number }> {
  await page.waitForFunction(() => !!window.tavern);
  const [col, row] = await page.evaluate((i) => window.tavern!.controller.state.map.buildSpots![i]!, spot);
  return worldPoint(page, (col + 1) * 64, (row + 1) * 64);
}

/** Taps an empty Build Spot for its ring, picks a family for its Ghost, then taps the Spot again to build. */
export async function buildOnSpot(page: Page, spot: number, family: string): Promise<void> {
  const before = (await towerSpecs(page)).length;
  const p = await spotPoint(page, spot);
  await tapAt(page, p.x, p.y);
  const pick = page.locator(`[data-action="ring-${family}"]`);
  await expect(page.getByTestId('build-ring')).toBeVisible();
  await pick.click();
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hint')).toHaveText(/again to build/);
  expect((await towerSpecs(page)).length).toBe(before);
  await tapAt(page, p.x, p.y);
  await expect.poll(async () => (await towerSpecs(page)).length).toBe(before + 1);
  await expect(page.getByTestId('build-ring')).toBeHidden();
}

/** From the main menu into a fresh Maul Run with this Race. */
export async function newMaulRun(
  page: Page, race: 'ironclad' | 'rimeborn' | 'mirefolk' | 'runecasters', difficulty: 'easy' | 'normal' | 'hard' | 'insane' = 'normal',
): Promise<void> {
  await page.getByTestId('mode-maul').getByTestId('new-run').click();
  await page.getByTestId(`option-race-${race}`).click();
  await page.getByTestId(`difficulty-${difficulty}`).click();
  await expect(page.getByTestId('maul-status')).toBeVisible();
  await page.waitForFunction(() => !!window.tavern);
}

/** From the main menu into a fresh Line Wars Run with your Race, the Rival's and the Difficulty. */
export async function newLineWarsRun(
  page: Page,
  race: 'ironclad' | 'rimeborn' | 'mirefolk' | 'runecasters',
  rival: 'random' | 'ironclad' | 'rimeborn' | 'mirefolk' | 'runecasters' = 'random',
  difficulty: 'easy' | 'normal' | 'hard' | 'insane' = 'normal',
): Promise<void> {
  await page.getByTestId('mode-linewars').getByTestId('new-run').click();
  await page.getByTestId(`option-race-${race}`).click();
  await page.getByTestId(`option-rivalRace-${rival}`).click();
  await page.getByTestId(`difficulty-${difficulty}`).click();
  await expect(page.getByTestId('lw-status')).toBeVisible();
  await page.waitForFunction(() => !!window.tavern);
}

/** The tower specs standing in one Side's Field: yours (0) is columns 28–43, the Rival's (1) columns 0–15. */
export async function fieldSpecs(page: Page, side: 0 | 1): Promise<string[]> {
  return page.evaluate((s) => {
    const state = window.tavern!.controller.state;
    return state.towers.filter((t) => (t.cell % state.map.cols >= 28) === (s === 0)).map((t) => t.spec);
  }, side);
}

/** Picks a tower in the build menu and builds it in your Field with its top-left at (col, row): a click, or tap then tap again. */
export async function buildInField(page: Page, action: string, col: number, row: number): Promise<void> {
  const before = (await fieldSpecs(page, 0)).length;
  const button = page.locator(`[data-action="build-${action}"]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const [wx, wy] = spotCorner(col, row);
  const p = await worldPoint(page, wx, wy);
  if (touch()) {
    await tapAt(page, p.x, p.y);
    await expect(page.getByTestId('hint')).toHaveText(/tap again to build/);
    expect((await fieldSpecs(page, 0)).length).toBe(before);
  }
  await tapAt(page, p.x, p.y);
  await expect.poll(async () => (await fieldSpecs(page, 0)).length).toBe(before + 1);
}
