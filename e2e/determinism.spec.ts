import { expect, test } from '@playwright/test';
import { replayHash, type Replay } from '../src/sim';
import { ELEMENT_FIXTURE_REPLAY, FIXTURE_REPLAY, ORIGINAL_FIXTURE_REPLAY } from '../src/sim/testing';
import { SIM_BUNDLE } from './global-setup';

declare global {
  interface Window {
    TavernSim?: { replayHash(r: Replay): string; FIXTURE_REPLAY: Replay; ELEMENT_FIXTURE_REPLAY: Replay; ORIGINAL_FIXTURE_REPLAY: Replay };
  }
}

// PLAN §2: the same replay must reach the same state in Safari's and Chrome's
// JavaScript engines as in Node, or versus play and shared replays would drift.
test('the replay fixture hashes the same in the browser as in Node', async ({ page }) => {
  const node = replayHash(FIXTURE_REPLAY);
  await page.goto('about:blank');
  await page.addScriptTag({ path: SIM_BUNDLE });
  const browser = await page.evaluate(() => {
    const sim = window.TavernSim!;
    return sim.replayHash(sim.FIXTURE_REPLAY);
  });
  expect(browser).toBe(node);
});

// Element walks a fixed route and leans on its own effect handlers, so it gets its own check.
test('the Element replay fixture hashes the same in the browser as in Node', async ({ page }) => {
  const node = replayHash(ELEMENT_FIXTURE_REPLAY);
  await page.goto('about:blank');
  await page.addScriptTag({ path: SIM_BUNDLE });
  const browser = await page.evaluate(() => {
    const sim = window.TavernSim!;
    return sim.replayHash(sim.ELEMENT_FIXTURE_REPLAY);
  });
  expect(browser).toBe(node);
});

// The Original runs several routes, air lines and its own damage model, so it gets its own check too.
test('the Original replay fixture hashes the same in the browser as in Node', async ({ page }) => {
  const node = replayHash(ORIGINAL_FIXTURE_REPLAY);
  await page.goto('about:blank');
  await page.addScriptTag({ path: SIM_BUNDLE });
  const browser = await page.evaluate(() => {
    const sim = window.TavernSim!;
    return sim.replayHash(sim.ORIGINAL_FIXTURE_REPLAY);
  });
  expect(browser).toBe(node);
});
