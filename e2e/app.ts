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
  await page.getByTestId('new-run').click();
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
