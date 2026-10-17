import { expect, test } from '@playwright/test';
import { replayHash, type Replay } from '../src/sim';
import { FIXTURE_REPLAY } from '../src/sim/testing';
import { SIM_BUNDLE } from './global-setup';

declare global {
  interface Window {
    TavernSim?: { replayHash(r: Replay): string; FIXTURE_REPLAY: Replay };
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
