import { decodeCode, encodeCode, sdpFields, sdpFromCode } from './codes';
import type { Transport, TransportState } from './transport';

// The browser's RTCPeerConnection as a Transport (docs/versus-design.md §2,
// §4.5): one negotiated DataChannel (id 0, reliable, ordered), gathering that
// isn't trickled, and codes made and read through codes.ts. The only net
// module that touches browser APIs; it can't run in Node, so it stays thin and
// the e2e test exercises it.

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
 */
declare global {
  var TAVERN_ICE_SERVERS: readonly RTCIceServer[] | undefined;
}

export interface RtcOptions {
  /** This build's `__SIM_HASH__`, written into each code and checked on paste. */
  readonly simHash: string;
  /** Overrides TAVERN_ICE_SERVERS and the defaults. */
  readonly iceServers?: readonly RTCIceServer[];
  /** Gathering stops this long after the first server-reflexive candidate (1 s), or after `gatherMs` (5 s). */
  readonly afterSrflxMs?: number;
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
  const pc = new RTCPeerConnection({ iceServers: iceServers(opts) });
  const transport = channelTransport(pc);
  const gathered = gather(pc, opts);
  await pc.setLocalDescription(await pc.createOffer());
  const extra = await gathered;
  const code = encodeCode({ kind: 'join', sim: opts.simHash, session: opts.session ?? null, ...sdpFields(pc.localDescription!.sdp, extra) });
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
  const pc = new RTCPeerConnection({ iceServers: iceServers(opts) });
  const transport = channelTransport(pc);
  await pc.setRemoteDescription({ type: 'offer', sdp: sdpFromCode(offer) });
  const gathered = gather(pc, opts);
  await pc.setLocalDescription(await pc.createAnswer());
  const extra = await gathered;
  const code = encodeCode({ kind: 'answer', sim: opts.simHash, session: null, ...sdpFields(pc.localDescription!.sdp, extra) });
  return { code, transport, session: offer.session, close: () => transport.close() };
}

function iceServers(opts: RtcOptions): RTCIceServer[] {
  return [...(opts.iceServers ?? globalThis.TAVERN_ICE_SERVERS ?? DEFAULT_ICE_SERVERS)];
}

/** Waits for gathering: done, 1 s after the first server-reflexive candidate, or 5 s. Resolves with every candidate seen. */
function gather(pc: RTCPeerConnection, opts: RtcOptions): Promise<string[]> {
  return new Promise((resolve) => {
    const seen: string[] = [];
    let srflx: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(all);
      if (srflx !== null) clearTimeout(srflx);
      pc.removeEventListener('icecandidate', onCandidate);
      pc.removeEventListener('icegatheringstatechange', onState);
      resolve(seen);
    };
    const all = setTimeout(finish, opts.gatherMs ?? 5000);
    const onCandidate = (e: RTCPeerConnectionIceEvent): void => {
      if (!e.candidate) return finish();
      if (e.candidate.candidate) seen.push(e.candidate.candidate);
      if (e.candidate.type === 'srflx' && srflx === null) srflx = setTimeout(finish, opts.afterSrflxMs ?? 1000);
    };
    const onState = (): void => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icecandidate', onCandidate);
    pc.addEventListener('icegatheringstatechange', onState);
  });
}

/** The one DataChannel, negotiated on both sides as id 0, reliable and ordered, with ICE's state as the Transport's. */
function channelTransport(pc: RTCPeerConnection): Transport {
  const dc = pc.createDataChannel('tavern', { negotiated: true, id: 0, ordered: true });
  let state: TransportState = 'connecting';
  const messageListeners = new Set<(text: string) => void>();
  const stateListeners = new Set<(s: TransportState) => void>();
  const set = (next: TransportState): void => {
    if (state === next || state === 'closed') return;
    state = next;
    for (const l of stateListeners) l(next);
  };
  dc.addEventListener('open', () => set(pc.iceConnectionState === 'disconnected' ? 'unstable' : 'open'));
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
