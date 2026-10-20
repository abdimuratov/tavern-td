import type { Browser, BrowserContext, Page } from '@playwright/test';
import { connectByRoom } from './app';
import { expect, silenceAudio, test } from './fixtures';

// Versus through the deployed Relay (docs/render-setup.md): two pages connect
// by Room code Direct, and two that may gather only relay candidates (with no
// TURN server, none) connect Relayed and agree on the hash checks. It needs
// the network and the Render service, which a cold start takes up to a
// minute to wake, so it runs only when asked:
//   TAVERN_LIVE_RELAY=1 pnpm exec playwright test e2e/live-relay.spec.ts --project=mac-chrome --workers=1
// against RELAY_URL in the preview build, or against the live Pages build with
//   TAVERN_LIVE_BASE=https://abdimuratov.github.io/tavern-td/

const ON = process.env['TAVERN_LIVE_RELAY'] === '1';
const BASE = process.env['TAVERN_LIVE_BASE'];

test.skip(!ON, 'set TAVERN_LIVE_RELAY=1 to connect through the deployed Relay');
test.describe.configure({ timeout: 180_000 });

interface Player {
  readonly context: BrowserContext;
  readonly page: Page;
}

/** One player on the build's own Relay (no test hook), silent; `relay` gathers relay candidates only. */
async function player(browser: Browser, policy: 'all' | 'relay'): Promise<Player> {
  const context = await browser.newContext(BASE ? { baseURL: BASE } : {});
  await context.addInitScript(silenceAudio);
  await context.addInitScript((p) => {
    globalThis.TAVERN_ICE_POLICY = p;
  }, policy);
  return { context, page: await context.newPage() };
}

for (const [policy, route] of [['all', 'Direct'], ['relay', 'Relayed']] as const) {
  test(`two pages connect by Room code through the deployed Relay, ${route}`, async ({ browser }) => {
    test.skip(test.info().project.name !== 'mac-chrome', 'The deployed Relay is tried from desktop Chrome');
    const host = await player(browser, policy);
    const guest = await player(browser, policy);
    try {
      // Wake it first: a cold start takes up to a minute, and the room's own 90 s covers it.
      await host.page.goto('./');
      await expect(host.page.getByTestId('versus-row')).toBeVisible();
      const code = await connectByRoom(host.page, guest.page);
      for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-route')).toHaveText(route);
      await host.page.getByTestId('lobby-race-ironclad').click();
      await guest.page.getByTestId('lobby-race-rimeborn').click();
      for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-ping')).toHaveText(/^\d+ ms$/);
      await host.page.getByTestId('lobby-ready').click();
      await expect(guest.page.getByTestId('lobby-rival')).toHaveText('Ironclad · Ready');
      await guest.page.getByTestId('lobby-ready').click();
      for (const p of [host.page, guest.page]) {
        await p.waitForFunction(() => !!window.tavern?.versus && window.tavern.controller.state.tick > 30, null, { timeout: 30_000 });
      }
      const run = (p: Page) => p.evaluate(() => {
        const t = window.tavern!;
        const st = t.versus!.status();
        return { tick: t.controller.state.tick, route: st.route, room: st.room, ping: st.ping, run: st.run! };
      });
      await expect.poll(async () => (await run(host.page)).run.checks, { timeout: 30_000 }).toBeGreaterThan(2);
      await host.page.getByTestId('pause').click();
      // Both stop on the pause's tick before they're compared.
      await expect(host.page.getByTestId('versus-pause-title')).toHaveText('You paused');
      await expect(guest.page.getByTestId('versus-pause-title')).toHaveText('The Rival paused');
      const [h, g] = await Promise.all([run(host.page), run(guest.page)]);
      test.info().annotations.push({ type: 'live', description: `${route}: room ${code}, ping ${Math.round(h.ping ?? -1)} ms, ${h.run.checks} hash checks` });
      expect(h).toMatchObject({ route: route.toLowerCase(), room: code });
      expect(h.tick).toBe(h.run.pause!.tick);
      expect(g.tick).toBe(h.tick);
      expect(g.run.agreed).toEqual(h.run.agreed);
      expect(h.run.desyncs + g.run.desyncs).toBe(0);
    } finally {
      await host.context.close();
      await guest.context.close();
    }
  });
}
