import { describe, expect, it } from 'vitest';
import { after } from '../../src/net/clock';
import { openRoom, type IceCandidate, type Room } from '../../src/net/room';
import { DIRECT_MS, guestLinks, hostLink, type DirectPeer, type RoomLink } from '../../src/net/route';
import type { Transport, TransportState } from '../../src/net/transport';
import { FakeRelay, settle } from './fake-relay';
import { VirtualTime } from './harness';

// Direct first, then the Relay (docs/versus-design.md §2): two apps in a room,
// with WebRTC faked so the DataChannel opens, never opens, or fails. Both
// must settle on the same route, and messages must flow over it.

type Direct = 'works' | 'never' | 'fails';

/** One end of a fake DataChannel. */
class FakeChannel implements Transport {
  state: TransportState = 'connecting';
  other: FakeChannel | null = null;
  readonly sent: string[] = [];
  private messages = new Set<(text: string) => void>();
  private states = new Set<(s: TransportState) => void>();
  set(s: TransportState): void {
    if (this.state === s || this.state === 'closed') return;
    this.state = s;
    for (const l of [...this.states]) l(s);
  }
  send(text: string): void {
    if (this.state !== 'open') return;
    this.sent.push(text);
    const to = this.other;
    queueMicrotask(() => {
      if (to?.state === 'open') for (const l of [...to.messages]) l(text);
    });
  }
  onMessage(l: (text: string) => void) {
    this.messages.add(l);
    return () => this.messages.delete(l);
  }
  onState(l: (s: TransportState) => void) {
    this.states.add(l);
    return () => this.states.delete(l);
  }
  close(): void {
    this.set('closed');
    const o = this.other;
    if (o) queueMicrotask(() => o.set('closed'));
  }
}

/** WebRTC as the tests want it: each pair's channel opens 300 ms after both descriptions are in, never, or fails at 1 s. */
class FakeWebRtc {
  readonly peers: (DirectPeer & { readonly id: string; readonly channel: FakeChannel; readonly got: IceCandidate[] })[] = [];
  constructor(private readonly time: VirtualTime, public mode: Direct = 'works') {}

  readonly make = (): DirectPeer => {
    const peers = this.peers;
    const mode = (): Direct => this.mode;
    const channel = new FakeChannel();
    const candidates = new Set<(c: IceCandidate) => void>();
    const failed = new Set<() => void>();
    const id = `p${this.peers.length}`;
    const clock = this.time.clockFor({ suspended: false });
    const gather = (): void => queueMicrotask(() => {
      for (const l of [...candidates]) l({ candidate: `candidate:${id} 1 udp 1 192.0.2.1 9 typ host`, sdpMid: '0', sdpMLineIndex: 0 });
    });
    const connect = (a: FakeWebRtc['peers'][number], b: FakeWebRtc['peers'][number]): void => {
      a.channel.other = b.channel;
      b.channel.other = a.channel;
      if (mode() === 'works') {
        after(clock, 300, () => {
          a.channel.set('open');
          b.channel.set('open');
        });
      } else if (mode() === 'fails') {
        after(clock, 1000, () => {
          for (const l of [...failed]) l();
        });
      }
    };
    const peer: FakeWebRtc['peers'][number] = {
      id,
      channel,
      got: [],
      transport: channel,
      async offer() {
        gather();
        return `offer-${id}`;
      },
      async answer() {
        gather();
        return `answer-${id}`;
      },
      async accept(sdp) {
        const guest = peers.find((p) => `answer-${p.id}` === sdp);
        if (guest) connect(peer, guest);
      },
      addCandidate(c) {
        peer.got.push(c);
      },
      onCandidate(l) {
        candidates.add(l);
        return () => candidates.delete(l);
      },
      onFailed(l) {
        failed.add(l);
        return () => failed.delete(l);
      },
      close() {
        channel.close();
      },
    };
    this.peers.push(peer);
    return peer;
  };
}

function setup(mode: Direct = 'works') {
  const time = new VirtualTime();
  const relay = new FakeRelay(time);
  const web = new FakeWebRtc(time, mode);
  const clock = time.clockFor({ suspended: false });
  const room = (role: 'host' | 'guest'): Room => openRoom({ role, url: 'ws://relay.test/room', clock, socket: relay.socket, ...(role === 'guest' ? { code: 'ABCD' } : {}) });
  const advance = async (ms: number): Promise<void> => {
    const end = time.now + ms;
    while (time.now < end) {
      time.advance(Math.min(end, time.now + 100));
      await settle();
    }
  };
  return { time, relay, web, clock, room, advance };
}

/** Both ends' messages, as each transport delivers them. */
function inbox(t: Transport): string[] {
  const got: string[] = [];
  t.onMessage((m) => got.push(m));
  return got;
}

async function connect(s: ReturnType<typeof setup>, session: string | null = null) {
  const hostRoom = s.room('host');
  await settle();
  const host = hostLink({ room: hostRoom, clock: s.clock, peer: s.web.make }, session);
  const guestRoom = s.room('guest');
  const links: { link: RoomLink; session: string | null }[] = [];
  guestLinks({ room: guestRoom, clock: s.clock, peer: s.web.make }, (link, sid) => links.push({ link, session: sid }));
  await settle();
  return { hostRoom, guestRoom, host, links, guest: () => links.at(-1)!.link };
}

describe('A connection through a room', () => {
  it('runs Direct when the DataChannel opens in time, and both ends say so', async () => {
    const s = setup('works');
    const c = await connect(s);
    expect(c.host.transport.state).toBe('connecting');
    expect(c.links).toHaveLength(1);
    await s.advance(400);
    for (const t of [c.host.transport, c.guest().transport]) {
      expect(t.state).toBe('open');
      expect(t.route).toBe('direct');
    }
    // Candidates went both ways through the room.
    expect(s.web.peers.every((p) => p.got.length === 1)).toBe(true);
    const atHost = inbox(c.host.transport);
    const atGuest = inbox(c.guest().transport);
    c.host.transport.send('hello from the Host');
    c.guest().transport.send('hello from the Guest');
    await settle();
    expect(atGuest).toEqual(['hello from the Host']);
    expect(atHost).toEqual(['hello from the Guest']);
    expect(s.relay.relayed).toBe(0);
  });

  it(`runs through the Relay when the DataChannel isn't open ${DIRECT_MS / 1000} s after the answer`, async () => {
    const s = setup('never');
    const c = await connect(s);
    await s.advance(DIRECT_MS - 200);
    expect(c.host.transport.state).toBe('connecting');
    await s.advance(300);
    for (const t of [c.host.transport, c.guest().transport]) {
      expect(t.state).toBe('open');
      expect(t.route).toBe('relayed');
    }
    const atHost = inbox(c.host.transport);
    const atGuest = inbox(c.guest().transport);
    c.host.transport.send('{"v":1,"t":"hello"}');
    c.guest().transport.send('{"v":1,"t":"hello","from":"guest"}');
    await settle();
    expect(atGuest).toEqual(['{"v":1,"t":"hello"}']);
    expect(atHost).toEqual(['{"v":1,"t":"hello","from":"guest"}']);
    expect(s.relay.relayed).toBe(2);
    // The DataChannels were closed.
    expect(s.web.peers.every((p) => p.channel.state === 'closed')).toBe(true);
  });

  it('goes to the Relay at once when ICE fails', async () => {
    const s = setup('fails');
    const c = await connect(s);
    await s.advance(1100);
    expect(c.host.transport.route).toBe('relayed');
    expect(c.guest().transport.route).toBe('relayed');
    expect(c.guest().transport.state).toBe('open');
  });

  it('closes a relayed connection when the Rival\'s app leaves the room', async () => {
    const s = setup('never');
    const c = await connect(s);
    await s.advance(DIRECT_MS + 100);
    const states: TransportState[] = [];
    c.host.transport.onState((st) => states.push(st));
    c.guestRoom.close();
    await settle();
    expect(c.host.transport.state).toBe('closed');
    expect(states).toEqual(['closed']);
  });

  it('keeps a Direct connection when the room\'s sockets drop', async () => {
    const s = setup('works');
    const c = await connect(s);
    await s.advance(400);
    for (const sock of s.relay.sockets) s.relay.drop(sock);
    await settle();
    expect(c.host.transport.state).toBe('open');
    expect(c.guest().transport.state).toBe('open');
  });

  it('starts over when the Guest\'s app leaves before the route is settled, and connects once it is back', async () => {
    const s = setup('never');
    const c = await connect(s);
    await s.advance(1000);
    s.relay.drop(s.relay.sockets[1]!);
    await settle();
    // The Guest's socket comes back by itself; the Host offers again with a new attempt.
    await s.advance(1100);
    expect(c.links).toHaveLength(2);
    expect(c.host.transport.state).toBe('connecting');
    await s.advance(DIRECT_MS);
    expect(c.host.transport.route).toBe('relayed');
    expect(c.guest().transport.state).toBe('open');
    expect(c.links[0]!.link.transport.state).toBe('connecting');
  });

  it('lets the Guest take a first message on the DataChannel as Direct, before the Host\'s word arrives', async () => {
    const s = setup('works');
    const hostRoom = s.room('host');
    await settle();
    const host = hostLink({ room: hostRoom, clock: s.clock, peer: s.web.make }, null);
    const guestRoom = s.room('guest');
    let guest: RoomLink | null = null;
    guestLinks({ room: guestRoom, clock: s.clock, peer: s.web.make }, (link) => (guest = link));
    await settle();
    // Hold what the Relay sends the Guest from here: the Host's word on the route among it.
    s.relay.sockets[1]!.held = true;
    await s.advance(400);
    expect(host.transport.route).toBe('direct');
    expect(guest!.transport.route).toBeNull();
    const got = inbox(guest!.transport);
    host.transport.send('{"v":1,"t":"hello"}');
    await settle();
    expect(guest!.transport.route).toBe('direct');
    expect(guest!.transport.state).toBe('open');
    expect(got).toEqual(['{"v":1,"t":"hello"}']);
    s.relay.sockets[1]!.release();
    await settle();
    expect(guest!.transport.route).toBe('direct');
  });

  it('goes straight to the Relay when the Guest has no WebRTC', async () => {
    const s = setup('works');
    const hostRoom = s.room('host');
    await settle();
    const host = hostLink({ room: hostRoom, clock: s.clock, peer: s.web.make }, null);
    const guestRoom = s.room('guest');
    let guest: RoomLink | null = null;
    guestLinks({ room: guestRoom, clock: s.clock, peer: () => { throw new Error('no RTCPeerConnection'); } }, (link) => (guest = link));
    await settle();
    expect(host.transport.route).toBe('relayed');
    expect(guest!.transport.route).toBe('relayed');
    expect(guest!.transport.state).toBe('open');
  });

  it('hands the Guest the session a Reconnect names, for a rejoin', async () => {
    const s = setup('works');
    const c = await connect(s, '0123456789abcdef');
    expect(c.links[0]!.session).toBe('0123456789abcdef');
  });

  it('closes its DataChannel and stops offering once closed', async () => {
    const s = setup('never');
    const c = await connect(s);
    c.host.close();
    await s.advance(DIRECT_MS + 100);
    expect(c.host.transport.state).toBe('closed');
    expect(s.web.peers[0]!.channel.state).toBe('closed');
    expect(c.guest().transport.route).toBeNull();
  });
});
