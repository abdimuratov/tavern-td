import type { Browser, BrowserContext, Page } from '@playwright/test';
import { RELAY_URL } from '../src/net/relay';
import { connectByCodes } from './app';
import { expect, silenceAudio, test } from './fixtures';

// Versus through the real Relay (docs/relay-setup.md): two pages that may use
// relay candidates only, connected by link and Answer code, must reach the
// Lobby Relayed and play Relayed. It needs the network and the Cloudflare
// Worker, so it runs only when asked:
//   TAVERN_RELAY_E2E=1 pnpm exec playwright test e2e/relay.spec.ts --project=mac-chrome --workers=1
// against RELAY_URL in src/net/relay.ts, or before that is set, against
//   TAVERN_RELAY_URL_REAL=https://tavern-turn.<subdomain>.workers.dev
// The preview's origin, http://localhost:4173, is one the Worker serves.

const RELAY = process.env['TAVERN_RELAY_URL_REAL'] ?? RELAY_URL;
const ON = process.env['TAVERN_RELAY_E2E'] === '1' && RELAY !== '';

test.skip(!ON, 'set TAVERN_RELAY_E2E=1, with RELAY_URL set or TAVERN_RELAY_URL_REAL given, to connect through the real Relay');
test.describe.configure({ timeout: 90_000 });

interface Player {
  readonly context: BrowserContext;
  readonly page: Page;
}

/** One player, silent, gathering relay candidates only, with the real Relay. */
async function player(browser: Browser): Promise<Player> {
  const context = await browser.newContext();
  await context.addInitScript(silenceAudio);
  await context.addInitScript((url) => {
    globalThis.TAVERN_ICE_POLICY = 'relay';
    globalThis.TAVERN_RELAY_URL = url;
  }, RELAY);
  return { context, page: await context.newPage() };
}

test('two devices that may only use the Relay connect through it, reach the Lobby Relayed and play Relayed', async ({ browser }) => {
  test.skip(test.info().project.name !== 'mac-chrome', 'The real Relay is tried from desktop Chrome');
  const host = await player(browser);
  const guest = await player(browser);
  try {
    await connectByCodes(host.page, guest.page, async () => {
      // Both codes got a relay candidate, so neither says the Relay is unavailable.
      for (const p of [host.page, guest.page]) await expect(p.getByTestId('relay-note')).toHaveCount(0);
    });
    for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-route')).toHaveText('Relayed', { timeout: 10_000 });

    // Into a Run, where window.tavern.versus reports the route and the Relay in both codes.
    await host.page.getByTestId('lobby-race-ironclad').click();
    await guest.page.getByTestId('lobby-race-rimeborn').click();
    await host.page.getByTestId('lobby-ready').click();
    await expect(guest.page.getByTestId('lobby-rival')).toHaveText('Ironclad · Ready');
    await guest.page.getByTestId('lobby-ready').click();
    for (const p of [host.page, guest.page]) {
      await p.waitForFunction(() => !!window.tavern?.versus && window.tavern.controller.state.tick > 30, null, { timeout: 20_000 });
      const st = await p.evaluate(() => {
        const s = window.tavern!.versus!.status();
        return { route: s.route, relay: s.relay, rivalRelay: s.rivalRelay, link: s.link };
      });
      expect(st).toEqual({ route: 'relayed', relay: { use: 'offered', why: null }, rivalRelay: true, link: 'open' });
      await expect(p.getByTestId('versus-line')).toHaveText(/^Ping \d+ ms · relayed$/);
    }
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});
