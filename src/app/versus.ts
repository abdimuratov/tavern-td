import type { RaceId } from '../content/maul';
import {
  BUILD, CodeError, SIM_HASH, answerJoinCode, browserClock, createSession, createWake, decodeCode, directPeer, guestLinks, hostLink as roomHostLink,
  joinLink, makeJoinCode, openRoom, readCode, relayUrl, roomSocketUrl,
  type GuestLink, type HostLink, type Outcome, type Role, type Room, type RoomLink, type Session, type SessionEvent, type SessionStatus,
  type SideId, type Transport, type VersusRun,
} from '../net';
import { onBackground, onForeground } from '../platform/lifecycle';
import { copyText, shareContent } from '../platform/share';
import { catalogEntry } from '../ui/catalog';
import { runEnd } from '../ui/state';
import { versus, versusActions, versusRunOn, type CodeSwap, type RoomStep, type RoomSwap, type VersusActions } from '../ui/versus/state';
import { ROOM_CODE_ERROR, roomProblemText, sessionRunEnd, swapTimedOut, WAKE_NOTE_MS } from '../ui/versus/text';
import type { Play, PlayOptions } from './game';
import { browserName, linkBase, readRoomCode, roomLink } from './versus-link';

// Versus in the app (docs/versus-design.md §2–§6, §8): one session at a time,
// connected through a room on the Relay (Direct first, then relayed) or, as
// the fallback, by codes swapped by hand, the first time and on every
// Reconnect; the Lobby; and the play screen started with the lockstep as its
// tick source and the device's Side as its Viewer Side. The screens in
// src/ui/versus read what this writes to `versus` and call `versusActions`.
// The main menu wakes the Relay ahead, so a cold start overlaps menu time.

/** What window.tavern.versus.status() adds to the session's status. */
export interface VersusDebugStatus extends SessionStatus {
  /** The Room code this device is connected through; null with codes passed by hand. */
  readonly room: string | null;
}

/** What the e2e tests and the Safari inspector read of a Versus Run, beside window.tavern. */
export interface VersusDebug {
  /**
   * The session as it stands: its phase, the link and its route (Direct or
   * Relayed), the lockstep's status with the last hash check (`run.agreed`),
   * and the room.
   */
  status(): VersusDebugStatus;
  /** This device's Side, which is also its Viewer Side. */
  readonly side: SideId;
}

/** What the Versus controller asks of the shell, which owns the one play screen. */
export interface VersusShell {
  /**
   * Opens the play screen on a Versus Run, stopping any other. Resolves to
   * null when `live()` turned false meanwhile: that Run is gone, so it stopped
   * the screen it built.
   */
  playVersus(run: VersusRun, extra: PlayOptions, debug: VersusDebug, live: () => boolean): Promise<Play | null>;
  /** Stops the play screen, if one is up, and shows the Versus screens. */
  showVersus(): void;
  showMenu(): Promise<void>;
}

/** How often the screens' copy of the session is read again: for ages, countdowns and the waits of §5.3. */
const POLL_MS = 250;
/** A Concede's `end` gets this long to go out before the channel closes (hand-over §6). */
const CONCEDE_FLUSH_MS = 300;

const blankSwap = (role: Role, step: CodeSwap['step'], reconnect: boolean, prefill = ''): CodeSwap => ({
  kind: 'codes', role, step, code: null, madeAt: null, connectingAt: null, error: null, prefill, reconnect,
});

const roomSwap = (role: Role, step: RoomStep, reconnect: boolean, code: string | null = null, prefill = ''): RoomSwap => ({
  kind: 'room', role, step, code, link: null, since: performance.now(), error: null, prefill, reconnect,
});

/** The Relay's warm-up, shared by every Versus session. */
const relayWake = createWake({ clock: browserClock });

const isOpen = (t: Transport | undefined): boolean => t?.state === 'open' || t?.state === 'unstable';

export function createVersus(shell: VersusShell) {
  const random = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;
  const browser = browserName(navigator.userAgent, navigator.maxTouchPoints);
  const base = linkBase(__PLATFORM__, location.origin, import.meta.env.BASE_URL);
  const ui = catalogEntry('linewars')!.ui!;

  let session: Session | null = null;
  let offSession: (() => void) | null = null;
  let role: Role = 'host';
  let hostLink: HostLink | null = null;
  let guestLink: GuestLink | null = null;
  let offTransport: (() => void) | null = null;
  let swap: CodeSwap | RoomSwap | null = null;
  /** The room this session connects through, and its current connection; null with codes. */
  let room: Room | null = null;
  let offRoom: (() => void) | null = null;
  let roomLinkNow: RoomLink | null = null;
  /** Bumped by each new swap, so a code still being made for an older one is dropped. */
  let swapSeq = 0;
  let rejoin = false;
  let reconnecting = false;
  /** The Run on the play screen, and the screen once it's up. */
  let playing: VersusRun | null = null;
  let play: Play | null = null;
  /** Bumped by each Run and by leaving, so a play screen still starting for an older one is dropped. */
  let runSeq = 0;
  let poll: ReturnType<typeof setInterval> | null = null;

  /** The transport of the swap under way, whose opening ends it. */
  const swapTransport = (): Transport | undefined => {
    if (swap?.kind === 'room') return roomLinkNow?.transport;
    return role === 'host' ? hostLink?.transport : guestLink?.transport;
  };

  /** A room's swap as the room and its connection now stand: done once the connection opens. */
  function roomNow(at: RoomSwap, now: number): RoomSwap | null {
    if (at.step === 'enter' || !room) return at;
    if (isOpen(roomLinkNow?.transport)) return null;
    const st = room.status();
    let step: RoomStep;
    if (st.state === 'failed') step = 'failed';
    else if (st.state !== 'open') step = 'opening';
    // The Host is connecting while the Rival's app is in; the Guest once the Host has offered.
    else if (role === 'host' ? st.peer : roomLinkNow?.transport.state === 'connecting') step = 'connecting';
    else step = 'waiting';
    const code = st.code ?? at.code;
    const link = role === 'host' && code ? roomLink(base, code) : null;
    const error = step === 'failed' && st.problem ? roomProblemText(st.problem, role, code) : null;
    if (step === at.step && code === at.code && link === at.link && error === at.error) return at;
    return { ...at, step, code, link, error, since: step === at.step ? at.since : now };
  }

  /** Writes the screens' copy, moving the swap on: done once its connection opens, failed once it closes or times out. */
  function publish(): void {
    const now = performance.now();
    if (swap?.kind === 'room') {
      swap = roomNow(swap, now);
      if (!swap) reconnecting = false;
    } else if (swap && swap.step !== 'paste' && swap.step !== 'making') {
      const t = swapTransport();
      // A connection that opens late (the Rival's app was in the background) still ends the swap, failed or not.
      if (isOpen(t)) {
        swap = null;
        reconnecting = false;
      } else if (swap.step !== 'failed' && ((t?.state === 'closed' && (swap.step === 'connecting' || swap.step === 'answer')) || swapTimedOut(swap, now))) {
        swap = { ...swap, step: 'failed' };
      }
    }
    if (!session && !swap) {
      versus.value = null;
      return;
    }
    const status = session?.status() ?? null;
    const waking = (relayWake.state === 'waking' && now - (relayWake.since ?? now) >= WAKE_NOTE_MS)
      || (swap?.kind === 'room' && swap.step === 'opening' && now - swap.since >= WAKE_NOTE_MS);
    versus.value = {
      role, swap, status, now, inRun: playing !== null && play !== null, report: (status?.run?.desyncs ?? 0) > 0, rejoin, reconnecting,
      relay: relayUrl() !== '', room: room?.status().code ?? null, waking,
    };
  }

  function startPolling(): void {
    if (poll === null) poll = setInterval(publish, POLL_MS);
  }

  function newSession(as: Role, rejoinOf: string | null = null): Session {
    offSession?.();
    session?.close();
    const s = createSession({
      role: as, clock: browserClock, simHash: SIM_HASH, build: BUILD, browser, seed: random, random,
      ...(rejoinOf ? { rejoin: rejoinOf } : {}),
    });
    session = s;
    offSession = s.on((e) => onEvent(s, e));
    return s;
  }

  /** Follows a swap's transport, so the screens move on the moment it opens or fails, and show its route once known. */
  function watch(t: Transport): void {
    offTransport?.();
    const offs = [t.onState(() => publish()), t.onRoute?.(() => publish())];
    offTransport = () => {
      for (const off of offs) off?.();
    };
  }

  /** The session's status for window.tavern, with the room it connects through. */
  function debugStatus(s: Session): VersusDebugStatus {
    return { ...s.status(), room: room?.status().code ?? null };
  }

  function onEvent(s: Session, e: SessionEvent): void {
    if (s !== session) return;
    switch (e.type) {
      case 'run':
        void startRun(s, e.run);
        break;
      case 'phase':
        // A Rematch, or a connection lost between Start and Go, goes back to the Lobby; a version message ends it all.
        if ((e.phase === 'lobby' || e.phase === 'mismatch') && playing) stopRun();
        break;
      case 'end':
        void ended(e.outcome);
        break;
      default:
        break;
    }
    publish();
  }

  async function startRun(s: Session, run: VersusRun): Promise<void> {
    const my = ++runSeq;
    playing = run;
    play = null;
    // A rejoin's Run arrives through the swap that connected it.
    swap = null;
    reconnecting = false;
    try {
      const p = await shell.playVersus(run, {
        onPause: () => s.pause(),
        onQuit: () => leave(),
        inFlight: () => run.lockstep.inFlight().map((x) => x.command),
      }, { status: () => debugStatus(s), side: run.side }, () => my === runSeq && session === s);
      if (!p) return;
      play = p;
      // Resyncs, rejoins and reports go through the controller; a rejoin adopts the Host's state right here.
      run.lockstep.attach(p.controller);
    } catch (err) {
      console.error('[versus] could not start the Run', err);
      leave();
      return;
    }
    publish();
  }

  function stopRun(): void {
    runSeq++;
    playing = null;
    play = null;
    shell.showVersus();
  }

  /** A Run the session ended rather than the sim: its end card, and its Record (design §6). */
  async function ended(outcome: Outcome): Promise<void> {
    const p = play;
    const run = playing;
    // The sim's own end ('run') already showed its card and recorded it; a Concede leaves at once.
    if (!p || !run || outcome === 'run' || outcome === 'conceded') return;
    const state = p.controller.state;
    const options = ui.optionsText?.(ui.optionsOf?.(state, run.side) ?? {}) ?? '';
    const end = sessionRunEnd(outcome, state, run.side, options);
    runEnd.value = end;
    if (outcome === 'desync') return;
    const update = await p.recordVersus(outcome);
    if (runEnd.value === end) runEnd.value = { ...end, update };
  }

  /** Leaves the room and closes its connection. */
  function closeRoom(): void {
    offRoom?.();
    offRoom = null;
    roomLinkNow?.close();
    roomLinkNow = null;
    room?.close();
    room = null;
  }

  /** Closes the codes' connections. */
  function closeCodes(): void {
    hostLink?.close();
    guestLink?.close();
    hostLink = null;
    guestLink = null;
  }

  /** Closes everything Versus holds, without leaving the screen it's on. */
  function closeAll(): void {
    runSeq++;
    swapSeq++;
    offSession?.();
    offSession = null;
    offTransport?.();
    offTransport = null;
    session?.close();
    session = null;
    closeRoom();
    closeCodes();
    swap = null;
    rejoin = false;
    reconnecting = false;
    playing = null;
    play = null;
    if (poll !== null) clearInterval(poll);
    poll = null;
    versus.value = null;
  }

  function leave(): void {
    closeAll();
    void shell.showMenu();
  }

  // ---- The Host's side -----------------------------------------------------------

  /** A Join code: the first, a fresh one for a stale or failed swap, or a Reconnect's, marked with the Run's session id (§5.4). */
  async function makeCode(reconnect: boolean): Promise<void> {
    const s = session;
    if (!s) return;
    const my = ++swapSeq;
    swap = blankSwap('host', 'making', reconnect);
    publish();
    try {
      const link = await makeJoinCode({ simHash: SIM_HASH, session: reconnect ? s.status().session : null });
      if (my !== swapSeq || session !== s) {
        link.close();
        return;
      }
      hostLink?.close();
      hostLink = link;
      watch(link.transport);
      // Attached now: Hello goes out the moment the channel opens. The old connection, if any, is closed.
      s.attach(link.transport);
      swap = { ...blankSwap('host', 'offer', reconnect), code: joinLink(base, link.code), madeAt: performance.now() };
    } catch (err) {
      console.error('[versus] could not make a Join code', err);
      if (my === swapSeq) swap = { ...blankSwap('host', 'failed', reconnect), error: errorText(err) };
    }
    publish();
  }

  async function accept(text: string): Promise<void> {
    const link = hostLink;
    const at = swap;
    if (!link || at?.kind !== 'codes' || at.role !== 'host' || at.step !== 'offer') return;
    try {
      await link.accept(text);
      if (swap !== at) return;
      swap = { ...at, step: 'connecting', connectingAt: performance.now(), error: null };
    } catch (err) {
      if (swap !== at) return;
      swap = { ...at, error: err instanceof CodeError ? err.message : "That Answer code didn't work. Ask the Rival to make a new one." };
    }
    publish();
  }

  // ---- The Guest's side ----------------------------------------------------------

  /** Is the pasted text a rejoin's Join code? Null when it isn't a usable Join code at all. */
  function rejoinOf(text: string): string | null {
    try {
      return decodeCode(text, 'join', SIM_HASH).session;
    } catch {
      return null;
    }
  }

  async function join(text: string): Promise<void> {
    const at = swap;
    if (at?.kind !== 'codes' || at.role !== 'guest' || at.step !== 'paste') return;
    const my = ++swapSeq;
    // A CodeError comes before any WebRTC work: a damaged code, another version's, an Answer code.
    try {
      decodeCode(text, 'join', SIM_HASH);
    } catch (err) {
      swap = { ...at, prefill: text, error: errorText(err) };
      publish();
      return;
    }
    swap = { ...at, step: 'making', prefill: text, error: null };
    publish();
    try {
      const link = await answerJoinCode(text, { simHash: SIM_HASH });
      if (my !== swapSeq) {
        link.close();
        return;
      }
      // A session with a Lobby or a Run in memory reconnects on itself and ignores a rejoin's id;
      // otherwise a fresh one, which a rejoin's id turns into a restarted app rejoining (§5.4).
      const keep = session !== null && session.status().phase !== 'connecting';
      const s = keep ? session! : newSession('guest', link.session);
      guestLink?.close();
      guestLink = link;
      watch(link.transport);
      s.attach(link.transport);
      const now = performance.now();
      swap = { ...at, step: 'answer', code: link.code, madeAt: now, connectingAt: now, prefill: text, error: null };
    } catch (err) {
      console.error('[versus] could not answer the Join code', err);
      if (my === swapSeq) swap = { ...at, step: 'paste', prefill: text, error: errorText(err) };
    }
    publish();
  }

  // ---- Rooms on the Relay -------------------------------------------------------------

  /** Opens a room for this session: the Host's to make, or the Guest's by its code, whose offers become connections. */
  function enterRoom(as: Role, code: string | null): Room {
    closeRoom();
    const r = openRoom({ role: as, url: roomSocketUrl(relayUrl()), clock: browserClock, ...(code ? { code } : {}) });
    room = r;
    const offStatus = r.on((e) => {
      if (e.type === 'status') publish();
    });
    const offLinks = as === 'guest' ? guestLinks({ room: r, clock: browserClock, peer: () => directPeer() }, (link, id) => guestLinked(r, link, id)) : null;
    offRoom = () => {
      offStatus();
      offLinks?.();
    };
    return r;
  }

  /** Host: a new connection through its room, attached to the session at once; a Reconnect's names the Run (§5.4). */
  function hostConnect(s: Session, reconnect: boolean): void {
    if (!room) return;
    const link = roomHostLink({ room, clock: browserClock, peer: () => directPeer() }, reconnect ? s.status().session : null);
    const old = roomLinkNow;
    roomLinkNow = link;
    watch(link.transport);
    s.attach(link.transport);
    old?.close();
  }

  /** Host: a new room, and the session's connection through it. */
  function hostRoom(reconnect: boolean): void {
    const s = session;
    if (!s) return;
    swapSeq++;
    closeCodes();
    enterRoom('host', null);
    hostConnect(s, reconnect);
    swap = roomSwap('host', 'opening', reconnect);
    publish();
  }

  /**
   * Guest: each offer from the Host is a new connection. A session with a
   * Lobby or a Run in memory reconnects on itself; otherwise a fresh one,
   * which an offer naming a Run turns into a restarted app rejoining (§5.4).
   */
  function guestLinked(r: Room, link: RoomLink, id: string | null): void {
    if (r !== room) {
      link.close();
      return;
    }
    const keep = session !== null && session.status().phase !== 'connecting';
    const s = keep ? session! : newSession('guest', id);
    const old = roomLinkNow;
    roomLinkNow = link;
    watch(link.transport);
    s.attach(link.transport);
    old?.close();
    publish();
  }

  /** Guest: enters the room whose code was typed. */
  function enter(text: string): void {
    const at = swap;
    if (at?.kind !== 'room' || at.role !== 'guest' || at.step !== 'enter') return;
    const code = readRoomCode(text);
    if (!code) {
      swap = { ...at, prefill: text, error: ROOM_CODE_ERROR };
      publish();
      return;
    }
    swapSeq++;
    closeCodes();
    enterRoom('guest', code);
    swap = roomSwap('guest', 'opening', at.reconnect, code, code);
    publish();
  }

  // ---- Entry points ------------------------------------------------------------------

  function host(): void {
    closeAll();
    role = 'host';
    newSession('host');
    startPolling();
    shell.showVersus();
    if (relayUrl() === '') void makeCode(false);
    else hostRoom(false);
  }

  /** A Join code or its link, rather than a Room code: those go to the codes passed by hand. */
  const isJoinCode = (text: string): boolean => /^TTD[A-Z]\d\./i.test(readCode(text));

  /** Join: from the menu, or a link (boot, or a link opened while the app is up), a room's or a Join code's. */
  function openJoin(code = ''): void {
    const codes = isJoinCode(code) || relayUrl() === '';
    // A Guest with a Lobby or a Run in memory takes the link as its Reconnect's.
    if (session && role === 'guest' && session.status().phase !== 'connecting') {
      if (session.status().link !== 'lost') return;
      reconnecting = true;
      swapSeq++;
      const typed = readRoomCode(code);
      if (codes) {
        swap = blankSwap('guest', 'paste', true, code);
      } else if (room && (typed === null || typed === room.status().code)) {
        room.reopen();
        swap = roomSwap('guest', 'waiting', true, room.status().code);
      } else {
        swap = roomSwap('guest', 'enter', true, null, typed ?? code);
      }
      rejoin = false;
      publish();
      return;
    }
    if (versusRunOn(versus.value)) return;
    closeAll();
    role = 'guest';
    swap = codes ? blankSwap('guest', 'paste', false, code) : roomSwap('guest', 'enter', false, null, readRoomCode(code) ?? '');
    rejoin = codes && rejoinOf(code) !== null;
    startPolling();
    shell.showVersus();
    publish();
  }

  const actions: VersusActions = {
    enter,
    useCodes() {
      const reconnect = swap?.reconnect ?? reconnecting;
      swapSeq++;
      closeRoom();
      if (role === 'host') {
        if (session) void makeCode(reconnect);
      } else {
        swap = blankSwap('guest', 'paste', reconnect);
        rejoin = false;
      }
      publish();
    },
    useRoom() {
      if (relayUrl() === '') return;
      const reconnect = swap?.reconnect ?? reconnecting;
      if (role === 'host') return hostRoom(reconnect);
      swapSeq++;
      closeCodes();
      swap = roomSwap('guest', 'enter', reconnect);
      publish();
    },
    retry() {
      const at = swap;
      if (at?.kind !== 'room') return;
      if (role === 'host') return hostRoom(at.reconnect);
      swapSeq++;
      closeRoom();
      swap = roomSwap('guest', 'enter', at.reconnect, null, at.code ?? at.prefill);
      publish();
    },
    join: (text) => void join(text),
    accept: (text) => void accept(text),
    newCode() {
      if (!session && role === 'host') return;
      if (role === 'host') {
        void makeCode(swap?.reconnect ?? reconnecting);
        return;
      }
      swapSeq++;
      swap = blankSwap('guest', 'paste', swap?.reconnect ?? reconnecting);
      rejoin = false;
      publish();
    },
    typed(text) {
      const was = rejoin;
      rejoin = swap?.kind === 'codes' && rejoinOf(text) !== null;
      if (swap?.error || was !== rejoin) {
        if (swap) swap = { ...swap, error: null };
        publish();
      }
    },
    share(text, kind) {
      if (kind === 'code') return shareContent({ text });
      const words = kind === 'room'
        ? `Play me in Tavern TD Versus: room ${readRoomCode(text) ?? ''}. Open this link, or type the code in Versus · Join:`
        : 'Play me in Tavern TD Versus. Open this link, or paste it into Join:';
      return shareContent({ title: 'Tavern TD Versus', text: words, url: text });
    },
    copy: (text) => copyText(text),
    pick: (race: RaceId | 'random') => session?.pick(race),
    setReady: (on) => session?.setReady(on),
    pause: () => session?.pause(),
    ready: (on) => session?.ready(on),
    concede() {
      const s = session;
      const p = play;
      if (!s) return leave();
      s.concede();
      const conceded = s.status().outcome === 'conceded';
      const recorded = conceded && p ? p.recordVersus('conceded') : Promise.resolve(null);
      void recorded.catch((err: unknown) => console.error('[versus] could not record the Concede', err))
        .finally(() => setTimeout(() => {
          if (session === s) leave();
        }, CONCEDE_FLUSH_MS));
    },
    claim() {
      session?.claim();
      publish();
    },
    reconnect(open) {
      const s = session;
      if (!s) return;
      reconnecting = open;
      swapSeq++;
      if (!open) {
        swap = null;
      } else if (room && room.status().state !== 'failed') {
        // Through the same room: the Host offers again, and the Guest's room comes back to wait for that offer.
        if (role === 'host') hostConnect(s, true);
        else room.reopen();
        swap = roomSwap(role, 'opening', true, room.status().code);
      } else if (room) {
        if (role === 'host') return hostRoom(true);
        swap = roomSwap('guest', 'enter', true, null, room.status().code ?? '');
      } else if (role === 'host') {
        void makeCode(true);
      } else {
        swap = blankSwap('guest', 'paste', true);
        rejoin = false;
      }
      publish();
    },
    rematch: () => session?.rematch(),
    async copyReport() {
      const code = await session?.report();
      return code ? copyText(code) : false;
    },
    leave,
  };
  versusActions.value = actions;

  // Going to the background pauses both devices; coming back tells the Rival (§5.2).
  onBackground(() => session?.away());
  onForeground(() => {
    session?.back();
    publish();
  });
  relayWake.on(() => publish());

  /** Wakes the Relay ahead of need: the main menu calls it as it shows Line Wars' Versus row. */
  const wake = (): void => relayWake.wake();

  return { host, openJoin, wake };
}

function errorText(err: unknown): string {
  if (err instanceof CodeError) return err.message;
  return `Something went wrong making the connection: ${err instanceof Error ? err.message : String(err)}`;
}
