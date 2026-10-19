import { createRunController, type RunController } from '../../src/app/controller';
import type { RaceId } from '../../src/content/maul';
import type { Clock } from '../../src/net/clock';
import { deflateCodec, type Codec } from '../../src/net/protocol';
import { createSession, type Role, type Session, type SessionEvent, type VersusRun } from '../../src/net/session';
import type { Transport, TransportState } from '../../src/net/transport';
import { createRng, hashState, nextFloat, type GameState, type SimEvent } from '../../src/sim';
import { sideBot, type LwBot, type SideBot } from '../sim/linewars/bots';

// Two Versus devices in one process (docs/versus-design.md §9): a virtual
// clock, an in-memory channel that is reliable and ordered but late and
// jittery, and per device a session, a RunController driven by frame(now) and
// a scripted bot for its own Side.

export const FRAME_MS = 1000 / 60;
export const SIM_HASH = 'abcd1234';

/** Virtual time: every device's clock reads it, and timers fire as it advances (not while their device is suspended). */
export class VirtualTime {
  now = 0;
  private timers: { next: number; ms: number; fn: () => void; owner: { suspended: boolean }; live: boolean }[] = [];

  clockFor(owner: { suspended: boolean }): Clock {
    return {
      now: () => this.now,
      every: (ms, fn) => {
        const t = { next: this.now + ms, ms, fn, owner, live: true };
        this.timers.push(t);
        return () => {
          t.live = false;
        };
      },
    };
  }

  advance(to: number): void {
    for (;;) {
      let first: (typeof this.timers)[number] | null = null;
      for (const t of this.timers) if (t.live && t.next <= to && (!first || t.next < first.next)) first = t;
      if (!first) break;
      this.now = Math.max(this.now, first.next);
      first.next += first.ms;
      if (!first.owner.suspended) first.fn();
    }
    this.timers = this.timers.filter((t) => t.live);
    this.now = to;
  }
}

export interface PipeOptions {
  /** One way, in ms. */
  readonly latency: number;
  /** Each message is ± up to this much late on top, never overtaking the one before. */
  readonly jitter: number;
  readonly seed?: number;
}

export interface FakeTransport extends Transport {
  setState(state: TransportState): void;
}

/** The two ends of one in-memory connection. Delivery time = max(previous delivery, now + latency + jitter). */
export class Pipe {
  readonly ends: [FakeTransport, FakeTransport];
  private queues: { at: number; text: string }[][] = [[], []];
  private last = [0, 0];
  private stalled = [0, 0];
  private rng;
  sent = [0, 0];

  constructor(private readonly time: VirtualTime, private readonly o: PipeOptions) {
    this.rng = createRng(o.seed ?? 1);
    this.ends = [this.end(0), this.end(1)];
  }

  private end(i: 0 | 1): FakeTransport {
    let state: TransportState = 'connecting';
    const messages = new Set<(text: string) => void>();
    const states = new Set<(s: TransportState) => void>();
    const { time, o, rng, last, queues, sent } = this.wire();
    const t: FakeTransport & { deliver(text: string): void } = {
      get state() {
        return state;
      },
      send(text) {
        if (state !== 'open' && state !== 'unstable') return;
        const to = 1 - i;
        const jitter = (nextFloat(rng) * 2 - 1) * o.jitter;
        const at = Math.max(last[to]!, time.now + o.latency + jitter);
        last[to] = at;
        queues()[to]!.push({ at, text });
        sent[i]!++;
      },
      onMessage(l) {
        messages.add(l);
        return () => messages.delete(l);
      },
      onState(l) {
        states.add(l);
        return () => states.delete(l);
      },
      close: () => this.close(),
      setState(next) {
        if (state === next || state === 'closed') return;
        state = next;
        for (const l of [...states]) l(next);
      },
      deliver(text) {
        if (state === 'closed') return;
        for (const l of [...messages]) l(text);
      },
    };
    return t;
  }

  /** What an end's send() needs; the queues are read late, since close() replaces them. */
  private wire() {
    return { time: this.time, o: this.o, rng: this.rng, last: this.last, queues: () => this.queues, sent: this.sent };
  }

  open(): void {
    for (const e of this.ends) e.setState('open');
  }

  /** Nothing reaches end `to` before `until`. */
  stall(to: 0 | 1, until: number): void {
    this.stalled[to] = until;
  }

  /** Both ends close; whatever was in flight is lost. */
  close(): void {
    this.queues = [[], []];
    for (const e of this.ends) e.setState('closed');
  }

  /** Delivers everything due by now, in order. */
  pump(): void {
    for (const to of [0, 1] as const) {
      const q = this.queues[to]!;
      while (q.length > 0 && q[0]!.at <= this.time.now && this.time.now >= this.stalled[to]!) {
        const { text } = q.shift()!;
        (this.ends[to] as FakeTransport & { deliver(text: string): void }).deliver(text);
      }
    }
  }
}

/** Snapshots pack asynchronously; the world waits for them before moving time on. */
export function trackedCodec(): Codec & { flush(): Promise<void>; readonly pending: number } {
  const inFlight = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>): Promise<T> => {
    inFlight.add(p);
    void p.finally(() => inFlight.delete(p)).catch(() => {});
    return p;
  };
  return {
    pack: (text) => track(deflateCodec.pack(text)),
    unpack: (data) => track(deflateCodec.unpack(data)),
    get pending() {
      return inFlight.size;
    },
    async flush() {
      while (inFlight.size > 0) {
        await Promise.allSettled([...inFlight]);
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

export interface DeviceOptions {
  readonly bot?: Exclude<LwBot, 'competent'> | null;
  readonly race?: RaceId;
  readonly simHash?: string;
  readonly build?: string;
  readonly rejoin?: string;
  /** Extra commands a misbehaving player sends every 15 ticks, built from the state. */
  readonly evil?: (state: GameState) => readonly object[];
}

export class Device {
  readonly session: Session;
  readonly events: SessionEvent[] = [];
  /** Hash checks this device saw agree, by tick. */
  readonly agreed = new Map<number, string>();
  readonly desyncs: number[] = [];
  controller: RunController | null = null;
  run: VersusRun | null = null;
  bot: SideBot | null = null;
  suspended = false;
  /** What this device's player submitted, in order. */
  readonly submitted: object[] = [];

  constructor(readonly world: World, readonly role: Role, readonly o: DeviceOptions = {}) {
    const seeds = createRng(role === 'host' ? 7 : 8);
    this.session = createSession({
      role, clock: world.time.clockFor(this), simHash: o.simHash ?? SIM_HASH, build: o.build ?? (role === 'host' ? 'aaaaaaa' : 'bbbbbbb'),
      browser: `node-${role}`, seed: () => world.seed++, random: () => Math.floor(nextFloat(seeds) * 0x1_0000_0000),
      codec: world.codec, ...(o.rejoin ? { rejoin: o.rejoin } : {}),
    });
    this.session.on((e) => {
      this.events.push(e);
      if (e.type === 'run') this.begin(e.run);
      if (e.type === 'lockstep' && e.event.type === 'hash') this.agreed.set(e.event.tick, e.event.hash);
      if (e.type === 'lockstep' && e.event.type === 'desync') this.desyncs.push(e.event.tick);
    });
  }

  get side(): 0 | 1 {
    return this.role === 'host' ? 0 : 1;
  }

  get state(): GameState {
    return this.controller!.state;
  }

  private begin(run: VersusRun): void {
    this.run = run;
    const c = createRunController({ runOptions: () => run.options, ticks: run.lockstep, requestFrame: () => 0, cancelFrame: () => {} });
    this.controller = c;
    run.lockstep.attach(c);
    c.frame(this.world.time.now);
    const kind = this.o.bot === undefined ? 'greedy' : this.o.bot;
    this.bot = kind ? sideBot(kind, this.side) : null;
    c.onStep((state: GameState, events: readonly SimEvent[]) => {
      if (!this.bot) return;
      const s = state as Parameters<SideBot['next']>[0];
      this.bot.seen(s, events);
      if (state.tick % 15 !== 0 || state.phase === 'won' || state.phase === 'lost') return;
      const command = this.bot.next(s);
      if (command) this.submit(command);
      for (const extra of this.o.evil?.(state) ?? []) this.submit(extra);
    });
  }

  submit(command: object): void {
    this.submitted.push(command);
    this.controller!.send(command as never);
  }

  frame(): void {
    if (!this.suspended) this.controller?.frame(this.world.time.now);
  }
}

export class World {
  readonly time = new VirtualTime();
  readonly codec = trackedCodec();
  seed = 1001;
  pipe: Pipe;
  host: Device;
  guest: Device;

  constructor(readonly pipeOptions: PipeOptions, o: { host?: DeviceOptions; guest?: DeviceOptions } = {}) {
    this.host = new Device(this, 'host', o.host);
    this.guest = new Device(this, 'guest', o.guest);
    this.pipe = this.connect();
  }

  /** A new connection between the two devices (the first, or a reconnect's), opened at once. */
  connect(options: PipeOptions = this.pipeOptions): Pipe {
    const pipe = new Pipe(this.time, { ...options, seed: (options.seed ?? 1) + this.time.now });
    this.pipe = pipe;
    this.host.session.attach(pipe.ends[0]);
    this.guest.session.attach(pipe.ends[1]);
    pipe.open();
    return pipe;
  }

  get devices(): Device[] {
    return [this.host, this.guest];
  }

  /** Runs frames for `ms` of virtual time, or until `done` holds. */
  async run(ms: number, done: () => boolean = () => false): Promise<void> {
    const end = this.time.now + ms;
    while (this.time.now < end && !done()) {
      this.time.advance(Math.min(end, this.time.now + FRAME_MS));
      this.pipe.pump();
      for (const d of this.devices) d.frame();
      if (this.codec.pending > 0) await this.codec.flush();
    }
  }

  /** Lobby and Start: both pick, wait `lobbyMs` of pings, press Ready, and run until both are past Go's countdown. */
  async start(races: [RaceId, RaceId] = ['ironclad', 'rimeborn'], lobbyMs = 2000): Promise<void> {
    await this.run(100);
    this.host.session.pick(races[0]);
    this.guest.session.pick(races[1]);
    await this.run(lobbyMs);
    this.host.session.setReady(true);
    this.guest.session.setReady(true);
    await this.run(6000, () => this.devices.every((d) => d.controller !== null && d.controller.state.tick > 0));
  }

  /** Runs until both Runs are over (or `maxMs`). */
  async finish(maxMs = 25 * 60 * 1000): Promise<void> {
    await this.run(maxMs, () => this.devices.every((d) => d.controller && (d.state.phase === 'won' || d.state.phase === 'lost')));
  }
}

/** Both devices agreed at every hash check either saw: equal hashes where both saw a tick, and no Desync. */
export function expectAgreement(world: World): { checks: number } {
  const [a, b] = [world.host.agreed, world.guest.agreed];
  for (const [tick, hash] of a) if (b.has(tick) && b.get(tick) !== hash) throw new Error(`hash at ${tick} differs`);
  if (world.host.desyncs.length + world.guest.desyncs.length > 0) throw new Error(`desyncs at ${[...world.host.desyncs, ...world.guest.desyncs].join(', ')}`);
  return { checks: Math.min(a.size, b.size) };
}

/** Steps the device ahead until both are on the same tick, then compares whole states. */
export function sameState(world: World): boolean {
  return hashState(world.host.state) === hashState(world.guest.state) && world.host.state.tick === world.guest.state.tick;
}
