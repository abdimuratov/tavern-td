import { afterEach, describe, expect, it } from 'vitest';
import { AWAKE_MS, createWake, healthUrl, relayTransport, relayUrl, roomSocketUrl, type WakeState } from '../../src/net/relay';
import { openRoom } from '../../src/net/room';
import { FakeRelay, settle } from './fake-relay';
import { VirtualTime } from './harness';

// The Relay as the app sees it (docs/versus-design.md §2): its address, the
// warm-up the main menu sends, and its relayed frames as a Transport.

afterEach(() => {
  globalThis.TAVERN_RELAY_URL = undefined;
});

describe('The address', () => {
  it('is the test hook\'s when set, without a trailing slash, and gives the socket and health URLs', () => {
    globalThis.TAVERN_RELAY_URL = 'https://tavern-relay.onrender.com/';
    expect(relayUrl()).toBe('https://tavern-relay.onrender.com');
    expect(roomSocketUrl(relayUrl())).toBe('wss://tavern-relay.onrender.com/room');
    expect(roomSocketUrl('http://localhost:8787')).toBe('ws://localhost:8787/room');
    expect(healthUrl('http://localhost:8787')).toBe('http://localhost:8787/health');
    globalThis.TAVERN_RELAY_URL = '';
    expect(relayUrl()).toBe('');
  });
});

describe('The warm-up', () => {
  function setup(url = 'https://relay.test') {
    let now = 0;
    const asked: { url: string; init: RequestInit }[] = [];
    let answer: (ok: boolean) => void = () => {};
    let fail: () => void = () => {};
    const wake = createWake({
      url: () => url,
      clock: { now: () => now },
      fetch: (u, init) => {
        asked.push({ url: u, init });
        return new Promise((resolve, reject) => {
          answer = (ok) => resolve({ ok });
          fail = () => reject(new TypeError('Failed to fetch'));
        });
      },
    });
    const states: WakeState[] = [];
    wake.on((s) => states.push(s));
    return { wake, asked, states, answer: (ok: boolean) => answer(ok), fail: () => fail(), at: (ms: number) => (now = ms) };
  }

  it('knocks once on /health with a plain GET and no cookies, and is awake when it answers', async () => {
    const w = setup();
    w.at(100);
    w.wake.wake();
    w.wake.wake();
    expect(w.asked).toHaveLength(1);
    expect(w.asked[0]!.url).toBe('https://relay.test/health');
    expect(w.asked[0]!.init).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    expect(w.asked[0]!.init.headers).toBeUndefined();
    expect(w.wake).toMatchObject({ state: 'waking', since: 100 });
    w.answer(true);
    await settle();
    expect(w.wake.state).toBe('awake');
    expect(w.states).toEqual(['waking', 'awake']);
  });

  it('doesn\'t knock again for 10 minutes after an answer, then does', async () => {
    const w = setup();
    w.wake.wake();
    w.answer(true);
    await settle();
    w.at(AWAKE_MS - 1);
    w.wake.wake();
    expect(w.asked).toHaveLength(1);
    w.at(AWAKE_MS);
    w.wake.wake();
    expect(w.asked).toHaveLength(2);
  });

  it('is down when the knock fails or answers badly, and knocks again when asked', async () => {
    const w = setup();
    w.wake.wake();
    w.fail();
    await settle();
    expect(w.wake.state).toBe('down');
    w.wake.wake();
    w.answer(false);
    await settle();
    expect(w.wake.state).toBe('down');
    expect(w.asked).toHaveLength(2);
  });

  it('does nothing with no Relay set up', () => {
    const w = setup('');
    w.wake.wake();
    expect(w.asked).toHaveLength(0);
    expect(w.wake.state).toBe('idle');
  });
});

describe('The relayed transport', () => {
  async function pair() {
    const time = new VirtualTime();
    const relay = new FakeRelay(time);
    const clock = time.clockFor({ suspended: false });
    const host = openRoom({ role: 'host', url: 'ws://relay.test/room', clock, socket: relay.socket });
    await settle();
    const guest = openRoom({ role: 'guest', code: 'ABCD', url: 'ws://relay.test/room', clock, socket: relay.socket });
    await settle();
    return { relay, host, guest };
  }

  it('is open, Relayed, and carries text both ways in order, as frames of its own attempt only', async () => {
    const { host, guest } = await pair();
    const a = relayTransport(host, 7);
    const b = relayTransport(guest, 7);
    const stale = relayTransport(guest, 6);
    expect([a.state, a.route, b.state]).toEqual(['open', 'relayed', 'open']);
    const got: string[] = [];
    const old: string[] = [];
    b.onMessage((m) => got.push(m));
    stale.onMessage((m) => old.push(m));
    for (const m of ['one', 'two', 'three']) a.send(m);
    await settle();
    expect(got).toEqual(['one', 'two', 'three']);
    expect(old).toEqual([]);
  });

  it('closes for good once the Rival\'s app leaves the room or its own socket drops', async () => {
    const { relay, host, guest } = await pair();
    const a = relayTransport(host, 1);
    const b = relayTransport(guest, 1);
    relay.drop(relay.sockets[1]!);
    await settle();
    expect(a.state).toBe('closed');
    expect(b.state).toBe('closed');
    // A transport made while the Rival is away is closed from the start.
    expect(relayTransport(host, 2).state).toBe('closed');
  });
});
