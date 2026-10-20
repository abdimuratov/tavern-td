import { createRooms, type Member } from '../../server/src/rooms.ts';
import type { OpenSocket, SocketHandlers } from '../../src/net/room';
import type { VirtualTime } from './harness';

// The Relay in memory for the client's tests: the server's own rooms
// (server/src/rooms.ts) behind fake sockets speaking server.ts's protocol.
// Every frame is delivered on a microtask, in order, so `settle()` lets
// promises and deliveries run out. `down` refuses new sockets; `drop` cuts
// one as a lost network would.

export interface FakeSocket {
  readonly url: string;
  /** Frames this socket sent, parsed. */
  readonly sent: Record<string, unknown>[];
  /** Holds what the Relay sends this socket until released. */
  held: boolean;
  open: boolean;
  release(): void;
}

export class FakeRelay {
  up = true;
  readonly sockets: FakeSocket[] = [];
  /** Relayed frames passed between the two of a room. */
  relayed = 0;
  readonly rooms;
  private tokens = 0;
  private draws = 0;

  constructor(readonly time: VirtualTime, idleMs = 1_800_000) {
    // Codes drawn in a fixed order: the first room is ABCD, the next EFGH.
    this.rooms = createRooms({
      now: () => time.now,
      randomInt: (n) => this.draws++ % n,
      token: () => `token-${++this.tokens}`,
      idleMs,
    });
  }

  readonly socket: OpenSocket = (url: string, on: SocketHandlers) => {
    const queue: (() => void)[] = [];
    const later = (fn: () => void): void => {
      if (fake.held) queue.push(fn);
      else queueMicrotask(fn);
    };
    let entered = false;
    const member: Member = {
      // What the Relay sent before closing still arrives, as on a real socket.
      send: (text) => {
        if (fake.open) later(() => on.message(text));
      },
      close: () => shut(),
    };
    const shut = (): void => {
      if (!fake.open) return;
      fake.open = false;
      this.rooms.left(member);
      later(() => on.close());
    };
    const fake: FakeSocket & { cut(): void } = {
      url,
      sent: [],
      held: false,
      open: false,
      release() {
        fake.held = false;
        for (const fn of queue.splice(0)) queueMicrotask(fn);
      },
      cut: shut,
    };
    this.sockets.push(fake);
    if (!this.up) {
      queueMicrotask(() => on.close());
      return { send() {}, close() {} };
    }
    fake.open = true;
    queueMicrotask(() => {
      if (fake.open) on.open();
    });
    const reply = (m: object): void => member.send(JSON.stringify(m));
    return {
      send: (text) => {
        if (!fake.open) return;
        const m = JSON.parse(text) as Record<string, unknown>;
        fake.sent.push(m);
        if (m['t'] === 'ping') return reply({ t: 'pong' });
        if (!entered) {
          const e = m['t'] === 'create' ? this.rooms.create(member)
            : m['t'] === 'join' ? this.rooms.join(member, String(m['code']))
              : this.rooms.rejoin(member, String(m['code']), m['role'] as 'host' | 'guest', String(m['token']));
          if (!e.ok) {
            reply({ t: 'error', why: e.why });
            return shut();
          }
          entered = true;
          return reply({ t: 'room', code: e.code, role: e.seat, token: e.token, peer: e.peer });
        }
        if (m['t'] === 'relay') this.relayed++;
        this.rooms.forward(member, text);
      },
      close: () => shut(),
    };
  };

  /** Cuts a socket, as a lost network does: both ends see it close. */
  drop(socket: FakeSocket): void {
    (socket as FakeSocket & { cut(): void }).cut();
  }

  /** The last socket opened. */
  get last(): FakeSocket {
    return this.sockets.at(-1)!;
  }
}

/** Lets microtasks and promise chains run out. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}
