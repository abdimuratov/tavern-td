import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH } from '../../server/src/rooms.ts';
import { PROTOCOL } from '../../server/src/server.ts';
import {
  BACKOFF_MS, isRoomCode, KEEPALIVE_MS, OPEN_MS, openRoom, readSignal, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_PROTOCOL,
  type Room, type RoomEvent, type RoomOptions,
} from '../../src/net/room';
import { FakeRelay, settle } from './fake-relay';
import { VirtualTime } from './harness';

// A room on the Relay as the app holds it (docs/versus-design.md §2): making
// and entering it by Room code, the Rival's presence, signals and relayed
// frames, a socket that drops and comes back, and every way it can fail,
// against the server's own rooms in memory.

function setup() {
  const time = new VirtualTime();
  const relay = new FakeRelay(time);
  const clock = time.clockFor({ suspended: false });
  const open = (o: Partial<RoomOptions> & Pick<RoomOptions, 'role'>): Room => openRoom({ url: 'ws://relay.test/room', clock, socket: relay.socket, ...o });
  const advance = async (ms: number): Promise<void> => {
    const end = time.now + ms;
    while (time.now < end) {
      time.advance(Math.min(end, time.now + 250));
      await settle();
    }
  };
  return { time, relay, open, advance };
}

function events(room: Room): RoomEvent[] {
  const got: RoomEvent[] = [];
  room.on((e) => got.push(e));
  return got;
}

describe('A room', () => {
  it('is made by the Host, entered by the Guest with its code, and each knows when the other is in', async () => {
    const { open } = setup();
    const host = open({ role: 'host' });
    expect(host.status()).toMatchObject({ state: 'opening', code: null, peer: false });
    await settle();
    expect(host.status()).toMatchObject({ state: 'open', code: 'ABCD', peer: false, problem: null });
    const guest = open({ role: 'guest', code: 'ABCD' });
    await settle();
    expect(guest.status()).toMatchObject({ state: 'open', code: 'ABCD', peer: true });
    expect(host.status().peer).toBe(true);
    guest.close();
    await settle();
    expect(host.status().peer).toBe(false);
  });

  it('passes signals and relayed frames between the two, and nothing before it opens', async () => {
    const { open, relay } = setup();
    const host = open({ role: 'host' });
    host.signal({ k: 'route', n: 1, route: 'direct' });
    await settle();
    const guest = open({ role: 'guest', code: 'ABCD' });
    const got = events(guest);
    await settle();
    host.signal({ k: 'offer', n: 3, sdp: 'v=0', session: 'abc' });
    host.relay(3, '{"v":1,"t":"ping","at":5}');
    await settle();
    expect(got.filter((e) => e.type !== 'status')).toEqual([
      { type: 'signal', signal: { k: 'offer', n: 3, sdp: 'v=0', session: 'abc' } },
      { type: 'relay', n: 3, text: '{"v":1,"t":"ping","at":5}' },
    ]);
    expect(relay.sockets[0]!.sent.map((m) => m['t'])).toEqual(['create', 'signal', 'relay']);
  });

  it('fails with why: a code nobody made, a room that has its two', async () => {
    const { open } = setup();
    const lost = open({ role: 'guest', code: 'ZZZZ' });
    await settle();
    expect(lost.status()).toMatchObject({ state: 'failed', problem: 'no-room' });
    open({ role: 'host' });
    await settle();
    open({ role: 'guest', code: 'ABCD' });
    const third = open({ role: 'guest', code: 'ABCD' });
    await settle();
    expect(third.status()).toMatchObject({ state: 'failed', problem: 'full' });
  });

  it('keeps trying while the Relay wakes, gives up after 90 s, and tries again when asked', async () => {
    const { open, relay, advance } = setup();
    relay.up = false;
    const host = open({ role: 'host' });
    await advance(30_000);
    expect(host.status().state).toBe('opening');
    expect(relay.sockets.length).toBeGreaterThan(10);
    relay.up = true;
    await advance(2000);
    expect(host.status()).toMatchObject({ state: 'open', code: 'ABCD' });

    relay.up = false;
    const late = open({ role: 'host' });
    await advance(OPEN_MS);
    expect(late.status()).toMatchObject({ state: 'failed', problem: 'unreachable' });
    relay.up = true;
    late.reopen();
    await settle();
    expect(late.status()).toMatchObject({ state: 'open', code: 'EFGH' });
  });

  it('comes back by itself after its socket drops, into the same seat by its token', async () => {
    const { open, relay, advance } = setup();
    const host = open({ role: 'host' });
    await settle();
    const guest = open({ role: 'guest', code: 'ABCD' });
    await settle();
    relay.drop(relay.sockets[1]!);
    await settle();
    expect(guest.status()).toMatchObject({ state: 'down', peer: false });
    expect(host.status().peer).toBe(false);
    await advance(BACKOFF_MS[0]!);
    expect(guest.status()).toMatchObject({ state: 'open', code: 'ABCD', peer: true });
    expect(relay.last.sent[0]).toEqual({ t: 'return', v: 1, code: 'ABCD', role: 'guest', token: 'token-2' });
    expect(host.status().peer).toBe(true);
  });

  it('makes its room again after the Relay restarted and lost it', async () => {
    const { time, open, relay, advance } = setup();
    const host = open({ role: 'host' });
    await settle();
    // A restart: every socket cut, every room gone.
    const fresh = new FakeRelay(time);
    relay.drop(relay.sockets[0]!);
    Object.assign(relay, { rooms: fresh.rooms });
    await settle();
    await advance(BACKOFF_MS[0]!);
    expect(host.status()).toMatchObject({ state: 'open', code: 'ABCD' });
    expect(fresh.rooms.counts()).toEqual({ rooms: 1, members: 1 });
  });

  it('pings while open, so no proxy drops a quiet socket', async () => {
    const { open, relay, advance } = setup();
    open({ role: 'host' });
    await settle();
    await advance(KEEPALIVE_MS * 2);
    expect(relay.sockets[0]!.sent.filter((m) => m['t'] === 'ping')).toHaveLength(2);
  });

  it('rests once the Relay closes it as idle, until a connection reopens it', async () => {
    const time = new VirtualTime();
    const relay = new FakeRelay(time, 1000);
    const host = openRoom({ role: 'host', url: 'ws://relay.test/room', clock: time.clockFor({ suspended: false }), socket: relay.socket });
    await settle();
    time.advance(1000);
    relay.rooms.sweep();
    await settle();
    expect(host.status()).toMatchObject({ state: 'down', code: 'ABCD' });
    time.advance(60_000);
    await settle();
    expect(relay.sockets).toHaveLength(1);
    host.reopen();
    await settle();
    expect(host.status()).toMatchObject({ state: 'open', code: 'ABCD' });
  });

  it('sends nothing more once closed', async () => {
    const { open, relay } = setup();
    const host = open({ role: 'host' });
    await settle();
    host.close();
    host.signal({ k: 'route', n: 1, route: 'relayed' });
    await settle();
    expect(relay.sockets[0]!.open).toBe(false);
    expect(relay.rooms.counts().members).toBe(0);
  });
});

describe('The app and the Relay', () => {
  it('agree on the protocol and on what a Room code is', () => {
    expect(ROOM_PROTOCOL).toBe(PROTOCOL);
    expect(ROOM_CODE_ALPHABET).toBe(CODE_ALPHABET);
    expect(ROOM_CODE_LENGTH).toBe(CODE_LENGTH);
    expect(isRoomCode('K7QX')).toBe(true);
    expect(isRoomCode('K0QX')).toBe(false);
  });
});

describe('Signals from the Rival', () => {
  it('are read only when well formed', () => {
    expect(readSignal({ k: 'answer', n: 2, sdp: null })).toEqual({ k: 'answer', n: 2, sdp: null });
    expect(readSignal({ k: 'ice', n: 2, c: { candidate: 'candidate:1 1 udp 1 192.0.2.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } }))
      .toEqual({ k: 'ice', n: 2, c: { candidate: 'candidate:1 1 udp 1 192.0.2.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
    for (const bad of [null, 'x', { k: 'offer', n: 1 }, { k: 'answer', n: 'a', sdp: '' }, { k: 'route', n: 1, route: 'turn' }, { k: 'ice', n: 1, c: {} }, { k: 'nope', n: 1 }]) {
      expect(readSignal(bad)).toBeNull();
    }
  });
});
