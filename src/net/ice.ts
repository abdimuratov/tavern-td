import type { Route } from './transport';

// The decisions rtc.ts makes about ICE (docs/versus-design.md §2), kept pure
// so Node tests can read them: the configuration, which candidate ends a
// code's gathering early, and whether the pair ICE picked runs Direct.

/** `relay` gathers relay candidates only: a test hook that, with no TURN server, keeps anything direct from connecting. */
export type IcePolicy = 'all' | 'relay';

/** The STUN servers, copied so RTCPeerConnection gets plain arrays. */
export function iceConfiguration(stun: readonly RTCIceServer[], policy: IcePolicy = 'all'): RTCConfiguration {
  return {
    iceServers: stun.map((s) => ({ ...s, urls: typeof s.urls === 'string' ? s.urls : [...s.urls] })),
    iceTransportPolicy: policy,
  };
}

/**
 * Whether this candidate starts a code's last second of gathering: the
 * first server-reflexive one, since the code must hold the public address.
 * Gathering then ends a second later, at the 5 s cap, or once the browser
 * says it's complete, whichever comes first.
 */
export function startsLastSecond(candidate: { readonly type?: string | null; readonly candidate: string }): boolean {
  const type = candidate.type ?? / typ (\w+)/.exec(candidate.candidate)?.[1];
  return type === 'srflx';
}

/** One entry of getStats()'s report, as far as the route needs it. */
export interface StatsEntry {
  readonly id: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * How a DataChannel runs, from getStats(): `relayed` when either end of the
 * selected candidate pair is a relay candidate (a TURN server, which Versus
 * no longer uses but a test may give), else `direct`; null while none is
 * selected. The pair is the transport's `selectedCandidatePairId`
 * (Chrome, Safari), else one marked `selected` (Firefox), else one
 * `nominated` that has `succeeded` (an older WebKit).
 */
export function selectedRoute(stats: Iterable<StatsEntry>): Route | null {
  const byId = new Map<string, StatsEntry>();
  for (const s of stats) byId.set(s.id, s);
  const all = [...byId.values()];
  let pair: StatsEntry | undefined;
  for (const t of all) {
    const id = t['selectedCandidatePairId'];
    if (t.type === 'transport' && typeof id === 'string' && byId.has(id)) {
      pair = byId.get(id);
      break;
    }
  }
  const pairs = all.filter((s) => s.type === 'candidate-pair');
  pair ??= pairs.find((p) => p['selected'] === true) ?? pairs.find((p) => p['nominated'] === true && p['state'] === 'succeeded');
  if (!pair) return null;
  const ends = [byId.get(String(pair['localCandidateId'])), byId.get(String(pair['remoteCandidateId']))];
  if (ends.some((c) => c?.['candidateType'] === 'relay')) return 'relayed';
  return ends.every((c) => c !== undefined) ? 'direct' : null;
}
