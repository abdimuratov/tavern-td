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

/** The middle of the Original's 2 × 2 place with its top-left at (col, row): the grid corner it centres on. */
export async function placePoint(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  const [wx, wy] = spotCorner(col, row);
  return worldPoint(page, wx, wy);
}

/** Taps Open ground for the Original's build ring there, picks a family for its Ghost, then taps the place again to build. */
export async function buildAt(page: Page, col: number, row: number, family: string): Promise<void> {
  const before = (await towerSpecs(page)).length;
  const p = await placePoint(page, col, row);
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
  const cell = await page.evaluate(() => window.tavern!.controller.state.towers.at(-1)!.cell);
  expect(cell).toBe(row * 32 + col);
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

/**
 * Versus through a room, as two players connect (docs/versus-design.md §2):
 * the Host makes one, and the Guest opens Join and types its code, as
 * `typed` writes it. Resolves with the code once both pages are in the Lobby.
 */
export async function connectByRoom(host: Page, guest: Page, typed = (code: string): string => code): Promise<string> {
  await host.goto('./');
  await host.getByTestId('mode-linewars').getByTestId('versus-host').click();
  const shown = host.getByTestId('room-code');
  await expect(shown).toHaveText(/^[A-HJ-NP-Z2-9]{4}$/, { timeout: 15_000 });
  const code = (await shown.textContent())!;
  await expect(host.getByTestId('room-wait')).toHaveText('Waiting for the Rival…');
  await guest.goto('./');
  await guest.getByTestId('mode-linewars').getByTestId('versus-join').click();
  await guest.getByTestId('room-input').fill(typed(code));
  await guest.getByTestId('room-join').click();
  for (const p of [host, guest]) await expect(p.getByTestId('lobby')).toBeVisible({ timeout: 20_000 });
  return code;
}

/**
 * Versus' swap of codes by hand, the fallback to a room, as two players make
 * it (docs/versus-design.md §2): the Host leaves its room for a Join code,
 * the Guest opens its link and answers, and the Answer code goes back.
 * `whileUp` runs while both codes are on screen. Resolves once both pages
 * are in the Lobby, with how long each code took from its button.
 */
export async function connectByCodes(host: Page, guest: Page, whileUp?: () => Promise<void>): Promise<{ joinMs: number; answerMs: number }> {
  await host.goto('./');
  await host.getByTestId('mode-linewars').getByTestId('versus-host').click();
  await host.getByTestId('use-codes').click();
  let at = Date.now();
  const linkBox = host.getByTestId('join-link');
  await expect(linkBox).toHaveValue(/#join=TTDJ1\./, { timeout: 15_000 });
  const joinMs = Date.now() - at;
  await guest.goto('about:blank');
  await guest.goto(await linkBox.inputValue());
  await guest.getByTestId('join-go').click();
  at = Date.now();
  const answerBox = guest.getByTestId('answer-code');
  await expect(answerBox).toHaveValue(/^TTDA1\./, { timeout: 15_000 });
  const answerMs = Date.now() - at;
  await whileUp?.();
  await host.getByTestId('answer-paste').fill(await answerBox.inputValue());
  await host.getByTestId('answer-accept').click();
  for (const p of [host, guest]) await expect(p.getByTestId('lobby')).toBeVisible({ timeout: 20_000 });
  return { joinMs, answerMs };
}
