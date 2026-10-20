import { decodeCode, encodeCode, sdpFields, sdpFromCode } from './codes';
import { iceConfiguration, selectedRoute, startsLastSecond, type IcePolicy, type StatsEntry } from './ice';
import type { IceCandidate } from './room';
import type { DirectPeer } from './route';
import type { Route, Transport, TransportState } from './transport';

// The browser's RTCPeerConnection (docs/versus-design.md §2, §4.5): one
// negotiated DataChannel (id 0, reliable, ordered) over public STUN, as a
// Transport. Two ways to connect it: through a room on the Relay, with ICE
// trickled (directPeer, which route.ts drives), or by codes passed by hand,
// with gathering that isn't trickled and codes made and read through
// codes.ts. The only net module that touches WebRTC; it can't run in Node, so
// it stays thin, ice.ts holds its decisions, and the e2e test exercises it.

/** The two public STUN servers. They learn each device's public address, as any website does, and nothing else. */
export const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

/** "Connecting…" turns into "Couldn't reach the Rival" after this long (§3). */
export const CONNECT_TIMEOUT_MS = 20_000;

/**
 * Tests set `globalThis.TAVERN_ICE_SERVERS = []` in an init script, so two
 * pages on one machine connect over host candidates with no STUN.
 * `TAVERN_ICE_POLICY = 'relay'` gathers relay candidates only, and with no
 * TURN server that's none, so nothing direct connects and a room's
 * connection falls back to the Relay (e2e/versus.spec.ts).
 */
declare global {
  var TAVERN_ICE_SERVERS: readonly RTCIceServer[] | undefined;
  var TAVERN_ICE_POLICY: IcePolicy | undefined;
}

export interface RtcOptions {
  /** This build's `__SIM_HASH__`, written into each code and checked on paste. */
  readonly simHash: string;
  /** The STUN servers: overrides TAVERN_ICE_SERVERS and the defaults. */
  readonly iceServers?: readonly RTCIceServer[];
  /** Gathering stops this long after the first server-reflexive candidate (1 s), or after `gatherMs` (5 s). */
  readonly settleMs?: number;
  readonly gatherMs?: number;
}

export interface HostLink {
  /** The Join code; joinLink() makes the link. */
  readonly code: string;
  /** Opens once the Answer code is accepted and ICE connects. */
  readonly transport: Transport;
  /** Takes the Guest's pasted Answer code. Throws a CodeError whose message can be shown as is. */
  accept(answerCode: string): Promise<void>;
  close(): void;
}

export interface GuestLink {
  /** The Answer code to send back to the Host. */
  readonly code: string;
  readonly transport: Transport;
  /** The session id of a rejoin's Join code, null for a fresh one. */
  readonly session: string | null;
  close(): void;
}

/** The Host's side: a new connection and its Join code. `session` marks a rejoin's code (§5.4). */
export async function makeJoinCode(opts: RtcOptions & { readonly session?: string | null }): Promise<HostLink> {
  const pc = connection(opts);
  const transport = channelTransport(pc);
  const gathered = gather(pc, opts);
  await pc.setLocalDescription(await pc.createOffer());
  const extra = await gathered;
  const fields = sdpFields(pc.localDescription!.sdp, extra);
  const code = encodeCode({ kind: 'join', sim: opts.simHash, session: opts.session ?? null, ...fields });
  return {
    code,
    transport,
    async accept(answerCode) {
      const answer = decodeCode(answerCode, 'answer', opts.simHash);
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpFromCode(answer) });
    },
    close: () => transport.close(),
  };
}

/** The Guest's side: reads a pasted Join code or link (throwing a CodeError) and makes the Answer code. */
export async function answerJoinCode(joinCode: string, opts: RtcOptions): Promise<GuestLink> {
  const offer = decodeCode(joinCode, 'join', opts.simHash);
  const pc = connection(opts);
  const transport = channelTransport(pc);
  await pc.setRemoteDescription({ type: 'offer', sdp: sdpFromCode(offer) });
  const gathered = gather(pc, opts);
  await pc.setLocalDescription(await pc.createAnswer());
  const extra = await gathered;
  const fields = sdpFields(pc.localDescription!.sdp, extra);
  const code = encodeCode({ kind: 'answer', sim: opts.simHash, session: null, ...fields });
  return { code, transport, session: offer.session, close: () => transport.close() };
}

/** A new RTCPeerConnection with the STUN servers, gathering relay candidates only under the test hook. */
function connection(opts: { readonly iceServers?: readonly RTCIceServer[] | undefined }): RTCPeerConnection {
  const stun = opts.iceServers ?? globalThis.TAVERN_ICE_SERVERS ?? DEFAULT_ICE_SERVERS;
  return new RTCPeerConnection(iceConfiguration(stun, globalThis.TAVERN_ICE_POLICY === 'relay' ? 'relay' : 'all'));
}

/**
 * WebRTC's side of a connection made through a room (route.ts): candidates
 * trickled as they're gathered, the Rival's held until its description is in,
 * and the full descriptions passed as they are, since the room carries them.
 */
export function directPeer(opts: { readonly iceServers?: readonly RTCIceServer[] } = {}): DirectPeer {
  const pc = connection(opts);
  const transport = channelTransport(pc);
  const candidateListeners = new Set<(c: IceCandidate) => void>();
  const failedListeners = new Set<() => void>();
  const held: IceCandidate[] = [];
  let described = false;
  const add = (c: IceCandidate): void => {
    pc.addIceCandidate(c).catch((err: unknown) => console.warn('[versus] a candidate did not take', err));
  };
  const takeHeld = (): void => {
    described = true;
    for (const c of held.splice(0)) add(c);
  };
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate?.candidate) return;
    const c = { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex };
    for (const l of [...candidateListeners]) l(c);
  });
  const failed = (): void => {
    if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') for (const l of [...failedListeners]) l();
  };
  pc.addEventListener('iceconnectionstatechange', failed);
  pc.addEventListener('connectionstatechange', failed);
  return {
    transport,
    async offer() {
      await pc.setLocalDescription(await pc.createOffer());
      return pc.localDescription!.sdp;
    },
    async answer(sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      takeHeld();
      await pc.setLocalDescription(await pc.createAnswer());
      return pc.localDescription!.sdp;
    },
    async accept(sdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp });
      takeHeld();
    },
    addCandidate(c) {
      if (described) add(c);
      else held.push(c);
    },
    onCandidate(listener) {
      candidateListeners.add(listener);
      return () => candidateListeners.delete(listener);
    },
    onFailed(listener) {
      failedListeners.add(listener);
      return () => failedListeners.delete(listener);
    },
    close: () => transport.close(),
  };
}

/**
 * Waits for gathering for a code: done, 1 s after the first server-reflexive
 * candidate, or 5 s. Resolves with every candidate seen.
 */
function gather(pc: RTCPeerConnection, opts: RtcOptions): Promise<string[]> {
  return new Promise((resolve) => {
    const seen: string[] = [];
    let soon: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(all);
      if (soon !== null) clearTimeout(soon);
      pc.removeEventListener('icecandidate', onCandidate);
      pc.removeEventListener('icegatheringstatechange', onState);
      resolve(seen);
    };
    const all = setTimeout(finish, opts.gatherMs ?? 5000);
    const onCandidate = (e: RTCPeerConnectionIceEvent): void => {
      if (!e.candidate) return finish();
      if (e.candidate.candidate) seen.push(e.candidate.candidate);
      if (soon === null && startsLastSecond(e.candidate)) soon = setTimeout(finish, opts.settleMs ?? 1000);
    };
    const onState = (): void => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icecandidate', onCandidate);
    pc.addEventListener('icegatheringstatechange', onState);
  });
}

/**
 * The one DataChannel, negotiated on both sides as id 0, reliable and
 * ordered, with ICE's state as the Transport's, and the route read from
 * getStats() once the channel opens and on every ICE change.
 */
function channelTransport(pc: RTCPeerConnection): Transport {
  const dc = pc.createDataChannel('tavern', { negotiated: true, id: 0, ordered: true });
  let state: TransportState = 'connecting';
  let route: Route | null = null;
  const messageListeners = new Set<(text: string) => void>();
  const stateListeners = new Set<(s: TransportState) => void>();
  const routeListeners = new Set<(r: Route) => void>();
  const set = (next: TransportState): void => {
    if (state === next || state === 'closed') return;
    state = next;
    for (const l of stateListeners) l(next);
  };
  const readRoute = (): void => {
    if (state === 'closed') return;
    pc.getStats().then((report) => {
      const next = selectedRoute(report.values() as Iterable<StatsEntry>);
      if (next === null || next === route || state === 'closed') return;
      route = next;
      for (const l of routeListeners) l(next);
    }, () => {
      // Closed meanwhile: its route no longer matters.
    });
  };
  dc.addEventListener('open', () => {
    set(pc.iceConnectionState === 'disconnected' ? 'unstable' : 'open');
    readRoute();
  });
  dc.addEventListener('close', () => set('closed'));
  dc.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data !== 'string') return;
    for (const l of messageListeners) l(e.data);
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    const ice = pc.iceConnectionState;
    if (ice === 'failed' || ice === 'closed') set('closed');
    else if (ice === 'disconnected') {
      if (state !== 'connecting') set('unstable');
    } else if ((ice === 'connected' || ice === 'completed') && dc.readyState === 'open') set('open');
    readRoute();
  });
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') set('closed');
  });
  return {
    get state() {
      return state;
    },
    send(text) {
      if ((state === 'open' || state === 'unstable') && dc.readyState === 'open') dc.send(text);
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
      try {
        dc.close();
        pc.close();
      } catch {
        // Already closed.
      }
    },
  };
}
