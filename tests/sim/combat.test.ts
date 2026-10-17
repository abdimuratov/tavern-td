import { describe, expect, it } from 'vitest';
import {
  armorMultiplier, getMode, killCreep, registerEffect, registerMode, step, typeMultiplier, WC3_DAMAGE_TABLE,
  type AttackSpec, type CreepSpec, type GameState, type Sim, type TowerSpec,
} from '../../src/sim';
import { TEST_MODE } from '../../src/sim/testing';
import { creepAt, newRun, ofType, openMap, run, towerAt } from './helpers';

// A Game Mode with one tower per effect, deterministic numbers (chaos damage is
// 100% against every armor type), and one Map with no rock in the way.

const base: AttackSpec = { damage: [10, 10], cooldown: 1, range: 300, attackType: 'chaos', targets: 'both', projectileSpeed: 0 };
const with_ = (a: Partial<AttackSpec>): TowerSpec => ({ name: 'fx', attack: { ...base, ...a } });

const FX_TOWERS: Record<string, TowerSpec> = {
  dart: with_({}),
  normal: with_({ attackType: 'normal' }),
  air: with_({ targets: 'air' }),
  ground: with_({ targets: 'ground' }),
  bolt: with_({ projectileSpeed: 300 }),
  splash: with_({ damage: [20, 20], effects: [{ kind: 'splash', bands: [[60, 1], [120, 0.5], [180, 0.25]] }] }),
  lob: with_({ projectileSpeed: 150, effects: [{ kind: 'splash', bands: [[100, 0.5]] }, { kind: 'slow', amount: 0.5, duration: 1 }] }),
  slow: with_({ damage: [0, 0], effects: [{ kind: 'slow', amount: 0.5, duration: 1 }] }),
  slowWeak: with_({ damage: [0, 0], effects: [{ kind: 'slow', amount: 0.25, duration: 3 }] }),
  frost: with_({ damage: [0, 0], effects: [{ kind: 'slow', amount: 0.2, duration: 3, key: 'frost' }] }),
  poison: with_({ damage: [0, 0], cooldown: 10, effects: [{ kind: 'poison', dps: 30, duration: 1 }] }),
  crit: with_({ effects: [{ kind: 'crit', chance: 1, multiplier: 2.5 }] }),
  multi: with_({ effects: [{ kind: 'multishot', count: 3 }] }),
  shred: with_({ damage: [0, 0], effects: [{ kind: 'armor', amount: 5, duration: 2 }] }),
  stun: with_({ damage: [0, 0], cooldown: 10, effects: [{ kind: 'stun', chance: 1, duration: 1 }] }),
  haste: { name: 'haste', auras: [{ kind: 'attackSpeed', to: 'towers', radius: 100, value: 1 }] },
  might: { name: 'might', auras: [{ kind: 'damage', to: 'towers', radius: 100, value: 0.5 }] },
  curse: { name: 'curse', auras: [{ kind: 'armor', to: 'creeps', radius: 200, value: 10 }] },
  chill: { name: 'chill', auras: [{ kind: 'slow', to: 'creeps', radius: 200, value: 0.5 }] },
  rock: { name: 'rock' },
};

const FX_CREEPS: Record<string, CreepSpec> = {
  dummy: { name: 'dummy', hp: 1000, armor: 0, armorType: 'medium', speed: 300, flying: false, bounty: 1 },
  plated: { name: 'plated', hp: 1000, armor: 5, armorType: 'medium', speed: 300, flying: false, bounty: 1 },
  flyer: { name: 'flyer', hp: 1000, armor: 0, armorType: 'light', speed: 300, flying: true, bounty: 1 },
};

registerMode({ ...TEST_MODE, id: 'fx', towers: FX_TOWERS, creeps: FX_CREEPS, waves: [] });

const FX_MAP = openMap(14, 10, [0, 0], [[[13, 0]], [[13, 9]]]);
/** Centre of cell (6, 5), where test towers stand. */
const X = 6.5 * 64;
const Y = 5.5 * 64;

function fx(): GameState {
  return newRun({ mode: 'fx', map: FX_MAP });
}

function hits(events: ReturnType<typeof step>, creep: number) {
  return ofType(events, 'hit').filter((e) => e.creep === creep);
}

describe('targeting', () => {
  it('keeps its target while it lives and stays in range', () => {
    const s = fx();
    const t = towerAt(s, 'dart', 6, 5);
    const a = creepAt(s, 'dummy', X + 200, Y);
    const b = creepAt(s, 'dummy', X - 250, Y);
    step(s, []);
    expect(t.target).toBe(a.id);
    b.x = X - 50;
    const events = run(s, 60);
    expect(t.target).toBe(a.id);
    expect(hits(events, b.id)).toEqual([]);
    a.x = X + 400;
    run(s, 30);
    expect(t.target).toBe(b.id);
  });

  it('attacks once per cooldown, averaging cooldowns that are not whole ticks', () => {
    const fireTicks = (cooldown: number) => {
      registerMode({ ...TEST_MODE, id: `fx-cd`, towers: { t: with_({ cooldown }) }, creeps: FX_CREEPS, waves: [] });
      const s = newRun({ mode: 'fx-cd', map: FX_MAP });
      towerAt(s, 't', 6, 5);
      creepAt(s, 'dummy', X + 100, Y);
      const ticks: number[] = [];
      for (let i = 0; i < 70; i++) {
        const tick = s.tick;
        if (ofType(step(s, []), 'fire').length > 0) ticks.push(tick);
      }
      return ticks;
    };
    expect(fireTicks(1)).toEqual([0, 30, 60]);
    expect(fireTicks(0.35).slice(0, 5)).toEqual([0, 11, 21, 32, 42]);
  });

  it('acquires the closest creep, the lower id on a tie', () => {
    const s = fx();
    const t = towerAt(s, 'dart', 6, 5);
    const first = creepAt(s, 'dummy', X + 150, Y);
    creepAt(s, 'dummy', X - 150, Y);
    const near = creepAt(s, 'dummy', X, Y + 100);
    step(s, []);
    expect(t.target).toBe(near.id);
    killCreep({ state: s, rules: getMode('fx'), events: [] }, near, 0);
    run(s, 30);
    expect(t.target).toBe(first.id);
  });

  it('only attacks the layers it targets', () => {
    const s = fx();
    const air = towerAt(s, 'air', 6, 5);
    const ground = towerAt(s, 'ground', 7, 5);
    const walker = creepAt(s, 'dummy', X + 32, Y);
    const flyer = creepAt(s, 'flyer', X + 250, Y);
    step(s, []);
    expect(air.target).toBe(flyer.id);
    expect(ground.target).toBe(walker.id);
    walker.hp = 0;
    flyer.x = X + 2000;
    const events = run(s, 60);
    expect(ofType(events, 'fire')).toEqual([]);
  });
});

describe('damage', () => {
  it('follows the WC3 armor formula for positive and negative armor', () => {
    expect(armorMultiplier(0)).toBe(1);
    expect(armorMultiplier(5)).toBeCloseTo(1 - (0.06 * 5) / (1 + 0.06 * 5), 15);
    expect(armorMultiplier(1)).toBeCloseTo(0.9434, 4);
    for (const a of [-1, -2.5, -10, -0.3, -37.75]) expect(armorMultiplier(a)).toBeCloseTo(2 - Math.pow(0.94, -a), 12);
    expect(armorMultiplier(-10)).toBeCloseTo(1.461, 3);
  });

  it('reads the damage table, counting a missing pair as 100%', () => {
    expect(typeMultiplier(WC3_DAMAGE_TABLE, 'pierce', 'light')).toBe(2);
    expect(typeMultiplier(WC3_DAMAGE_TABLE, 'magic', 'fortified')).toBe(0.35);
    expect(typeMultiplier(WC3_DAMAGE_TABLE, 'pierce', 'nothing')).toBe(1);
    expect(typeMultiplier(WC3_DAMAGE_TABLE, 'constructor', 'light')).toBe(1);
  });

  it('applies type and armor to every hit', () => {
    const s = fx();
    towerAt(s, 'normal', 6, 5);
    const soft = creepAt(s, 'dummy', X + 100, Y);
    expect(hits(step(s, []), soft.id)[0]?.damage).toBe(15);
    soft.hp = 0;
    const plated = creepAt(s, 'plated', X + 100, Y);
    const [hit] = hits(run(s, 30), plated.id);
    expect(hit?.damage).toBeCloseTo(15 / 1.3, 12);
    expect(plated.hp).toBeCloseTo(1000 - 15 / 1.3, 12);
  });
});

describe('effects', () => {
  it('splash hits each creep by the smallest band it stands in', () => {
    const s = fx();
    towerAt(s, 'splash', 6, 5);
    const target = creepAt(s, 'dummy', X + 100, Y);
    const at = [50, 100, 150, 200].map((d) => creepAt(s, 'dummy', X + 100, Y + d));
    const events = step(s, []);
    expect(hits(events, target.id).map((e) => [e.damage, e.kind])).toEqual([[20, 'attack']]);
    expect(at.map((c) => 1000 - c.hp)).toEqual([20, 10, 5, 0]);
    expect(ofType(events, 'hit').filter((e) => e.kind === 'splash')).toHaveLength(3);
  });

  it('a projectile whose target died lands at its last spot with area effects only', () => {
    const s = fx();
    towerAt(s, 'lob', 6, 5);
    const target = creepAt(s, 'dummy', X + 280, Y);
    const neighbour = creepAt(s, 'dummy', X + 280, Y + 60);
    const [fire] = ofType(step(s, []), 'fire');
    expect(fire?.target).toBe(target.id);
    killCreep({ state: s, rules: getMode('fx'), events: [] }, target, 0);
    const events = run(s, 60);
    const [impact] = ofType(events, 'impact').filter((e) => e.projectile === fire!.projectile);
    expect(impact).toMatchObject({ x: X + 280, y: Y });
    expect(1000 - neighbour.hp).toBe(5);
    expect(neighbour.status).toEqual([]);
  });

  it('homing projectiles follow a moving target', () => {
    const s = fx();
    towerAt(s, 'bolt', 6, 5);
    const target = creepAt(s, 'dummy', X + 200, Y);
    const [fire] = ofType(step(s, []), 'fire');
    target.y = Y + 150;
    const events = run(s, 40);
    const [impact] = ofType(events, 'impact').filter((e) => e.projectile === fire!.projectile);
    expect(impact).toMatchObject({ x: X + 200, y: Y + 150 });
    expect(target.hp).toBe(990);
  });

  it('slow takes speed off; the strongest per key counts and different keys add up', () => {
    const s = fx();
    const c = creepAt(s, 'dummy', X + 100, Y);
    c.speed = 300 / 30;
    towerAt(s, 'slow', 6, 5);
    towerAt(s, 'slowWeak', 6, 6);
    step(s, []);
    expect(c.status.map((st) => [st.key, st.value])).toEqual([['slow', 0.5], ['slow', 0.25]]);
    const move = () => {
      const [x, y] = [c.x, c.y];
      step(s, []);
      return Math.hypot(c.x - x, c.y - y);
    };
    expect(move()).toBeCloseTo(5, 9);
    towerAt(s, 'frost', 5, 5);
    run(s, 30);
    expect(move()).toBeCloseTo(10 * (1 - 0.5 - 0.2), 9);
  });

  it('slow wears off after its duration', () => {
    const s = fx();
    const c = creepAt(s, 'dummy', X + 100, Y);
    const t = towerAt(s, 'slow', 6, 5);
    step(s, []);
    s.towers.splice(s.towers.indexOf(t), 1);
    expect(c.status).toHaveLength(1);
    run(s, 29);
    expect(c.status).toHaveLength(1);
    run(s, 1);
    expect(c.status).toEqual([]);
  });

  it('poison deals its damage per second over the duration, ignoring armor, and earns the kill', () => {
    const s = fx();
    const t = towerAt(s, 'poison', 6, 5);
    const c = creepAt(s, 'plated', X + 100, Y, 20);
    step(s, []);
    expect(c.hp).toBe(20);
    let events = run(s, 15);
    expect(c.hp).toBeCloseTo(5, 9);
    expect(ofType(events, 'hit')).toEqual([]);
    events = run(s, 5);
    expect(ofType(events, 'kill')).toEqual([expect.objectContaining({ creep: c.id, tower: t.id })]);
    expect(t.kills).toBe(1);
  });

  it('crit multiplies the shot', () => {
    const s = fx();
    towerAt(s, 'crit', 6, 5);
    const c = creepAt(s, 'dummy', X + 100, Y);
    expect(hits(step(s, []), c.id)).toEqual([expect.objectContaining({ damage: 25, kind: 'crit' })]);
  });

  it('multishot hits the target and the closest others in range', () => {
    const s = fx();
    towerAt(s, 'multi', 6, 5);
    const near = [100, 150, 200].map((d) => creepAt(s, 'dummy', X + d, Y));
    const far = creepAt(s, 'dummy', X - 250, Y);
    const events = step(s, []);
    expect(ofType(events, 'fire').map((e) => e.target)).toEqual(near.map((c) => c.id));
    expect(far.hp).toBe(1000);
  });

  it('armor reduction raises the damage later hits do', () => {
    const s = fx();
    towerAt(s, 'normal', 6, 6);
    towerAt(s, 'shred', 6, 5);
    const c = creepAt(s, 'plated', X + 100, Y);
    const first = hits(step(s, []), c.id).find((e) => e.damage > 0);
    expect(first?.damage).toBeCloseTo(15 / 1.3, 12);
    const second = hits(run(s, 30), c.id).find((e) => e.damage > 0);
    expect(second?.damage).toBe(15);
  });

  it('stun stops a creep for its duration', () => {
    const s = fx();
    towerAt(s, 'stun', 6, 5);
    const c = creepAt(s, 'dummy', X + 100, Y);
    c.speed = 10;
    step(s, []);
    const x = c.x;
    run(s, 30);
    expect(c.x).toBe(x);
    step(s, []);
    expect(c.x).not.toBe(x);
  });

  it('a Game Mode adds an effect kind with one handler', () => {
    registerEffect<{ kind: 'execute'; below: number }>({
      kind: 'execute',
      validate: (e) => (e.below > 0 && e.below < 1 ? null : 'below must be a fraction'),
      onImpact(e, impact, sim: Sim) {
        const c = impact.target;
        if (c && c.hp > 0 && c.hp < c.maxHp * e.below) killCreep(sim, c, impact.tower);
      },
    });
    expect(() => registerMode({ ...TEST_MODE, id: 'fx-bad', towers: { x: with_({ effects: [{ kind: 'execute', below: 2 }] }) }, creeps: FX_CREEPS, waves: [] }))
      .toThrow(/below must be a fraction/);
    expect(() => registerMode({ ...TEST_MODE, id: 'fx-bad', towers: { x: with_({ effects: [{ kind: 'nope' }] }) }, creeps: FX_CREEPS, waves: [] }))
      .toThrow(/unknown effect kind nope/);
    registerMode({ ...TEST_MODE, id: 'fx-exec', towers: { reaper: with_({ effects: [{ kind: 'execute', below: 0.5 }] }) }, creeps: FX_CREEPS, waves: [] });
    const s = newRun({ mode: 'fx-exec', map: FX_MAP });
    towerAt(s, 'reaper', 6, 5);
    const c = creepAt(s, 'dummy', X + 100, Y, 400);
    c.maxHp = 1000;
    const events = step(s, []);
    expect(ofType(events, 'kill')).toEqual([expect.objectContaining({ creep: c.id })]);
  });
});

describe('auras', () => {
  it('attack speed: a buffed tower attacks twice as often, and the same aura twice does not stack', () => {
    const fires = (setup: (s: GameState) => void) => {
      const s = fx();
      towerAt(s, 'dart', 6, 5);
      setup(s);
      creepAt(s, 'dummy', X + 100, Y);
      return ofType(run(s, 90), 'fire').length;
    };
    expect(fires(() => {})).toBe(3);
    expect(fires((s) => towerAt(s, 'haste', 6, 4))).toBe(6);
    expect(fires((s) => {
      towerAt(s, 'haste', 6, 4);
      towerAt(s, 'haste', 6, 6);
    })).toBe(6);
  });

  it('damage: a buffed tower hits harder', () => {
    const s = fx();
    towerAt(s, 'dart', 6, 5);
    towerAt(s, 'might', 5, 5);
    const c = creepAt(s, 'dummy', X + 100, Y);
    expect(hits(step(s, []), c.id)[0]?.damage).toBe(15);
  });

  it('armor: creeps in the radius lose armor, down past zero', () => {
    const s = fx();
    towerAt(s, 'dart', 6, 5);
    towerAt(s, 'curse', 7, 5);
    const c = creepAt(s, 'plated', X + 100, Y);
    expect(hits(step(s, []), c.id)[0]?.damage).toBeCloseTo(10 * (2 - Math.pow(0.94, 5)), 12);
  });

  it('slow: creeps in the radius move slower', () => {
    const s = fx();
    towerAt(s, 'chill', 6, 5);
    const inside = creepAt(s, 'dummy', X + 100, Y);
    const outside = creepAt(s, 'dummy', X + 400, Y);
    for (const c of [inside, outside]) c.speed = 10;
    const moved = (c: typeof inside, x: number, y: number) => Math.hypot(c.x - x, c.y - y);
    const [ix, iy, ox, oy] = [inside.x, inside.y, outside.x, outside.y];
    step(s, []);
    expect(moved(inside, ix, iy)).toBeCloseTo(5, 9);
    expect(moved(outside, ox, oy)).toBeCloseTo(10, 9);
  });
});
