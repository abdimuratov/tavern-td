import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStorage, DEFAULT_SETTINGS, type KeyValueStore } from '../src/platform/storage';

/** A Map that clones on the way in and out, as IndexedDB does. */
function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => structuredClone(data.get(key)),
    set: async (key, value) => void data.set(key, structuredClone(value)),
    del: async (key) => void data.delete(key),
  };
}

const failing: KeyValueStore = {
  get: () => Promise.reject(new Error('IndexedDB connection lost')),
  set: () => Promise.reject(new Error('QuotaExceededError')),
  del: () => Promise.reject(new Error('IndexedDB connection lost')),
};

function setup(kv: KeyValueStore = memoryStore()) {
  const persist = vi.fn(async () => true);
  let clock = 1_000;
  const storage = createStorage(kv, { now: () => clock, persist });
  return { storage, persist, tick: (ms: number) => (clock += ms) };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('Run autosave', () => {
  it('round-trips one slot per Game Mode with its version and save time', async () => {
    const { storage } = setup();
    expect(await storage.hasRun('gem')).toBe(false);
    expect(await storage.saveRun('gem', { wave: 7, towers: [[1, 2]] }, 3)).toBe(true);
    expect(await storage.saveRun('element', { wave: 2 })).toBe(true);

    expect(await storage.hasRun('gem')).toBe(true);
    expect(await storage.loadRun('gem')).toEqual({ version: 3, savedAt: 1_000, data: { wave: 7, towers: [[1, 2]] } });
    expect((await storage.loadRun('element'))?.version).toBe(1);
  });

  it('snapshots the state when called, so stepping on afterwards does not leak into the save', async () => {
    const { storage } = setup();
    const state = { tick: 10 };
    const saving = storage.saveRun('gem', state);
    state.tick = 11;
    await saving;
    expect((await storage.loadRun<{ tick: number }>('gem'))?.data.tick).toBe(10);
  });

  it('overwrites the slot and clears it', async () => {
    const { storage, tick } = setup();
    await storage.saveRun('gem', { wave: 1 });
    tick(500);
    await storage.saveRun('gem', { wave: 2 });
    expect(await storage.loadRun('gem')).toMatchObject({ savedAt: 1_500, data: { wave: 2 } });
    expect(await storage.clearRun('gem')).toBe(true);
    expect(await storage.hasRun('gem')).toBe(false);
    expect(await storage.loadRun('gem')).toBeUndefined();
  });

  it('treats a damaged slot as no Run', async () => {
    const kv = memoryStore();
    const { storage } = setup(kv);
    kv.data.set('run/gem', 'garbage');
    expect(await storage.hasRun('gem')).toBe(false);
    kv.data.set('run/gem', { version: 1, savedAt: 1, json: '{"cut off' });
    expect(await storage.loadRun('gem')).toBeUndefined();
  });

  it('rejects state that is not JSON without throwing', async () => {
    const { storage } = setup();
    expect(await storage.saveRun('gem', { big: 1n })).toBe(false);
  });
});

describe('failures never reach the caller', () => {
  it('reports false, undefined or defaults when IndexedDB fails', async () => {
    const { storage } = setup(failing);
    expect(await storage.saveRun('gem', { wave: 1 })).toBe(false);
    expect(await storage.loadRun('gem')).toBeUndefined();
    expect(await storage.hasRun('gem')).toBe(false);
    expect(await storage.clearRun('gem')).toBe(false);
    expect(await storage.saveSettings(DEFAULT_SETTINGS)).toBe(false);
    expect(await storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    const update = await storage.recordResult('gem', 'normal', { wave: 5, score: 10, won: false, seconds: 60 });
    expect(update.saved).toBe(false);
    expect(update.improved.bestWave).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('survives a store that throws synchronously, like a missing indexedDB', async () => {
    const throwing: KeyValueStore = {
      get: () => { throw new ReferenceError('indexedDB is not defined'); },
      set: () => { throw new ReferenceError('indexedDB is not defined'); },
      del: () => { throw new ReferenceError('indexedDB is not defined'); },
    };
    const { storage } = setup(throwing);
    expect(await storage.saveRun('gem', {})).toBe(false);
    expect(await storage.loadRecord('gem', 'easy')).toMatchObject({ played: 0 });
  });

  it('asks for persistent storage once, on the first write', async () => {
    const { storage, persist } = setup();
    await storage.loadSettings();
    expect(persist).not.toHaveBeenCalled();
    await storage.saveRun('gem', {});
    await storage.saveSettings(DEFAULT_SETTINGS);
    expect(await storage.requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('Records', () => {
  it('starts empty and counts a first Run as a new best', async () => {
    const { storage } = setup();
    expect(await storage.loadRecord('gem', 'hard')).toEqual({ bestWave: 0, bestScore: 0, fastestWin: null, played: 0, won: 0 });
    const update = await storage.recordResult('gem', 'hard', { wave: 12, score: 3400, won: false, seconds: 900 });
    expect(update.improved).toEqual({ bestWave: true, bestScore: true, fastestWin: false });
    expect(update.record).toEqual({ bestWave: 12, bestScore: 3400, fastestWin: null, played: 1, won: 0 });
  });

  it('keeps the best of each field and says which ones improved', async () => {
    const { storage } = setup();
    await storage.recordResult('gem', 'normal', { wave: 50, score: 9000, won: true, seconds: 2400 });
    const slower = await storage.recordResult('gem', 'normal', { wave: 50, score: 9500, won: true, seconds: 2600 });
    expect(slower.improved).toEqual({ bestWave: false, bestScore: true, fastestWin: false });
    const loss = await storage.recordResult('gem', 'normal', { wave: 20, score: 100, won: false, seconds: 600 });
    expect(loss.improved).toEqual({ bestWave: false, bestScore: false, fastestWin: false });
    const faster = await storage.recordResult('gem', 'normal', { wave: 50, score: 9100, won: true, seconds: 2000 });
    expect(faster.improved.fastestWin).toBe(true);
    expect(await storage.loadRecord('gem', 'normal')).toEqual({
      bestWave: 50, bestScore: 9500, fastestWin: 2000, played: 4, won: 3,
    });
  });

  it('keeps each Game Mode and Difficulty apart', async () => {
    const { storage } = setup();
    await storage.recordResult('gem', 'easy', { wave: 30, score: 1, won: false, seconds: 1 });
    await storage.recordResult('element', 'easy', { wave: 4, score: 1, won: false, seconds: 1 });
    const gem = await storage.loadRecords('gem');
    expect(gem.easy.bestWave).toBe(30);
    expect(gem.insane.played).toBe(0);
    expect((await storage.loadRecord('element', 'easy')).bestWave).toBe(4);
  });

  it('counts results that arrive together', async () => {
    const { storage } = setup();
    await Promise.all([
      storage.recordResult('gem', 'normal', { wave: 3, score: 1, won: false, seconds: 1 }),
      storage.recordResult('gem', 'normal', { wave: 9, score: 1, won: false, seconds: 1 }),
    ]);
    expect(await storage.loadRecord('gem', 'normal')).toMatchObject({ played: 2, bestWave: 9 });
  });

  it('ignores nonsense numbers instead of storing them', async () => {
    const { storage } = setup();
    const update = await storage.recordResult('gem', 'normal', { wave: NaN, score: -5, won: true, seconds: Infinity });
    expect(update.record).toEqual({ bestWave: 0, bestScore: 0, fastestWin: null, played: 1, won: 1 });
  });
});

describe('settings', () => {
  it('starts from the defaults', async () => {
    const { storage } = setup();
    expect(await storage.loadSettings()).toEqual({ sound: true, volume: 0.8, haptics: true, defaultSpeed: 1, showGrid: true });
  });

  it('round-trips and repairs damaged fields one by one', async () => {
    const kv = memoryStore();
    const { storage } = setup(kv);
    const mine = { sound: false, volume: 0.3, haptics: false, defaultSpeed: 2, showGrid: false } as const;
    expect(await storage.saveSettings(mine)).toBe(true);
    expect(await storage.loadSettings()).toEqual(mine);

    kv.data.set('settings', { sound: 'yes', volume: 7, defaultSpeed: 5, showGrid: false });
    expect(await storage.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, volume: 1, showGrid: false });
  });
});
