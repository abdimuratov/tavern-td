import type { RunTarget, TickSource } from '../app/controller';
import {
  hashState, restore, snapshot, TICK_RATE,
  type Command, type GameState, type ReplayEntry,
} from '../sim';
import type { Clock } from './clock';
import {
  HASH_EVERY, MAX_BATCH, TURN_TICKS, createSnapAssembler, deflateCodec, encodeMessage, parseMessage, parsePayload, snapParts,
  type Codec, type NetMessage, type PauseKind, type SnapPayload, type TurnMessage,
} from './protocol';

// The tick source for a Versus Run (docs/versus-design.md §4–5). A Turn is 3
// ticks. As this device begins Turn n it seals everything its player did since
// the last seal into its Batch n + D and sends it, empty or not; Batches 0 to
// D − 1 are empty on both devices. Tick 3n steps only once both Batches of
// Turn n are in: Side 0's commands, then Side 1's, each filtered to its own
// Side. A pause rides in a Batch, so both devices stop at the start of the same
// Turn. Every 30 ticks the state's hash rides in the next Batch, and the two
// are compared. Pure: time comes from the injected clock, and the Rival only
// through `send` and `receive`.

export type SideId = 0 | 1;

/** A Batch as both devices apply it: the parsed-back text of what its sender sent. */
type Batch = TurnMessage;

export type EndReason = 'run' | 'desync' | 'stopped';

export type LockstepEvent =
  /** Both devices stop at the start of `turn`: who paused and why. */
  | { readonly type: 'pause'; readonly turn: number; readonly by: readonly SideId[]; readonly kinds: readonly PauseKind[] }
  | { readonly type: 'ready'; readonly side: SideId; readonly on: boolean }
  /** The countdown to resuming started; play resumes in `inMs`. */
  | { readonly type: 'resume'; readonly turn: number; readonly inMs: number }
  | { readonly type: 'resumed'; readonly turn: number }
  | { readonly type: 'away'; readonly side: SideId; readonly away: boolean }
  /** A hash check both devices agree on. */
  | { readonly type: 'hash'; readonly tick: number; readonly hash: string }
  /** A hash check that differs: `count` is 1 for the one repaired, 2 for the one that ends the Run. */
  | { readonly type: 'desync'; readonly tick: number; readonly hashes: readonly [string, string]; readonly count: number }
  /** The Host's state was adopted (on the Guest) or sent (on the Host) at `tick`. */
  | { readonly type: 'resynced'; readonly tick: number }
  | { readonly type: 'ended'; readonly why: EndReason };

export interface PauseStatus {
  readonly turn: number;
  readonly tick: number;
  /** The Sides whose Batch carried it, and why. */
  readonly by: readonly SideId[];
  readonly kinds: readonly PauseKind[];
  /** Side 0's and Side 1's Ready. A `sync` pause resumes with no Ready. */
  readonly ready: readonly [boolean, boolean];
  /** Ms until play resumes, once the Host has sent Resume; null before. */
  readonly resumeInMs: number | null;
}

export interface LockstepStatus {
  readonly side: SideId;
  readonly delay: number;
  /** The state's tick, and the last Turn begun (-1 before the first). */
  readonly tick: number;
  readonly turn: number;
  /** Ms left of the countdown to Go or to a resume; 0 when none runs. */
  readonly countdownMs: number;
  readonly started: boolean;
  /** How long the loop has been held for the Rival's Batch: show "Waiting for the Rival…" from 1 s. 0 while not waiting. */
  readonly waitingMs: number;
  /** How often, and how long in all, it has waited for a Batch. */
  readonly waits: number;
  readonly waitedMs: number;
  /** The pause both devices are stopped at (or this one is, waiting for the other to get there); null otherwise. */
  readonly pause: PauseStatus | null;
  /** A pause sealed but not reached yet: "Pausing…". */
  readonly pausing: boolean;
  /** Each Side's app in the background. */
  readonly away: readonly [boolean, boolean];
  /** A Desync is being repaired. */
  readonly syncing: boolean;
  readonly desyncs: number;
  /** The last hash check both agreed on. */
  readonly agreed: { readonly tick: number; readonly hash: string } | null;
  readonly checks: number;
  readonly ended: EndReason | null;
  /** Batches resent after reconnects. */
  readonly resent: number;
}

/** What a desync report needs from this device, kept at the pause (or at the second Desync). */
export interface DesyncRecord {
  readonly tick: number;
  readonly hashes: readonly [string, string];
  readonly pauseTick: number;
  readonly state: string;
  readonly replay: ReturnType<RunTarget['replay']>;
}

export interface LockstepOptions {
  /** This device's Side: 0 on the Host, 1 on the Guest. */
  readonly side: SideId;
  /** Input Delay D, in Turns. */
  readonly delay: number;
  readonly clock: Clock;
  /** Sends one encoded message to the Rival; dropped while there's no connection (a reconnect resends Batches). */
  send(text: string): void;
  /** The Run's session id, carried in a rejoin's snapshot. */
  readonly session?: string;
  /** How snapshots are packed; the deflate of save codes by default. */
  readonly codec?: Codec;
  /** The latest round trip in ms: the Host starts its countdowns half of it after sending. */
  rtt?(): number;
  emit?(event: LockstepEvent): void;
  /** A Guest taking its Side up again from the Host's state (§5.4); the session passes the snapshot's payload. */
  readonly rejoin?: { readonly payload: SnapPayload; readonly state: GameState; readonly log: readonly ReplayEntry[] };
}

export interface Lockstep extends TickSource {
  readonly side: SideId;
  readonly delay: number;
  /** Binds the controller it drives, for resyncs, rejoins and reports. A pending rejoin state is adopted at once. */
  attach(target: RunTarget): void;
  /** Starts the clock: tick 0 steps at `at` on the injected clock. */
  go(at: number): void;
  /** A message from the Rival that belongs to the Run: turn, ready (with a Turn), resume, away, back, desync, snap. */
  receive(message: NetMessage): void;
  /** This player's Pause: it rides in the next Batch, so both stop at the start of that Turn. */
  pause(): void;
  /** This player's Ready at the pause; once both are, the Host sends Resume. */
  ready(on: boolean): void;
  /** The app went to the background: seal the next Batch at once with a pause, and tell the Rival. */
  away(): void;
  back(): void;
  /** The connection dropped: seal a pause, so both stop once Batches flow again and both press Ready. */
  linkLost(): void;
  /** After a reconnect: resend every Batch after the Rival's last received one. */
  resend(peerReceived: number): void;
  /** The Rival's app restarted and asks to rejoin: once this (the Host) is held at a Turn, send its state there. */
  rejoinRequested(): void;
  /** Ends the Run here, for a concede or a claimed win. */
  stop(): void;
  /** The last Turn begun and the last of the Rival's Batches held, for Hello. */
  readonly lastTurn: number;
  readonly received: number;
  status(): LockstepStatus;
  /** What a desync report needs, from the first Desync on; null before. */
  readonly desync: DesyncRecord | null;
  /** This player's commands not applied yet, with the Turn each lands on (null: not sealed yet), for faint pending marks. */
  inFlight(): readonly { readonly turn: number | null; readonly command: Command }[];
}

/** The countdown before Go and before a resume. */
export const COUNTDOWN_MS = 3000;
const TICK_MS = 1000 / TICK_RATE;
/** Behind its own clock by more than this many ticks, a device paces up to 2×. */
const CATCH_UP_TICKS = 2;
const NO_COMMANDS: readonly Command[] = [];
const EMPTY = (n: number): Batch => ({ t: 'turn', n, c: [] });
/** When a pause holds both devices, which kind the pause sheet leads with. */
const PAUSE_RANK: Readonly<Record<PauseKind, number>> = { sync: 3, away: 2, link: 1, pause: 0 };

/**
 * The own-Side filter both devices apply to both Batches of a Turn: only
 * `lw.*` commands naming `side: side`, and at most the first 16 of those.
 */
export function filterBatch(commands: readonly unknown[], side: SideId): Command[] {
  const out: Command[] = [];
  for (const c of commands) {
    if (out.length >= MAX_BATCH) break;
    if (typeof c !== 'object' || c === null || Array.isArray(c)) continue;
    const type = Object.hasOwn(c, 'type') ? (c as { type: unknown }).type : undefined;
    const named = Object.hasOwn(c, 'side') ? (c as { side: unknown }).side : undefined;
    if (typeof type !== 'string' || !type.startsWith('lw.') || named !== side) continue;
    out.push(c as Command);
  }
  return out;
}

/** D from the lobby's round trips (§4.3): ⌈(the 90th percentile ÷ 2 + 50 ms) ÷ 100 ms⌉, held between 2 and 5. */
export function inputDelay(rtts: readonly number[]): number {
  if (rtts.length === 0) return 3;
  const sorted = [...rtts].sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]!;
  return Math.min(5, Math.max(2, Math.ceil((p90 / 2 + 50) / 100)));
}

export function createLockstep(opts: LockstepOptions): Lockstep {
  const { side, delay: D, clock } = opts;
  const codec = opts.codec ?? deflateCodec;
  const emit = (e: LockstepEvent): void => opts.emit?.(e);
  const rtt = (): number => opts.rtt?.() ?? 0;

  /** This device's Batches not applied yet, and the text of every one it sealed (for resends). */
  const own = new Map<number, Batch>();
  const ownText = new Map<number, string>();
  /** The Rival's Batches not applied yet. */
  const peer = new Map<number, Batch>();
  let peerTop = -1;
  let nextSeal = D;
  let pending: Command[] = [];
  let pendingPause: PauseKind | null = null;
  let pendingHash: readonly [number, string] | null = null;

  let startAt: number | null = null;
  /** The last Turn begun, and the state's tick as last seen. */
  let stepped = -1;
  let stateTick = 0;
  let held = true;
  let anchor: { time: number; tick: number } | null = null;
  let waitSince: number | null = null;
  let waits = 0;
  let waitedMs = 0;

  /** Pauses at Turns up to this one were cleared by a resume. */
  let resumed = -1;
  let holdTurn: number | null = null;
  const readyOf: [boolean, boolean] = [false, false];
  let peerReady: { turn: number; on: boolean } | null = null;
  let resumeAt: number | null = null;
  let resumeTurn = -1;
  const away: [boolean, boolean] = [false, false];

  const ownHashes = new Map<number, string>();
  const peerHashes = new Map<number, string>();
  /** Hash checks at ticks up to this one are void: before a resync or rejoin. */
  let checked = 0;
  let agreed: { tick: number; hash: string } | null = null;
  let checks = 0;
  let desyncs = 0;
  /** A Desync found and not yet repaired. */
  let repairing: { tick: number; hashes: readonly [string, string] } | null = null;
  let record: DesyncRecord | null = null;
  /** The Guest waiting at a sync pause for the Host's state, and that state once it's in. */
  let syncing = false;
  let incoming: { turn: number; hash: string; state: string } | null = null;
  let busy = 0;
  const assembler = createSnapAssembler();

  let target: RunTarget | null = null;
  let adoptPending: { state: GameState; log: readonly ReplayEntry[] } | null = null;
  let hostRejoin = false;
  let ended: EndReason | null = null;
  let resent = 0;

  if (opts.rejoin) {
    const { payload, state, log } = opts.rejoin;
    const R = payload.turn;
    for (const b of payload.batches ?? []) {
      own.set(b.n, b);
      ownText.set(b.n, encodeMessage(b));
      nextSeal = Math.max(nextSeal, b.n + 1);
    }
    nextSeal = Math.max(nextSeal, R);
    desyncs = payload.desyncs ?? 0;
    resumed = payload.resumed ?? -1;
    checked = Math.max(payload.checked ?? 0, R * TURN_TICKS);
    stepped = R - 1;
    stateTick = R * TURN_TICKS;
    startAt = clock.now();
    adoptPending = { state, log };
  }

  const ownSide = (n: number): Batch | undefined => (n < D ? EMPTY(n) : own.get(n));
  const peerSide = (n: number): Batch | undefined => (n < D ? EMPTY(n) : peer.get(n));
  const batchOf = (s: SideId, n: number): Batch | undefined => (s === side ? ownSide(n) : peerSide(n));

  function send(message: NetMessage): void {
    opts.send(encodeMessage(message));
  }

  /** Seals Batch n: up to 16 of the commands since the last seal, a pause and a hash when it has them. */
  function seal(n: number, pause: PauseKind | null = null): void {
    const p = strongest(pause, pendingPause);
    pendingPause = null;
    const h = pendingHash;
    pendingHash = null;
    const commands = pending.slice(0, MAX_BATCH);
    pending = pending.slice(commands.length);
    let text: string;
    try {
      text = encodeMessage({ t: 'turn', n, c: commands, ...(p ? { p } : {}), ...(h ? { h } : {}) });
    } catch (err) {
      console.error('[lockstep] dropping commands that would not encode', err);
      text = encodeMessage({ t: 'turn', n, c: [], ...(p ? { p } : {}), ...(h ? { h } : {}) });
    }
    // Apply exactly what the Rival will decode, so both sims see the same command objects.
    const parsed = parseMessage(text);
    if (!parsed.ok || parsed.message.t !== 'turn') throw new Error('a sealed Batch does not parse back');
    own.set(n, parsed.message);
    ownText.set(n, text);
    nextSeal = n + 1;
    opts.send(text);
  }

  function sealThrough(n: number): void {
    while (nextSeal <= n) seal(nextSeal);
  }

  /** A pause at Turn n that still counts: who carried it and why. */
  function pauseAt(n: number): { by: SideId[]; kinds: PauseKind[] } | null {
    if (n <= resumed) return null;
    const by: SideId[] = [];
    const kinds: PauseKind[] = [];
    for (const s of [0, 1] as const) {
      const p = batchOf(s, n)?.p;
      if (p) {
        by.push(s);
        if (!kinds.includes(p)) kinds.push(p);
      }
    }
    kinds.sort((a, b) => PAUSE_RANK[b] - PAUSE_RANK[a]);
    return by.length > 0 ? { by, kinds } : null;
  }

  /** A pause sealed (by either Side) for a Turn not begun yet. */
  function pauseAhead(): boolean {
    for (const m of [own, peer]) for (const [n, b] of m) if (b.p && n > resumed && n > stepped) return true;
    return pendingPause !== null;
  }

  function hold(): null {
    held = true;
    return null;
  }

  function take(tick: number): readonly Command[] | null {
    if (ended) return hold();
    const now = clock.now();
    if (startAt === null || now < startAt || adoptPending) return hold();
    if (tick % TURN_TICKS !== 0) return NO_COMMANDS;
    const n = tick / TURN_TICKS;
    stateTick = tick;
    sealThrough(n + D);
    const b0 = batchOf(0, n);
    const b1 = batchOf(1, n);
    if (!b0 || !b1) {
      if (waitSince === null) {
        waitSince = now;
        waits++;
      }
      maybeRejoin(n);
      return hold();
    }
    if (waitSince !== null) {
      waitedMs += now - waitSince;
      waitSince = null;
    }
    const pause = pauseAt(n);
    if (pause) {
      if (holdTurn !== n) reach(n, pause);
      const due = resumeAt !== null && resumeTurn === n && now >= resumeAt && !syncing && busy === 0;
      if (!due) {
        maybeRejoin(n);
        return hold();
      }
      resumed = n + D;
      holdTurn = null;
      resumeAt = null;
      readyOf[0] = readyOf[1] = false;
      peerReady = null;
      emit({ type: 'resumed', turn: n });
    }
    if (held) {
      anchor = { time: now, tick };
      held = false;
    }
    stepped = n;
    own.delete(n);
    peer.delete(n);
    const commands = [...filterBatch(b0.c, 0), ...filterBatch(b1.c, 1)];
    return commands.length > 0 ? commands : NO_COMMANDS;
  }

  /** Both devices are (or this one is) at the pause at Turn n. */
  function reach(n: number, pause: { by: SideId[]; kinds: PauseKind[] }): void {
    holdTurn = n;
    readyOf[0] = readyOf[1] = false;
    emit({ type: 'pause', turn: n, by: pause.by, kinds: pause.kinds });
    if (pause.kinds.includes('sync')) {
      if (side === 0) sendSync(n);
      else {
        syncing = true;
        tryAdopt();
      }
    }
    if (peerReady && peerReady.turn === n) readyOf[peerSideId()] = peerReady.on;
    maybeResume();
  }

  const peerSideId = (): SideId => (side === 0 ? 1 : 0);

  function afterStep(state: GameState): void {
    stateTick = state.tick;
    if (ended) return;
    if (state.phase === 'won' || state.phase === 'lost') {
      end('run');
      return;
    }
    if (state.tick % HASH_EVERY === 0) {
      const h = hashState(state);
      pendingHash = [state.tick, h];
      ownHashes.set(state.tick, h);
      compare(state.tick);
    }
  }

  function compare(tick: number): void {
    if (tick <= checked) {
      ownHashes.delete(tick);
      peerHashes.delete(tick);
      return;
    }
    const mine = ownHashes.get(tick);
    const theirs = peerHashes.get(tick);
    if (mine === undefined || theirs === undefined) return;
    ownHashes.delete(tick);
    peerHashes.delete(tick);
    if (mine === theirs) {
      agreed = { tick, hash: mine };
      checks++;
      emit({ type: 'hash', tick, hash: mine });
      return;
    }
    mismatch(tick, side === 0 ? [mine, theirs] : [theirs, mine], true);
  }

  /** A hash check differed (found here, or told by the Rival). */
  function mismatch(tick: number, hashes: readonly [string, string], tell: boolean): void {
    if (ended || repairing || tick <= checked) return;
    desyncs++;
    emit({ type: 'desync', tick, hashes, count: desyncs });
    if (tell) send({ t: 'desync', tick, hashes });
    if (desyncs >= 2) {
      record = snapshotRecord(tick, hashes) ?? record;
      end('desync');
      return;
    }
    repairing = { tick, hashes };
    // The Host stops both on the same tick by putting a pause in its next Batch.
    if (side === 0) pendingPause = strongest(pendingPause, 'sync');
  }

  function snapshotRecord(tick: number, hashes: readonly [string, string]): DesyncRecord | null {
    if (!target) return null;
    return { tick, hashes, pauseTick: target.state.tick, state: snapshot(target.state), replay: target.replay() };
  }

  /** The Host at its sync pause: its state goes to the Guest, and play resumes after a countdown with no Ready. */
  function sendSync(n: number): void {
    if (!target || !repairing) return;
    const state = target.state;
    const text = snapshot(state);
    record = { tick: repairing.tick, hashes: repairing.hashes, pauseTick: state.tick, state: text, replay: target.replay() };
    const hash = hashState(state);
    busy++;
    void codec.pack(JSON.stringify({ kind: 'sync', state: text, turn: n } satisfies SnapPayload)).then((data) => {
      busy--;
      if (ended) return;
      for (const part of snapParts(n, hash, data)) send(part);
      repaired(n);
      startResume(n);
    }, (err: unknown) => {
      busy--;
      console.error('[lockstep] could not pack the state', err);
      end('desync');
    });
  }

  function repaired(n: number): void {
    checked = Math.max(checked, n * TURN_TICKS);
    for (const m of [ownHashes, peerHashes]) for (const t of [...m.keys()]) if (t <= checked) m.delete(t);
    repairing = null;
    syncing = false;
    emit({ type: 'resynced', tick: n * TURN_TICKS });
  }

  /** The Guest at the sync pause with the Host's state in: keep its own for the report, adopt the Host's. */
  function tryAdopt(): void {
    if (!incoming || !target || !syncing || holdTurn !== incoming.turn || target.state.tick !== incoming.turn * TURN_TICKS) return;
    const { turn, hash, state: text } = incoming;
    incoming = null;
    const info = repairing ?? { tick: turn * TURN_TICKS, hashes: ['', ''] as const };
    record = { tick: info.tick, hashes: info.hashes, pauseTick: target.state.tick, state: snapshot(target.state), replay: target.replay() };
    let next: GameState;
    try {
      next = restore(text);
    } catch {
      end('desync');
      return;
    }
    if (hashState(next) !== hash) {
      end('desync');
      return;
    }
    target.adopt(next);
    stateTick = next.tick;
    repaired(turn);
  }

  function startResume(n: number): void {
    if (side !== 0 || ended) return;
    send({ t: 'resume', n, ms: COUNTDOWN_MS });
    resumeTurn = n;
    resumeAt = clock.now() + COUNTDOWN_MS + rtt() / 2;
    emit({ type: 'resume', turn: n, inMs: resumeAt - clock.now() });
  }

  /** The Host resumes once both players are Ready at the pause (a sync pause resumes by itself). */
  function maybeResume(): void {
    if (side !== 0 || holdTurn === null || (resumeTurn === holdTurn && resumeAt !== null)) return;
    const pause = pauseAt(holdTurn);
    if (!pause || pause.kinds.includes('sync')) return;
    if (readyOf[0] && readyOf[1]) startResume(holdTurn);
  }

  /** The Host, held at Turn n, answering a rejoin from nothing: its state, the options, the log and the Guest's Batches it holds. */
  function maybeRejoin(n: number): void {
    if (!hostRejoin || !target || target.state.tick !== n * TURN_TICKS || busy > 0) return;
    hostRejoin = false;
    const state = target.state;
    const r = target.replay();
    const options = {
      mode: r.mode, seed: r.seed, difficulty: r.difficulty,
      ...(r.map !== undefined ? { map: r.map } : {}), ...(r.options !== undefined ? { options: r.options } : {}),
    };
    checked = Math.max(checked, n * TURN_TICKS);
    const payload: SnapPayload = {
      kind: 'rejoin', state: snapshot(state), turn: n, options: options as { readonly [key: string]: unknown }, log: r.log,
      session: opts.session ?? '0000000000000000', delay: D,
      batches: [...peer.values()].filter((b) => b.n >= n).sort((a, b) => a.n - b.n),
      desyncs, resumed, checked,
    };
    const hash = hashState(state);
    busy++;
    void codec.pack(JSON.stringify(payload)).then((data) => {
      busy--;
      if (ended) return;
      for (const part of snapParts(n, hash, data)) send(part);
      for (const k of [...ownText.keys()].filter((k) => k >= n).sort((a, b) => a - b)) {
        opts.send(ownText.get(k)!);
        resent++;
      }
    }, (err: unknown) => {
      busy--;
      hostRejoin = true;
      console.error('[lockstep] could not pack the state for a rejoin', err);
    });
  }

  function receive(m: NetMessage): void {
    if (ended && m.t !== 'turn') return;
    switch (m.t) {
      case 'turn': {
        if (m.n < D || m.n <= stepped || peer.has(m.n)) return;
        peer.set(m.n, m);
        peerTop = Math.max(peerTop, m.n);
        if (m.h) {
          peerHashes.set(m.h[0], m.h[1]);
          compare(m.h[0]);
        }
        return;
      }
      case 'ready': {
        if (m.n === undefined) return;
        peerReady = { turn: m.n, on: m.on };
        if (holdTurn === m.n) readyOf[peerSideId()] = m.on;
        emit({ type: 'ready', side: peerSideId(), on: m.on });
        maybeResume();
        return;
      }
      case 'resume': {
        if (side === 0) return;
        resumeTurn = m.n;
        resumeAt = clock.now() + m.ms;
        emit({ type: 'resume', turn: m.n, inMs: m.ms });
        return;
      }
      case 'away':
      case 'back': {
        const s = peerSideId();
        away[s] = m.t === 'away';
        if (away[s]) readyOf[s] = false;
        emit({ type: 'away', side: s, away: away[s] });
        return;
      }
      case 'desync':
        mismatch(m.tick, m.hashes, false);
        return;
      case 'snap': {
        if (side === 0) return;
        const whole = assembler.add(m);
        if (!whole) return;
        busy++;
        void codec.unpack(whole.data).then((text) => {
          busy--;
          const payload = parsePayload(text);
          if (!payload || payload.kind !== 'sync') return;
          incoming = { turn: payload.turn, hash: whole.hash, state: payload.state };
          tryAdopt();
        }, () => {
          busy--;
          end('desync');
        });
        return;
      }
      default:
        return;
    }
  }

  function end(why: EndReason): void {
    if (ended) return;
    ended = why;
    emit({ type: 'ended', why });
  }

  return {
    side,
    delay: D,
    submit(command) {
      if (!ended) pending.push(command);
    },
    take,
    stepped: afterStep,
    pace() {
      if (!anchor || held || ended) return 1;
      const due = anchor.tick + (clock.now() - anchor.time) / TICK_MS;
      return due - stateTick > CATCH_UP_TICKS ? 2 : 1;
    },
    attach(t) {
      target = t;
      if (adoptPending) {
        const { state, log } = adoptPending;
        adoptPending = null;
        t.adopt(state, log);
        stateTick = state.tick;
      }
      tryAdopt();
    },
    go(at) {
      if (startAt === null) startAt = at;
    },
    receive,
    pause() {
      if (ended || pauseAhead() || holdTurn !== null) return;
      pendingPause = 'pause';
    },
    ready(on) {
      if (ended || holdTurn === null) return;
      readyOf[side] = on;
      send({ t: 'ready', on, n: holdTurn });
      emit({ type: 'ready', side, on });
      maybeResume();
    },
    away() {
      if (ended || away[side]) return;
      away[side] = true;
      if (holdTurn === null && !pauseAhead()) seal(nextSeal, 'away');
      if (holdTurn !== null && readyOf[side]) {
        readyOf[side] = false;
        send({ t: 'ready', on: false, n: holdTurn });
      }
      send({ t: 'away' });
      emit({ type: 'away', side, away: true });
    },
    back() {
      if (ended || !away[side]) return;
      away[side] = false;
      send({ t: 'back' });
      emit({ type: 'away', side, away: false });
    },
    linkLost() {
      if (ended || startAt === null) return;
      if (holdTurn === null && !pauseAhead()) seal(nextSeal, 'link');
    },
    resend(peerReceived) {
      if (ended && ended !== 'run') return;
      for (const k of [...ownText.keys()].filter((k) => k > peerReceived).sort((a, b) => a - b)) {
        opts.send(ownText.get(k)!);
        resent++;
      }
    },
    rejoinRequested() {
      if (side === 0 && !ended) hostRejoin = true;
    },
    stop() {
      end('stopped');
    },
    get lastTurn() {
      return stepped;
    },
    get received() {
      return peerTop;
    },
    get desync() {
      return record;
    },
    status() {
      const now = clock.now();
      const pause = holdTurn !== null ? pauseAt(holdTurn) : null;
      const countdown = startAt !== null && now < startAt ? startAt - now : resumeAt !== null && now < resumeAt ? resumeAt - now : 0;
      return {
        side, delay: D, tick: stateTick, turn: stepped, countdownMs: countdown, started: startAt !== null && now >= startAt,
        waitingMs: waitSince !== null ? now - waitSince : 0, waits, waitedMs,
        pause: holdTurn !== null && pause ? {
          turn: holdTurn, tick: holdTurn * TURN_TICKS, by: pause.by, kinds: pause.kinds, ready: [readyOf[0], readyOf[1]],
          resumeInMs: resumeAt !== null && resumeTurn === holdTurn ? Math.max(0, resumeAt - now) : null,
        } : null,
        pausing: holdTurn === null && pauseAhead(),
        away: [away[0], away[1]], syncing: syncing || repairing !== null || busy > 0, desyncs,
        agreed, checks, ended, resent,
      };
    },
    inFlight() {
      const out: { turn: number | null; command: Command }[] = [];
      for (const n of [...own.keys()].sort((a, b) => a - b)) for (const c of filterBatch(own.get(n)!.c, side)) out.push({ turn: n, command: c });
      for (const c of pending) out.push({ turn: null, command: c });
      return out;
    },
  };
}

function strongest(a: PauseKind | null, b: PauseKind | null): PauseKind | null {
  if (!a) return b;
  if (!b) return a;
  return PAUSE_RANK[a] >= PAUSE_RANK[b] ? a : b;
}
