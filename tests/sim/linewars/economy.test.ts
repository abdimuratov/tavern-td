import { describe, expect, it } from 'vitest';
import {
  FIELD_COLS, LIVE_CAP, LW_SENDS, RIVAL_INCOME, START_GOLD, START_INCOME, START_LIVES, SUDDEN_DEATH_AT, SUDDEN_HP_PER_MINUTE,
} from '../../../src/content/linewars';
import { RACES } from '../../../src/content/maul';
import { CELL, DIFFICULTIES, TICK_RATE, killCreep, linewars, step } from '../../../src/sim';
import { modeEvents, newRun, ofType, purse, reasons, run, runTo, send, type LwRun } from './helpers';

const TICK = 10 * TICK_RATE;
const sim = (state: LwRun) => ({ state, rules: linewars.LW_RULES as never, events: [] });

describe('a Run', () => {
  it('starts each Side with 150 gold, 10 income and 30 lives, and has no Waves', () => {
    const s = newRun();
    expect(purse(s)).toMatchObject({ gold: [START_GOLD, START_GOLD], income: [START_INCOME, START_INCOME], lives: [START_LIVES, START_LIVES] });
    // The core's gold copies Side 0's; its lives are a sentinel that never ends the Run.
    expect([s.gold, s.lives, s.wave.total, s.phase]).toEqual([START_GOLD, 1, 0, 'build']);
    expect(reasons(send(s, { type: 'startWave' }))).toEqual(['no Waves left']);
    expect(reasons(send(s, { type: 'lw.nothing', side: 0 }))).toEqual(['unknown command']);
  });

  it('draws the Rival\'s Race from the Run\'s RNG unless New Run names one', () => {
    const drawn = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) drawn.add(newRun({ seed, rivalRace: 'random' }).mode.sides[1].race);
    expect([...drawn].every((r) => (RACES as readonly string[]).includes(r))).toBe(true);
    expect(drawn.size).toBeGreaterThan(1);
    expect(newRun({ rivalRace: 'mirefolk' }).mode.sides[1].race).toBe('mirefolk');
    expect(() => newRun({ race: 'goblins' as never })).toThrow();
  });
});

describe('the income tick', () => {
  it('pays both Sides every 10 s from 0:10, the Rival times the Difficulty\'s factor and you never scaled', () => {
    for (const difficulty of DIFFICULTIES) {
      const s = newRun({ difficulty });
      let events = run(s, TICK);
      expect(modeEvents(events, 'lw.income')).toEqual([]);
      events = run(s, 1);
      const pay = Math.floor(START_INCOME * RIVAL_INCOME[difficulty]);
      expect(modeEvents(events, 'lw.income')[0]!.data).toEqual({ pay: [START_INCOME, pay], income: [START_INCOME, START_INCOME] });
      expect(purse(s).gold).toEqual([START_GOLD + START_INCOME, START_GOLD + pay]);
      expect(ofType(events, 'goldChanged')).toEqual([{ type: 'goldChanged', gold: START_GOLD + START_INCOME, delta: START_INCOME }]);
      expect(linewars.lwStatus(s).sides[1]).toMatchObject({ pay, factor: RIVAL_INCOME[difficulty] });
    }
  });
});

describe('what the HUD asks', () => {
  it('counts down to the income tick and the next unlock, and lists the Rival\'s creeps in your Field', () => {
    const s = newRun({ gold: 5000 });
    expect(linewars.lwStatus(s).incomeIn).toBe(TICK);
    run(s, TICK);
    expect(linewars.lwStatus(s).incomeIn).toBe(0);
    run(s, 1);
    expect(linewars.lwStatus(s).incomeIn).toBe(TICK - 1);
    expect(linewars.nextUnlock(s)).toEqual({ send: 'snowlings', name: 'Snowlings', ticksLeft: 20 * TICK_RATE - s.tick });
    runTo(s, LW_SENDS.harpies.unlock * TICK_RATE + 1);
    expect(linewars.nextUnlock(s)?.send).toBe('ice_golem');
    send(s, { type: 'lw.send', side: 1, send: 'harpies' }, { type: 'lw.send', side: 1, send: 'snowlings' });
    expect(linewars.inField(s, 0)).toEqual([
      { send: 'snowlings', name: 'Snowlings', count: 3, flying: false, boss: false },
      { send: 'harpies', name: 'Harpies', count: 2, flying: true, boss: false },
    ]);
    expect(linewars.inField(s, 1)).toEqual([]);
    expect(linewars.sendOptions(s, 1).filter((o) => o.flying).map((o) => o.send)).toEqual(['harpies']);
  });
});

describe('Sends', () => {
  it('stay locked until their unlock, then hold 1 in Stock and refill one at a time up to the cap', () => {
    const s = newRun({ gold: 5000 });
    const snow = LW_SENDS.snowlings;
    runTo(s, snow.unlock * TICK_RATE);
    // The unlock is processed after this tick's commands.
    let events = send(s, { type: 'lw.send', side: 0, send: 'snowlings' });
    expect(reasons(events)).toEqual(['Snowlings unlocks at 0:20']);
    expect(modeEvents(events, 'lw.unlock').map((e) => e.data)).toEqual([{ send: 'snowlings' }]);
    expect(s.mode.sides.map((x) => x.stock['snowlings'])).toEqual([1, 1]);
    events = send(s, { type: 'lw.send', side: 0, send: 'snowlings' }, { type: 'lw.send', side: 0, send: 'snowlings' });
    expect(reasons(events)).toEqual(['no Snowlings in Stock']);
    // Restocking runs from the unlock while Stock is below the cap, one every 5 s.
    runTo(s, (snow.unlock + snow.restock) * TICK_RATE);
    expect(s.mode.sides[0].stock['snowlings']).toBe(0);
    run(s, 1);
    expect(s.mode.sides[0].stock['snowlings']).toBe(1);
    expect(s.mode.sides[1].stock['snowlings']).toBe(2);
    runTo(s, (snow.unlock + snow.restock * (snow.cap - 1)) * TICK_RATE + 1);
    expect(s.mode.sides.map((x) => x.stock['snowlings'])).toEqual([snow.cap - 1, snow.cap]);
    // Full Stock pauses the restock; buying from it starts the next one from that moment.
    expect(s.mode.sides[1].restock['snowlings']).toBe(-1);
    run(s, 40, [{ type: 'lw.send', side: 1, send: 'snowlings' }]);
    expect(s.mode.sides[1].restock['snowlings']).toBe(s.tick - 40 + snow.restock * TICK_RATE);
    expect(linewars.sendOptions(s, 1)[0]).toMatchObject({ send: 'snowlings', stock: snow.cap - 1, restockIn: snow.restock * TICK_RATE - 40 });
    expect(linewars.sendOptions(s, 0)[9]).toMatchObject({ send: 'mammoth', stock: 0, unlockIn: 600 * TICK_RATE - s.tick });
  });

  it('cost the price, raise income at once, and put their creeps on random cells of the other Field\'s spawn row', () => {
    const s = newRun({ gold: 5000 });
    runTo(s, LW_SENDS.harpies.unlock * TICK_RATE + 1);
    const before = purse(s);
    const events = send(s, { type: 'lw.send', side: 0, send: 'snowlings' }, { type: 'lw.send', side: 1, send: 'harpies' });
    const sent = modeEvents(events, 'lw.sent').map((e) => e.data as { side: number; send: string; creeps: number[]; income: number });
    expect(sent.map((x) => [x.side, x.send, x.creeps.length, x.income])).toEqual([[0, 'snowlings', 3, 2], [1, 'harpies', 2, 5]]);
    expect(purse(s).gold).toEqual([before.gold[0] - LW_SENDS.snowlings.price, before.gold[1] - LW_SENDS.harpies.price]);
    expect(purse(s).income).toEqual([before.income[0] + 2, before.income[1] + 5]);
    expect(purse(s).live).toEqual([3, 2]);
    for (const x of sent) {
      const field = x.side === 0 ? 1 : 0;
      for (const id of x.creeps) {
        const c = s.creeps.find((k) => k.id === id)!;
        expect(linewars.creepField(c)).toBe(field);
        expect(Math.floor(c.y / CELL)).toBe(0);
        const colNow = Math.floor(c.x / CELL);
        expect(colNow >= FIELD_COLS[field][0] && colNow <= FIELD_COLS[field][1]).toBe(true);
        expect(c.maxHp).toBe(x.send === 'snowlings' ? LW_SENDS.snowlings.hp : LW_SENDS.harpies.hp);
      }
    }
    expect(s.mode.sides[1].inbound).toEqual([{ tick: s.tick - 1, send: 'snowlings', hp: 3 * LW_SENDS.snowlings.hp }]);
    // Spawn cells come from the Run's RNG: a pack doesn't all stand on one cell every time.
    const cells = new Set(sent[0]!.creeps.map((id) => s.creeps.find((k) => k.id === id)!.x));
    expect(cells.size).toBeGreaterThanOrEqual(1);
  });

  it('are refused without gold, and past the cap of 40 live creeps a Side', () => {
    const s = newRun();
    runTo(s, LW_SENDS.brawler.unlock * TICK_RATE + 1);
    s.mode.sides[0].gold = LW_SENDS.brawler.price - 1;
    expect(reasons(send(s, { type: 'lw.send', side: 0, send: 'brawler' }))).toEqual([`needs ${LW_SENDS.brawler.price} gold`]);
    s.mode.sides[0].live = LIVE_CAP - 2;
    expect(reasons(send(s, { type: 'lw.send', side: 0, send: 'snowlings' }))).toEqual(['40 of yours are already out']);
    s.mode.sides[0].live = LIVE_CAP - 3;
    expect(reasons(send(s, { type: 'lw.send', side: 0, send: 'snowlings' }))).toEqual([]);
    expect(s.mode.sides[0].live).toBe(LIVE_CAP);
    expect(reasons(send(s, { type: 'lw.send', side: 0, send: 'nope' }))).toEqual(['no such Send']);
  });

  it('pay their bounty to the defender for each kill, never scaled, and free the sender\'s cap', () => {
    const s = newRun({ gold: 500, difficulty: 'insane' });
    runTo(s, LW_SENDS.brawler.unlock * TICK_RATE + 1);
    send(s, { type: 'lw.send', side: 0, send: 'brawler' }, { type: 'lw.send', side: 1, send: 'brawler' });
    const gold = purse(s).gold;
    for (const c of [...s.creeps]) killCreep(sim(s), c, 0);
    step(s, []);
    expect(purse(s).gold).toEqual([gold[0] + LW_SENDS.brawler.bounty, gold[1] + LW_SENDS.brawler.bounty]);
    expect(purse(s).live).toEqual([0, 0]);
    expect(s.mode.sides.map((x) => [x.killed, x.bounty])).toEqual([[1, LW_SENDS.brawler.bounty], [1, LW_SENDS.brawler.bounty]]);
    // Side 0's score is its bounty so far.
    expect(s.mode.score).toBe(LW_SENDS.brawler.bounty);
  });

  it('bought in Sudden Death add no income and get 10% more HP for each minute since it began', () => {
    const s = newRun({ gold: 100000 });
    const sd = SUDDEN_DEATH_AT * TICK_RATE;
    runTo(s, sd - 1);
    const firstId = (modeEvents(send(s, { type: 'lw.send', side: 0, send: 'brute' }), 'lw.sent')[0]!.data as { creeps: number[] }).creeps[0]!;
    const first = s.creeps.find((c) => c.id === firstId)!;
    // Held still, so it is still walking when the next is bought.
    first.speed = 0;
    expect(s.mode.sides[0].income).toBe(START_INCOME + LW_SENDS.brute.income);
    runTo(s, sd + 90 * TICK_RATE);
    const events = send(s, { type: 'lw.send', side: 0, send: 'brute' });
    const sent = modeEvents(events, 'lw.sent')[0]!.data as { creeps: number[]; income: number };
    expect(sent.income).toBe(0);
    expect(s.mode.sides[0].income).toBe(START_INCOME + LW_SENDS.brute.income);
    expect(s.creeps.find((c) => c.id === sent.creeps[0])!.maxHp).toBe(Math.round(LW_SENDS.brute.hp * (1 + SUDDEN_HP_PER_MINUTE * 1.5)));
    // Creeps already walking keep theirs.
    expect(first.maxHp).toBe(LW_SENDS.brute.hp);
  });
});
