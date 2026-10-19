import { RACES, type RaceId } from '../content/maul';
import { deflate, fromBase64Url, inflate, toBase64Url } from '../platform/savecode';

// Versus' messages (docs/versus-design.md §4.5): JSON text `{ "v": 1, "t": … }`
// on one reliable, ordered DataChannel. Everything a peer sends is untrusted,
// so parseMessage checks every field and refuses rather than throws; a refusal
// ends the connection with the version message.

/** Bumped whenever a message changes shape or meaning. Both devices' must match. */
export const NET_VERSION = 1;
/** A message over this many bytes (UTF-8) ends the connection. */
export const MAX_MESSAGE_BYTES = 64 * 1024;
/** A snapshot travels deflated, in parts of at most this many base64url characters. */
export const SNAP_PART_CHARS = 16 * 1024;
/** 4 MiB of parts: far past a Line Wars Run's state and log. */
export const MAX_SNAP_PARTS = 256;
/** A snapshot that inflates past this is refused. */
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
/** Ticks in a Turn (100 ms). */
export const TURN_TICKS = 3;
/** Ticks between hash checks (1 s). */
export const HASH_EVERY = 30;
/** At most this many of a Side's commands apply per Turn; the rest are dropped on both devices. */
export const MAX_BATCH = 16;
/** Input Delay, in Turns: 200–500 ms. */
export const MIN_DELAY = 2;
export const MAX_DELAY = 5;

/**
 * Why a Batch stops both devices at the start of its Turn: a player's Pause,
 * the app going to the background, the connection dropping, or the Host
 * repairing a Desync.
 */
export type PauseKind = 'pause' | 'away' | 'link' | 'sync';
export const PAUSE_KINDS: readonly PauseKind[] = ['pause', 'away', 'link', 'sync'];

export interface HelloMessage {
  readonly t: 'hello';
  /** NET_VERSION, SNAPSHOT_VERSION and the sim hash: all three must match. */
  readonly net: number;
  readonly snap: number;
  readonly sim: string;
  /** The git commit, shown in the version message; it needn't match. */
  readonly build: string;
  readonly browser: string;
  /** The Run this device is in (or rejoining), null when it has none. */
  readonly session: string | null;
  /** The last Turn it stepped and the last of the other's Batches it holds; -1 for none. */
  readonly stepped: number;
  readonly received: number;
}
export interface PickMessage {
  readonly t: 'pick';
  readonly race: RaceId;
}
export interface ReadyMessage {
  readonly t: 'ready';
  readonly on: boolean;
  /** In a Run, the Turn of the pause it is Ready to resume; absent in the lobby. */
  readonly n?: number;
}
export interface PingMessage {
  readonly t: 'ping' | 'pong';
  /** The pinging device's clock, echoed back in the pong. */
  readonly at: number;
}
export interface StartMessage {
  readonly t: 'start';
  readonly session: string;
  /** The RunOptions; the Guest checks them before it builds the Run. */
  readonly options: { readonly [key: string]: unknown };
  readonly delay: number;
  readonly turn: number;
  readonly every: number;
  /** hashState of the Run built from the options. */
  readonly hash: string;
}
export interface StartedMessage {
  readonly t: 'started';
  readonly hash: string;
}
export interface GoMessage {
  readonly t: 'go' | 'resume';
  /** The Turn play starts or resumes at. */
  readonly n: number;
  /** The countdown, from receiving it. */
  readonly ms: number;
}
/** A Batch: one Side's commands for Turn `n`, sealed Input Delay Turns ahead. */
export interface TurnMessage {
  readonly t: 'turn';
  readonly n: number;
  /** The commands, untrusted: the own-Side filter decides which apply. */
  readonly c: readonly unknown[];
  readonly p?: PauseKind;
  /** The sender's hash at a tick: `[tick, hash]`. */
  readonly h?: readonly [number, string];
}
export interface SignalMessage {
  readonly t: 'away' | 'back' | 'rematch';
}
export interface DesyncMessage {
  readonly t: 'desync';
  readonly tick: number;
  /** Side 0's hash, then Side 1's. */
  readonly hashes: readonly [string, string];
}
/** Part `k` of `of` of the Host's state at Turn `n`, deflated and in base64url. */
export interface SnapMessage {
  readonly t: 'snap';
  readonly n: number;
  readonly hash: string;
  readonly k: number;
  readonly of: number;
  readonly data: string;
}
export interface EndMessage {
  readonly t: 'end';
  readonly why: 'concede';
}

export type NetMessage =
  | HelloMessage | PickMessage | ReadyMessage | PingMessage | StartMessage | StartedMessage | GoMessage
  | TurnMessage | SignalMessage | DesyncMessage | SnapMessage | EndMessage;
export type MessageKind = NetMessage['t'];

/**
 * Why a message was refused: too big, not JSON or missing a field, a kind
 * this version doesn't know, or another protocol version. Each ends the
 * connection with the version message.
 */
export type Refusal = 'oversized' | 'malformed' | 'unknown' | 'version';

export type Parsed =
  | { readonly ok: true; readonly message: NetMessage }
  /** `build` is the sender's, when another version's hello still says it. */
  | { readonly ok: false; readonly problem: Refusal; readonly build?: string };

export function encodeMessage(message: NetMessage): string {
  const text = JSON.stringify({ v: NET_VERSION, ...message });
  if (utf8Length(text) > MAX_MESSAGE_BYTES) throw new RangeError(`a ${message.t} message is over ${MAX_MESSAGE_BYTES} bytes`);
  return text;
}

/** One message from the peer, checked field by field. */
export function parseMessage(text: string): Parsed {
  if (text.length > MAX_MESSAGE_BYTES || utf8Length(text) > MAX_MESSAGE_BYTES) return { ok: false, problem: 'oversized' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'malformed' };
  }
  if (!isRecord(raw)) return { ok: false, problem: 'malformed' };
  if (raw['v'] !== NET_VERSION) {
    const build = raw['t'] === 'hello' && isText(raw['build'], 40) ? raw['build'] : undefined;
    return build === undefined ? { ok: false, problem: 'version' } : { ok: false, problem: 'version', build };
  }
  const kind = raw['t'];
  if (typeof kind !== 'string') return { ok: false, problem: 'malformed' };
  if (!Object.hasOwn(CHECKS, kind)) return { ok: false, problem: 'unknown' };
  const message = CHECKS[kind as MessageKind](raw);
  return message ? { ok: true, message } : { ok: false, problem: 'malformed' };
}

type Raw = { readonly [key: string]: unknown };

const CHECKS: { readonly [K in MessageKind]: (m: Raw) => NetMessage | null } = {
  hello: (m) => (
    isWhole(m['net']) && isWhole(m['snap']) && isHex8(m['sim']) && isText(m['build'], 40) && isText(m['browser'], 200)
    && (m['session'] === null || isSessionId(m['session'])) && isTurnOrNone(m['stepped']) && isTurnOrNone(m['received'])
      ? {
        t: 'hello', net: m['net'], snap: m['snap'], sim: m['sim'], build: m['build'], browser: m['browser'],
        session: m['session'] as string | null, stepped: m['stepped'], received: m['received'],
      }
      : null
  ),
  pick: (m) => (isRace(m['race']) ? { t: 'pick', race: m['race'] } : null),
  ready: (m) => {
    if (typeof m['on'] !== 'boolean') return null;
    if (m['n'] === undefined) return { t: 'ready', on: m['on'] };
    return isWhole(m['n']) ? { t: 'ready', on: m['on'], n: m['n'] } : null;
  },
  ping: (m) => (isFiniteNumber(m['at']) ? { t: 'ping', at: m['at'] } : null),
  pong: (m) => (isFiniteNumber(m['at']) ? { t: 'pong', at: m['at'] } : null),
  start: (m) => (
    isSessionId(m['session']) && isRecord(m['options']) && isWhole(m['delay']) && isWhole(m['turn']) && isWhole(m['every']) && isHex8(m['hash'])
      ? { t: 'start', session: m['session'], options: m['options'], delay: m['delay'], turn: m['turn'], every: m['every'], hash: m['hash'] }
      : null
  ),
  started: (m) => (isHex8(m['hash']) ? { t: 'started', hash: m['hash'] } : null),
  go: (m) => goOf('go', m),
  resume: (m) => goOf('resume', m),
  turn: (m) => {
    if (!isWhole(m['n']) || !Array.isArray(m['c'])) return null;
    const p = m['p'];
    const h = m['h'];
    if (p !== undefined && !(PAUSE_KINDS as readonly unknown[]).includes(p)) return null;
    if (h !== undefined && !(Array.isArray(h) && h.length === 2 && isWhole(h[0]) && isHex8(h[1]))) return null;
    return {
      t: 'turn', n: m['n'], c: m['c'] as unknown[],
      ...(p === undefined ? {} : { p: p as PauseKind }),
      ...(h === undefined ? {} : { h: [h[0] as number, h[1] as string] as const }),
    };
  },
  away: () => ({ t: 'away' }),
  back: () => ({ t: 'back' }),
  rematch: () => ({ t: 'rematch' }),
  desync: (m) => {
    const hs = m['hashes'];
    return isWhole(m['tick']) && Array.isArray(hs) && hs.length === 2 && isHex8(hs[0]) && isHex8(hs[1])
      ? { t: 'desync', tick: m['tick'], hashes: [hs[0], hs[1]] }
      : null;
  },
  snap: (m) => {
    const { n, hash, k, of, data } = m;
    return isWhole(n) && isHex8(hash) && isWhole(k) && isWhole(of) && of >= 1 && of <= MAX_SNAP_PARTS && k < of
      && typeof data === 'string' && data.length <= SNAP_PART_CHARS && /^[A-Za-z0-9_-]*$/.test(data)
      ? { t: 'snap', n, hash, k, of, data }
      : null;
  },
  end: (m) => (m['why'] === 'concede' ? { t: 'end', why: 'concede' } : null),
};

function goOf(t: 'go' | 'resume', m: Raw): GoMessage | null {
  return isWhole(m['n']) && isFiniteNumber(m['ms']) && m['ms'] >= 0 && m['ms'] <= 10_000 ? { t, n: m['n'], ms: m['ms'] } : null;
}

// ---- Snapshots in parts -----------------------------------------------------

/** What a snapshot carries: the Host's state, and on a rejoin all the Guest needs to take up its Side again. */
export interface SnapPayload {
  readonly kind: 'sync' | 'rejoin';
  /** snapshot() of the Host's state at the start of Turn `turn`. */
  readonly state: string;
  readonly turn: number;
  /** Rejoin only: the Run's options, the log, the session, the Input Delay, and the Guest's Batches from `turn` on that the Host holds. */
  readonly options?: { readonly [key: string]: unknown };
  readonly log?: readonly { readonly tick: number; readonly command: unknown }[];
  readonly session?: string;
  readonly delay?: number;
  readonly batches?: readonly TurnMessage[];
  /** Rejoin only: Desyncs so far, the last Turn whose pauses a resume cleared, and the tick hash checks restart after. */
  readonly desyncs?: number;
  readonly resumed?: number;
  readonly checked?: number;
}

/** Deflates a payload's text for the wire, and back: save codes' compression. */
export interface Codec {
  pack(text: string): Promise<string>;
  unpack(data: string): Promise<string>;
}

export const deflateCodec: Codec = {
  pack: async (text) => toBase64Url(await deflate(text)),
  async unpack(data) {
    const bytes = fromBase64Url(data);
    if (!bytes) throw new Error('snapshot is not base64url');
    return inflate(bytes, MAX_SNAPSHOT_BYTES);
  },
};

/** The snap messages that carry `data` (a packed payload) for Turn `n`. */
export function snapParts(n: number, hash: string, data: string): SnapMessage[] {
  const of = Math.max(1, Math.ceil(data.length / SNAP_PART_CHARS));
  if (of > MAX_SNAP_PARTS) throw new RangeError('snapshot too large to send');
  const parts: SnapMessage[] = [];
  for (let k = 0; k < of; k++) parts.push({ t: 'snap', n, hash, k, of, data: data.slice(k * SNAP_PART_CHARS, (k + 1) * SNAP_PART_CHARS) });
  return parts;
}

export interface SnapAssembler {
  /** Takes one part; once a snapshot's every part is in, returns its whole data and starts afresh. */
  add(part: SnapMessage): { readonly n: number; readonly hash: string; readonly data: string } | null;
}

/** Collects one snapshot's parts in any order. A part of another snapshot starts it over. */
export function createSnapAssembler(): SnapAssembler {
  let key = '';
  let parts: (string | undefined)[] = [];
  let have = 0;
  return {
    add(part) {
      const k = `${part.n}/${part.hash}/${part.of}`;
      if (k !== key) {
        key = k;
        parts = new Array<string | undefined>(part.of);
        have = 0;
      }
      if (parts[part.k] === undefined) {
        parts[part.k] = part.data;
        have++;
      }
      if (have < part.of) return null;
      const data = parts.join('');
      key = '';
      parts = [];
      have = 0;
      return { n: part.n, hash: part.hash, data };
    },
  };
}

/** A payload from its JSON, checked as far as the receiver relies on it; null when it isn't one. */
export function parsePayload(text: string): SnapPayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || (raw['kind'] !== 'sync' && raw['kind'] !== 'rejoin') || typeof raw['state'] !== 'string' || !isWhole(raw['turn'])) return null;
  if (raw['kind'] === 'sync') return raw as unknown as SnapPayload;
  const ok = isRecord(raw['options']) && Array.isArray(raw['log']) && isSessionId(raw['session']) && isWhole(raw['delay'])
    && Array.isArray(raw['batches']) && isWhole(raw['desyncs']) && isTurnOrNone(raw['resumed']) && isWhole(raw['checked']);
  if (!ok) return null;
  const batches: TurnMessage[] = [];
  for (const b of raw['batches'] as unknown[]) {
    const parsed = isRecord(b) && b['t'] === 'turn' ? CHECKS.turn(b) : null;
    if (!parsed) return null;
    batches.push(parsed as TurnMessage);
  }
  for (const e of raw['log'] as unknown[]) if (!isRecord(e) || !isWhole(e['tick']) || !isRecord(e['command'])) return null;
  return { ...(raw as unknown as SnapPayload), batches };
}

// ---- Field checks -------------------------------------------------------------

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isWhole(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function isTurnOrNone(v: unknown): v is number {
  return v === -1 || isWhole(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

export function isHex8(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}$/.test(v);
}

/** A session id: 8 bytes as 16 hex digits, as a rejoin's Join code carries it. */
export function isSessionId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{16}$/.test(v);
}

export function isRace(v: unknown): v is RaceId {
  return typeof v === 'string' && (RACES as readonly string[]).includes(v);
}

/** Bytes of `text` as UTF-8. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
