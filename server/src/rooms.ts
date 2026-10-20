// The Relay's rooms (docs/adr/0006-a-relay-server-on-render.md): a 4-character
// Room code, a seat for the Host and one for the Guest, and the frames passed
// between them. Everything lives in memory and nothing names a player: a seat
// holds only a random token, so the same app can take it back after its socket
// drops. Pure but for the injected clock and randomness, so the tests drive it
// without sockets.

/** Letters and digits nobody misreads: no O or 0, no I or 1. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

/** A room with nobody in it is kept this long (10 min), so Reconnect and Rejoin still find it. */
export const GRACE_MS = 600_000;
/** A room whose Guest never came closes after this long (15 min). */
export const WAIT_MS = 900_000;
/** A room that passed no frame between its two for this long closes (30 min), so a forgotten tab doesn't keep the server awake. */
export const IDLE_MS = 1_800_000;
/** At most this many rooms at once. */
export const MAX_ROOMS = 500;

export type Seat = 'host' | 'guest';

/** One socket in a room, as the room sees it. */
export interface Member {
  send(text: string): void;
  close(code: number, reason: string): void;
}

/**
 * Why a socket can't enter:
 * - `no-room`: no room has that code.
 * - `full`: the room's Guest seat is taken by another app.
 * - `taken`: the Host seat belongs to another app (its token differs).
 * - `busy`: the server holds as many rooms as it may.
 */
export type Refusal = 'no-room' | 'full' | 'taken' | 'busy';

/** Why the server closed a room: nobody joined in time (`expired`), or nothing passed for too long (`idle`). */
export type Ending = 'expired' | 'idle';

export type Entered =
  | { readonly ok: true; readonly code: string; readonly seat: Seat; readonly token: string; readonly peer: boolean }
  | { readonly ok: false; readonly why: Refusal };

export interface RoomsOptions {
  readonly now: () => number;
  /** A whole number from 0 to n − 1. */
  readonly randomInt: (n: number) => number;
  /** A fresh secret for a seat. */
  readonly token: () => string;
  readonly maxRooms?: number;
  readonly graceMs?: number;
  readonly waitMs?: number;
  readonly idleMs?: number;
}

interface Place {
  token: string;
  member: Member | null;
}

interface Room {
  readonly code: string;
  host: Place | null;
  guest: Place | null;
  readonly created: number;
  /** Both seats have been filled at once. */
  met: boolean;
  /** The last frame passed, or the last entry. */
  active: number;
  /** When its last member left; null while anyone is in. */
  emptySince: number | null;
}

/** Whether text is a well-formed Room code. */
export function isCode(text: unknown): text is string {
  return typeof text === 'string' && text.length === CODE_LENGTH && [...text].every((c) => CODE_ALPHABET.includes(c));
}

const other = (seat: Seat): Seat => (seat === 'host' ? 'guest' : 'host');
const peerText = (here: boolean): string => JSON.stringify({ t: 'peer', here });

export function createRooms(opts: RoomsOptions) {
  const maxRooms = opts.maxRooms ?? MAX_ROOMS;
  const graceMs = opts.graceMs ?? GRACE_MS;
  const waitMs = opts.waitMs ?? WAIT_MS;
  const idleMs = opts.idleMs ?? IDLE_MS;
  const rooms = new Map<string, Room>();
  const where = new Map<Member, { readonly room: Room; readonly seat: Seat }>();

  function newRoom(code: string): Room {
    const now = opts.now();
    const room: Room = { code, host: null, guest: null, created: now, met: false, active: now, emptySince: now };
    rooms.set(code, room);
    return room;
  }

  function freshCode(): string | null {
    for (let tries = 0; tries < 100; tries++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[opts.randomInt(CODE_ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
    return null;
  }

  /** Seats the member, tells the other seat, and says who is there. */
  function seat(room: Room, member: Member, at: Seat, token: string): Entered {
    const old = room[at]?.member;
    if (old && old !== member) {
      // The same app on a new socket: the old one is dead or about to be.
      where.delete(old);
      old.send(JSON.stringify({ t: 'error', why: 'replaced' }));
      old.close(1000, 'replaced');
    }
    room[at] = { token, member };
    where.set(member, { room, seat: at });
    room.emptySince = null;
    room.active = opts.now();
    const peer = room[other(at)]?.member ?? null;
    if (peer) {
      room.met = true;
      peer.send(peerText(true));
    }
    return { ok: true, code: room.code, seat: at, token, peer: peer !== null };
  }

  function end(room: Room, why: Ending): void {
    for (const place of [room.host, room.guest]) {
      const m = place?.member;
      if (!m) continue;
      where.delete(m);
      m.send(JSON.stringify({ t: 'error', why }));
      m.close(1000, why);
    }
    rooms.delete(room.code);
  }

  return {
    /** A new room with this member as its Host. */
    create(member: Member): Entered {
      if (rooms.size >= maxRooms) return { ok: false, why: 'busy' };
      const code = freshCode();
      if (!code) return { ok: false, why: 'busy' };
      return seat(newRoom(code), member, 'host', opts.token());
    },

    /** The Guest seat of the room with this code, if no other app holds it. */
    join(member: Member, code: string): Entered {
      const room = isCode(code) ? rooms.get(code) : undefined;
      if (!room) return { ok: false, why: 'no-room' };
      if (room.guest?.member) return { ok: false, why: 'full' };
      return seat(room, member, 'guest', opts.token());
    },

    /**
     * A member taking its seat back after its socket dropped (a Reconnect),
     * with the token the room gave it. A room that's gone, because the server
     * restarted or its grace ran out, is made again with that code. The Host
     * seat needs the token; a free Guest seat takes anyone, as a restarted
     * Guest app rejoining by code does.
     */
    rejoin(member: Member, code: string, at: Seat, token: string): Entered {
      if (!isCode(code)) return { ok: false, why: 'no-room' };
      let room = rooms.get(code);
      if (!room) {
        if (rooms.size >= maxRooms) return { ok: false, why: 'busy' };
        room = newRoom(code);
      }
      const place = room[at];
      if (at === 'host' && place && place.token !== token) return { ok: false, why: 'taken' };
      if (at === 'guest' && place?.member && place.token !== token) return { ok: false, why: 'full' };
      return seat(room, member, at, token);
    },

    /** Passes a frame, as sent, to the other seat; dropped while it's empty. False for a member in no room. */
    forward(member: Member, text: string): boolean {
      const w = where.get(member);
      if (!w) return false;
      w.room.active = opts.now();
      w.room[other(w.seat)]?.member?.send(text);
      return true;
    },

    /** A member's socket closed: its seat waits for it, and the other seat hears it's gone. */
    left(member: Member): void {
      const w = where.get(member);
      if (!w) return;
      where.delete(member);
      const place = w.room[w.seat];
      if (place?.member === member) place.member = null;
      w.room[other(w.seat)]?.member?.send(peerText(false));
      if (!w.room.host?.member && !w.room.guest?.member) w.room.emptySince = opts.now();
    },

    /** Closes the rooms whose time is up: empty past the grace, never met, or idle. */
    sweep(): void {
      const now = opts.now();
      for (const room of [...rooms.values()]) {
        if (room.emptySince !== null && now - room.emptySince >= graceMs) rooms.delete(room.code);
        else if (!room.met && now - room.created >= waitMs) end(room, 'expired');
        else if (now - room.active >= idleMs) end(room, 'idle');
      }
    },

    counts(): { readonly rooms: number; readonly members: number } {
      return { rooms: rooms.size, members: where.size };
    },
  };
}

export type Rooms = ReturnType<typeof createRooms>;
