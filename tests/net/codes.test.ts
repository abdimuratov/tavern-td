import { describe, expect, it } from 'vitest';
import {
  CodeError, decodeCode, encodeCode, formatIpv6, joinLink, parseIpv6, readCode, sdpFields, sdpFromCode,
  type CodeContent, type CodeKind, type CodeProblem,
} from '../../src/net/codes';
import {
  ANDROID_ANSWER, CHROME_IPV6_OFFER, CHROME_OFFER, CHROME_RELAY_CANDIDATE, CHROME_RELAY_OFFER, FIREFOX_OFFER, SAFARI_ANSWER,
} from './fixtures';

const SIM = 'abcd1234';
const SESSION = '0123456789abcdef';

function code(sdp: string, kind: CodeKind, session: string | null = null): { text: string; content: CodeContent } {
  const content: CodeContent = { kind, sim: SIM, session, ...sdpFields(sdp) };
  return { text: encodeCode(content), content };
}

function problem(fn: () => unknown): CodeProblem | 'none' {
  try {
    fn();
    return 'none';
  } catch (err) {
    if (err instanceof CodeError) return err.problem;
    throw err;
  }
}

describe('Join and Answer codes', () => {
  it('read the fields that matter out of each browser\'s description', () => {
    const chrome = sdpFields(CHROME_OFFER);
    expect(chrome).toEqual({
      ufrag: 'Xk3d', pwd: '9fGh2Jk4Lm6Np8Qr0St2Uv4W', setup: 'actpass', mid: '0',
      fingerprint: '4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:3E:60:1E:6E:3E:46:BB:93:AF:1F:A0:5E',
      candidates: [
        { kind: 'host', family: 'mdns', address: '8c7a3f5e-2b1d-4e6f-9a0b-1c2d3e4f5a6b.local', port: 54400 },
        { kind: 'srflx', family: 'ipv4', address: '203.0.113.45', port: 54400 },
      ],
    });
    // TCP and component 2 are dropped; one of each kind, then the second server-reflexive before the second host.
    expect(sdpFields(CHROME_IPV6_OFFER).candidates.map((c) => `${c.kind}/${c.family}`)).toEqual(['host/mdns', 'srflx/ipv4', 'srflx/ipv6', 'host/mdns']);
    expect(sdpFields(CHROME_IPV6_OFFER).candidates[2]!.address).toBe('2001:db8:85a3::8a2e:370:7334');
    const firefox = sdpFields(FIREFOX_OFFER);
    expect(firefox.ufrag).toBe('5a7c9e1b');
    expect(firefox.pwd).toHaveLength(32);
    expect(firefox.fingerprint.startsWith('6E:0F:3B')).toBe(true);
    expect(firefox.candidates.map((c) => c.kind)).toEqual(['host', 'srflx']);
    expect(sdpFields(SAFARI_ANSWER).setup).toBe('active');
    expect(sdpFields(ANDROID_ANSWER).candidates.map((c) => `${c.kind}/${c.family}/${c.address}`))
      .toEqual(['host/ipv6/2001:db8:4f0:1c2::a1', 'srflx/ipv6/2001:db8:4f0:1c2::a1']);
  });

  it('round-trip every fixture, at the design\'s lengths', () => {
    for (const [sdp, kind] of [[CHROME_OFFER, 'join'], [CHROME_IPV6_OFFER, 'join'], [FIREFOX_OFFER, 'join'], [SAFARI_ANSWER, 'answer'], [ANDROID_ANSWER, 'answer']] as const) {
      const { text, content } = code(sdp, kind);
      expect(text.startsWith(kind === 'join' ? 'TTDJ1.' : 'TTDA1.')).toBe(true);
      expect(decodeCode(text, kind, SIM)).toEqual(content);
    }
    // One mDNS host and one IPv4 server-reflexive: 103 bytes, 144 characters; two of each with IPv6: 141 bytes, 194.
    expect(code(CHROME_OFFER, 'join').text).toHaveLength(144);
    expect(code(CHROME_IPV6_OFFER, 'join').text).toHaveLength(194);
    const rejoin = code(CHROME_IPV6_OFFER, 'join', SESSION);
    expect(decodeCode(rejoin.text, 'join', SIM).session).toBe(SESSION);
    expect(rejoin.text.length).toBeLessThanOrEqual(220);
  });

  it('rebuild a description with every line setRemoteDescription needs, which reads back to the same fields', () => {
    const fields = sdpFields(CHROME_IPV6_OFFER);
    const sdp = sdpFromCode(fields);
    const lines = sdp.split('\r\n');
    expect(sdp.endsWith('\r\n')).toBe(true);
    for (const want of [
      'v=0', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      'a=ice-ufrag:Q9zP', 'a=ice-pwd:aB3dE5fG7hJ9kL1mN3pQ5rS7', `a=fingerprint:sha-256 ${fields.fingerprint}`, 'a=setup:actpass',
      'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:65536', 'a=end-of-candidates',
    ]) expect(lines).toContain(want);
    expect(lines[1]).toMatch(/^o=- \d+ 2 IN IP4 127\.0\.0\.1$/);
    const candidates = lines.filter((l) => l.startsWith('a=candidate:'));
    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toMatch(/^a=candidate:1 1 udp 2130706431 0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0\.local 60123 typ host$/);
    expect(candidates[1]).toMatch(/ 198\.51\.100\.7 60123 typ srflx raddr 0\.0\.0\.0 rport 0$/);
    expect(sdpFields(sdp)).toEqual(fields);
    // Firefox's description too, with its session-level fingerprint.
    expect(sdpFields(sdpFromCode(sdpFields(FIREFOX_OFFER)))).toEqual(sdpFields(FIREFOX_OFFER));
  });

  it('carry a relay candidate, whose rebuilt line a browser takes, at a reasonable length', () => {
    const fields = sdpFields(CHROME_RELAY_OFFER);
    // The host, the server-reflexive, then both relays: the UDP allocation's first, as Chrome listed it.
    expect(fields.candidates).toEqual([
      { kind: 'host', family: 'mdns', address: '8c7a3f5e-2b1d-4e6f-9a0b-1c2d3e4f5a6b.local', port: 54400 },
      { kind: 'srflx', family: 'ipv4', address: '203.0.113.45', port: 54400 },
      { kind: 'relay', family: 'ipv4', address: '192.0.2.77', port: 61432 },
      { kind: 'relay', family: 'ipv4', address: '192.0.2.77', port: 52011 },
    ]);
    // A relay candidate gets in beside two hosts and two server-reflexives, in place of the second host.
    const withIpv6 = sdpFields(CHROME_IPV6_OFFER, [CHROME_RELAY_CANDIDATE]);
    expect(withIpv6.candidates.map((c) => `${c.kind}/${c.family}`)).toEqual(['host/mdns', 'srflx/ipv4', 'relay/ipv4', 'srflx/ipv6']);

    // Its rebuilt line: the lowest type preference, a related address as Firefox wants, and the same fields read back.
    const lines = sdpFromCode(fields).split('\r\n').filter((l) => l.startsWith('a=candidate:'));
    expect(lines[2]).toBe('a=candidate:3 1 udp 16776703 192.0.2.77 61432 typ relay raddr 0.0.0.0 rport 0');
    expect(sdpFields(sdpFromCode(fields))).toEqual(fields);
    const { text } = code(CHROME_RELAY_OFFER, 'join');
    expect(decodeCode(text, 'join', SIM).candidates).toEqual(fields.candidates);

    // 7 bytes a relay candidate: 117 bytes and 162 characters with two; one host, one server-reflexive and one relay make 153.
    expect(text).toHaveLength(162);
    expect(encodeCode({ kind: 'join', sim: SIM, session: null, ...fields, candidates: fields.candidates.slice(0, 3) })).toHaveLength(153);
    expect(code(CHROME_IPV6_OFFER.replace('a=ice-ufrag', `a=${CHROME_RELAY_CANDIDATE}\r\na=ice-ufrag`), 'join').text).toHaveLength(178);
  });

  it('take a whole link, spaces and invisible characters, and say what\'s wrong with anything else', () => {
    const { text } = code(CHROME_OFFER, 'join');
    const link = joinLink('https://abdimuratov.github.io/tavern-td/#old', text);
    expect(link).toBe(`https://abdimuratov.github.io/tavern-td/#join=${text}`);
    expect(readCode(link)).toBe(text);
    expect(decodeCode(link, 'join', SIM).ufrag).toBe('Xk3d');
    expect(decodeCode(` ${text.slice(0, 40)}\n${text.slice(40, 90)}\u200b${text.slice(90)} `, 'join', SIM).ufrag).toBe('Xk3d');

    expect(problem(() => decodeCode(text.slice(0, -6), 'join', SIM))).toBe('damaged');
    expect(problem(() => decodeCode(text.slice(0, 50), 'join', SIM))).toBe('damaged');
    const flipped = text.slice(0, 60) + (text[60] === 'A' ? 'B' : 'A') + text.slice(61);
    expect(problem(() => decodeCode(flipped, 'join', SIM))).toBe('damaged');
    expect(problem(() => decodeCode(text.replace('TTDJ1.', 'TTDA1.'), 'answer', SIM))).toBe('damaged');
    expect(problem(() => decodeCode(text, 'join', 'ffff0000'))).toBe('version');
    expect(problem(() => decodeCode(text.replace('TTDJ1.', 'TTDJ2.'), 'join', SIM))).toBe('version');
    expect(problem(() => decodeCode(text, 'answer', SIM))).toBe('wrong-kind');
    expect(problem(() => decodeCode(code(SAFARI_ANSWER, 'answer').text, 'join', SIM))).toBe('wrong-kind');
    expect(problem(() => decodeCode('hello there', 'join', SIM))).toBe('not-a-code');
    expect(problem(() => decodeCode('TTD1.0a1b2c3d.abcdef', 'join', SIM))).toBe('not-a-code');
    expect(new CodeError('damaged', 'x').message).toBe('x');
    try {
      decodeCode(text, 'join', 'ffff0000');
    } catch (err) {
      expect((err as Error).message).toMatch(/different version of Tavern TD/);
    }
  });

  it('refuse a description they can\'t carry', () => {
    expect(problem(() => sdpFields(CHROME_OFFER.replace(/a=fingerprint:sha-256/, 'a=fingerprint:sha-1')))).toBe('unsupported');
    expect(problem(() => sdpFields(CHROME_OFFER.replace(/a=ice-pwd:.*\r\n/, '')))).toBe('unsupported');
    expect(problem(() => sdpFields('v=0\r\n'))).toBe('unsupported');
  });

  it('write IPv6 as RFC 5952 does', () => {
    expect(formatIpv6(parseIpv6('2001:0db8:0000:0000:0000:ff00:0042:8329')!)).toBe('2001:db8::ff00:42:8329');
    expect(formatIpv6(parseIpv6('fe80::1%eth0')!)).toBe('fe80::1');
    expect(formatIpv6(parseIpv6('::ffff:192.0.2.1')!)).toBe('::ffff:c000:201');
    expect(formatIpv6(parseIpv6('2001:db8:0:1:0:0:0:1')!)).toBe('2001:db8:0:1::1');
    expect(parseIpv6('1:2:3')).toBeNull();
    expect(parseIpv6('1::2::3')).toBeNull();
    expect(parseIpv6('203.0.113.4')).toBeNull();
  });
});
