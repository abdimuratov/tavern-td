import { describe, expect, it } from 'vitest';
import { decodeReport } from '../../src/net/report';
import { HASH_EVERY } from '../../src/net/protocol';
import { hashState, linewars, replayHash, restore } from '../../src/sim';
import { Device, expectAgreement, World } from './harness';

// The lockstep over a fake transport (docs/versus-design.md §9, step 2): two
// devices, each a controller, its lockstep source and a scripted bot for its
// own Side, on a virtual clock.

const NET = { latency: 40, jitter: 30 };

const sideOf = (command: object): number => Number((command as { side?: unknown }).side);

/** Both devices' logs hold the same commands, Side 0's first on every tick. */
function expectSameLogs(world: World): void {
  const [a, b] = [world.host.controller!.log, world.guest.controller!.log];
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  for (let i = 1; i < a.length; i++) {
    if (a[i]!.tick !== a[i - 1]!.tick) continue;
    expect(sideOf(a[i]!.command)).toBeGreaterThanOrEqual(sideOf(a[i - 1]!.command));
  }
}

describe('Versus lockstep', () => {
  it('plays a whole Run at 40 ± 30 ms each way: every hash check agrees, both end alike, and either replay reaches the end', { timeout: 30_000 }, async () => {
    const world = new World(NET, { host: { bot: 'greedy' }, guest: { bot: 'flyer' } });
    await world.start(['runecasters', 'mirefolk']);
    expect(world.host.run!.lockstep.delay).toBe(2);
    await world.finish();
    const [h, g] = [world.host.state, world.guest.state];
    const { checks } = expectAgreement(world);
    expect(checks).toBeGreaterThanOrEqual(Math.floor(h.tick / HASH_EVERY) - 2);
    expect(h.tick).toBe(g.tick);
    expect(hashState(h)).toBe(hashState(g));
    expect(linewars.lwState(h).result).not.toBe('playing');
    expect(linewars.lwState(g).result).toBe(linewars.lwState(h).result);
    expectSameLogs(world);
    const sides = new Set(world.host.controller!.log.map((e) => sideOf(e.command)));
    expect([...sides].sort()).toEqual([0, 1]);
    expect(replayHash(world.host.controller!.replay())).toBe(hashState(h));
    expect(replayHash(world.guest.controller!.replay())).toBe(hashState(g));
    for (const d of world.devices) {
      expect(d.session.status().phase).toBe('over');
      expect(d.session.status().outcome).toBe('run');
    }
    console.log(`whole Run: ${linewars.lwState(h).result} by ${linewars.lwState(h).why} at ${(h.tick / 30 / 60).toFixed(1)} min, `
      + `${checks} hash checks, ${world.host.controller!.log.length} commands, waits ${world.host.run!.lockstep.status().waits}/${world.guest.run!.lockstep.status().waits}`);
  });

  it('holds 300 ms of ping with D = 3 and never waits for a Batch', async () => {
    const world = new World({ latency: 150, jitter: 8 });
    await world.start(['ironclad', 'rimeborn'], 4000);
    expect(world.host.session.status().ping).toBeGreaterThan(280);
    expect(world.host.run!.lockstep.delay).toBe(3);
    expect(world.guest.run!.lockstep.delay).toBe(3);
    await world.run(90_000);
    for (const d of world.devices) {
      const s = d.run!.lockstep.status();
      expect(s.waits, d.role).toBe(0);
      expect(s.waitedMs, d.role).toBe(0);
      expect(s.tick).toBeGreaterThan(2600);
    }
    expect(expectAgreement(world).checks).toBeGreaterThan(80);
  });

  it('stops both devices on the same tick for a pause from either Side, and resumes once both are Ready', async () => {
    const world = new World(NET);
    await world.start();
    await world.run(15_000);
    for (const [who, by] of [[world.host, 0], [world.guest, 1]] as const) {
      who.session.pause();
      await world.run(1500);
      const [h, g] = [world.host.run!.lockstep.status(), world.guest.run!.lockstep.status()];
      expect(h.pause).not.toBeNull();
      expect(g.pause?.turn).toBe(h.pause!.turn);
      expect(h.pause!.by).toEqual([by]);
      expect(h.pause!.kinds).toEqual(['pause']);
      expect(world.host.state.tick).toBe(h.pause!.tick);
      expect(world.guest.state.tick).toBe(h.pause!.tick);
      await world.run(3000);
      expect(world.host.state.tick).toBe(h.pause!.tick);
      world.host.session.ready(true);
      await world.run(500);
      expect(world.host.run!.lockstep.status().pause!.ready).toEqual([true, false]);
      expect(world.host.state.tick).toBe(h.pause!.tick);
      world.guest.session.ready(true);
      await world.run(2000);
      expect(world.guest.run!.lockstep.status().countdownMs).toBeGreaterThan(0);
      expect(world.guest.state.tick).toBe(h.pause!.tick);
      await world.run(3000);
      expect(world.host.state.tick).toBeGreaterThan(h.pause!.tick + 15);
      expect(world.guest.run!.lockstep.status().pause).toBeNull();
      await world.run(5000);
    }
    expect(expectAgreement(world).checks).toBeGreaterThan(20);
  });

  it('pauses both while the Guest is away for 20 s, and plays on once it is back and both are Ready', async () => {
    const world = new World(NET);
    await world.start();
    await world.run(15_000);
    world.guest.session.away();
    world.guest.suspended = true;
    await world.run(20_000);
    const h = world.host.session.status();
    expect(h.rivalAway).toBe(true);
    expect(h.run!.pause?.by).toEqual([1]);
    expect(h.run!.pause?.kinds).toEqual(['away']);
    expect(h.link).not.toBe('lost');
    expect(h.canClaim).toBe(false);
    const at = h.run!.pause!.tick;
    expect(world.host.state.tick).toBe(at);
    world.guest.suspended = false;
    world.guest.session.back();
    await world.run(1000);
    expect(world.guest.state.tick).toBe(at);
    expect(world.host.session.status().rivalAway).toBe(false);
    world.host.session.ready(true);
    world.guest.session.ready(true);
    await world.run(15_000);
    expect(world.host.state.tick).toBeGreaterThan(at + 300);
    expect(expectAgreement(world).checks).toBeGreaterThan(20);
  });

  it('resends lost Batches when a dropped connection is made again, and both stop together to press Ready', async () => {
    const world = new World(NET);
    await world.start();
    await world.run(15_000);
    world.pipe.close();
    await world.run(5000);
    const held = [world.host.state.tick, world.guest.state.tick];
    for (const d of world.devices) expect(d.session.status().link).toBe('lost');
    await world.run(5000);
    expect([world.host.state.tick, world.guest.state.tick]).toEqual(held);
    world.connect();
    await world.run(2000);
    const [h, g] = [world.host.run!.lockstep.status(), world.guest.run!.lockstep.status()];
    expect(h.resent + g.resent).toBeGreaterThan(0);
    expect(h.pause?.kinds).toContain('link');
    expect(g.pause?.turn).toBe(h.pause!.turn);
    expect(world.host.state.tick).toBe(world.guest.state.tick);
    world.host.session.ready(true);
    world.guest.session.ready(true);
    await world.run(15_000);
    expect(world.host.state.tick).toBeGreaterThan(h.pause!.tick + 300);
    expect(expectAgreement(world).checks).toBeGreaterThan(20);
  });

  it('lets a restarted Guest rejoin from the Host\'s state, and both play on in agreement', async () => {
    const world = new World(NET, { guest: { bot: 'flyer' } });
    await world.start();
    await world.run(20_000);
    const session = world.host.session.status().session!;
    world.pipe.close();
    await world.run(3000);
    world.guest.session.close();
    world.guest = new Device(world, 'guest', { rejoin: session, bot: 'flyer' });
    world.connect();
    await world.run(3000);
    expect(world.guest.run).not.toBeNull();
    expect(world.guest.session.status().phase).toBe('playing');
    const at = world.host.run!.lockstep.status().pause!.tick;
    expect(world.guest.run!.lockstep.status().pause?.tick).toBe(at);
    expect(world.guest.state.tick).toBe(at);
    expect(hashState(world.guest.state)).toBe(hashState(world.host.state));
    expect(world.guest.controller!.log).toEqual(world.host.controller!.log);
    world.host.session.ready(true);
    world.guest.session.ready(true);
    await world.run(5000);
    world.guest.submit({ type: 'lw.send', side: 1, send: 'snowlings', tap: 'after the rejoin' });
    await world.run(15_000);
    expect(world.guest.state.tick).toBeGreaterThan(at + 400);
    const { checks } = expectAgreement(world);
    expect(checks).toBeGreaterThan(10);
    for (const d of world.devices) expect(d.controller!.log.filter((e) => 'tap' in e.command), d.role).toHaveLength(1);
  });

  it('repairs a first Desync from the Host\'s state, then agrees; a second ends the Run on both', async () => {
    const world = new World(NET);
    await world.start();
    await world.run(15_000);
    (world.guest.state as linewars.LwGameState).mode.sides[1].gold += 7;
    await world.run(8000);
    for (const d of world.devices) {
      const s = d.run!.lockstep.status();
      expect(s.desyncs, d.role).toBe(1);
      expect(s.ended).toBeNull();
      expect(s.syncing).toBe(false);
    }
    const fixedAt = Math.max(...world.host.desyncs);
    await world.run(10_000);
    // Checks between the Desync and the pause that repaired it are void; every one since agrees.
    const after = [...world.host.agreed.keys()].filter((t) => t > fixedAt);
    expect(after.length).toBeGreaterThan(8);
    for (const t of after) expect(world.guest.agreed.get(t) ?? world.host.agreed.get(t)).toBe(world.host.agreed.get(t));

    const code = await world.guest.session.report();
    expect(code).toMatch(/^TTDR1\./);
    const report = await decodeReport(code!);
    expect(report.side).toBe(1);
    expect(report.builds).toEqual(['aaaaaaa', 'bbbbbbb']);
    expect(report.hashes[0]).not.toBe(report.hashes[1]);
    expect(report.tick).toBe(fixedAt);
    expect(restore(report.state).tick).toBe(report.pauseTick);
    expect(report.replay.log.length).toBeGreaterThan(0);

    (world.guest.state as linewars.LwGameState).mode.sides[1].gold += 7;
    await world.run(5000);
    for (const d of world.devices) {
      const s = d.session.status();
      expect(s.run!.ended, d.role).toBe('desync');
      expect(s.run!.desyncs).toBe(2);
      expect(s.phase).toBe('over');
      expect(s.outcome).toBe('desync');
    }
    const stopped = [world.host.state.tick, world.guest.state.tick];
    await world.run(3000);
    expect([world.host.state.tick, world.guest.state.tick]).toEqual(stopped);
  });

  it('drops commands for the other Side on both devices, so a misbehaving peer moves nothing of the Host\'s', async () => {
    const world = new World(NET, {
      guest: {
        evil: () => [
          { type: 'lw.send', side: 0, send: 'snowlings', evil: true },
          { type: 'lw.build', side: 0, spec: 'ironclad_wall', col: 30, row: 10, evil: true },
          { type: 'lw.send', side: '1', send: 'snowlings', evil: true },
          { type: 'startWave', evil: true },
          { side: 1, evil: true },
        ],
      },
    });
    await world.start();
    await world.run(40_000);
    expect(world.guest.submitted.filter((c) => 'evil' in c).length).toBeGreaterThan(100);
    for (const d of world.devices) expect(d.controller!.log.some((e) => 'evil' in e.command)).toBe(false);
    expect(expectAgreement(world).checks).toBeGreaterThan(30);
    expect(world.guest.controller!.log.filter((e) => sideOf(e.command) === 1).length).toBeGreaterThan(0);
  });
});
