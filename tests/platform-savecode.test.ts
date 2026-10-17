import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave, SaveCodeError } from '../src/platform/savecode';

const state = {
  mode: 'gem',
  version: 1,
  tick: 48_213,
  rng: { s: [2693262067, 11749833, 2265367787, 7] },
  lives: 17.5,
  note: 'Ünïcødé and emoji 💎 survive',
  towers: Array.from({ length: 80 }, (_, i) => ({ id: i, kind: 'ruby', quality: i % 6, col: i % 24, row: (i * 7) % 14 })),
  creeps: [],
  flags: { paused: true, speed: 2, recipe: null },
};

async function expectProblem(code: string, problem: SaveCodeError['problem']): Promise<void> {
  const error = await decodeSave(code).catch((err: unknown) => err);
  expect(error).toBeInstanceOf(SaveCodeError);
  expect((error as SaveCodeError).problem).toBe(problem);
  expect((error as SaveCodeError).message).not.toBe('');
}

describe('save codes', () => {
  it('round-trips a JSON game state exactly', async () => {
    const code = await encodeSave(state);
    expect(await decodeSave(code)).toEqual(state);
  });

  it('is plain copyable text: a versioned prefix, a checksum, then base64url', async () => {
    const code = await encodeSave(state);
    expect(code).toMatch(/^TTD1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
  });

  it('compresses, so a big state stays short enough to paste', async () => {
    const code = await encodeSave(state);
    expect(code.length).toBeLessThan(JSON.stringify(state).length / 3);
  });

  it('ignores the spaces and line breaks people add when pasting', async () => {
    const code = await encodeSave(state);
    const mangled = `  \n${code.match(/.{1,40}/g)?.join('\r\n') ?? ''}\u200b \n`;
    expect(await decodeSave(mangled)).toEqual(state);
  });

  it('rejects a code that was cut off', async () => {
    const code = await encodeSave(state);
    for (const cut of [1, 2, 3, 10, Math.floor(code.length / 2)]) {
      await expectProblem(code.slice(0, code.length - cut), 'damaged');
    }
    await expectProblem(code.slice(0, 9), 'damaged');
  });

  it('rejects a code with one character changed', async () => {
    const code = await encodeSave(state);
    const i = code.length - 20;
    const flipped = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    await expectProblem(flipped, 'damaged');
  });

  it('says when a code is not a save code at all', async () => {
    await expectProblem('', 'not-a-save');
    await expectProblem('hello there', 'not-a-save');
    await expectProblem('{"wave": 5}', 'not-a-save');
  });

  it('says when a code comes from a newer version of the app', async () => {
    const code = await encodeSave(state);
    await expectProblem(code.replace(/^TTD1/, 'TTD2'), 'newer-version');
  });

  it('round-trips primitives too', async () => {
    for (const value of [0, 'text', null, true, [1, [2, [3]]]]) {
      expect(await decodeSave(await encodeSave(value))).toEqual(value);
    }
  });
});
