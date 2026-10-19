import { describe, expect, it } from 'vitest';
import { filterBatch, inputDelay } from '../../src/net/lockstep';
import {
  MAX_MESSAGE_BYTES, NET_VERSION, SNAP_PART_CHARS, createSnapAssembler, deflateCodec, encodeMessage, parseMessage, parsePayload, snapParts,
  type NetMessage,
} from '../../src/net/protocol';
import { decodeReport, encodeReport, type DesyncReport } from '../../src/net/report';
import { BUILD, SIM_HASH } from '../../src/net/version';

const MESSAGES: NetMessage[] = [
  { t: 'hello', net: NET_VERSION, snap: 1, sim: 'abcd1234', build: 'a1b2c3d', browser: 'Safari 26', session: null, stepped: -1, received: -1 },
  { t: 'hello', net: NET_VERSION, snap: 1, sim: 'abcd1234', build: 'dev', browser: 'x', session: '0123456789abcdef', stepped: 120, received: 123 },
  { t: 'pick', race: 'mirefolk' },
  { t: 'ready', on: true },
  { t: 'ready', on: false, n: 300 },
  { t: 'ping', at: 1234.5 },
  { t: 'pong', at: 1234.5 },
  { t: 'start', session: '0123456789abcdef', options: { mode: 'linewars', seed: 9 }, delay: 2, turn: 3, every: 30, hash: '00ff00ff' },
  { t: 'started', hash: '00ff00ff' },
  { t: 'go', n: 0, ms: 3000 },
  { t: 'resume', n: 41, ms: 3000 },
  { t: 'turn', n: 7, c: [] },
  { t: 'turn', n: 8, c: [{ type: 'lw.send', side: 1, send: 'snowlings' }], p: 'away', h: [30, '12345678'] },
  { t: 'away' },
  { t: 'back' },
  { t: 'rematch' },
  { t: 'desync', tick: 330, hashes: ['11111111', '22222222'] },
  { t: 'snap', n: 50, hash: 'abcdef01', k: 0, of: 1, data: 'AbC-_9' },
  { t: 'end', why: 'concede' },
];

describe('Versus messages', () => {
  it('parse back exactly what was sent, every kind', () => {
    for (const m of MESSAGES) {
      const text = encodeMessage(m);
      expect(JSON.parse(text).v).toBe(NET_VERSION);
      expect(parseMessage(text)).toEqual({ ok: true, message: m });
    }
  });

  it('refuse malformed, oversized, unknown and other-version messages', () => {
    const refusal = (text: string): string => {
      const r = parseMessage(text);
      return r.ok ? 'ok' : r.problem;
    };
    expect(refusal('{not json')).toBe('malformed');
    expect(refusal('[1,2]')).toBe('malformed');
    expect(refusal('"turn"')).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1 }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'shout' }))).toBe('unknown');
    expect(refusal(JSON.stringify({ v: 1, t: 'constructor' }))).toBe('unknown');
    expect(refusal(JSON.stringify({ v: 2, t: 'turn', n: 1, c: [] }))).toBe('version');
    expect(parseMessage(JSON.stringify({ v: 2, t: 'hello', build: 'e4f5a6b' }))).toEqual({ ok: false, problem: 'version', build: 'e4f5a6b' });
    expect(refusal(JSON.stringify({ v: 1, t: 'turn', n: -1, c: [] }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'turn', n: 1.5, c: [] }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'turn', n: 1, c: {} }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'turn', n: 1, c: [], p: 'nap' }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'turn', n: 1, c: [], h: [30, 'XYZ'] }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'pick', race: 'orcs' }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'hello', net: 1, snap: 1, sim: 'abcd1234', build: 'x', browser: 'y', session: 'short', stepped: -1, received: -1 }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'snap', n: 1, hash: 'abcdef01', k: 2, of: 2, data: '' }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'snap', n: 1, hash: 'abcdef01', k: 0, of: 1, data: 'a+b' }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'go', n: 0, ms: 1e9 }))).toBe('malformed');
    expect(refusal(JSON.stringify({ v: 1, t: 'end', why: 'bored' }))).toBe('malformed');
    const big = JSON.stringify({ v: 1, t: 'turn', n: 1, c: ['x'.repeat(MAX_MESSAGE_BYTES)] });
    expect(refusal(big)).toBe('oversized');
    // Counted in UTF-8 bytes, not characters.
    expect(refusal(JSON.stringify({ v: 1, t: 'turn', n: 1, c: ['é'.repeat(MAX_MESSAGE_BYTES / 2)] }))).toBe('oversized');
    expect(() => encodeMessage({ t: 'turn', n: 1, c: ['x'.repeat(MAX_MESSAGE_BYTES)] })).toThrow(RangeError);
  });

  it('keep only lw.* commands naming the Batch\'s own Side, and at most 16 of them', () => {
    const mine = (i: number) => ({ type: 'lw.send', side: 1, send: 'snowlings', i });
    const batch: unknown[] = [
      mine(0), { type: 'lw.send', side: 0, send: 'snowlings' }, { type: 'startWave' }, { type: 'place', side: 1 }, { side: 1 },
      { type: 'lw.send', side: '1' }, null, 7, 'lw.send', [mine(99)], Object.assign(Object.create({ side: 1 }), { type: 'lw.sell' }),
      ...Array.from({ length: 20 }, (_, i) => mine(i + 1)),
    ];
    const kept = filterBatch(batch, 1);
    expect(kept).toHaveLength(16);
    expect(kept.map((c) => (c as { i?: unknown }).i)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(filterBatch(batch, 0)).toEqual([{ type: 'lw.send', side: 0, send: 'snowlings' }]);
  });

  it('set the Input Delay from the lobby\'s round trips: 2 up to about 300 ms, 5 at worst', () => {
    expect(inputDelay([])).toBe(3);
    expect(inputDelay([40, 60, 80, 100])).toBe(2);
    expect(inputDelay(Array.from({ length: 20 }, () => 300))).toBe(2);
    expect(inputDelay([...Array.from({ length: 18 }, () => 280), 330, 340])).toBe(2);
    expect(inputDelay([...Array.from({ length: 16 }, () => 280), 330, 330, 340, 340])).toBe(3);
    expect(inputDelay([600, 610, 620])).toBe(4);
    expect(inputDelay([2000])).toBe(5);
  });

  it('send a snapshot deflated in 16 KiB parts and put it back together in any order', async () => {
    const text = JSON.stringify({ kind: 'sync', turn: 9, state: JSON.stringify({ filler: Array.from({ length: 6000 }, (_, i) => (i * 7919) % 104729) }) });
    const data = await deflateCodec.pack(text);
    const parts = snapParts(9, 'abcdef01', data);
    expect(parts.length).toBe(Math.ceil(data.length / SNAP_PART_CHARS));
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.data.length).toBeLessThanOrEqual(SNAP_PART_CHARS);
      expect(parseMessage(encodeMessage(p)).ok).toBe(true);
    }
    const a = createSnapAssembler();
    const shuffled = [...parts].reverse();
    for (const p of shuffled.slice(0, -1)) expect(a.add(p)).toBeNull();
    // A part of another snapshot starts it over.
    expect(a.add({ ...parts[0]!, n: 10 })).toBeNull();
    for (const p of shuffled) {
      const whole = a.add(p);
      if (whole) {
        expect(whole.n).toBe(9);
        expect(await deflateCodec.unpack(whole.data)).toBe(text);
      }
    }
    expect(parsePayload(text)).toMatchObject({ kind: 'sync', turn: 9 });
    expect(parsePayload('{"kind":"rejoin","state":"{}","turn":1}')).toBeNull();
    await expect(deflateCodec.unpack('!!')).rejects.toThrow();
  });

  it('copy a desync report as a TTDR1 code and read it back', async () => {
    const report: DesyncReport = {
      v: 1, side: 1, builds: ['a1b2c3d', 'e4f5a6b'], browsers: ['Chrome 141', 'Safari 26'], tick: 900, hashes: ['11111111', '22222222'],
      pauseTick: 960, replay: { mode: 'linewars', seed: 5, difficulty: 'normal', log: [{ tick: 3, command: { type: 'lw.send', side: 0, send: 'snowlings' } }], until: 960 },
      state: '{"v":1}',
    };
    const code = await encodeReport(report);
    expect(code).toMatch(/^TTDR1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
    expect(await decodeReport(code)).toEqual(report);
    await expect(decodeReport(code.slice(0, -4))).rejects.toThrow(/damaged/);
    await expect(decodeReport('TTD1.00000000.abc')).rejects.toThrow(/desync report/);
  });

  it('see the build\'s sim hash and commit under vitest, as Vite defines them', () => {
    expect(SIM_HASH).toMatch(/^[0-9a-f]{8}$/);
    expect(SIM_HASH).not.toBe('00000000');
    expect(BUILD).toMatch(/^([0-9a-f]{7,}|dev)$/);
  });
});
