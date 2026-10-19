import { RACES, type RaceId } from '../content/maul';
import { createRun, hashState, restore, SNAPSHOT_VERSION, type GameState, type ReplayEntry, type RunOptions } from '../sim';
import type { Clock } from './clock';
import {
  COUNTDOWN_MS, createLockstep, inputDelay,
  type Lockstep, type LockstepEvent, type LockstepStatus, type SideId,
} from './lockstep';
import {
  HASH_EVERY, MAX_DELAY, MIN_DELAY, NET_VERSION, TURN_TICKS, createSnapAssembler, deflateCodec, encodeMessage, isRace, parseMessage,
  parsePayload,
  type Codec, type NetMessage, type SnapPayload, type StartMessage,
} from './protocol';
import { encodeReport } from './report';
import { canSend, type Route, type Transport, type TransportState } from './transport';

// A Versus session (docs/versus-design.md §4.6, §5): Hello and the version
// check, the lobby's picks and Ready, the pings that set the Input Delay,
// Start, Started and Go, then the lockstep for the Run; reconnects, rejoins,
// Concede, claiming the win and Rematch. Pure, over a Transport and a Clock;
// the app hands it a fresh seed for each Start and a source of random numbers.

export type Role = 'host' | 'guest';

/**
 * - `connecting`: no open connection yet.
 * - `hello`: connected, waiting for the Rival's Hello.
 * - `lobby`: picking Races and pressing Ready.
 * - `starting`: the Host sent Start; waiting for Started (Host) or Go (Guest).
 * - `rejoining`: a restarted Guest waiting for the Host's state.
 * - `playing`: the Run, from Go's countdown on. The lockstep's status says the rest.
 * - `over`: the Run ended, however it did; Rematch goes back to the lobby.
 * - `mismatch`: different versions, or the Rival broke the protocol. Nothing more happens.
 */
export type SessionPhase = 'connecting' | 'hello' | 'lobby' | 'starting' | 'rejoining' | 'playing' | 'over' | 'mismatch';

/** How the connection looks: `unstable` after 5 s of silence or ICE `disconnected`, `lost` after 30 s, ICE `failed` or a closed channel. */
export type LinkState = 'none' | 'connecting' | 'open' | 'unstable' | 'lost';

/**
 * - `version`: another protocol version, `SNAPSHOT_VERSION` or sim hash.
 * - `protocol`: the Rival sent something this version refuses.
 * - `start`: the two devices built different initial states from one Start.
 * - `gone`: a rejoin found no Run to rejoin (the Host's app restarted).
 */
export interface Mismatch {
  readonly why: 'version' | 'protocol' | 'start' | 'gone';
  /** This build and the Rival's (null when it never said), for the version message. */
  readonly mine: string;
  readonly rival: string | null;
}

/**
 * How the Run ended for this device. `run`: the sim ended it (read
 * lwRecord(state, side)). `conceded`: this player conceded, a loss.
 * `rival-conceded` and `claimed`: a win with the score so far and no
 * fastest time. `desync`: no result.
 */
export type Outcome = 'run' | 'conceded' | 'rival-conceded' | 'claimed' | 'desync';

export interface LobbyStatus {
  readonly mine: { readonly race: RaceId | null; readonly random: boolean; readonly ready: boolean };
  /** The Rival's pick and Ready; `here` is false while it is still on the end card after a Run. */
  readonly rival: { readonly race: RaceId | null; readonly ready: boolean; readonly here: boolean };
}

/** A Versus Run, ready for startPlay: its options, the tick source, and the Side this device plays and shows. */
export interface VersusRun {
  readonly options: RunOptions;
  readonly lockstep: Lockstep;
  readonly side: SideId;
  readonly viewer: SideId;
  readonly session: string;
}

export type SessionEvent =
  | { readonly type: 'phase'; readonly phase: SessionPhase }
  | { readonly type: 'lobby'; readonly lobby: LobbyStatus }
  /** A Run was built: start the play screen with `run.lockstep` as its tick source, then `run.lockstep.attach(controller)`. */
  | { readonly type: 'run'; readonly run: VersusRun }
  /** Go: play starts in `inMs`. */
  | { readonly type: 'go'; readonly inMs: number }
  | { readonly type: 'link'; readonly link: LinkState }
  | { readonly type: 'mismatch'; readonly mismatch: Mismatch }
  | { readonly type: 'end'; readonly outcome: Outcome }
  /** The Rival pressed Rematch and is back in the lobby. */
  | { readonly type: 'rematch' }
  | { readonly type: 'lockstep'; readonly event: LockstepEvent };

export interface SessionStatus {
  readonly phase: SessionPhase;
  readonly role: Role;
  readonly side: SideId;
  readonly link: LinkState;
  /** How the connection runs, Direct or through the Relay, as the transport says; null until known, or where it can't tell. */
  readonly route: Route | null;
  /** Ms since the Rival's last message; null before any. */
  readonly lastHeardMs: number | null;
  /** The median round trip of the last pings, in ms; null before any. */
  readonly ping: number | null;
  /** The Input Delay the lobby's pings give (or the Run's), and the "Slow connection: expect waits" warning above 800 ms. */
  readonly delay: number;
  readonly slow: boolean;
  readonly lobby: LobbyStatus;
  readonly mismatch: Mismatch | null;
  readonly outcome: Outcome | null;
  /** Two minutes without the Rival, this app in front all that time: the player may claim the win. */
  readonly canClaim: boolean;
  readonly rivalAway: boolean;
  readonly rivalBuild: string | null;
  readonly rivalBrowser: string | null;
  /** The Run's session id: a rejoin's Join code carries it. */
  readonly session: string | null;
  readonly run: LockstepStatus | null;
}

export interface SessionOptions {
  readonly role: Role;
  readonly clock: Clock;
  /** This build's `__SIM_HASH__` and `__BUILD__`, and a short name of the browser, for Hello and reports. */
  readonly simHash: string;
  readonly build: string;
  readonly browser: string;
  /** A fresh seed for each Start (the Host's app, never the sim). */
  seed(): number;
  /** A uint32, for Random picks and session ids: crypto.getRandomValues in the app. */
  random(): number;
  /** A Guest whose app restarted, joining with a rejoin's Join code: that code's session id. */
  readonly rejoin?: string | null;
  readonly codec?: Codec;
}

export interface Session {
  readonly role: Role;
  readonly side: SideId;
  /** The current Run, from Start (or a rejoin's snapshot) until the next Start; null in the lobby. */
  readonly run: VersusRun | null;
  /** Uses a new connection: the first, or one made by Reconnect. The old one is closed. */
  attach(transport: Transport): void;
  /** The lobby: this player's Race. Random is drawn here, on the picker's device. */
  pick(race: RaceId | 'random'): void;
  /** The lobby: Ready on or off. The Host starts once both are Ready. */
  setReady(on: boolean): void;
  /** In a Run: Pause, Ready to resume, and the app hidden or shown again. */
  pause(): void;
  ready(on: boolean): void;
  away(): void;
  back(): void;
  /** Leaves the Run as a loss and tells the Rival. Close the session once the message is out. */
  concede(): void;
  /** Takes the win after 2 min without the Rival (canClaim); false when it isn't open. */
  claim(): boolean;
  /** After a Run, back to the lobby with the same picks; the Host starts with a new seed. */
  rematch(): void;
  /** The `TTDR1.` desync report, from the first Desync on; null before. */
  report(): Promise<string | null>;
  status(): SessionStatus;
  on(listener: (event: SessionEvent) => void): () => void;
  close(): void;
}

const UNSTABLE_MS = 5_000;
const LOST_MS = 30_000;
const CLAIM_MS = 120_000;
const SLOW_RTT_MS = 800;
const PING_SAMPLES = 20;

export function createSession(opts: SessionOptions): Session {
  const { role, clock } = opts;
  const side: SideId = role === 'host' ? 0 : 1;
  const codec = opts.codec ?? deflateCodec;
  const listeners = new Set<(e: SessionEvent) => void>();
  const emit = (e: SessionEvent): void => {
    for (const l of listeners) l(e);
  };

  let transport: Transport | null = null;
  let unsubscribe: (() => void)[] = [];
  let phase: SessionPhase = 'connecting';
  let helloSent = false;
  let lastHeard: number | null = null;
  const rtts: number[] = [];
  let mismatch: Mismatch | null = null;
  let outcome: Outcome | null = null;
  let rivalBuild: string | null = null;
  let rivalBrowser: string | null = null;
  let rivalAway = false;
  const mine = { race: null as RaceId | null, random: false, ready: false };
  const rival = { race: null as RaceId | null, ready: false, here: true };
  let run: VersusRun | null = null;
  let startHash: string | null = null;
  let isAway = false;
  let lastAwayEnd = -Infinity;
  let lastLink: LinkState = 'none';
  let ticks = 0;
  const rejoinParts = createSnapAssembler();
  /** Run messages that came in while a rejoin's snapshot was still unpacking. */
  let early: NetMessage[] = [];

  const setPhase = (next: SessionPhase): void => {
    if (phase === next) return;
    phase = next;
    emit({ type: 'phase', phase });
  };

  const sendMessage = (m: NetMessage): void => {
    if (canSend(transport)) transport.send(encodeMessage(m));
  };
  const sendText = (text: string): void => {
    if (canSend(transport)) transport.send(text);
  };

  const median = (): number | null => {
    if (rtts.length === 0) return null;
    const s = [...rtts].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const p90 = (): number => {
    if (rtts.length === 0) return 0;
    const s = [...rtts].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)]!;
  };

  const lobby = (): LobbyStatus => ({ mine: { ...mine }, rival: { ...rival } });
  const lobbyChanged = (): void => emit({ type: 'lobby', lobby: lobby() });

  function link(): LinkState {
    if (!transport) return 'none';
    if (transport.state === 'connecting') return 'connecting';
    if (transport.state === 'closed') return 'lost';
    const silence = lastHeard === null ? 0 : clock.now() - lastHeard;
    if (silence >= LOST_MS) return 'lost';
    if (transport.state === 'unstable' || silence >= UNSTABLE_MS) return 'unstable';
    return 'open';
  }

  function checkLink(): void {
    const now = link();
    if (now === lastLink) return;
    lastLink = now;
    emit({ type: 'link', link: now });
  }

  function fail(why: Mismatch['why'], rivalSays: string | null = rivalBuild): void {
    if (phase === 'mismatch') return;
    mismatch = { why, mine: opts.build, rival: rivalSays };
    if (run && !run.lockstep.status().ended) run.lockstep.stop();
    setPhase('mismatch');
    emit({ type: 'mismatch', mismatch });
    // Another version's Hello leaves the connection open, so the Rival still gets this Hello and says so too.
    if (why !== 'version') transport?.close();
  }

  function sendHello(): void {
    helloSent = true;
    sendMessage({
      t: 'hello', net: NET_VERSION, snap: SNAPSHOT_VERSION, sim: opts.simHash, build: opts.build, browser: opts.browser,
      session: run?.session ?? opts.rejoin ?? null,
      stepped: run?.lockstep.lastTurn ?? -1, received: run?.lockstep.received ?? -1,
    });
  }

  function onState(state: TransportState): void {
    if ((state === 'open' || state === 'unstable') && !helloSent) {
      if (phase === 'connecting') setPhase('hello');
      sendHello();
    }
    if (state === 'closed' && run && phase === 'playing') run.lockstep.linkLost();
    checkLink();
  }

  function onText(text: string): void {
    if (phase === 'mismatch') return;
    const parsed = parseMessage(text);
    if (!parsed.ok) {
      fail(parsed.problem === 'version' ? 'version' : 'protocol', parsed.build ?? rivalBuild);
      return;
    }
    lastHeard = clock.now();
    handle(parsed.message);
    checkLink();
  }

  function handle(m: NetMessage): void {
    switch (m.t) {
      case 'hello':
        return hello(m);
      case 'ping':
        return sendMessage({ t: 'pong', at: m.at });
      case 'pong': {
        const rtt = clock.now() - m.at;
        if (rtt >= 0) {
          rtts.push(rtt);
          if (rtts.length > PING_SAMPLES) rtts.shift();
        }
        return;
      }
      case 'pick':
        rival.race = m.race;
        return lobbyChanged();
      case 'ready':
        if (m.n !== undefined) return toRun(m);
        rival.ready = m.on;
        rival.here = true;
        lobbyChanged();
        return maybeStart();
      case 'rematch':
        rival.here = true;
        rival.ready = false;
        emit({ type: 'rematch' });
        return lobbyChanged();
      case 'start':
        return start(m);
      case 'started':
        return started(m.hash);
      case 'go':
        if (role !== 'guest' || phase !== 'starting' || !run) return fail('protocol');
        run.lockstep.go(clock.now() + m.ms);
        setPhase('playing');
        return emit({ type: 'go', inMs: m.ms });
      case 'end':
        if (!run || phase !== 'playing') return;
        outcome = 'rival-conceded';
        return run.lockstep.stop();
      case 'away':
      case 'back':
        rivalAway = m.t === 'away';
        return toRun(m);
      case 'snap':
        if (phase === 'rejoining' && !run) return rejoinPart(m);
        return toRun(m);
      default:
        return toRun(m);
    }
  }

  function toRun(m: NetMessage): void {
    if (run) run.lockstep.receive(m);
    else if (phase === 'rejoining') early.push(m);
  }

  function hello(m: Extract<NetMessage, { t: 'hello' }>): void {
    rivalBuild = m.build;
    rivalBrowser = m.browser;
    if (m.net !== NET_VERSION || m.snap !== SNAPSHOT_VERSION || m.sim !== opts.simHash) return fail('version');
    if (!helloSent) sendHello();
    if (run && phase === 'starting') {
      // The connection dropped between Start and Go: that Run never began, so both go back to the lobby.
      run = null;
      setPhase('lobby');
    }
    if (run && phase === 'playing') {
      if (m.session !== run.session) return fail('gone');
      if (m.stepped < 0 && role === 'host' && phase === 'playing') run.lockstep.rejoinRequested();
      else run.lockstep.resend(m.received);
      return;
    }
    if (role === 'guest' && opts.rejoin && !run) {
      if (m.session !== opts.rejoin) return fail('gone');
      return setPhase('rejoining');
    }
    if (phase === 'connecting' || phase === 'hello') setPhase('lobby');
    if (phase === 'lobby') {
      if (mine.race) sendMessage({ t: 'pick', race: mine.race });
      if (mine.ready) sendMessage({ t: 'ready', on: true });
      lobbyChanged();
    }
  }

  function maybeStart(): void {
    if (role !== 'host' || phase !== 'lobby' || !mine.ready || !rival.ready || !mine.race || !rival.race || !rival.here) return;
    const session = hex32(opts.random()) + hex32(opts.random());
    const options: RunOptions = {
      mode: 'linewars', seed: opts.seed() >>> 0, difficulty: 'normal',
      options: { race: mine.race, rivalRace: rival.race, drivers: ['human', 'human'] },
    };
    const delay = inputDelay(rtts);
    startHash = hashState(createRun(options));
    sendMessage({ t: 'start', session, options: options as unknown as StartMessage['options'], delay, turn: TURN_TICKS, every: HASH_EVERY, hash: startHash });
    begin(options, delay, session);
  }

  function start(m: StartMessage): void {
    if (role !== 'guest' || phase !== 'lobby') return fail('protocol');
    const options = versusOptions(m.options, mine.race);
    if (!options || m.turn !== TURN_TICKS || m.every !== HASH_EVERY || m.delay < MIN_DELAY || m.delay > MAX_DELAY) return fail('protocol');
    let state: GameState;
    try {
      state = createRun(options);
    } catch {
      return fail('protocol');
    }
    const hash = hashState(state);
    sendMessage({ t: 'started', hash });
    if (hash !== m.hash) return fail('start');
    begin(options, m.delay, m.session);
  }

  function started(hash: string): void {
    if (role !== 'host' || phase !== 'starting' || !run) return fail('protocol');
    if (hash !== startHash) return fail('start');
    sendMessage({ t: 'go', n: 0, ms: COUNTDOWN_MS });
    const inMs = COUNTDOWN_MS + (median() ?? 0) / 2;
    run.lockstep.go(clock.now() + inMs);
    setPhase('playing');
    emit({ type: 'go', inMs });
  }

  function newLockstep(delay: number, session: string, rejoin?: Parameters<typeof createLockstep>[0]['rejoin']): Lockstep {
    return createLockstep({
      side, delay, clock, session, codec, send: sendText, rtt: () => median() ?? 0,
      emit: onLockstep, ...(rejoin ? { rejoin } : {}),
    });
  }

  function begin(options: RunOptions, delay: number, session: string): void {
    mine.ready = false;
    rival.ready = false;
    // After this Run the Rival is on its end card until it presses Rematch.
    rival.here = false;
    outcome = null;
    rivalAway = false;
    run = { options, lockstep: newLockstep(delay, session), side, viewer: side, session };
    setPhase('starting');
    emit({ type: 'run', run });
  }

  function onLockstep(e: LockstepEvent): void {
    emit({ type: 'lockstep', event: e });
    if (e.type !== 'ended') return;
    if (e.why === 'run') outcome = 'run';
    else if (e.why === 'desync') outcome = 'desync';
    if (phase !== 'mismatch') setPhase('over');
    if (outcome) emit({ type: 'end', outcome });
  }

  /** A restarted Guest collecting the Host's state, then taking up its Side from there. */
  function rejoinPart(m: Extract<NetMessage, { t: 'snap' }>): void {
    const whole = rejoinParts.add(m);
    if (!whole) return;
    void codec.unpack(whole.data).then((text) => {
      const payload = parsePayload(text);
      if (!payload || payload.kind !== 'rejoin' || !payload.options || !payload.session || payload.delay === undefined) return fail('protocol');
      const options = versusOptions(payload.options, null);
      if (!options) return fail('protocol');
      let state: GameState;
      try {
        state = restore(payload.state);
      } catch {
        return fail('protocol');
      }
      if (hashState(state) !== whole.hash) return fail('protocol');
      const log = (payload.log ?? []) as readonly ReplayEntry[];
      mine.race = options.options!['rivalRace'] as RaceId;
      run = {
        options, side, viewer: side, session: payload.session,
        lockstep: newLockstep(payload.delay, payload.session, { payload: payload as SnapPayload, state, log }),
      };
      setPhase('playing');
      emit({ type: 'run', run });
      const queued = early;
      early = [];
      for (const q of queued) run.lockstep.receive(q);
    }, () => fail('protocol'));
  }

  const stop = clock.every(500, () => {
    ticks++;
    const pausedRun = run && phase === 'playing' && run.lockstep.status().pause !== null;
    if (phase === 'lobby' || ((phase === 'over' || pausedRun) && ticks % 2 === 0)) sendMessage({ t: 'ping', at: clock.now() });
    checkLink();
  });

  const canClaim = (): boolean => {
    if (!run || phase !== 'playing' || isAway || lastHeard === null || run.lockstep.status().ended) return false;
    return clock.now() - lastHeard >= CLAIM_MS && lastAwayEnd < lastHeard;
  };

  return {
    role,
    side,
    get run() {
      return run;
    },
    attach(next) {
      for (const u of unsubscribe) u();
      if (transport && transport !== next) transport.close();
      transport = next;
      helloSent = false;
      unsubscribe = [next.onMessage(onText), next.onState(onState)];
      onState(next.state);
    },
    pick(race) {
      if (phase === 'starting' || phase === 'playing' || phase === 'rejoining' || phase === 'mismatch') return;
      if (race === 'random') {
        mine.race = RACES[opts.random() % RACES.length]!;
        mine.random = true;
      } else {
        mine.race = race;
        mine.random = false;
      }
      sendMessage({ t: 'pick', race: mine.race });
      lobbyChanged();
      maybeStart();
    },
    setReady(on) {
      if (phase !== 'lobby' || (on && !mine.race)) return;
      mine.ready = on;
      sendMessage({ t: 'ready', on });
      lobbyChanged();
      maybeStart();
    },
    pause: () => run?.lockstep.pause(),
    ready: (on) => run?.lockstep.ready(on),
    away() {
      if (isAway) return;
      isAway = true;
      if (run && phase === 'playing') run.lockstep.away();
    },
    back() {
      if (!isAway) return;
      isAway = false;
      lastAwayEnd = clock.now();
      if (run && phase === 'playing') run.lockstep.back();
    },
    concede() {
      if (!run || phase !== 'playing') return;
      sendMessage({ t: 'end', why: 'concede' });
      outcome = 'conceded';
      run.lockstep.stop();
    },
    claim() {
      if (!canClaim()) return false;
      outcome = 'claimed';
      run!.lockstep.stop();
      return true;
    },
    rematch() {
      if (phase !== 'over' || !canSend(transport)) return;
      run = null;
      mine.ready = false;
      setPhase('lobby');
      sendMessage({ t: 'rematch' });
      if (mine.race) sendMessage({ t: 'pick', race: mine.race });
      lobbyChanged();
    },
    async report() {
      const record = run?.lockstep.desync;
      if (!record) return null;
      const rb = rivalBuild ?? '?';
      const rw = rivalBrowser ?? '?';
      return encodeReport({
        v: 1, side, builds: side === 0 ? [opts.build, rb] : [rb, opts.build], browsers: side === 0 ? [opts.browser, rw] : [rw, opts.browser],
        tick: record.tick, hashes: record.hashes, pauseTick: record.pauseTick, replay: record.replay, state: record.state,
      });
    },
    status() {
      const now = clock.now();
      const median_ = median();
      return {
        phase, role, side, link: link(), route: transport?.route ?? null, lastHeardMs: lastHeard === null ? null : now - lastHeard, ping: median_,
        delay: run?.lockstep.delay ?? inputDelay(rtts), slow: p90() > SLOW_RTT_MS, lobby: lobby(), mismatch, outcome,
        canClaim: canClaim(), rivalAway, rivalBuild, rivalBrowser, session: run?.session ?? null, run: run?.lockstep.status() ?? null,
      };
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      stop();
      for (const u of unsubscribe) u();
      unsubscribe = [];
      transport?.close();
    },
  };
}

/**
 * The Start's RunOptions if they are a Versus Run this device can play:
 * Line Wars, Normal, two human Sides, real Races, and (on the Guest) its own
 * pick as the Rival's Race. Null otherwise.
 */
function versusOptions(raw: { readonly [key: string]: unknown }, guestRace: RaceId | null): RunOptions | null {
  const o = raw['options'];
  if (raw['mode'] !== 'linewars' || raw['difficulty'] !== 'normal' || raw['map'] !== undefined) return null;
  if (typeof raw['seed'] !== 'number' || !Number.isInteger(raw['seed']) || raw['seed'] < 0 || raw['seed'] > 0xffffffff) return null;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const opt = o as { readonly [key: string]: unknown };
  const drivers = opt['drivers'];
  if (!Array.isArray(drivers) || drivers.length !== 2 || drivers[0] !== 'human' || drivers[1] !== 'human') return null;
  if (!isRace(opt['race']) || !isRace(opt['rivalRace'])) return null;
  if (guestRace !== null && opt['rivalRace'] !== guestRace) return null;
  const extra = Object.keys(opt).filter((k) => !['race', 'rivalRace', 'drivers'].includes(k));
  if (extra.length > 0) return null;
  return {
    mode: 'linewars', seed: raw['seed'], difficulty: 'normal',
    options: { race: opt['race'], rivalRace: opt['rivalRace'], drivers: ['human', 'human'] },
  };
}

function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}
