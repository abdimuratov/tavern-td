import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, createRooms, isCode, type Member } from '../src/rooms.ts';

// The Relay's rooms without sockets (docs/adr/0006-a-relay-server-on-render.md):
// codes, seats and tokens, what passes between the two, and when a room closes.

interface Fake extends Member {
  readonly got: unknown[];
  closed: string | null;
}

function member(): Fake {
  const m: Fake = {
    got: [],
    closed: null,
    send(text) {
      m.got.push(JSON.parse(text));
    },
    close(_code, reason) {
      m.closed = reason;
    },
  };
  return m;
}

/** Rooms on a clock the test sets, drawing code characters from `draws` in turn. */
function setup(over: { maxRooms?: number } = {}, draws = [0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 6, 7]) {
  let t = 0;
  let n = 0;
  let tokens = 0;
  const rooms = createRooms({
    now: () => t,
    randomInt: (k) => draws[n++ % draws.length]! % k,
    token: () => `token-${++tokens}`,
    graceMs: 1000,
    waitMs: 5000,
    idleMs: 10_000,
    ...over,
  });
  return { rooms, at: (ms: number) => (t = ms) };
}

describe('Room codes', () => {
  it('are 4 characters from an alphabet with no O, 0, I or 1', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    for (const c of 'O0I1') expect(CODE_ALPHABET).not.toContain(c);
    expect(isCode('K7QX')).toBe(true);
    expect(isCode('k7qx')).toBe(false);
    expect(isCode('K7Q')).toBe(false);
    expect(isCode('K0QX')).toBe(false);
    expect(isCode(1234)).toBe(false);
  });

  it('never repeat one in use', () => {
    // The second room draws ABCD again first, then EFGH.
    const { rooms } = setup({}, [0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rooms.create(member())).toMatchObject({ ok: true, code: 'ABCD' });
    expect(rooms.create(member())).toMatchObject({ ok: true, code: 'EFGH' });
  });
});

describe('A room', () => {
  it('seats the Host and then the Guest, who each hear whether the other is there', () => {
    const { rooms } = setup();
    const host = member();
    const guest = member();
    const made = rooms.create(host);
    expect(made).toMatchObject({ ok: true, seat: 'host', peer: false });
    const code = made.ok ? made.code : '';
    expect(rooms.join(guest, code)).toMatchObject({ ok: true, code, seat: 'guest', peer: true });
    expect(host.got).toEqual([{ t: 'peer', here: true }]);
    expect(rooms.counts()).toEqual({ rooms: 1, members: 2 });
  });

  it('refuses a code nobody made, and a third app', () => {
    const { rooms } = setup();
    const made = rooms.create(member());
    const code = made.ok ? made.code : '';
    expect(rooms.join(member(), 'ZZZZ')).toEqual({ ok: false, why: 'no-room' });
    expect(rooms.join(member(), 'not a code')).toEqual({ ok: false, why: 'no-room' });
    expect(rooms.join(member(), code).ok).toBe(true);
    expect(rooms.join(member(), code)).toEqual({ ok: false, why: 'full' });
  });

  it('passes frames, exactly as sent, to the other seat only, and drops them while it is empty', () => {
    const { rooms } = setup();
    const host = member();
    const guest = member();
    const made = rooms.create(host);
    const text = '{"t":"relay","d":"{\\"v\\":1,\\"t\\":\\"ping\\"}"}';
    expect(rooms.forward(host, text)).toBe(true);
    rooms.join(guest, made.ok ? made.code : '');
    rooms.forward(host, text);
    rooms.forward(guest, '{"t":"signal","d":{"k":"answer"}}');
    expect(guest.got).toEqual([{ t: 'relay', d: '{"v":1,"t":"ping"}' }]);
    expect(host.got).toEqual([{ t: 'peer', here: true }, { t: 'signal', d: { k: 'answer' } }]);
    expect(rooms.forward(member(), text)).toBe(false);
  });

  it('tells the other seat when a socket leaves, and lets the same app back in by its token', () => {
    const { rooms } = setup();
    const host = member();
    const guest = member();
    const made = rooms.create(host);
    if (!made.ok) throw new Error('no room');
    const joined = rooms.join(guest, made.code);
    if (!joined.ok) throw new Error('no seat');
    rooms.left(host);
    expect(guest.got).toEqual([{ t: 'peer', here: false }]);
    expect(rooms.rejoin(member(), made.code, 'host', 'someone else')).toEqual({ ok: false, why: 'taken' });
    const back = member();
    expect(rooms.rejoin(back, made.code, 'host', made.token)).toMatchObject({ ok: true, seat: 'host', peer: true });
    expect(guest.got.at(-1)).toEqual({ t: 'peer', here: true });
  });

  it('gives a free Guest seat to a restarted app joining by code, but not one still held', () => {
    const { rooms } = setup();
    const made = rooms.create(member());
    const code = made.ok ? made.code : '';
    const guest = member();
    const joined = rooms.join(guest, code);
    if (!joined.ok) throw new Error('no seat');
    expect(rooms.rejoin(member(), code, 'guest', 'another')).toEqual({ ok: false, why: 'full' });
    rooms.left(guest);
    expect(rooms.join(member(), code)).toMatchObject({ ok: true, seat: 'guest' });
  });

  it('closes the old socket when the same app enters again on a new one', () => {
    const { rooms } = setup();
    const old = member();
    const made = rooms.create(old);
    if (!made.ok) throw new Error('no room');
    const fresh = member();
    expect(rooms.rejoin(fresh, made.code, 'host', made.token).ok).toBe(true);
    expect(old.got).toEqual([{ t: 'error', why: 'replaced' }]);
    expect(old.closed).toBe('replaced');
    // Its close then changes nothing.
    rooms.left(old);
    expect(rooms.counts()).toEqual({ rooms: 1, members: 1 });
  });

  it('is made again with its code when a member returns after the server restarted', () => {
    const { rooms } = setup();
    const guest = member();
    expect(rooms.rejoin(guest, 'K7QX', 'guest', 'g')).toMatchObject({ ok: true, code: 'K7QX', seat: 'guest', peer: false });
    expect(rooms.rejoin(member(), 'K7QX', 'host', 'h')).toMatchObject({ ok: true, seat: 'host', peer: true });
    expect(rooms.rejoin(member(), 'BAD!', 'host', 'h')).toEqual({ ok: false, why: 'no-room' });
  });

  it('refuses new rooms past the limit', () => {
    const { rooms } = setup({ maxRooms: 1 });
    expect(rooms.create(member()).ok).toBe(true);
    expect(rooms.create(member())).toEqual({ ok: false, why: 'busy' });
    expect(rooms.rejoin(member(), 'K7QX', 'host', 'h')).toEqual({ ok: false, why: 'busy' });
  });
});

describe('Closing rooms', () => {
  it('keeps an empty room for the grace, counted from its last member leaving, then forgets it', () => {
    const { rooms, at } = setup();
    const host = member();
    const guest = member();
    const made = rooms.create(host);
    rooms.join(guest, made.ok ? made.code : '');
    at(100);
    rooms.left(host);
    at(200);
    rooms.left(guest);
    at(1199);
    rooms.sweep();
    expect(rooms.counts().rooms).toBe(1);
    at(1200);
    rooms.sweep();
    expect(rooms.counts().rooms).toBe(0);
  });

  it('closes a room whose Guest never came', () => {
    const { rooms, at } = setup();
    const host = member();
    rooms.create(host);
    at(4999);
    rooms.sweep();
    expect(host.closed).toBeNull();
    at(5000);
    rooms.sweep();
    expect(host.got).toEqual([{ t: 'error', why: 'expired' }]);
    expect(host.closed).toBe('expired');
    expect(rooms.counts()).toEqual({ rooms: 0, members: 0 });
  });

  it('closes a room that passed nothing for too long, while frames keep it open', () => {
    const { rooms, at } = setup();
    const host = member();
    const guest = member();
    const made = rooms.create(host);
    rooms.join(guest, made.ok ? made.code : '');
    at(9000);
    rooms.forward(host, '{"t":"relay","d":"x"}');
    at(18_000);
    rooms.sweep();
    expect(host.closed).toBeNull();
    at(19_000);
    rooms.sweep();
    expect(host.closed).toBe('idle');
    expect(guest.got.at(-1)).toEqual({ t: 'error', why: 'idle' });
    expect(rooms.counts().rooms).toBe(0);
  });
});
