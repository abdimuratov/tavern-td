// Hand-written descriptions shaped like what each browser makes for one
// negotiated DataChannel after gathering (addresses from the documentation
// ranges). libwebrtc (Chrome, Safari, the Android WebView) hides host
// addresses behind mDNS names, makes 4-character ufrags and 24-character
// passwords, and puts the fingerprint in the media section; Firefox makes
// 8 and 32 hex characters, puts the fingerprint at the session level, and
// writes UDP in capitals.

const crlf = (lines: string[]): string => `${lines.join('\r\n')}\r\n`;

/** Chrome's offer: one mDNS host, one IPv4 server-reflexive, and a TCP host it must drop. */
export const CHROME_OFFER = crlf([
  'v=0',
  'o=- 4215775240449105457 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:2999745851 1 udp 2122260223 8c7a3f5e-2b1d-4e6f-9a0b-1c2d3e4f5a6b.local 54400 typ host generation 0 network-id 1 network-cost 10',
  'a=candidate:842163049 1 udp 1686052607 203.0.113.45 54400 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1 network-cost 10',
  'a=candidate:1510613869 1 tcp 1518280447 8c7a3f5e-2b1d-4e6f-9a0b-1c2d3e4f5a6b.local 9 typ host tcptype active generation 0 network-id 1 network-cost 10',
  'a=ice-ufrag:Xk3d',
  'a=ice-pwd:9fGh2Jk4Lm6Np8Qr0St2Uv4W',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:3E:60:1E:6E:3E:46:BB:93:AF:1F:A0:5E',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** Chrome's offer on a network with IPv6 too: two mDNS hosts, an IPv4 and an IPv6 server-reflexive, and more it drops. */
export const CHROME_IPV6_OFFER = crlf([
  'v=0',
  'o=- 7319056215443320872 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:3442447574 1 udp 2122260223 0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.local 60123 typ host generation 0 network-id 1',
  'a=candidate:1855489532 1 udp 2122197247 9e8d7c6b-5a49-4837-a625-14f3e2d1c0b9.local 60124 typ host generation 0 network-id 2',
  'a=candidate:1218296510 1 udp 1686052607 198.51.100.7 60123 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1',
  'a=candidate:2410946324 1 udp 1685987071 2001:db8:85a3::8a2e:370:7334 60124 typ srflx raddr :: rport 0 generation 0 network-id 2',
  'a=candidate:4233069003 1 tcp 1518280447 0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.local 9 typ host tcptype active generation 0 network-id 1',
  'a=candidate:2999745852 2 udp 2122260222 0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0.local 60125 typ host generation 0 network-id 1',
  'a=ice-ufrag:Q9zP',
  'a=ice-pwd:aB3dE5fG7hJ9kL1mN3pQ5rS7',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 C2:5B:76:0E:1A:94:3F:D8:62:A7:B0:15:4E:C9:83:2D:F6:58:0B:E1:7A:34:9C:D2:61:F8:05:AB:3E:C7:90:14',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** Safari's answer to a rebuilt offer: DTLS active, one mDNS host, one IPv4 server-reflexive. */
export const SAFARI_ANSWER = crlf([
  'v=0',
  'o=- 1793452856023914556 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'b=AS:30',
  'a=candidate:1366913454 1 udp 2113937151 d4c3b2a1-f6e5-4987-b6a5-0c1d2e3f4a5b.local 49152 typ host generation 0 network-cost 999',
  'a=candidate:842163050 1 udp 1677729535 192.0.2.88 49152 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  'a=ice-ufrag:7tWq',
  'a=ice-pwd:Zx8cV6bN4mL2kJ0hG8fD6sA4',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 91:3C:E4:57:0A:BD:62:F8:13:7E:C5:29:A0:4F:D6:8B:35:E2:79:0C:B1:46:FA:23:8D:6E:C0:59:A7:12:F4:3B',
  'a=setup:active',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** The Android WebView's answer (libwebrtc again), on mobile data with IPv6 only: raw IPv6 host and server-reflexive. */
export const ANDROID_ANSWER = crlf([
  'v=0',
  'o=- 5524137260813547031 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:559267639 1 udp 2122197247 2001:db8:4f0:1c2::a1 41234 typ host generation 0 network-id 3 network-cost 900',
  'a=candidate:3471623853 1 udp 1685987071 2001:db8:4f0:1c2::a1 41234 typ srflx raddr 2001:db8:4f0:1c2::a1 rport 41234 generation 0 network-id 3 network-cost 900',
  'a=ice-ufrag:m2Rn',
  'a=ice-pwd:Hy6tF4dS2aQ0wE8rT6yU4iO2',
  'a=fingerprint:sha-256 0D:72:A9:4E:B3:18:C6:5F:E0:27:9A:41:D8:6B:F3:0C:52:E7:8A:1D:B4:69:2F:C0:95:3A:E8:47:1B:D6:70:2C',
  'a=setup:active',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** Firefox's offer: fingerprint at the session level, hex credentials, UDP in capitals, a TCP host and end-of-candidates. */
export const FIREFOX_OFFER = crlf([
  'v=0',
  'o=mozilla...THIS_IS_SDPARTA-99.0 6327934413574343370 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'a=fingerprint:sha-256 6E:0F:3B:A8:51:D4:97:2C:E6:1A:8D:40:B7:F3:65:09:C2:7E:94:1B:D8:36:AF:50:E3:8C:27:6A:F1:04:B9:5D',
  'a=group:BUNDLE 0',
  'a=ice-options:trickle',
  'a=msid-semantic:WMS *',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:0 1 UDP 2122252543 4f9b1c3a-5d7e-4a2b-8c6d-0e1f2a3b4c5d.local 61523 typ host',
  'a=candidate:2 1 TCP 2105524479 4f9b1c3a-5d7e-4a2b-8c6d-0e1f2a3b4c5d.local 9 typ host tcptype active',
  'a=candidate:1 1 UDP 1686052863 198.51.100.23 61523 typ srflx raddr 0.0.0.0 rport 0',
  'a=sendrecv',
  'a=end-of-candidates',
  'a=ice-pwd:2d3e7d1c9a5b4f6e8a0c2e4f6a8b0c1d',
  'a=ice-ufrag:5a7c9e1b',
  'a=mid:0',
  'a=setup:actpass',
  'a=sctp-port:5000',
  'a=max-message-size:1073741823',
]);
