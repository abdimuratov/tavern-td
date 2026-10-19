import type { RaceId } from '../content/maul';
import {
  BUILD, CodeError, SIM_HASH, answerJoinCode, browserClock, createSession, decodeCode, joinLink, makeJoinCode,
  type GuestLink, type HostLink, type Outcome, type Role, type Session, type SessionEvent, type SessionStatus, type SideId,
  type Transport, type VersusRun,
} from '../net';
import { onBackground, onForeground } from '../platform/lifecycle';
import { copyText, shareContent } from '../platform/share';
import { catalogEntry } from '../ui/catalog';
import { runEnd } from '../ui/state';
import { versus, versusActions, versusRunOn, type CodeSwap, type VersusActions } from '../ui/versus/state';
import { sessionRunEnd, swapTimedOut } from '../ui/versus/text';
import type { Play, PlayOptions } from './game';
import { browserName, linkBase } from './versus-link';

// Versus in the app (docs/versus-design.md §2–§6, §8): one session at a time,
// the code swaps by hand that connect it (the first and every Reconnect), the
// Lobby, and the play screen started with the lockstep as its tick source and
// the device's Side as its Viewer Side. The screens in src/ui/versus read
// what this writes to `versus` and call `versusActions`.

/** What the e2e tests and the Safari inspector read of a Versus Run, beside window.tavern. */
export interface VersusDebug {
  /** The session as it stands: its phase, the link, the lockstep's status with the last hash check (`run.agreed`). */
  status(): SessionStatus;
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
  role, step, code: null, madeAt: null, connectingAt: null, error: null, prefill, reconnect,
});

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
  let swap: CodeSwap | null = null;
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
  const swapTransport = (): Transport | undefined => (role === 'host' ? hostLink?.transport : guestLink?.transport);

  /** Writes the screens' copy, moving the swap on: done once its connection opens, failed once it closes or times out. */
  function publish(): void {
    const now = performance.now();
    if (swap && swap.step !== 'paste' && swap.step !== 'making') {
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
    versus.value = {
      role, swap, status, now, inRun: playing !== null && play !== null, report: (status?.run?.desyncs ?? 0) > 0, rejoin, reconnecting,
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

  /** Follows a swap's transport, so the screens move on the moment it opens or fails. */
  function watch(t: Transport): void {
    offTransport?.();
    offTransport = t.onState(() => publish());
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
      }, { status: () => s.status(), side: run.side }, () => my === runSeq && session === s);
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
    hostLink?.close();
    guestLink?.close();
    hostLink = null;
    guestLink = null;
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
    if (!link || !at || at.role !== 'host' || at.step !== 'offer') return;
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
    if (!at || at.role !== 'guest' || at.step !== 'paste') return;
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

  // ---- Entry points ------------------------------------------------------------------

  function host(): void {
    closeAll();
    role = 'host';
    newSession('host');
    startPolling();
    shell.showVersus();
    void makeCode(false);
  }

  /** The Join box: from the menu, or a link (boot, or a link opened while the app is up). */
  function openJoin(code = ''): void {
    // A Guest with a Lobby or a Run in memory takes the link as its Reconnect's code.
    if (session && role === 'guest' && session.status().phase !== 'connecting') {
      if (session.status().link !== 'lost') return;
      reconnecting = true;
      swapSeq++;
      swap = blankSwap('guest', 'paste', true, code);
      rejoin = false;
      publish();
      return;
    }
    if (versusRunOn(versus.value)) return;
    closeAll();
    role = 'guest';
    swap = blankSwap('guest', 'paste', false, code);
    rejoin = rejoinOf(code) !== null;
    startPolling();
    shell.showVersus();
    publish();
  }

  const actions: VersusActions = {
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
      rejoin = rejoinOf(text) !== null;
      if (swap?.error || was !== rejoin) {
        if (swap) swap = { ...swap, error: null };
        publish();
      }
    },
    share: (text, kind) => shareContent(kind === 'link'
      ? { title: 'Tavern TD Versus', text: 'Play me in Tavern TD Versus. Open this link, or paste it into Join:', url: text }
      : { text }),
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
      if (!session) return;
      reconnecting = open;
      if (!open) {
        swapSeq++;
        swap = null;
      } else if (role === 'host') {
        void makeCode(true);
      } else {
        swapSeq++;
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

  return { host, openJoin };
}

function errorText(err: unknown): string {
  if (err instanceof CodeError) return err.message;
  return `Something went wrong making the connection: ${err instanceof Error ? err.message : String(err)}`;
}
