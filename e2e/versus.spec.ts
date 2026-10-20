import type { Browser, BrowserContext, Page } from '@playwright/test';
import { encodeCode, type SdpFields } from '../src/net/codes';
import { buildInField, connectByCodes, connectByRoom, spotCorner, tapAt, touch, worldPoint } from './app';
import { expect, test, testContext } from './fixtures';

// Versus as two players play it (docs/versus-design.md §9): two browser
// contexts, each with its own storage, on the local Relay (server/, started
// by playwright.config.ts) and connected over loopback WebRTC with no STUN.
// The Host makes a room; its link opens Join on the Guest's page with the
// code filled in, and both reach the Lobby Direct. Both pick, press Ready and
// Go, then build and send through the HUD, pause together on one tick and
// resume, and the Guest concedes: the Host's end card and Versus Record show
// the win. Game time runs in real time here, as the lockstep holds a device
// that's ahead, so the Sends wait for 0:20. Then: two pages that can't
// connect directly play through the Relay's WebSocket; the codes passed by
// hand still connect; a Relay that doesn't answer shows the server waking;
// and the Join boxes say what's wrong with what was typed or pasted.

test.describe.configure({ timeout: 150_000 });

type Sides = { sides: { gold: number; income: number }[] };

interface Player {
  readonly context: BrowserContext;
  readonly page: Page;
}

/**
 * One player: a context of its own (so its own Records), silent, on the local
 * Relay, and with no STUN servers. `relay` gathers relay candidates only, and
 * with no TURN server that's none, so nothing direct can connect.
 */
async function player(browser: Browser, policy: 'all' | 'relay' = 'all'): Promise<Player> {
  const context = await browser.newContext();
  await testContext(context);
  await context.addInitScript((p) => {
    globalThis.TAVERN_ICE_SERVERS = [];
    globalThis.TAVERN_ICE_POLICY = p;
  }, policy);
  return { context, page: await context.newPage() };
}

/** The Run as a page sees it: its tick, Viewer Side, and the session's and lockstep's status, with the route and the room. */
function versusRun(page: Page) {
  return page.evaluate(() => {
    const t = window.tavern!;
    const st = t.versus!.status();
    return { tick: t.controller.state.tick, viewer: t.viewer, phase: st.phase, link: st.link, route: st.route, room: st.room, run: st.run! };
  });
}

/**
 * One end of the loopback probe, run in a page: a negotiated DataChannel, the
 * offer (or, given one, the answer) once gathering is done, and a promise of
 * the channel opening kept on `window.probe`.
 */
async function probeEnd(remote: string | null): Promise<string> {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const dc = pc.createDataChannel('probe', { negotiated: true, id: 0 });
  const open = new Promise<boolean>((resolve) => {
    dc.onopen = () => resolve(true);
    setTimeout(() => resolve(false), 10_000);
  });
  (window as unknown as { probe: unknown }).probe = { pc, open };
  if (remote) await pc.setRemoteDescription({ type: 'offer', sdp: remote });
  await pc.setLocalDescription(remote ? await pc.createAnswer() : await pc.createOffer());
  await new Promise<void>((resolve) => {
    const done = (): void => {
      if (pc.iceGatheringState === 'complete') resolve();
    };
    pc.onicegatheringstatechange = done;
    done();
    setTimeout(resolve, 5000);
  });
  return pc.localDescription!.sdp;
}

type Probe = { probe: { pc: RTCPeerConnection; open: Promise<boolean> } };

/**
 * Why two pages of this browser can't open a DataChannel to each other over
 * loopback with no STUN, or null when they can. Playwright's WebKit may hide
 * host candidates or lack WebRTC; the Versus test then skips with the reason.
 */
async function loopbackProblem(a: Page, b: Page): Promise<string | null> {
  if (!(await a.evaluate(() => typeof RTCPeerConnection === 'function'))) return 'this browser has no RTCPeerConnection';
  try {
    const offer = await a.evaluate(probeEnd, null);
    const answer = await b.evaluate(probeEnd, offer);
    await a.evaluate((sdp) => (window as unknown as Probe).probe.pc.setRemoteDescription({ type: 'answer', sdp }), answer);
    const opened = await Promise.all([a, b].map((p) => p.evaluate(() => (window as unknown as Probe).probe.open)));
    for (const p of [a, b]) await p.evaluate(() => (window as unknown as Probe).probe.pc.close());
    if (opened.every(Boolean)) return null;
    const candidates = (sdp: string): number => sdp.split('\n').filter((l) => l.startsWith('a=candidate:')).length;
    return `two pages couldn't open a DataChannel over loopback (${candidates(offer)} and ${candidates(answer)} ICE candidates gathered)`;
  } catch (err) {
    return `RTCPeerConnection failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

test('two devices connect by room code, play a Line Wars Run in lockstep, pause together, and the Guest concedes', async ({ browser }) => {
  const host = await player(browser);
  const guest = await player(browser);
  try {
    await host.page.goto('./');
    await expect(host.page.getByTestId('menu')).toBeVisible();
    if (browser.browserType().name() === 'webkit') {
      await guest.page.goto('./');
      const problem = await loopbackProblem(host.page, guest.page);
      test.skip(problem !== null, `Playwright's WebKit can't run Versus here: ${problem}`);
    }

    // The Host makes a room: its code, large, with Share, Copy and a QR of its link, and waits for the Rival.
    await host.page.getByTestId('mode-linewars').getByTestId('versus-host').click();
    const shown = host.page.getByTestId('room-code');
    await expect(shown).toHaveText(/^[A-HJ-NP-Z2-9]{4}$/, { timeout: 15_000 });
    const code = (await shown.textContent())!;
    await expect(host.page.getByTestId('join-qr')).toBeVisible();
    await expect(host.page.getByTestId('room-wait')).toHaveText('Waiting for the Rival…');

    // The Guest opens the room's link: Join with the code filled in, and the fragment gone from the address.
    await guest.page.goto('about:blank');
    await guest.page.goto(new URL(`./#room=${code}`, host.page.url()).href);
    await expect(guest.page.getByTestId('room-input')).toHaveValue(code);
    expect(guest.page.url()).not.toContain('#room');
    await guest.page.getByTestId('room-join').click();

    // Both reach the Lobby, connected directly.
    for (const p of [host.page, guest.page]) {
      await expect(p.getByTestId('lobby')).toBeVisible({ timeout: 20_000 });
      await expect(p.getByTestId('lobby-route')).toHaveText('Direct');
    }

    // Each picks, sees the other's pick and the ping, and presses Ready; the Host's app starts the Run.
    await host.page.getByTestId('lobby-race-ironclad').click();
    await guest.page.getByTestId('lobby-race-rimeborn').click();
    await expect(host.page.getByTestId('lobby-rival')).toHaveText('Rimeborn');
    await expect(guest.page.getByTestId('lobby-rival')).toHaveText('Ironclad');
    // The Lobby pings every 500 ms both ways; that ping is the Run's.
    for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-ping')).toHaveText(/^\d+ ms$/);
    await host.page.getByTestId('lobby-ready').click();
    await expect(guest.page.getByTestId('lobby-rival')).toHaveText('Ironclad · Ready');
    await guest.page.getByTestId('lobby-ready').click();

    // Go after the 3 s countdown (which a slow machine may still be building the board through): both step.
    for (const p of [host.page, guest.page]) {
      await p.waitForFunction(() => !!window.tavern?.versus && window.tavern.controller.state.tick > 0, null, { timeout: 15_000 });
    }
    expect((await versusRun(host.page)).viewer).toBe(0);
    expect((await versusRun(guest.page)).viewer).toBe(1);
    for (const p of [host.page, guest.page]) expect(await versusRun(p)).toMatchObject({ route: 'direct', room: code });
    await expect(guest.page.getByTestId('speed-1')).toHaveCount(0);
    await expect(guest.page.getByTestId('versus-line')).toHaveText(/^Ping \d+ ms$/);
    await expect(host.page.getByTestId('rival')).toHaveText('Rimeborn · +10');

    // The Guest builds a Rime Wall through the HUD: in Side 1's Field, drawn right of the middle on its mirrored board.
    const side1Towers = (page: Page): Promise<string[]> => page.evaluate(() => {
      const state = window.tavern!.controller.state;
      return state.towers.filter((t) => t.cell % state.map.cols < 16).map((t) => t.spec);
    });
    await guest.page.locator('[data-action="build-wall"]').click();
    const canvas = (await guest.page.locator('#board canvas').boundingBox())!;
    const [wx, wy] = spotCorner(4, 10);
    const spot = await worldPoint(guest.page, wx, wy);
    expect(spot.x).toBeGreaterThan(canvas.x + canvas.width / 2);
    if (touch()) {
      await tapAt(guest.page, spot.x, spot.y);
      await expect(guest.page.getByTestId('hint')).toHaveText(/tap again to build/);
    }
    await tapAt(guest.page, spot.x, spot.y);
    // It lands a few Turns later on both devices.
    for (const p of [guest.page, host.page]) await expect.poll(() => side1Towers(p)).toEqual(['rime_wall']);
    const log = await guest.page.evaluate(() => window.tavern!.controller.log.map((e) => e.command));
    expect(log).toContainEqual({ type: 'lw.build', side: 1, spec: 'rime_wall', col: 4, row: 10 });
    // Its gold is its own: Side 1's purse, 10 below the Host's, who has built nothing yet.
    const purses = await guest.page.evaluate(() => {
      const sides = (window.tavern!.controller.state.mode as Sides).sides;
      return { hud: Number(document.querySelector('[data-testid="gold"]')!.textContent), mine: sides[1]!.gold, theirs: sides[0]!.gold };
    });
    expect(purses.hud).toBe(purses.mine);
    expect(purses.theirs - purses.mine).toBe(10);

    // The Host builds in its own Field, on the right of its unmirrored board.
    await buildInField(host.page, 'wall', 30, 10);

    // Snowlings unlock at 0:20; each sends through the HUD, and both devices see both Sends.
    await host.page.waitForFunction(() => window.tavern!.controller.state.tick > 20 * 30 + 3, null, { timeout: 40_000 });
    await guest.page.waitForFunction(() => window.tavern!.controller.state.tick > 20 * 30 + 3, null, { timeout: 10_000 });
    await guest.page.locator('[data-action="send-snowlings"]').click();
    await host.page.locator('[data-action="send-snowlings"]').click();
    await expect(guest.page.getByTestId('income-value')).toHaveText('+12');
    await expect(host.page.getByTestId('income-value')).toHaveText('+12');
    const incomes = (page: Page) => page.evaluate(() => (window.tavern!.controller.state.mode as Sides).sides.map((s) => s.income));
    for (const p of [host.page, guest.page]) await expect.poll(() => incomes(p)).toEqual([12, 12]);

    // A Guest pause stops both on the same tick, and the hash checks agree there.
    await expect.poll(async () => (await versusRun(host.page)).run.checks, { timeout: 15_000 }).toBeGreaterThan(2);
    await guest.page.getByTestId('pause').click();
    await expect(host.page.getByTestId('versus-pause-title')).toHaveText('The Rival paused');
    await expect(guest.page.getByTestId('versus-pause-title')).toHaveText('You paused');
    const [h, g] = await Promise.all([versusRun(host.page), versusRun(guest.page)]);
    expect(h.run.pause!.tick).toBe(g.run.pause!.tick);
    expect(h.tick).toBe(h.run.pause!.tick);
    expect(g.tick).toBe(h.tick);
    expect(h.run.agreed).not.toBeNull();
    expect(g.run.agreed).toEqual(h.run.agreed);
    expect(h.run.desyncs + g.run.desyncs).toBe(0);
    await guest.page.waitForTimeout(500);
    expect((await versusRun(host.page)).tick).toBe(h.tick);

    // Ready on both resumes after a 3 s countdown.
    await guest.page.getByTestId('versus-ready').click();
    await expect(host.page.getByTestId('versus-rival-ready')).toHaveText('Rival: Ready ✓');
    await host.page.getByTestId('versus-ready').click();
    await expect(host.page.getByTestId('versus-pause-text')).toHaveText(/^Resuming in \d…$/);
    for (const p of [host.page, guest.page]) {
      await expect(p.getByTestId('versus-pause')).toBeHidden({ timeout: 10_000 });
      await expect.poll(async () => (await versusRun(p)).tick).toBeGreaterThan(h.tick + 30);
    }

    // The Guest concedes from the in-Run menu, which doesn't pause the Run, and is back at the main menu.
    await guest.page.getByTestId('menu-button').click();
    await expect(guest.page.getByTestId('run-menu')).toContainText('Menu');
    await expect(guest.page.getByTestId('quit')).toHaveCount(0);
    await guest.page.getByTestId('concede').click();
    await guest.page.getByTestId('concede-yes').click();
    await expect(guest.page.getByTestId('menu')).toBeVisible();

    // The Host's end card says the Rival conceded, with the score so far.
    await expect(host.page.getByTestId('end-title')).toHaveText('Victory', { timeout: 10_000 });
    await expect(host.page.getByTestId('end-summary')).toHaveText('The Rival conceded');
    await expect(host.page.getByTestId('end-score')).toHaveText(/\d/);
    await expect(host.page.getByTestId('play-again')).toHaveCount(0);
    await host.page.getByTestId('end-menu').click();

    // Each device's Versus Record: a win for the Host with no fastest time, a loss for the Guest.
    for (const [p, won] of [[host.page, '1'], [guest.page, '0']] as const) {
      await expect(p.getByTestId('menu')).toBeVisible();
      await p.getByTestId('records').click();
      const row = p.getByTestId('records-linewars').getByTestId('records-row-versus');
      await expect(row.locator('td').nth(2)).toHaveText('–');
      await expect(row.locator('td').nth(3)).toHaveText('1');
      await expect(row.locator('td').nth(4)).toHaveText(won);
    }
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});

const desktopChromeOnly = (): void => {
  test.skip(test.info().project.name !== 'mac-chrome', 'The Relay\'s other paths run on desktop Chrome');
};

test('two devices that can\'t connect directly play through the Relay, Relayed on both, and agree', async ({ browser }) => {
  desktopChromeOnly();
  const host = await player(browser, 'relay');
  const guest = await player(browser, 'relay');
  try {
    // Nothing direct can open, so 5 s after the answer the Host sends both through the Relay. The Guest types the code in lower case.
    const code = await connectByRoom(host.page, guest.page, (c) => c.toLowerCase());
    for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-route')).toHaveText('Relayed');

    // Into a Run, where the HUD says relayed and the hash checks agree. The Lobby's ping, through the Relay, is the Run's.
    await host.page.getByTestId('lobby-race-ironclad').click();
    await guest.page.getByTestId('lobby-race-rimeborn').click();
    for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-ping')).toHaveText(/^\d+ ms$/);
    await host.page.getByTestId('lobby-ready').click();
    await expect(guest.page.getByTestId('lobby-rival')).toHaveText('Ironclad · Ready');
    await guest.page.getByTestId('lobby-ready').click();
    for (const p of [host.page, guest.page]) {
      await p.waitForFunction(() => !!window.tavern?.versus && window.tavern.controller.state.tick > 30, null, { timeout: 20_000 });
      expect(await versusRun(p)).toMatchObject({ route: 'relayed', room: code, link: 'open' });
      await expect(p.getByTestId('versus-line')).toHaveText(/^Ping \d+ ms · relayed$/);
    }
    await expect.poll(async () => (await versusRun(host.page)).run.checks, { timeout: 20_000 }).toBeGreaterThan(2);
    await host.page.getByTestId('pause').click();
    // Both stop on the pause's tick before they're compared.
    await expect(host.page.getByTestId('versus-pause-title')).toHaveText('You paused');
    await expect(guest.page.getByTestId('versus-pause-title')).toHaveText('The Rival paused');
    const [h, g] = await Promise.all([versusRun(host.page), versusRun(guest.page)]);
    expect(h.tick).toBe(h.run.pause!.tick);
    expect(g.tick).toBe(h.tick);
    expect(h.run.agreed).not.toBeNull();
    expect(g.run.agreed).toEqual(h.run.agreed);
    expect(h.run.desyncs + g.run.desyncs).toBe(0);
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});

test('the codes passed by hand still connect, Direct, from the room\'s Use codes instead', async ({ browser }) => {
  desktopChromeOnly();
  const host = await player(browser);
  const guest = await player(browser);
  try {
    await connectByCodes(host.page, guest.page);
    for (const p of [host.page, guest.page]) await expect(p.getByTestId('lobby-route')).toHaveText('Direct');
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});

test('while the Relay doesn\'t answer, Host says the server is waking, and codes still work', async ({ browser }) => {
  desktopChromeOnly();
  const context = await browser.newContext();
  // Nothing listens there, so every try fails at once.
  await testContext(context, 'http://localhost:9');
  const page = await context.newPage();
  try {
    await page.goto('./');
    await page.getByTestId('mode-linewars').getByTestId('versus-host').click();
    await expect(page.getByTestId('room-wait')).toHaveText('Making a room…');
    await expect(page.getByTestId('room-wait')).toHaveText('Waking the server… up to a minute', { timeout: 5000 });
    await page.getByTestId('use-codes').click();
    await expect(page.getByTestId('join-link')).toHaveValue(/#join=TTDJ1\./, { timeout: 15_000 });
  } finally {
    await context.close();
  }
});

test('the room\'s Join box says when a code is mistyped or no such room is open', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('mode-linewars').getByTestId('versus-join').click();
  const box = page.getByTestId('room-input');
  await box.fill('K0QX');
  await page.getByTestId('room-join').click();
  await expect(page.getByTestId('swap-error')).toHaveText('A room code is 4 letters and digits, with no O, 0, I or 1.');
  await box.fill('zzzz');
  await page.getByTestId('room-join').click();
  await expect(page.getByTestId('room-error')).toHaveText('No room ZZZZ is open. Check the code with the Host.');
  await page.getByTestId('room-retry').click();
  await expect(box).toHaveValue('ZZZZ');
  // Codes instead, and back.
  await page.getByTestId('use-codes').click();
  await expect(page.getByTestId('join-paste')).toBeVisible();
  await page.getByTestId('use-room').click();
  await expect(box).toBeVisible();
});

// Codes made here in Node, as a browser's description would give them; none needs WebRTC to be refused.
const FIELDS: SdpFields = {
  ufrag: 'abcd', pwd: 'passwordpasswordpassword', fingerprint: Array.from({ length: 32 }, () => 'AB').join(':'), setup: 'actpass', mid: '0',
  candidates: [{ kind: 'host', family: 'ipv4', address: '192.168.1.20', port: 50000 }],
};

test('the Join box says what is wrong with a damaged code, an Answer code or another version\'s', async ({ page }) => {
  const other = encodeCode({ kind: 'join', sim: '00000000', session: null, ...FIELDS });
  const answer = encodeCode({ kind: 'answer', sim: '00000000', session: null, ...FIELDS });
  await page.goto('./');
  await page.getByTestId('mode-linewars').getByTestId('versus-join').click();
  await page.getByTestId('use-codes').click();
  const box = page.getByTestId('join-paste');
  const error = page.getByTestId('swap-error');
  for (const [text, says] of [
    [`${other.slice(0, -8)}`, /damaged or cut off/],
    [answer, /^That's an Answer code/],
    [other, /different version of Tavern TD/],
  ] as const) {
    await box.fill(text);
    await expect(error).toHaveCount(0);
    await page.getByTestId('join-go').click();
    await expect(error).toHaveText(says);
  }
  // Back leaves for the main menu.
  await page.getByTestId('back').click();
  await expect(page.getByTestId('menu')).toBeVisible();
});
