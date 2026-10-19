import { describe, expect, it } from 'vitest';
import { codeRelay, hasTurn, iceConfiguration, selectedRoute, startsLastSecond, type StatsEntry } from '../../src/net/ice';
import type { Relay } from '../../src/net/relay';

// What rtc.ts decides about ICE (docs/versus-design.md §2): the servers with
// the Relay's, when gathering stops, how the Relay stood for a code, and
// whether the selected pair runs through the Relay, read from getStats()
// reports shaped like Chrome's, Safari's and Firefox's.

const STUN: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
const TURN = [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }];

describe('the ICE servers', () => {
  it('are the STUN servers, then the Relay\'s TURN servers with their credentials', () => {
    expect(iceConfiguration(STUN, TURN)).toEqual({
      iceServers: [...STUN, { urls: TURN[0]!.urls, username: 'u', credential: 'c' }],
      iceTransportPolicy: 'all',
    });
    // The tests' empty STUN list still takes the Relay's; the relay-only hook sets the policy.
    expect(iceConfiguration([], TURN, 'relay')).toEqual({ iceServers: [{ urls: TURN[0]!.urls, username: 'u', credential: 'c' }], iceTransportPolicy: 'relay' });
    expect(iceConfiguration(STUN, []).iceServers).toEqual(STUN);
    expect(hasTurn(STUN)).toBe(false);
    expect(hasTurn(iceConfiguration(STUN, TURN).iceServers!)).toBe(true);
    expect(hasTurn([{ urls: 'TURNS:turn.example.com:443' }])).toBe(true);
  });
});

describe('gathering', () => {
  const candidate = (type: string | null, line = ''): { type: string | null; candidate: string } => ({ type, candidate: line });

  it('stops a second after the first relay candidate when there is a TURN server, not after a server-reflexive', () => {
    expect(startsLastSecond(candidate('srflx'), true)).toBe(false);
    expect(startsLastSecond(candidate('host'), true)).toBe(false);
    expect(startsLastSecond(candidate('relay'), true)).toBe(true);
    // A browser that leaves `type` out: read from the line.
    expect(startsLastSecond(candidate(null, 'candidate:3561839427 1 udp 41885439 192.0.2.77 61432 typ relay raddr 203.0.113.45 rport 54400'), true)).toBe(true);
  });

  it('stops a second after the first server-reflexive with no TURN server, as before the Relay', () => {
    expect(startsLastSecond(candidate('srflx'), false)).toBe(true);
    expect(startsLastSecond(candidate('host'), false)).toBe(false);
    expect(startsLastSecond(candidate('relay'), false)).toBe(false);
    expect(startsLastSecond(candidate(null, 'candidate:842163049 1 udp 1686052607 203.0.113.45 54400 typ srflx raddr 0.0.0.0 rport 0'), false)).toBe(true);
  });
});

describe('how the Relay stood for a code', () => {
  const ok: Relay = { ok: true, servers: TURN, until: 1 };
  const host = { kind: 'host', family: 'mdns', address: '8c7a3f5e-2b1d-4e6f-9a0b-1c2d3e4f5a6b.local', port: 54400 } as const;
  const relay = { kind: 'relay', family: 'ipv4', address: '192.0.2.77', port: 61432 } as const;

  it('offered when the code holds a relay candidate, unavailable when it should have and doesn\'t, none with no Relay set up', () => {
    expect(codeRelay(ok, { candidates: [host, relay] })).toEqual({ use: 'offered', why: null });
    expect(codeRelay(ok, { candidates: [host, relay] }, true)).toEqual({ use: 'offered', why: null });
    expect(codeRelay(ok, { candidates: [host] })).toEqual({ use: 'unavailable', why: 'no-candidate' });
    // A Guest that reached the Host while gathering, so Chrome stopped before any relay candidate: nothing to warn of.
    expect(codeRelay(ok, { candidates: [host] }, true)).toEqual({ use: 'unneeded', why: null });
    expect(codeRelay({ ok: false, why: 'unreachable', detail: 'timeout' }, { candidates: [host] }, true)).toEqual({ use: 'unavailable', why: 'unreachable' });
    expect(codeRelay({ ok: false, why: 'unreachable', detail: 'timeout' }, { candidates: [host] })).toEqual({ use: 'unavailable', why: 'unreachable' });
    expect(codeRelay({ ok: false, why: 'bad-response', detail: 'HTTP 403' }, { candidates: [host] })).toEqual({ use: 'unavailable', why: 'bad-response' });
    expect(codeRelay({ ok: false, why: 'no-url', detail: '' }, { candidates: [host] })).toEqual({ use: 'none', why: null });
  });
});

// Each browser's report for one data channel once connected, trimmed to what matters but with the fields beside it.

/** Chrome: the transport names the selected pair; another pair, from an `other` candidate, also succeeded but isn't it. */
function chromeStats(local: string, remote: string, other = 'host'): StatsEntry[] {
  return [
    { id: 'P', type: 'peer-connection', timestamp: 1729400000000, dataChannelsOpened: 1, dataChannelsClosed: 0 },
    { id: 'D1', type: 'data-channel', label: 'tavern', protocol: '', dataChannelIdentifier: 0, state: 'open', messagesSent: 12 },
    {
      id: 'T01', type: 'transport', bytesSent: 5120, bytesReceived: 4980, dtlsState: 'connected', iceState: 'connected', iceRole: 'controlling',
      selectedCandidatePairId: 'CPq3h+Ld7W_aBc1dE2f', selectedCandidatePairChanges: 1, localCertificateId: 'CF4A', remoteCertificateId: 'CF7B',
    },
    {
      id: 'CPq3h+Ld7W_aBc1dE2f', type: 'candidate-pair', transportId: 'T01', localCandidateId: 'Iq3h+Ld7W', remoteCandidateId: 'IaBc1dE2f',
      state: 'succeeded', nominated: true, writable: true, currentRoundTripTime: 0.041,
    },
    {
      id: 'CPq3h+Ld7W_Izz9', type: 'candidate-pair', transportId: 'T01', localCandidateId: 'Ixy7', remoteCandidateId: 'Izz9',
      state: 'succeeded', nominated: false, writable: true,
    },
    { id: 'Iq3h+Ld7W', type: 'local-candidate', transportId: 'T01', isRemote: false, address: '192.0.2.77', port: 61432, protocol: 'udp', candidateType: local, priority: 41885439 },
    { id: 'Ixy7', type: 'local-candidate', transportId: 'T01', isRemote: false, address: '192.168.1.20', port: 54400, protocol: 'udp', candidateType: other, priority: 2122260223 },
    { id: 'IaBc1dE2f', type: 'remote-candidate', transportId: 'T01', isRemote: true, address: '198.51.100.7', port: 60123, protocol: 'udp', candidateType: remote, priority: 1686052607 },
    { id: 'Izz9', type: 'remote-candidate', transportId: 'T01', isRemote: true, address: '192.168.1.30', port: 60123, protocol: 'udp', candidateType: 'host', priority: 2130706431 },
  ];
}

/** Safari's libwebrtc names it like Chrome; `old` drops the transport's pair, as an older WebKit's report does. */
function safariStats(local: string, remote: string, old = false): StatsEntry[] {
  const transport: StatsEntry = {
    id: 'RTCTransport_0_1', type: 'transport', bytesSent: 3311, bytesReceived: 3270, dtlsState: 'connected',
    ...(old ? {} : { selectedCandidatePairId: 'RTCIceCandidatePair_lF5k0bQx_Yp2wD7nH' }),
  };
  return [
    transport,
    {
      id: 'RTCIceCandidatePair_lF5k0bQx_Yp2wD7nH', type: 'candidate-pair', transportId: 'RTCTransport_0_1',
      localCandidateId: 'RTCIceCandidate_lF5k0bQx', remoteCandidateId: 'RTCIceCandidate_Yp2wD7nH', state: 'succeeded', nominated: true,
    },
    {
      id: 'RTCIceCandidatePair_lF5k0bQx_Mm3s', type: 'candidate-pair', transportId: 'RTCTransport_0_1',
      localCandidateId: 'RTCIceCandidate_lF5k0bQx', remoteCandidateId: 'RTCIceCandidate_Mm3s', state: 'failed', nominated: false,
    },
    { id: 'RTCIceCandidate_lF5k0bQx', type: 'local-candidate', transportId: 'RTCTransport_0_1', address: '192.0.2.88', port: 49152, protocol: 'udp', candidateType: local },
    { id: 'RTCIceCandidate_Yp2wD7nH', type: 'remote-candidate', transportId: 'RTCTransport_0_1', address: '192.0.2.77', port: 61432, protocol: 'udp', candidateType: remote },
    { id: 'RTCIceCandidate_Mm3s', type: 'remote-candidate', transportId: 'RTCTransport_0_1', address: '203.0.113.45', port: 54400, protocol: 'udp', candidateType: 'srflx' },
  ];
}

/** Firefox: no transport entry; the pair in use says `selected`, though another nominated one, through the Relay, succeeded too. */
function firefoxStats(local: string, remote: string): StatsEntry[] {
  return [
    { id: '0b6c4e2a', type: 'candidate-pair', localCandidateId: '9d1a', remoteCandidateId: '4f2c', state: 'succeeded', nominated: true, selected: false },
    { id: '7e3f1d5b', type: 'candidate-pair', localCandidateId: '3b8e', remoteCandidateId: '6a0d', state: 'succeeded', nominated: true, selected: true },
    { id: '9d1a', type: 'local-candidate', address: '192.0.2.77', port: 50071, protocol: 'udp', candidateType: 'relay', relayProtocol: 'udp' },
    { id: '3b8e', type: 'local-candidate', address: '192.0.2.77', port: 50077, protocol: 'udp', candidateType: local, relayProtocol: local === 'relay' ? 'udp' : undefined },
    { id: '4f2c', type: 'remote-candidate', address: '192.168.1.30', port: 60123, protocol: 'udp', candidateType: 'host' },
    { id: '6a0d', type: 'remote-candidate', address: '198.51.100.7', port: 60123, protocol: 'udp', candidateType: remote },
  ];
}

describe('the route', () => {
  it('reads Chrome\'s selected pair from its transport: relayed if either end is a relay candidate', () => {
    expect(selectedRoute(chromeStats('relay', 'srflx'))).toBe('relayed');
    expect(selectedRoute(chromeStats('srflx', 'relay'))).toBe('relayed');
    expect(selectedRoute(chromeStats('relay', 'relay'))).toBe('relayed');
    expect(selectedRoute(chromeStats('srflx', 'prflx'))).toBe('direct');
    // The other pair that succeeded goes through the Relay, but isn't the one in use.
    expect(selectedRoute(chromeStats('host', 'host', 'relay'))).toBe('direct');
    // getStats() gives a Map-like report: its values() are what rtc.ts passes.
    expect(selectedRoute(new Map(chromeStats('relay', 'host').map((s) => [s.id, s])).values())).toBe('relayed');
  });

  it('reads Safari\'s the same way, and an older WebKit\'s from the nominated pair that succeeded', () => {
    expect(selectedRoute(safariStats('srflx', 'relay'))).toBe('relayed');
    expect(selectedRoute(safariStats('host', 'srflx'))).toBe('direct');
    expect(selectedRoute(safariStats('srflx', 'relay', true))).toBe('relayed');
    expect(selectedRoute(safariStats('host', 'host', true))).toBe('direct');
  });

  it('reads Firefox\'s from the pair marked selected', () => {
    expect(selectedRoute(firefoxStats('relay', 'srflx'))).toBe('relayed');
    expect(selectedRoute(firefoxStats('srflx', 'relay'))).toBe('relayed');
    expect(selectedRoute(firefoxStats('srflx', 'srflx'))).toBe('direct');
  });

  it('knows nothing yet while ICE is still checking, or when a pair\'s ends are missing', () => {
    expect(selectedRoute([
      { id: 'T01', type: 'transport', dtlsState: 'new', iceState: 'checking' },
      { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R', state: 'in-progress', nominated: false },
      { id: 'L', type: 'local-candidate', candidateType: 'host' },
      { id: 'R', type: 'remote-candidate', candidateType: 'host' },
    ])).toBeNull();
    expect(selectedRoute([])).toBeNull();
    expect(selectedRoute([
      { id: 'T01', type: 'transport', selectedCandidatePairId: 'CP1' },
      { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'gone', state: 'succeeded', nominated: true },
      { id: 'L', type: 'local-candidate', candidateType: 'srflx' },
    ])).toBeNull();
    // One end is enough to say relayed.
    expect(selectedRoute([
      { id: 'T01', type: 'transport', selectedCandidatePairId: 'CP1' },
      { id: 'CP1', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'gone', state: 'succeeded', nominated: true },
      { id: 'L', type: 'local-candidate', candidateType: 'relay' },
    ])).toBe('relayed');
  });
});
