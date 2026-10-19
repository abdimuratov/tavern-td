import { describe, expect, it } from 'vitest';
import { browserName, isIos, joinInUrl, linkBase, PAGES_URL } from '../src/app/versus-link';
import { RACES } from '../src/content/maul';
import { CONNECT_TIMEOUT_MS, joinLink, type LockstepStatus, type PauseStatus, type SessionStatus } from '../src/net';
import { linewars } from '../src/sim';
import { LINEWARS_UI } from '../src/ui/modes/linewars';
import { lwEndText } from '../src/ui/modes/linewars/text';
import type { CodeSwap } from '../src/ui/versus/state';
import { linkDown, versusRunOn, type VersusState } from '../src/ui/versus/state';
import {
  ageText, boardBanner, connectionLine, countdownSeconds, FAIL_TEXT, FAIL_TEXT_NO_RELAY, FAIL_TEXT_RELAYED, failText, lostText, mismatchText,
  pauseView, raceChoices, RELAY_NOTE, rivalLobbyText, routeText, sessionEndText, sessionRunEnd, STALE_MS, swapStale, swapTimedOut,
} from '../src/ui/versus/text';
import { newRun } from './sim/linewars/helpers';

// The pure parts of the Versus screens (docs/versus-design.md §2–§6): reading
// a Join link at boot, the address a link opens, the device's name for
// reports, and every line the screens decide from the session's status.

const CODE = 'TTDJ1.AQEAq83vAQRhYmNkGHBhc3N3b3JkcGFzc3dvcmRwYXNzd29yZAAA';

const LOCKSTEP: LockstepStatus = {
  side: 0, delay: 3, tick: 300, turn: 100, countdownMs: 0, started: true, waitingMs: 0, waits: 0, waitedMs: 0, pause: null, pausing: false,
  away: [false, false], syncing: false, desyncs: 0, agreed: { tick: 270, hash: 'abcd' }, checks: 9, ended: null, resent: 0,
};

function status(o: Partial<SessionStatus> = {}, run: Partial<LockstepStatus> | null = {}): SessionStatus {
  return {
    phase: 'playing', role: 'host', side: 0, link: 'open', route: null, lastHeardMs: 20, ping: 42, delay: 3, slow: false,
    lobby: { mine: { race: 'ironclad', random: false, ready: false }, rival: { race: 'rimeborn', ready: false, here: true } },
    mismatch: null, outcome: null, canClaim: false, rivalAway: false, rivalBuild: 'bbbbbbb', rivalBrowser: 'Safari 26 · iOS',
    session: '0123456789abcdef', run: run === null ? null : { ...LOCKSTEP, ...run }, ...o,
  };
}

function pause(o: Partial<PauseStatus> = {}): PauseStatus {
  return { turn: 120, tick: 360, by: [1], kinds: ['pause'], ready: [false, false], resumeInMs: null, ...o };
}

const swap = (o: Partial<CodeSwap>): CodeSwap => ({
  role: 'host', step: 'offer', code: 'link', madeAt: 0, connectingAt: null, error: null, prefill: '', reconnect: false, relay: 'none', rivalRelay: false, ...o,
});

describe('Versus links', () => {
  it('reads a Join code from the fragment of a link, and gives the address back without it', () => {
    const link = joinLink('https://abdimuratov.github.io/tavern-td/', CODE);
    expect(link).toBe(`https://abdimuratov.github.io/tavern-td/#join=${CODE}`);
    expect(joinInUrl(link)).toEqual({ code: CODE, clean: '/tavern-td/' });
    // A query the app was opened with stays; spaces a messenger added are dropped.
    expect(joinInUrl(`http://localhost:4173/tavern-td/?fps#join=${CODE.slice(0, 20)} ${CODE.slice(20)}`))
      .toEqual({ code: CODE, clean: '/tavern-td/?fps' });
  });

  it('takes ?join= too, in case a messenger moved the fragment, and keeps the rest of the address', () => {
    expect(joinInUrl(`https://abdimuratov.github.io/tavern-td/?join=${CODE}&fps`)).toEqual({ code: CODE, clean: '/tavern-td/?fps' });
  });

  it('finds nothing in an address without a Join code', () => {
    expect(joinInUrl('https://abdimuratov.github.io/tavern-td/')).toBeNull();
    expect(joinInUrl('https://abdimuratov.github.io/tavern-td/#settings')).toBeNull();
    expect(joinInUrl('https://abdimuratov.github.io/tavern-td/#join=')).toBeNull();
    expect(joinInUrl('not a url')).toBeNull();
  });

  it('links to the web app itself, and from the Android app to Pages', () => {
    expect(linkBase('web', 'http://localhost:4173', '/tavern-td/')).toBe('http://localhost:4173/tavern-td/');
    expect(linkBase('web', 'https://abdimuratov.github.io', '/tavern-td/')).toBe(PAGES_URL);
    expect(linkBase('android', 'https://localhost', '/')).toBe(PAGES_URL);
    expect(linkBase('web', 'capacitor://localhost', '/')).toBe(PAGES_URL);
  });
});

describe('the device name in Hello and reports', () => {
  it('names the engine and the system briefly', () => {
    expect(browserName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'))
      .toBe('Chrome 141 · macOS');
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'))
      .toBe('Safari 26.0 · iOS');
    expect(browserName('Mozilla/5.0 (Linux; Android 16; SM-S928B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36'))
      .toBe('WebView 141 · Android');
    expect(browserName('Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'))
      .toBe('Chrome 141 · Android');
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1'))
      .toBe('Chrome 141 · iOS');
    expect(browserName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0')).toBe('Firefox 144 · macOS');
  });

  it('counts an iPad, which says Macintosh, as iOS by its touch points', () => {
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
    expect(isIos(ipad, 5)).toBe(true);
    expect(isIos(ipad, 0)).toBe(false);
    expect(browserName(ipad, 5)).toBe('Safari 26.0 · iOS');
  });
});

describe('the code swap', () => {
  it('shows a code\'s age, and calls it stale after 2 minutes on either side', () => {
    expect(ageText(0)).toBe('0:00');
    expect(ageText(65_400)).toBe('1:05');
    expect(swapStale(swap({ madeAt: 1000 }), 1000 + STALE_MS - 1)).toBe(false);
    expect(swapStale(swap({ madeAt: 1000 }), 1000 + STALE_MS)).toBe(true);
    expect(swapStale(swap({ role: 'guest', step: 'answer', madeAt: 0 }), STALE_MS)).toBe(true);
    // Still being made, or already connecting: no age to warn about.
    expect(swapStale(swap({ step: 'making', madeAt: null }), STALE_MS)).toBe(false);
  });

  it('gives up "Connecting…" 20 s after the Host had both codes (§3)', () => {
    const connecting = swap({ step: 'connecting', connectingAt: 5000 });
    expect(swapTimedOut(connecting, 5000 + CONNECT_TIMEOUT_MS - 1)).toBe(false);
    expect(swapTimedOut(connecting, 5000 + CONNECT_TIMEOUT_MS)).toBe(true);
    expect(swapTimedOut(swap({ step: 'offer' }), 10 * CONNECT_TIMEOUT_MS)).toBe(false);
  });

  it('says why it couldn\'t connect: even the relay, the relay unreachable, or no relay at all (§3)', () => {
    // A relay candidate in either code: the Relay was tried.
    expect(failText(swap({ relay: 'offered' }))).toBe(FAIL_TEXT_RELAYED);
    expect(failText(swap({ relay: 'unavailable', rivalRelay: true }))).toBe(FAIL_TEXT_RELAYED);
    expect(failText(swap({ relay: 'none', rivalRelay: true }))).toBe(FAIL_TEXT_RELAYED);
    expect(FAIL_TEXT_RELAYED).toMatch(/^Even the relay couldn't link you/);
    // A Relay set up but in neither code, and no Relay at all, as before.
    expect(failText(swap({ relay: 'unavailable' }))).toBe(FAIL_TEXT_NO_RELAY);
    expect(failText(swap({ relay: 'unneeded' }))).toBe(FAIL_TEXT_NO_RELAY);
    expect(FAIL_TEXT_NO_RELAY).toContain("the relay couldn't be reached");
    expect(failText(swap({}))).toBe(FAIL_TEXT);
    expect(FAIL_TEXT).toContain('Tavern TD has no relay server');
    expect(RELAY_NOTE).toBe('Relay unavailable: only direct connections will work.');
  });

  it('says what differs when the versions don\'t match, and when the Host\'s Run is gone', () => {
    expect(mismatchText({ why: 'version', mine: 'a1b2c3d', rival: 'e4f5a6b' }).text).toBe(
      "You have different versions of Tavern TD (yours a1b2c3d, the Rival's e4f5a6b). Update both: reload the web app, or reinstall the Android app.",
    );
    expect(mismatchText({ why: 'start', mine: 'a1b2c3d', rival: null }).text).toContain("the Rival's ?");
    expect(mismatchText({ why: 'gone', mine: 'a1b2c3d', rival: null }).title).toBe("The Host's Run is gone");
  });
});

describe('the Lobby', () => {
  it('lists Random first, then the four Races', () => {
    expect(raceChoices(RACES).map((c) => c.id)).toEqual(['random', ...RACES]);
  });

  it('says what the Rival picked and whether it\'s Ready, or that it\'s still on the end card', () => {
    const lobby = status().lobby;
    expect(rivalLobbyText(lobby)).toBe('Rimeborn');
    expect(rivalLobbyText({ ...lobby, rival: { race: 'rimeborn', ready: true, here: true } })).toBe('Rimeborn · Ready');
    expect(rivalLobbyText({ ...lobby, rival: { race: null, ready: false, here: true } })).toBe('Picking…');
    expect(rivalLobbyText({ ...lobby, rival: { race: 'rimeborn', ready: false, here: false } })).toBe('Still on the end card');
  });

  it('names the route beside the ping', () => {
    expect(routeText('direct')).toBe('Direct');
    expect(routeText('relayed')).toBe('Relayed');
  });
});

describe('in a Run', () => {
  it('shows the ping in the HUD, then "Waiting for the Rival…" from 1 s and "Connection unstable…" (§5.3)', () => {
    expect(connectionLine(status())).toEqual({ text: 'Ping 42 ms', tone: 'ok' });
    expect(connectionLine(status({ ping: null }))).toEqual({ text: 'Ping –', tone: 'ok' });
    expect(connectionLine(status({ ping: 900 }))).toEqual({ text: 'Ping 900 ms', tone: 'warn' });
    expect(connectionLine(status({}, { waitingMs: 999 })).text).toBe('Ping 42 ms');
    expect(connectionLine(status({}, { waitingMs: 1000 }))).toEqual({ text: 'Waiting for the Rival…', tone: 'warn' });
    expect(connectionLine(status({ rivalAway: true }, { waitingMs: 1500 })).text).toBe("The Rival's app is in the background");
    expect(connectionLine(status({ link: 'unstable' }, { waitingMs: 6000 }))).toEqual({ text: 'Connection unstable…', tone: 'warn' });
    expect(connectionLine(status({ link: 'lost' }))).toEqual({ text: 'Connection lost', tone: 'error' });
    // Held at a pause is no wait.
    expect(connectionLine(status({}, { waitingMs: 3000, pause: pause() })).text).toBe('Ping 42 ms');
  });

  it('adds "· relayed" to the HUD\'s line while the Relay carries the connection, and nothing while it\'s Direct', () => {
    const relayed = { route: 'relayed' } as const;
    expect(connectionLine(status(relayed))).toEqual({ text: 'Ping 42 ms · relayed', tone: 'ok' });
    expect(connectionLine(status({ ...relayed, ping: null })).text).toBe('Ping – · relayed');
    expect(connectionLine(status(relayed, { waitingMs: 1000 })).text).toBe('Waiting for the Rival… · relayed');
    expect(connectionLine(status({ ...relayed, link: 'unstable' })).text).toBe('Connection unstable… · relayed');
    // Not where the line is about the Rival's app, or the connection is down.
    expect(connectionLine(status({ ...relayed, rivalAway: true }, { waitingMs: 1500 })).text).toBe("The Rival's app is in the background");
    expect(connectionLine(status({ ...relayed, link: 'lost' })).text).toBe('Connection lost');
    expect(connectionLine(status({ ...relayed, link: 'connecting' })).text).toBe('Reconnecting…');
    expect(connectionLine(status({ route: 'direct' })).text).toBe('Ping 42 ms');
  });

  it('puts a banner over the board for a repair, a pause on its way or a wait, and none while a sheet says it', () => {
    expect(boardBanner(status())).toBeNull();
    expect(boardBanner(status({}, { syncing: true }))).toBe('Out of sync: fixing…');
    expect(boardBanner(status({}, { pausing: true }))).toBe('Pausing…');
    expect(boardBanner(status({}, { waitingMs: 1200 }))).toBe('Waiting for the Rival…');
    expect(boardBanner(status({ link: 'unstable' }))).toBe('Connection unstable…');
    expect(boardBanner(status({}, { pause: pause(), waitingMs: 5000 }))).toBeNull();
    expect(boardBanner(status({ link: 'lost' }, { waitingMs: 5000 }))).toBeNull();
    expect(boardBanner(status({}, { ended: 'stopped', syncing: true }))).toBeNull();
    expect(boardBanner(status({ phase: 'starting' }))).toBeNull();
  });

  it('says who paused, and each player\'s Ready from this device\'s Side', () => {
    expect(pauseView(pause({ by: [1] }), 0, [false, false])).toMatchObject({ title: 'The Rival paused', mine: false, rival: false, resumeIn: null });
    expect(pauseView(pause({ by: [1], ready: [false, true] }), 1, [false, false])).toMatchObject({ title: 'You paused', mine: true, rival: false });
    expect(pauseView(pause({ by: [0, 1] }), 0, [false, false]).title).toBe('You both paused');
    expect(pauseView(pause({ kinds: ['away', 'pause'], by: [1] }), 0, [false, true]).title).toBe("The Rival's app is in the background");
    expect(pauseView(pause({ kinds: ['away'], by: [1] }), 0, [false, true]).text).toMatch(/once the Rival returns/);
    expect(pauseView(pause({ kinds: ['away'], by: [1] }), 0, [false, false]).title).toBe('The Rival is back');
    expect(pauseView(pause({ kinds: ['away'], by: [0] }), 0, [false, false]).title).toBe('Your app was in the background');
    expect(pauseView(pause({ kinds: ['link'], by: [0, 1] }), 1, [false, false]).title).toBe('The connection is back');
    expect(pauseView(pause({ ready: [true, true], resumeInMs: 2400 }), 0, [false, false]).resumeIn).toBe(2400);
    expect(countdownSeconds(2400)).toBe(3);
    expect(countdownSeconds(1000)).toBe(1);
    expect(countdownSeconds(0)).toBe(0);
  });

  it('tells the Host and the Guest how a Reconnect goes, and when the win may be claimed (§5.4–§5.5)', () => {
    expect(lostText(status()).text).toMatch(/Reconnect makes a new code to send the Rival\.$/);
    expect(lostText(status({ role: 'guest', side: 1 })).text).toMatch(/Reconnect takes a new code from the Host\.$/);
    expect(lostText(status({ rivalAway: true })).text).toMatch(/^The Rival's app went to the background/);
    expect(lostText(status()).claim).toMatch(/^If the Rival is gone 2 minutes/);
    expect(lostText(status({ canClaim: true })).claim).toMatch(/you may claim the win\.$/);
  });

  it('marks a pending build on its footprint, and an upgrade or sale on its tower', () => {
    const state = newRun();
    expect(LINEWARS_UI.pendingMark!(state, { type: 'lw.build', side: 1, spec: 'rime_wall', col: 4, row: 10 } as never))
      .toEqual({ x: 5 * 64, y: 11 * 64, span: 128 });
    expect(LINEWARS_UI.pendingMark!(state, { type: 'lw.upgrade', side: 1, tower: 999, to: 'x' } as never)).toBeNull();
    expect(LINEWARS_UI.pendingMark!(state, { type: 'lw.send', side: 1, send: 'snowlings' } as never)).toBeNull();
  });

  it('keeps the Connection lost sheet up while a Reconnect\'s new connection is still connecting', () => {
    const v = (o: Partial<SessionStatus>, reconnecting = false, swapOpen = false): VersusState => ({
      role: 'host', swap: swapOpen ? swap({}) : null, status: status(o), now: 0, inRun: true, report: false, rejoin: false, reconnecting,
    });
    expect(linkDown(v({ link: 'open' }))).toBe(false);
    expect(linkDown(v({ link: 'lost' }))).toBe(true);
    expect(linkDown(v({ link: 'connecting' }))).toBe(true);
    expect(linkDown(v({ link: 'open' }, true, true))).toBe(true);
    // The first connection isn't a lost one.
    expect(linkDown(v({ link: 'connecting', phase: 'connecting' }))).toBe(false);
    expect(connectionLine(status({ link: 'connecting' }))).toEqual({ text: 'Reconnecting…', tone: 'error' });
    expect(boardBanner(status({ link: 'connecting' }, { waitingMs: 4000 }))).toBeNull();
  });

  it('holds the new version\'s reload while a Versus Run is on', () => {
    const v = (phase: SessionStatus['phase']): VersusState => ({
      role: 'host', swap: null, status: status({ phase }), now: 0, inRun: true, report: false, rejoin: false, reconnecting: false,
    });
    expect(versusRunOn(null)).toBe(false);
    expect(versusRunOn(v('playing'))).toBe(true);
    expect(versusRunOn(v('starting'))).toBe(true);
    expect(versusRunOn(v('lobby'))).toBe(false);
    expect(versusRunOn(v('over'))).toBe(false);
  });
});

describe('the end card', () => {
  it('reads a Run the sim ended from the viewer\'s Side, without "on Normal" in Versus', () => {
    const won = newRun();
    linewars.endRun(won, 1, 'lives', []);
    expect(lwEndText(won, 1, true)).toMatchObject({ won: true, title: 'Victory', summary: "You took the Rival's last life" });
    expect(lwEndText(won, 1)).toMatchObject({ summary: "You took the Rival's last life on Normal" });
    const drained = newRun();
    linewars.endRun(drained, 0, 'drain', []);
    expect(lwEndText(drained, 0, true).summary).toBe('Sudden Death drained the Rival first');
    const draw = newRun();
    linewars.endRun(draw, null, 'draw', []);
    expect(lwEndText(draw, 0, true).summary).toBe('Both Sides ran out of lives together, on the same Income');
    expect(lwEndText(draw, 0).summary).toBe('Both Sides ran out of lives together, on the same Income, on Normal');
  });

  it('says why for a Run the session ended: a Concede either way, a claimed win, a second Desync', () => {
    expect(sessionEndText('rival-conceded')).toEqual({ won: true, title: 'Victory', summary: 'The Rival conceded' });
    expect(sessionEndText('claimed')).toMatchObject({ won: true, title: 'Victory' });
    expect(sessionEndText('conceded')).toMatchObject({ won: false, title: 'Defeat', summary: 'You conceded' });
    expect(sessionEndText('desync')).toMatchObject({ won: false, title: 'Out of sync' });
  });

  it('keeps the score so far and the lives stolen from the viewer\'s Side, and no fastest time; a Desync shows no score', () => {
    const state = newRun();
    state.mode.sides[1].stolen = 4;
    state.mode.sides[1].bounty = 30;
    state.tick = 30 * 125;
    const end = sessionRunEnd('rival-conceded', state, 1, 'Rimeborn vs Ironclad');
    expect(end).toMatchObject({ won: true, title: 'Victory', wave: '4', score: linewars.lwScore(state, 1), seconds: null, options: 'Rimeborn vs Ironclad' });
    expect(sessionRunEnd('desync', state, 1, '').score).toBeNull();
  });
});
