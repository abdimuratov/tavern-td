import { describe, expect, it } from 'vitest';
import { RACES } from '../../src/content/maul';
import { createRun, hashState } from '../../src/sim';
import { Device, World } from './harness';

// Hello, the lobby, Start and Go, Concede, claiming the win and Rematch
// (docs/versus-design.md §4.6, §5.5, §6), over the fake transport.

const NET = { latency: 40, jitter: 30 };

describe('a Versus session', () => {
  it('stops at Hello when the two builds play different rules, and names both builds', async () => {
    const world = new World(NET, { guest: { simHash: 'ffff0000', build: 'e4f5a6b' } });
    await world.run(500);
    for (const d of world.devices) {
      const s = d.session.status();
      expect(s.phase, d.role).toBe('mismatch');
      expect(s.mismatch?.why).toBe('version');
    }
    expect(world.host.session.status().mismatch).toEqual({ why: 'version', mine: 'aaaaaaa', rival: 'e4f5a6b' });
    expect(world.guest.session.status().mismatch).toEqual({ why: 'version', mine: 'e4f5a6b', rival: 'aaaaaaa' });
  });

  it('ends the connection on a message it refuses', async () => {
    const world = new World(NET);
    await world.run(500);
    expect(world.host.session.status().phase).toBe('lobby');
    world.pipe.ends[1].send('{"v":1,"t":"shout"}');
    await world.run(500);
    expect(world.host.session.status().mismatch?.why).toBe('protocol');
    expect(world.pipe.ends[0].state).toBe('closed');
  });

  it('runs the lobby: picks seen both ways, Random drawn by the picker, the ping, and a slow-connection warning', async () => {
    const slow = new World({ latency: 450, jitter: 20 });
    await slow.run(100);
    slow.guest.session.pick('random');
    await slow.run(3000);
    const g = slow.guest.session.status().lobby.mine;
    expect(RACES).toContain(g.race);
    expect(g.random).toBe(true);
    expect(slow.host.session.status().lobby.rival.race).toBe(g.race);
    const h = slow.host.session.status();
    expect(h.ping).toBeGreaterThan(850);
    expect(h.slow).toBe(true);
    expect(h.delay).toBe(5);
    expect(h.link).toBe('open');
  });

  it('starts a Normal Run of two people from the Host\'s seed, checks the initial hash, and counts 3 s down from Go', async () => {
    const world = new World(NET);
    await world.run(100);
    world.host.session.pick('mirefolk');
    world.guest.session.pick('runecasters');
    await world.run(2000);
    world.host.session.setReady(true);
    await world.run(500);
    expect(world.host.run).toBeNull();
    world.guest.session.setReady(true);
    await world.run(300);
    const options = world.host.run!.options;
    expect(options).toEqual({
      mode: 'linewars', seed: 1001, difficulty: 'normal',
      options: { race: 'mirefolk', rivalRace: 'runecasters', drivers: ['human', 'human'] },
    });
    expect(world.guest.run!.options).toEqual(options);
    expect(world.guest.run!.side).toBe(1);
    expect(world.guest.run!.viewer).toBe(1);
    expect(world.guest.run!.session).toBe(world.host.run!.session);
    expect(world.host.run!.session).toMatch(/^[0-9a-f]{16}$/);
    expect(hashState(world.guest.state)).toBe(hashState(createRun(options)));
    for (const d of world.devices) expect(d.session.status().phase).toBe('playing');
    const countdown = world.guest.run!.lockstep.status().countdownMs;
    expect(countdown).toBeGreaterThan(2500);
    await world.run(countdown - 50);
    expect(world.guest.state.tick).toBe(0);
    expect(world.host.state.tick).toBe(0);
    await world.run(500);
    expect(world.guest.state.tick).toBeGreaterThan(5);
    expect(Math.abs(world.host.state.tick - world.guest.state.tick)).toBeLessThanOrEqual(3);
  });

  it('ends on a Concede: a loss for the one who left, a win for the Rival; Rematch goes back to the lobby and a new seed', async () => {
    const world = new World(NET);
    await world.start(['ironclad', 'rimeborn']);
    await world.run(10_000);
    world.guest.session.concede();
    await world.run(500);
    expect(world.guest.session.status().outcome).toBe('conceded');
    expect(world.host.session.status().outcome).toBe('rival-conceded');
    for (const d of world.devices) expect(d.session.status().phase).toBe('over');
    const ticks = [world.host.state.tick, world.guest.state.tick];
    await world.run(2000);
    expect([world.host.state.tick, world.guest.state.tick]).toEqual(ticks);

    const firstSeed = world.host.run!.options.seed;
    world.host.session.rematch();
    await world.run(300);
    expect(world.host.session.status().phase).toBe('lobby');
    expect(world.guest.session.status().lobby.rival.here).toBe(true);
    world.host.session.setReady(true);
    await world.run(300);
    expect(world.guest.session.status().phase).toBe('over');
    world.guest.session.rematch();
    world.guest.session.setReady(true);
    await world.run(300);
    expect(world.host.run!.options.seed).not.toBe(firstSeed);
    expect(world.host.run!.options.options).toEqual({ race: 'ironclad', rivalRace: 'rimeborn', drivers: ['human', 'human'] });
    expect(world.guest.session.status().phase).toBe('playing');
  });

  it('offers the win after 2 min without the Rival, only to a player whose app stayed in front', async () => {
    const world = new World(NET);
    await world.start();
    await world.run(10_000);
    world.pipe.close();
    await world.run(5000);
    world.host.session.away();
    await world.run(10_000);
    world.host.session.back();
    await world.run(100_000);
    expect(world.guest.session.status().canClaim).toBe(false);
    await world.run(6000);
    expect(world.guest.session.status().canClaim).toBe(true);
    expect(world.host.session.status().canClaim).toBe(false);
    expect(world.host.session.claim()).toBe(false);
    expect(world.guest.session.claim()).toBe(true);
    expect(world.guest.session.status().outcome).toBe('claimed');
    expect(world.guest.session.status().phase).toBe('over');
  });

  it('refuses a rejoin when the Host has no Run any more', async () => {
    const world = new World(NET);
    world.guest.session.close();
    world.guest = new Device(world, 'guest', { rejoin: '0123456789abcdef' });
    world.connect();
    await world.run(500);
    expect(world.guest.session.status().mismatch?.why).toBe('gone');
  });
});
