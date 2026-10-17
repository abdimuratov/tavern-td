import { describe, expect, it } from 'vitest';
import { ELEMENT_MAP } from '../../../src/content/element';
import { element, routeData } from '../../../src/sim';
import { creepOnRoute, hitCreep, modeEvents, newElementRun, ofType, reasons, run, send, skipWave } from './helpers';

const LEAK_AT = routeData(ELEMENT_MAP)!.leakAt;

describe('Element breaks and Waves', () => {
  it('starts Full with 250 gold, 1 Lumber, 50 lives and a 30 s break; Express with 600, 2 and 45 s', () => {
    const full = newElementRun();
    expect({ gold: full.gold, lumber: full.mode.lumber, lives: full.lives, total: full.wave.total }).toEqual({ gold: 250, lumber: 1, lives: 50, total: 155 });
    expect(element.elementStatus(full).break).toEqual({ wave: 1, ticksLeft: 900, totalTicks: 900 });
    const express = newElementRun({ length: 'express' });
    expect({ gold: express.gold, lumber: express.mode.lumber, total: express.wave.total }).toEqual({ gold: 600, lumber: 2, total: 30 });
    expect(element.elementStatus(express).break?.ticksLeft).toBe(1350);
  });

  it('starts each Wave on its own when the break ends; send now skips the rest and pays nothing', () => {
    const s = newElementRun();
    run(s, 900);
    expect(s.phase).toBe('build');
    expect(ofType(run(s, 1), 'waveStart')).toEqual([{ type: 'waveStart', wave: 1 }]);
    expect(s.tick).toBe(901);
    expect(reasons(send(s, { type: 'element.sendNow' }))).toEqual(['a Wave is still running']);
    skipWave(s);
    // Wave 2's break is 7 s on Normal; sending now starts it at once, for no gold.
    expect(element.elementStatus(s).break).toMatchObject({ wave: 2, totalTicks: 210 });
    const gold = s.gold;
    expect(ofType(send(s, { type: 'element.sendNow' }), 'waveStart')).toHaveLength(1);
    expect(s.gold).toBe(gold);
    // The core's startWave does the same.
    skipWave(s);
    expect(ofType(send(s, { type: 'startWave' }), 'waveStart')).toHaveLength(1);
  });

  it('pays the Wave\'s bounty per kill and nothing for clearing it', () => {
    const s = newElementRun();
    send(s, { type: 'element.sendNow' });
    run(s, 16);
    const c = s.creeps[0]!;
    const gold = s.gold;
    const events = hitCreep(s, c, 1000);
    expect(ofType(events, 'kill')[0]).toMatchObject({ bounty: 1 });
    expect(s.gold).toBe(gold + 1);
    const cleared = skipWave(s);
    expect(ofType(cleared, 'goldChanged').filter((e) => e.delta > 0 && modeEvents(cleared, 'element.interest').length === 0)).toEqual([]);
  });

  it('uses the Difficulty\'s breaks, and 30 s before Waves 6, 11 … 51 in Full', () => {
    const s = newElementRun({ difficulty: 'insane' });
    for (let w = 1; w <= 5; w++) skipWave(s);
    expect(element.elementStatus(s).break).toMatchObject({ wave: 6, totalTicks: 900 });
    skipWave(s);
    expect(element.elementStatus(s).break).toMatchObject({ wave: 7, totalTicks: 30 });
    expect(element.breakSeconds(s, 56)).toBe(60);
    expect(element.breakSeconds(s, 57)).toBe(0);
  });
});

describe('Element interest', () => {
  it('pays ⌊2% of gold⌋ every 15 s from Wave 1\'s first spawn, breaks included', () => {
    const s = newElementRun();
    run(s, 600);
    expect(s.mode.interest.next).toBe(-1);
    send(s, { type: 'element.sendNow' });
    // First spawn 0.5 s in.
    run(s, 15);
    expect(s.mode.firstSpawn).toBe(615);
    const events = run(s, 451);
    const paid = modeEvents(events, 'element.interest');
    expect(paid).toHaveLength(1);
    expect(paid[0]!.data).toEqual({ gold: 5, next: 615 + 900 });
    expect(s.gold).toBe(255);
    // It keeps running through a break.
    skipWave(s);
    expect(s.phase).toBe('build');
    const before = s.mode.interest.next;
    run(s, Math.max(0, before - s.tick) + 1);
    expect(s.mode.interest.next).toBe(before + 450);
  });

  it('pauses on a leak, keeping the time left, until that Wave is cleared', () => {
    const s = newElementRun();
    send(s, { type: 'element.sendNow' });
    // Walk the first creep to the exit.
    run(s, 16);
    const c = s.creeps[0]!;
    c.dist = LEAK_AT - 5;
    const at = s.tick;
    const due = s.mode.interest.next;
    expect(ofType(run(s, 1), 'leak')).toHaveLength(1);
    expect(s.mode.interest).toMatchObject({ next: -1, left: due - at, locks: [1] });
    expect(modeEvents(run(s, 900), 'element.interest')).toEqual([]);
    expect(element.elementStatus(s).interest).toMatchObject({ paused: true, nextTick: null });
    // Clearing Wave 1 resumes it with the same time left.
    for (const k of s.creeps) k.hp = 0;
    run(s, 1);
    expect(s.phase).toBe('build');
    expect(s.mode.interest).toMatchObject({ next: s.tick - 1 + (due - at), left: -1, locks: [] });
  });

  it('stops for good once Wave 55 (Express: 29) is cleared', () => {
    const s = newElementRun({ length: 'express' });
    for (let w = 1; w <= 29; w++) skipWave(s);
    expect(s.mode.completed).toBe(29);
    expect(s.mode.interest.stopped).toBe(true);
    expect(modeEvents(run(s, 900), 'element.interest')).toEqual([]);
  });
});

describe('Element Lumber, Elementals and Pure Essence', () => {
  it('gives All Pick Full its first Element free, then Lumber after Waves 5, 10 …', () => {
    const s = newElementRun();
    expect(element.summonOptions(s).elements.find((o) => o.element === 'fire')).toMatchObject({ instant: true, next: 1, blocked: null });
    const events = send(s, { type: 'element.summon', element: 'fire' });
    expect(modeEvents(events, 'element.levelUp')[0]!.data).toEqual({ element: 'fire', level: 1, creep: 0 });
    expect(s.mode).toMatchObject({ lumber: 0, freeElements: 0 });
    expect(reasons(send(s, { type: 'element.summon', element: 'water' }))).toEqual(['needs a Lumber']);
    for (let w = 1; w <= 4; w++) skipWave(s);
    expect(s.mode.lumber).toBe(0);
    const fifth = skipWave(s);
    expect(modeEvents(fifth, 'element.lumber')).toHaveLength(1);
    expect(s.mode.lumber).toBe(1);
  });

  it('summons an Elemental that walks the lane, costs 3 lives on a leak and raises the Element when killed', () => {
    const s = newElementRun();
    send(s, { type: 'element.summon', element: 'fire' });
    s.mode.lumber = 2;
    const opt = element.summonOptions(s).elements.find((o) => o.element === 'water')!;
    expect(opt).toMatchObject({ instant: false, elementalHp: 600, blocked: null });
    const events = send(s, { type: 'element.summon', element: 'water' });
    const spawn = ofType(events, 'spawn')[0]!;
    expect(spawn).toMatchObject({ spec: 'elemental-water-1', wave: 0 });
    const e = s.creeps.find((c) => c.id === spawn.creep)!;
    expect(e).toMatchObject({ hp: 600, maxHp: 600, bounty: 0 });
    expect(s.mode.lumber).toBe(1);
    // One at a time.
    expect(reasons(send(s, { type: 'element.summon', element: 'earth' }))).toEqual(['an Elemental is already on the lane']);
    e.dist = LEAK_AT - 5;
    const leak = ofType(run(s, 1), 'leak')[0]!;
    expect(leak).toMatchObject({ lives: 3, restart: true });
    // It takes damage as Water: Dark deals 200%.
    const gold = s.gold;
    expect(ofType(hitCreep(s, e, 299, 0, 'dark'), 'kill')).toEqual([]);
    expect(e.hp).toBe(2);
    const hit = hitCreep(s, e, 1, 0, 'dark');
    expect(ofType(hit, 'kill')).toEqual([expect.objectContaining({ creep: e.id, bounty: 0 })]);
    expect(s.mode.levels.water).toBe(1);
    expect(s.gold).toBe(gold);
  });

  it('scales Elemental HP ×1.5 per 5 Waves and by Difficulty', () => {
    const s = newElementRun({ difficulty: 'hard' });
    for (let w = 1; w <= 5; w++) skipWave(s);
    // Waiting for Wave 6: ⌊600 × 1.5 × 1.3⌋.
    expect(element.elementalHp(s, 1)).toBe(1170);
    expect(element.elementalHp(s, 2)).toBe(5850);
  });

  it('makes Express summons instant, gated to 6 cleared Waves for level 2 and 15 for level 3', () => {
    const s = newElementRun({ length: 'express' });
    send(s, { type: 'element.summon', element: 'light' });
    expect(s.mode.levels.light).toBe(1);
    expect(reasons(send(s, { type: 'element.summon', element: 'light' }))).toEqual(['level 2 opens after Wave 6']);
    send(s, { type: 'element.summon', element: 'dark' });
    expect(s.mode).toMatchObject({ lumber: 0, levels: { light: 1, dark: 1 } });
    expect(s.creeps).toEqual([]);
  });

  it('sells Pure Essence for a Lumber with an Element at 3 or all six at 1, at most twice; two more come free in Full', () => {
    const s = newElementRun();
    s.mode.lumber = 5;
    expect(reasons(send(s, { type: 'element.buyEssence' }))).toEqual(['needs an Element at level 3 or all six at level 1']);
    s.mode.levels.earth = 3;
    send(s, { type: 'element.buyEssence' });
    send(s, { type: 'element.buyEssence' });
    expect(s.mode).toMatchObject({ essence: 2, essenceBought: 2, lumber: 3 });
    expect(reasons(send(s, { type: 'element.buyEssence' }))).toEqual(['only 2 can be bought']);
    s.mode.levels.earth = 0;
    for (let w = 1; w <= 50; w++) skipWave(s);
    expect(s.mode.essence).toBe(3);
  });

  it('refuses picks and essence in All Random', () => {
    const s = newElementRun({ picks: 'allRandom' });
    s.mode.lumber = 3;
    expect(reasons(send(s, { type: 'element.summon', element: 'fire' }))).toEqual(['All Random picks your Elements']);
    expect(reasons(send(s, { type: 'element.buyEssence' }))).toEqual(['All Random can\'t buy Pure Essence']);
  });

  it('rejects malformed commands with a readable reason', () => {
    const s = newElementRun();
    expect(reasons(send(s, { type: 'element.summon', element: 'plasma' }))).toEqual(['summon needs an Element: water, fire, nature, earth, light or dark']);
    expect(reasons(send(s, { type: 'element.build', spec: 'basic_arrow_tower' }))).toEqual(['build needs spec, col and row']);
    expect(reasons(send(s, { type: 'element.sell', tower: 99 }))).toEqual(['no such tower']);
    expect(reasons(send(s, { type: 'element.dance' }))).toEqual(['unknown command']);
  });
});

describe('creepOnRoute', () => {
  it('puts a test creep on the route', () => {
    const s = newElementRun();
    const c = creepOnRoute(s, 'full-1', 684);
    expect({ x: c.x, y: c.y }).toEqual({ x: 832, y: 2048 });
  });
});
