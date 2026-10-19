import type { SdpFields } from './codes';
import type { Relay, RelayProblem, RelayServer } from './relay';
import type { Route } from './transport';

// The decisions rtc.ts makes about ICE (docs/versus-design.md §2), kept pure
// so Node tests can read them: the configuration with the Relay's servers,
// which candidate ends gathering early, how the Relay stood for a code, and
// whether the pair ICE picked runs through the Relay.

/** `relay` gathers relay candidates only: a test hook, so a test proves the Relay alone carries a connection. */
export type IcePolicy = 'all' | 'relay';

/** The STUN servers, then the Relay's TURN servers when there are any. */
export function iceConfiguration(stun: readonly RTCIceServer[], relay: readonly RelayServer[], policy: IcePolicy = 'all'): RTCConfiguration {
  return {
    iceServers: [
      ...stun.map((s) => ({ ...s, urls: typeof s.urls === 'string' ? s.urls : [...s.urls] })),
      ...relay.map((s) => ({ urls: [...s.urls], username: s.username, credential: s.credential })),
    ],
    iceTransportPolicy: policy,
  };
}

/** Whether any of the servers is a TURN server, so gathering waits for a relay candidate. */
export function hasTurn(servers: readonly RTCIceServer[]): boolean {
  return servers.some((s) => (typeof s.urls === 'string' ? [s.urls] : s.urls).some((u) => /^turns?:/i.test(u)));
}

/**
 * Whether this candidate starts gathering's last second: the first relay
 * candidate when there's a TURN server, since gathering isn't trickled and
 * the code must already hold it, else the first server-reflexive one.
 * Gathering then ends a second later, at the 5 s cap, or once the browser
 * says it's complete, whichever comes first.
 */
export function startsLastSecond(candidate: { readonly type?: string | null; readonly candidate: string }, turn: boolean): boolean {
  const type = candidate.type ?? / typ (\w+)/.exec(candidate.candidate)?.[1];
  return type === (turn ? 'relay' : 'srflx');
}

/**
 * - `offered`: the code holds a relay candidate.
 * - `unneeded`: none came because this device already reached the Rival
 *   directly while gathering, which ends Chrome's gathering (a Guest on the
 *   Host's Wi-Fi, connecting before the Host has its Answer code).
 * - `unavailable`: a Relay is set up, but fetching its credentials failed, or no relay candidate came in time.
 * - `none`: no Relay is set up, as before there was one.
 */
export type RelayUse = 'offered' | 'unneeded' | 'unavailable' | 'none';

/** How the Relay stood for one code (§2, §3). */
export interface CodeRelay {
  readonly use: RelayUse;
  /** Why it's unavailable: the fetch's problem, or `no-candidate`; null otherwise. */
  readonly why: Exclude<RelayProblem, 'no-url'> | 'no-candidate' | null;
}

/** Whether a code holds a relay candidate. */
export function holdsRelay(fields: Pick<SdpFields, 'candidates'>): boolean {
  return fields.candidates.some((c) => c.kind === 'relay');
}

/**
 * How the Relay stood for a code: what the fetch gave, whether a relay
 * candidate made it in, and whether ICE had already `reached` the Rival when
 * gathering ended.
 */
export function codeRelay(relay: Relay, fields: Pick<SdpFields, 'candidates'>, reached = false): CodeRelay {
  if (holdsRelay(fields)) return { use: 'offered', why: null };
  if (!relay.ok) return relay.why === 'no-url' ? { use: 'none', why: null } : { use: 'unavailable', why: relay.why };
  return reached ? { use: 'unneeded', why: null } : { use: 'unavailable', why: 'no-candidate' };
}

/** One entry of getStats()'s report, as far as the route needs it. */
export interface StatsEntry {
  readonly id: string;
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * How the connection runs, from getStats(): `relayed` when either end of the
 * selected candidate pair is a relay candidate, else `direct`; null while
 * none is selected. The pair is the transport's `selectedCandidatePairId`
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
