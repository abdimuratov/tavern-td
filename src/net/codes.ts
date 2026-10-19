import { crc32, fromBase64Url, toBase64Url } from '../platform/savecode';
import { isHex8, isSessionId } from './protocol';

// Join and Answer codes (docs/versus-design.md §2): the few fields of a
// browser's offer or answer that can't be rebuilt, as bytes in base64url after
// `TTDJ1.` or `TTDA1.`. The other end rebuilds a standard data-channel SDP
// around them for setRemoteDescription; each device's own description stays
// the browser's. Pure: no browser API, so the round trips run in Node.

export type CodeKind = 'join' | 'answer';
export type CandidateKind = 'host' | 'srflx' | 'prflx' | 'relay';
export type AddressFamily = 'ipv4' | 'ipv6' | 'mdns';
export type SetupRole = 'actpass' | 'active' | 'passive';

/** One UDP candidate as a code carries it. TCP candidates and related addresses are dropped. */
export interface CodeCandidate {
  readonly kind: CandidateKind;
  readonly family: AddressFamily;
  /** Dotted IPv4, IPv6 as RFC 5952 writes it, or an mDNS name `<uuid>.local`. */
  readonly address: string;
  readonly port: number;
}

/** What a description holds that the other end can't rebuild. */
export interface SdpFields {
  readonly ufrag: string;
  readonly pwd: string;
  /** The SHA-256 DTLS fingerprint as 32 uppercase hex pairs joined by colons. */
  readonly fingerprint: string;
  readonly setup: SetupRole;
  readonly mid: string;
  /** At most four. */
  readonly candidates: readonly CodeCandidate[];
}

export interface CodeContent extends SdpFields {
  readonly kind: CodeKind;
  /** The sim hash (8 hex digits): another version's code says so on paste. */
  readonly sim: string;
  /** On a rejoin's Join code, the Run's session id (16 hex digits); null otherwise. */
  readonly session: string | null;
}

/**
 * - `not-a-code`: not a Tavern TD code at all (or a save code).
 * - `damaged`: cut off, mistyped or changed, so its checksum fails.
 * - `version`: made by a build with other rules or another code format.
 * - `wrong-kind`: an Answer code where a Join code goes, or the other way round.
 * - `unsupported`: a description this format can't carry (no SHA-256 fingerprint, no ICE credentials).
 */
export type CodeProblem = 'not-a-code' | 'damaged' | 'version' | 'wrong-kind' | 'unsupported';

/** A code that can't be used; its message can be shown to the player as is. */
export class CodeError extends Error {
  override name = 'CodeError';
  constructor(readonly problem: CodeProblem, message: string) {
    super(message);
  }
}

const FORMAT = 1;
const PREFIX: Readonly<Record<CodeKind, string>> = { join: 'TTDJ', answer: 'TTDA' };
const KIND_BYTE: Readonly<Record<CodeKind, number>> = { join: 1, answer: 2 };
const SETUPS: readonly SetupRole[] = ['actpass', 'active', 'passive'];
const KINDS: readonly CandidateKind[] = ['host', 'srflx', 'prflx', 'relay'];
/** The order pick() takes a second of each kind and on. */
const LATER_KINDS: readonly CandidateKind[] = ['srflx', 'host', 'prflx', 'relay'];
const FAMILIES: readonly AddressFamily[] = ['ipv4', 'ipv6', 'mdns'];
const MAX_CANDIDATES = 4;
const FLAG_SESSION = 1;
const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;
/** ICE's ufrag and password characters (RFC 8839): letters, digits, + and /. */
const ICE_CHARS = /^[A-Za-z0-9+/]+$/;

// ---- Reading a browser's SDP -------------------------------------------------

/**
 * The code's fields from a browser's offer or answer. `extra` adds candidates
 * the page saw in `icecandidate` events but the description doesn't list yet.
 * Throws a CodeError (`unsupported`) on a description it can't carry.
 */
export function sdpFields(sdp: string, extra: readonly string[] = []): SdpFields {
  const lines = sdp.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const session: string[] = [];
  const sections: { media: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith('m=')) sections.push({ media: line, lines: [] });
    else (sections.at(-1)?.lines ?? session).push(line);
  }
  const app = sections.find((s) => s.media.startsWith('m=application')) ?? sections[0];
  if (!app) throw unsupported('it has no media section');
  const attr = (name: string): string | undefined => {
    const prefix = `a=${name}:`;
    const line = app.lines.find((l) => l.startsWith(prefix)) ?? session.find((l) => l.startsWith(prefix));
    return line?.slice(prefix.length).trim();
  };
  const ufrag = attr('ice-ufrag');
  const pwd = attr('ice-pwd');
  if (!ufrag || !pwd || !ICE_CHARS.test(ufrag) || !ICE_CHARS.test(pwd) || ufrag.length > 255 || pwd.length > 255) {
    throw unsupported('its ICE credentials are missing');
  }
  const fp = /^sha-256\s+((?:[0-9a-f]{2}:){31}[0-9a-f]{2})$/i.exec(attr('fingerprint') ?? '');
  if (!fp) throw unsupported('it has no SHA-256 fingerprint');
  const setup = (attr('setup') ?? 'actpass').toLowerCase();
  if (!(SETUPS as readonly string[]).includes(setup)) throw unsupported('its DTLS role is unknown');
  const mid = attr('mid') ?? '0';
  if (mid.length > 32 || !/^[\x21-\x7e]+$/.test(mid)) throw unsupported('its mid is too long');
  const raw = [...app.lines.filter((l) => l.startsWith('a=candidate:')), ...extra];
  const seen = new Set<string>();
  const found: CodeCandidate[] = [];
  for (const line of raw) {
    const c = parseCandidate(line);
    if (!c) continue;
    const key = `${c.kind} ${c.address} ${c.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(c);
  }
  return { ufrag, pwd, fingerprint: fp[1]!.toUpperCase(), setup: setup as SetupRole, mid, candidates: pick(found) };
}

/** One `a=candidate:` line (or an icecandidate's `candidate:` string) as a code candidate; null for one it drops. */
export function parseCandidate(line: string): CodeCandidate | null {
  const text = line.replace(/^a=/, '').replace(/^candidate:/, '');
  const f = text.trim().split(/\s+/);
  // foundation component transport priority address port "typ" type …
  if (f.length < 8 || f[6] !== 'typ') return null;
  if (f[1] !== '1' || f[2]!.toLowerCase() !== 'udp') return null;
  const kind = f[7] as CandidateKind;
  if (!KINDS.includes(kind)) return null;
  const port = Number(f[5]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const at = f[4]!;
  if (parseIpv4(at)) return { kind, family: 'ipv4', address: at, port };
  const v6 = parseIpv6(at);
  if (v6) return { kind, family: 'ipv6', address: formatIpv6(v6), port };
  if (MDNS.test(at)) return { kind, family: 'mdns', address: at.toLowerCase(), port };
  return null;
}

/**
 * Up to four, each kind in the browser's order: first a host, a
 * server-reflexive, a peer-reflexive and a relay, then more of each in turn,
 * server-reflexives first. So a relay candidate always gets in, and beside it
 * an IPv6 server-reflexive, which reaches past the LAN, beats a second mDNS
 * host, which doesn't.
 */
function pick(found: readonly CodeCandidate[]): CodeCandidate[] {
  const of = (k: CandidateKind): CodeCandidate[] => found.filter((c) => c.kind === k);
  const out = KINDS.flatMap((k) => of(k).slice(0, 1));
  const later = LATER_KINDS.map(of);
  for (let round = 1; out.length < MAX_CANDIDATES && later.some((g) => g.length > round); round++) {
    for (const g of later) if (g[round] && out.length < MAX_CANDIDATES) out.push(g[round]!);
  }
  return out;
}

// ---- The code ------------------------------------------------------------------

/** A Join or Answer code from its fields. */
export function encodeCode(c: CodeContent): string {
  if (!isHex8(c.sim)) throw new TypeError('sim must be 8 hex digits');
  if (c.session !== null && !isSessionId(c.session)) throw new TypeError('session must be 16 hex digits');
  const out: number[] = [FORMAT, KIND_BYTE[c.kind], c.session !== null ? FLAG_SESSION : 0];
  out.push(...hexBytes(c.sim));
  pushText(out, c.ufrag);
  pushText(out, c.pwd);
  out.push(...hexBytes(c.fingerprint.replace(/:/g, '')));
  out.push(SETUPS.indexOf(c.setup));
  pushText(out, c.mid);
  const candidates = c.candidates.slice(0, MAX_CANDIDATES);
  out.push(candidates.length);
  for (const cand of candidates) {
    out.push((KINDS.indexOf(cand.kind) << 4) | FAMILIES.indexOf(cand.family), cand.port >> 8, cand.port & 0xff);
    out.push(...addressBytes(cand));
  }
  if (c.session !== null) out.push(...hexBytes(c.session));
  const crc = crc32(Uint8Array.from(out));
  out.push(crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
  return `${PREFIX[c.kind]}${FORMAT}.${toBase64Url(Uint8Array.from(out))}`;
}

/** The code inside a paste: a bare code, or a whole link with `#join=` after it; spaces and invisible characters dropped. */
export function readCode(text: string): string {
  let clean = text.replace(/[\s\u200b-\u200d\u2060\ufeff]+/g, '');
  const at = clean.search(/[#?&]join=/i);
  if (at >= 0) {
    clean = clean.slice(at + 6).split('&')[0]!;
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // Left as it is: the checks below say what's wrong with it.
    }
  }
  return clean;
}

/** The Host's link: the app's address with the Join code after `#`, so the server never receives it. */
export function joinLink(appUrl: string, code: string): string {
  return `${appUrl.split('#')[0]}#join=${code}`;
}

/**
 * Reads a pasted code (or link) of the `kind` this screen takes, made by a
 * build with the sim hash `sim`. Throws a CodeError whose message says what's wrong.
 */
export function decodeCode(text: string, kind: CodeKind, sim: string): CodeContent {
  const code = readCode(text);
  const m = /^TTD([JA])(\d+)\.([A-Za-z0-9_-]+)$/i.exec(code);
  if (!m) {
    if (/^TTD[JA]\d/i.test(code)) throw damaged();
    throw new CodeError('not-a-code', kind === 'join'
      ? "That isn't a Tavern TD Join code. Paste the whole link or code the Host sent you."
      : "That isn't a Tavern TD Answer code. Paste the whole code the Rival sent back.");
  }
  const got: CodeKind = m[1]!.toUpperCase() === 'J' ? 'join' : 'answer';
  if (Number(m[2]) !== FORMAT) throw versionError();
  const bytes = fromBase64Url(m[3]!);
  if (!bytes || bytes.length < 12) throw damaged();
  const body = bytes.subarray(0, bytes.length - 4);
  const crc = ((bytes[bytes.length - 4]! << 24) | (bytes[bytes.length - 3]! << 16) | (bytes[bytes.length - 2]! << 8) | bytes[bytes.length - 1]!) >>> 0;
  if (crc32(body) !== crc) throw damaged();
  const content = readBody(body);
  if (!content || content.kind !== got) throw damaged();
  if (got !== kind) {
    throw new CodeError('wrong-kind', kind === 'join'
      ? "That's an Answer code: it goes in the Host's box. Paste the Host's Join code here."
      : "That's a Join code. Paste the Answer code the Rival sent back.");
  }
  if (content.sim !== sim) throw versionError();
  return content;
}

function readBody(b: Uint8Array): CodeContent | null {
  let i = 0;
  const byte = (): number => {
    if (i >= b.length) throw new RangeError('short');
    return b[i++]!;
  };
  const bytes = (n: number): Uint8Array => {
    if (i + n > b.length) throw new RangeError('short');
    const out = b.subarray(i, i + n);
    i += n;
    return out;
  };
  const text = (): string => String.fromCharCode(...bytes(byte()));
  try {
    if (byte() !== FORMAT) return null;
    const kindByte = byte();
    const kind: CodeKind | null = kindByte === KIND_BYTE.join ? 'join' : kindByte === KIND_BYTE.answer ? 'answer' : null;
    const flags = byte();
    if (!kind || (flags & ~FLAG_SESSION) !== 0) return null;
    const sim = toHex(bytes(4));
    const ufrag = text();
    const pwd = text();
    if (!ICE_CHARS.test(ufrag) || !ICE_CHARS.test(pwd)) return null;
    const fingerprint = toHex(bytes(32)).toUpperCase().match(/../g)!.join(':');
    const setup = SETUPS[byte()];
    const mid = text();
    if (!setup || !/^[\x21-\x7e]+$/.test(mid)) return null;
    const count = byte();
    if (count > MAX_CANDIDATES) return null;
    const candidates: CodeCandidate[] = [];
    for (let k = 0; k < count; k++) {
      const kf = byte();
      const cand = KINDS[kf >> 4];
      const family = FAMILIES[kf & 0x0f];
      const port = (byte() << 8) | byte();
      if (!cand || !family || port === 0) return null;
      candidates.push({ kind: cand, family, port, address: readAddress(family, bytes(family === 'ipv4' ? 4 : 16)) });
    }
    const session = flags & FLAG_SESSION ? toHex(bytes(8)) : null;
    if (i !== b.length || (kind === 'answer' && session !== null)) return null;
    return { kind, sim, session, ufrag, pwd, fingerprint, setup, mid, candidates };
  } catch {
    return null;
  }
}

// ---- Rebuilding a description --------------------------------------------------

/**
 * A standard data-channel description around a code's fields, for
 * setRemoteDescription: one `m=application` section with SCTP on port 5000,
 * a 64 KiB message cap, the candidates with priorities from their kind, and
 * end-of-candidates, since gathering isn't trickled.
 */
export function sdpFromCode(c: SdpFields): string {
  const id = parseInt(fnv(`${c.ufrag}:${c.pwd}`), 16);
  const lines = [
    'v=0',
    `o=- ${id} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    `a=group:BUNDLE ${c.mid}`,
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${c.ufrag}`,
    `a=ice-pwd:${c.pwd}`,
    `a=fingerprint:sha-256 ${c.fingerprint}`,
    `a=setup:${c.setup}`,
    `a=mid:${c.mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:65536',
  ];
  c.candidates.forEach((cand, i) => {
    const related = cand.kind === 'host' ? '' : ' raddr 0.0.0.0 rport 0';
    lines.push(`a=candidate:${i + 1} 1 udp ${priority(cand, i)} ${cand.address} ${cand.port} typ ${cand.kind}${related}`);
  });
  lines.push('a=end-of-candidates');
  return `${lines.join('\r\n')}\r\n`;
}

/** RFC 8445's formula: type preference, then a local preference by order, then component 1. */
function priority(c: CodeCandidate, index: number): number {
  const type = { host: 126, prflx: 110, srflx: 100, relay: 0 }[c.kind];
  return type * 16_777_216 + (65_535 - index) * 256 + 255;
}

// ---- Addresses -------------------------------------------------------------------

function parseIpv4(text: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/** IPv6 as 8 groups; null when it isn't one. A zone id (`%eth0`) is dropped, and a dotted IPv4 tail becomes two groups. */
export function parseIpv6(text: string): number[] | null {
  let t = text.replace(/^\[|\]$/g, '').split('%')[0]!;
  if (!t.includes(':')) return null;
  const v4 = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (v4) {
    const b = parseIpv4(v4[2]!);
    if (!b) return null;
    t = `${v4[1]}${((b[0]! << 8) | b[1]!).toString(16)}:${((b[2]! << 8) | b[3]!).toString(16)}`;
  }
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const groups = (s: string): number[] | null => {
    if (s === '') return [];
    const out: number[] = [];
    for (const g of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  if (!head || !rest) return null;
  const total = head.length + rest.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return null;
  return [...head, ...new Array<number>(8 - total).fill(0), ...rest];
}

/** RFC 5952: lowercase, no leading zeros, the longest run of two or more zero groups as `::`. */
export function formatIpv6(groups: readonly number[]): string {
  let best = -1;
  let bestLen = 1;
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      best = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (best < 0) return hex.join(':');
  return `${hex.slice(0, best).join(':')}::${hex.slice(best + bestLen).join(':')}`;
}

function addressBytes(c: CodeCandidate): number[] {
  if (c.family === 'ipv4') {
    const b = parseIpv4(c.address);
    if (!b) throw new TypeError(`not an IPv4 address: ${c.address}`);
    return b;
  }
  if (c.family === 'ipv6') {
    const g = parseIpv6(c.address);
    if (!g) throw new TypeError(`not an IPv6 address: ${c.address}`);
    return g.flatMap((x) => [x >> 8, x & 0xff]);
  }
  const m = MDNS.exec(c.address);
  if (!m) throw new TypeError(`not an mDNS name: ${c.address}`);
  return hexBytes(m.slice(1).join(''));
}

function readAddress(family: AddressFamily, b: Uint8Array): string {
  if (family === 'ipv4') return Array.from(b).join('.');
  if (family === 'ipv6') {
    const groups: number[] = [];
    for (let i = 0; i < 16; i += 2) groups.push((b[i]! << 8) | b[i + 1]!);
    return formatIpv6(groups);
  }
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`;
}

// ---- Bytes -------------------------------------------------------------------------

function pushText(out: number[], text: string): void {
  if (text.length > 255) throw new RangeError('field too long for a code');
  out.push(text.length);
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0x7f);
}

function hexBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function damaged(): CodeError {
  return new CodeError('damaged', 'This code is damaged or cut off. Copy the whole code and try again.');
}

function versionError(): CodeError {
  return new CodeError('version', 'This code is from a different version of Tavern TD. Update both: reload the web app, or reinstall the Android app.');
}

function unsupported(why: string): CodeError {
  return new CodeError('unsupported', `This browser's connection offer can't be made into a code: ${why}.`);
}
