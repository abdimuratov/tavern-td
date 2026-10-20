import { after, type Clock } from './clock';
import { relayTransport } from './relay';
import type { IceCandidate, Room, Signal } from './room';
import type { Route, Transport, TransportState } from './transport';

// Direct first, then the Relay (docs/versus-design.md §2): one connection
// between the two apps in a room. The Host offers WebRTC through the room and
// the Guest answers, both trickling ICE candidates. If the DataChannel opens
// within DIRECT_MS of the Host having the answer, the connection runs Direct;
// if not, or ICE fails first, it runs through the Relay's WebSocket. The Host
// alone decides and says which through the room, so both always use the same
// one. Either way the session sees one Transport. Pure over the Room, the
// clock and a DirectPeer (rtc.ts makes the real one), so the tests run it in
// Node.

/**
 * How long the Host gives a direct connection once it has the Guest's answer
 * (5 s). One Wi-Fi connects in well under a second, and two home networks
 * through STUN in one to three; ICE retries its checks for far longer than
 * that, so a pair still not connected at 5 s rarely will. The Relay then
 * takes over at once, so the wait stays short.
 */
export const DIRECT_MS = 5000;

/** WebRTC's side of one connection. rtc.ts makes it from an RTCPeerConnection; the tests fake it. */
export interface DirectPeer {
  /** The DataChannel; it opens once ICE connects. */
  readonly transport: Transport;
  /** Host: makes the offer. */
  offer(): Promise<string>;
  /** Guest: answers the Host's offer. */
  answer(offer: string): Promise<string>;
  /** Host: takes the Guest's answer. */
  accept(answer: string): Promise<void>;
  /** A candidate from the Rival's end, held until the description it belongs to is in. */
  addCandidate(c: IceCandidate): void;
  /** Every candidate this end gathers, as it comes. */
  onCandidate(listener: (c: IceCandidate) => void): () => void;
  /** ICE gave up: nothing direct will connect. */
  onFailed(listener: () => void): () => void;
  close(): void;
}

export interface LinkOptions {
  readonly room: Room;
  readonly clock: Clock;
  /** A fresh DirectPeer for each attempt; one that throws means no WebRTC here, so the Relay. */
  readonly peer: () => DirectPeer;
  readonly directMs?: number;
}

/** One connection to the Rival through a room: the Transport the session attaches, Direct or Relayed once settled. */
export interface RoomLink {
  readonly transport: Transport;
  close(): void;
}

/**
 * The session's Transport for one connection: `connecting` until the route
 * is settled, then the DataChannel's or the Relay's, whose state it follows.
 */
function linkTransport() {
  let state: TransportState = 'connecting';
  let route: Route | null = null;
  let inner: Transport | null = null;
  let offInner: (() => void)[] = [];
  const messageListeners = new Set<(text: string) => void>();
  const stateListeners = new Set<(s: TransportState) => void>();
  const routeListeners = new Set<(r: Route) => void>();
  const set = (next: TransportState): void => {
    if (state === next || state === 'closed') return;
    state = next;
    if (next === 'closed') {
      for (const off of offInner) off();
      offInner = [];
    }
    for (const l of [...stateListeners]) l(next);
  };
  const deliver = (text: string): void => {
    if (state === 'open' || state === 'unstable') for (const l of [...messageListeners]) l(text);
  };
  const follow = (s: TransportState): void => {
    if (s !== 'connecting') set(s);
  };
  const transport: Transport = {
    get state() {
      return state;
    },
    send(text) {
      if (inner && (state === 'open' || state === 'unstable')) inner.send(text);
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    get route() {
      return route;
    },
    onRoute(listener) {
      routeListeners.add(listener);
      return () => routeListeners.delete(listener);
    },
    close() {
      set('closed');
      inner?.close();
    },
  };
  return {
    transport,
    get route() {
      return route;
    },
    get closed() {
      return state === 'closed';
    },
    /**
     * From now on the connection is `via`. A DataChannel's messages come
     * through deliver() (the Guest hears them before it settles); the
     * Relay's are followed here.
     */
    settle(r: Route, via: Transport, messages: boolean): void {
      if (route !== null || state === 'closed') return;
      route = r;
      inner = via;
      for (const l of [...routeListeners]) l(r);
      offInner = [via.onState(follow), ...(messages ? [via.onMessage(deliver)] : [])];
      follow(via.state);
    },
    deliver,
  };
}

let attempts = 0;

/** Sends a peer's candidates through the room once its description has gone; any gathered before wait. */
function candidates(room: Room, n: number) {
  let sent = false;
  const early: IceCandidate[] = [];
  return {
    gathered(c: IceCandidate): void {
      if (sent) room.signal({ k: 'ice', n, c });
      else early.push(c);
    },
    described(): void {
      sent = true;
      for (const c of early.splice(0)) room.signal({ k: 'ice', n, c });
    },
  };
}

/**
 * The Host's side: a new connection to the Rival (the first, or a
 * Reconnect's). It offers once the Guest's app is in the room, and starts
 * over whenever that app leaves or the socket drops before the route is
 * settled. `session` names the Run on a Reconnect, so a restarted Guest app
 * can rejoin it (§5.4).
 */
export function hostLink(opts: LinkOptions, session: string | null): RoomLink {
  const { room, clock } = opts;
  const directMs = opts.directMs ?? DIRECT_MS;
  const link = linkTransport();
  let n = 0;
  let peer: DirectPeer | null = null;
  let offPeer: (() => void)[] = [];
  let cancelTimer: (() => void) | null = null;

  function drop(): void {
    cancelTimer?.();
    cancelTimer = null;
    for (const off of offPeer) off();
    offPeer = [];
    peer?.close();
    peer = null;
  }

  function direct(p: DirectPeer): void {
    if (link.route !== null || peer !== p) return;
    cancelTimer?.();
    room.signal({ k: 'route', n, route: 'direct' });
    link.settle('direct', p.transport, false);
  }

  function relay(): void {
    if (link.route !== null || link.closed) return;
    drop();
    room.signal({ k: 'route', n, route: 'relayed' });
    link.settle('relayed', relayTransport(room, n), true);
  }

  async function offer(): Promise<void> {
    drop();
    n = ++attempts;
    const mine = n;
    let p: DirectPeer;
    try {
      p = opts.peer();
    } catch (err) {
      console.warn('[versus] no WebRTC here, so the Relay', err);
      room.signal({ k: 'offer', n: mine, sdp: null, session });
      return relay();
    }
    peer = p;
    const trickle = candidates(room, mine);
    offPeer = [
      p.onCandidate(trickle.gathered),
      p.onFailed(() => {
        if (peer === p) relay();
      }),
      p.transport.onState((s) => {
        if (s === 'open') direct(p);
      }),
      p.transport.onMessage((text) => {
        if (link.route === 'direct' && peer === p) link.deliver(text);
      }),
    ];
    let sdp: string | null;
    try {
      sdp = await p.offer();
    } catch (err) {
      console.warn('[versus] could not make an offer, so the Relay', err);
      sdp = null;
    }
    if (peer !== p || link.closed) return;
    room.signal({ k: 'offer', n: mine, sdp, session });
    if (sdp === null) return relay();
    trickle.described();
  }

  async function answered(sdp: string | null): Promise<void> {
    const p = peer;
    if (!p || cancelTimer || link.route !== null) return;
    if (sdp === null) return relay();
    // The direct connection's time starts now: both ends have both descriptions.
    cancelTimer = after(clock, directMs, relay);
    try {
      await p.accept(sdp);
    } catch (err) {
      console.warn('[versus] the answer did not take, so the Relay', err);
      if (peer === p) relay();
    }
  }

  function signal(s: Signal): void {
    if (s.n !== n || !peer) return;
    if (s.k === 'answer') void answered(s.sdp);
    else if (s.k === 'ice') peer.addCandidate(s.c);
  }

  const off = room.on((e) => {
    if (link.closed || link.route !== null) return;
    if (e.type === 'signal') return signal(e.signal);
    if (e.type !== 'status') return;
    const here = e.status.state === 'open' && e.status.peer;
    if (here && !peer) void offer();
    else if (!here && peer) drop();
  });
  const st = room.status();
  if (st.state === 'open' && st.peer) void offer();
  else if (st.state === 'down' || (st.state === 'failed' && st.problem === 'unreachable')) room.reopen();

  return {
    transport: link.transport,
    close() {
      off();
      drop();
      link.transport.close();
    },
  };
}

/**
 * The Guest's side: every offer from the Host is a new connection, handed to
 * `onLink` with the session it names (a Reconnect's, for a rejoin). It
 * answers, trickles its candidates, and takes the Host's word on the route,
 * or a first message on the DataChannel as Direct. Returns the unsubscribe;
 * each link is closed by whoever took it.
 */
export function guestLinks(opts: LinkOptions, onLink: (link: RoomLink, session: string | null) => void): () => void {
  const { room } = opts;
  let current: { readonly n: number; signal(s: Signal): void } | null = null;
  return room.on((e) => {
    if (e.type !== 'signal') return;
    const s = e.signal;
    if (s.k === 'offer') {
      const made = guestAttempt(opts, s.n, s.sdp);
      current = made;
      onLink(made.link, s.session);
    } else if (current && s.n === current.n) {
      current.signal(s);
    }
  });
}

function guestAttempt(opts: LinkOptions, n: number, offer: string | null) {
  const { room } = opts;
  const link = linkTransport();
  let peer: DirectPeer | null = null;
  const offs: (() => void)[] = [];
  if (offer !== null) {
    try {
      peer = opts.peer();
    } catch (err) {
      console.warn('[versus] no WebRTC here, so the Relay', err);
    }
  }
  const p = peer;
  if (p) {
    const trickle = candidates(room, n);
    offs.push(
      p.onCandidate(trickle.gathered),
      p.transport.onMessage((text) => {
        // Only a Host that chose Direct sends on the DataChannel, so a first message there settles it.
        if (link.route === null) link.settle('direct', p.transport, false);
        if (link.route === 'direct') link.deliver(text);
      }),
    );
    void p.answer(offer!).then(
      (sdp) => {
        if (link.closed) return;
        room.signal({ k: 'answer', n, sdp });
        trickle.described();
      },
      (err: unknown) => {
        console.warn('[versus] could not answer, so the Relay', err);
        room.signal({ k: 'answer', n, sdp: null });
      },
    );
  } else {
    room.signal({ k: 'answer', n, sdp: null });
  }
  const done = (): void => {
    for (const off of offs.splice(0)) off();
    peer?.close();
    peer = null;
  };
  return {
    n,
    link: {
      transport: link.transport,
      close() {
        done();
        link.transport.close();
      },
    } satisfies RoomLink,
    signal(s: Signal): void {
      if (link.closed) return;
      if (s.k === 'ice') {
        peer?.addCandidate(s.c);
      } else if (s.k === 'route' && link.route === null) {
        if (s.route === 'direct' && peer) {
          link.settle('direct', peer.transport, false);
        } else {
          done();
          link.settle('relayed', relayTransport(room, n), true);
        }
      }
    },
  };
}
