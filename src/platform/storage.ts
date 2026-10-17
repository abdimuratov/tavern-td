import { createStore, del, get, set, type UseStore } from 'idb-keyval';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'insane'];

/** The three IndexedDB calls this module needs, so tests can back it with a Map. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

/** The autosave of one Game Mode's Run in progress. */
export interface SavedRun<T> {
  /** Schema version of `data`, handed back so a newer build can migrate or drop an old autosave. */
  version: number;
  /** Epoch milliseconds. */
  savedAt: number;
  data: T;
}

/** The best results kept for one Game Mode and Difficulty. */
export interface ModeRecord {
  bestWave: number;
  bestScore: number;
  /** Seconds; null until the first win. */
  fastestWin: number | null;
  played: number;
  won: number;
}

export interface RunResult {
  /** The Wave reached. */
  wave: number;
  score: number;
  won: boolean;
  /** Length of the Run in seconds of play. */
  seconds: number;
}

export interface RecordUpdate {
  /** The Record as merged and stored. */
  record: ModeRecord;
  /** Which bests this Run beat, for a "new best" badge. A first Run beats an empty Record. */
  improved: { bestWave: boolean; bestScore: boolean; fastestWin: boolean };
  /** False if the merged Record could not be written; `improved` still holds for this screen. */
  saved: boolean;
}

export interface Settings {
  sound: boolean;
  /** 0–1. */
  volume: number;
  haptics: boolean;
  defaultSpeed: 1 | 2 | 3;
  showGrid: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  sound: true,
  volume: 0.8,
  haptics: true,
  defaultSpeed: 1,
  showGrid: true,
};

export const EMPTY_RECORD: Readonly<ModeRecord> = {
  bestWave: 0,
  bestScore: 0,
  fastestWin: null,
  played: 0,
  won: 0,
};

export interface StorageOptions {
  now?: () => number;
  /** Asks the browser not to evict our data. Called once, before the first write. */
  persist?: () => Promise<boolean>;
}

export interface AppStorage {
  /**
   * Overwrites the Game Mode's autosave. `data` is snapshotted as JSON before
   * this returns, so the caller can keep stepping the Run straight away.
   */
  saveRun<T>(modeId: string, data: T, version?: number): Promise<boolean>;
  loadRun<T = unknown>(modeId: string): Promise<SavedRun<T> | undefined>;
  clearRun(modeId: string): Promise<boolean>;
  /** Whether to offer Continue. */
  hasRun(modeId: string): Promise<boolean>;
  loadRecord(modeId: string, difficulty: Difficulty): Promise<ModeRecord>;
  loadRecords(modeId: string): Promise<Record<Difficulty, ModeRecord>>;
  /** Merges a finished Run into its Record. Calls are queued, so two quick results both count. */
  recordResult(modeId: string, difficulty: Difficulty, result: RunResult): Promise<RecordUpdate>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<boolean>;
  /** Best effort; resolves to whether storage is persistent. Safe to call any number of times. */
  requestPersistence(): Promise<boolean>;
}

interface StoredRun {
  version: number;
  savedAt: number;
  json: string;
}

const runKey = (modeId: string): string => `run/${modeId}`;
const recordKey = (modeId: string, difficulty: Difficulty): string => `record/${modeId}/${difficulty}`;
const SETTINGS_KEY = 'settings';

/** Every call resolves; failures are logged and reported as false, undefined or defaults. */
export function createStorage(kv: KeyValueStore, options: StorageOptions = {}): AppStorage {
  const now = options.now ?? Date.now;
  const persist = options.persist ?? persistBrowserStorage;
  let persistence: Promise<boolean> | undefined;
  let recordQueue: Promise<unknown> = Promise.resolve();

  const requestPersistence = (): Promise<boolean> =>
    (persistence ??= persist().catch((err: unknown) => {
      console.warn('[storage] persist() failed', err);
      return false;
    }));

  async function read(key: string): Promise<unknown> {
    try {
      return await kv.get(key);
    } catch (err) {
      console.warn(`[storage] read ${key} failed`, err);
      return undefined;
    }
  }

  async function write(key: string, value: unknown): Promise<boolean> {
    void requestPersistence();
    try {
      await kv.set(key, value);
      return true;
    } catch (err) {
      console.warn(`[storage] write ${key} failed`, err);
      return false;
    }
  }

  async function remove(key: string): Promise<boolean> {
    try {
      await kv.del(key);
      return true;
    } catch (err) {
      console.warn(`[storage] delete ${key} failed`, err);
      return false;
    }
  }

  function saveRun<T>(modeId: string, data: T, version = 1): Promise<boolean> {
    let json: string | undefined;
    try {
      json = JSON.stringify(data);
    } catch (err) {
      console.warn('[storage] Run state is not JSON-serializable', err);
    }
    if (json === undefined) return Promise.resolve(false);
    const stored: StoredRun = { version, savedAt: now(), json };
    return write(runKey(modeId), stored);
  }

  async function loadRun<T = unknown>(modeId: string): Promise<SavedRun<T> | undefined> {
    const stored = await read(runKey(modeId));
    if (!isStoredRun(stored)) return undefined;
    try {
      return { version: stored.version, savedAt: stored.savedAt, data: JSON.parse(stored.json) as T };
    } catch (err) {
      console.warn(`[storage] autosave for ${modeId} is corrupt`, err);
      return undefined;
    }
  }

  async function loadRecord(modeId: string, difficulty: Difficulty): Promise<ModeRecord> {
    return toRecord(await read(recordKey(modeId, difficulty)));
  }

  async function loadRecords(modeId: string): Promise<Record<Difficulty, ModeRecord>> {
    const entries = await Promise.all(DIFFICULTIES.map(async (d) => [d, await loadRecord(modeId, d)] as const));
    return Object.fromEntries(entries) as Record<Difficulty, ModeRecord>;
  }

  async function mergeResult(modeId: string, difficulty: Difficulty, result: RunResult): Promise<RecordUpdate> {
    const prev = await loadRecord(modeId, difficulty);
    const wave = count(result.wave);
    const score = count(result.score);
    const seconds = Number.isFinite(result.seconds) && result.seconds > 0 ? result.seconds : null;
    const improved = {
      bestWave: wave > prev.bestWave,
      bestScore: score > prev.bestScore,
      fastestWin: result.won && seconds !== null && (prev.fastestWin === null || seconds < prev.fastestWin),
    };
    const record: ModeRecord = {
      bestWave: Math.max(prev.bestWave, wave),
      bestScore: Math.max(prev.bestScore, score),
      fastestWin: improved.fastestWin ? seconds : prev.fastestWin,
      played: prev.played + 1,
      won: prev.won + (result.won ? 1 : 0),
    };
    const saved = await write(recordKey(modeId, difficulty), record);
    return { record, improved, saved };
  }

  function recordResult(modeId: string, difficulty: Difficulty, result: RunResult): Promise<RecordUpdate> {
    const update = recordQueue.then(() => mergeResult(modeId, difficulty, result));
    recordQueue = update.catch(() => undefined);
    return update;
  }

  async function loadSettings(): Promise<Settings> {
    return toSettings(await read(SETTINGS_KEY));
  }

  return {
    saveRun,
    loadRun,
    clearRun: (modeId) => remove(runKey(modeId)),
    hasRun: async (modeId) => isStoredRun(await read(runKey(modeId))),
    loadRecord,
    loadRecords,
    recordResult,
    loadSettings,
    saveSettings: (settings) => write(SETTINGS_KEY, toSettings(settings)),
    requestPersistence,
  };
}

/**
 * idb-keyval in its own database, opened on first use so importing this module
 * never touches IndexedDB. A failed call drops the connection so the next one
 * reopens it: Safari can lose its IndexedDB connection while the app sits in
 * the background.
 */
export function indexedDbStore(dbName = 'tavern-td', storeName = 'kv'): KeyValueStore {
  let store: UseStore | undefined;
  const run = async <T>(op: (s: UseStore) => Promise<T>): Promise<T> => {
    try {
      return await op((store ??= createStore(dbName, storeName)));
    } catch (err) {
      store = undefined;
      throw err;
    }
  };
  return {
    get: (key) => run((s) => get(key, s)),
    set: (key, value) => run((s) => set(key, value, s)),
    del: (key) => run((s) => del(key, s)),
  };
}

/** Installed web apps are usually granted this without a prompt (WebKit and Chrome use heuristics). */
async function persistBrowserStorage(): Promise<boolean> {
  const storage = globalThis.navigator?.storage;
  if (typeof storage?.persist !== 'function') return false;
  if (await storage.persisted()) return true;
  return storage.persist();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredRun(value: unknown): value is StoredRun {
  return isObject(value) && typeof value.version === 'number' && typeof value.savedAt === 'number' && typeof value.json === 'string';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function toRecord(value: unknown): ModeRecord {
  if (!isObject(value)) return { ...EMPTY_RECORD };
  const fastest = value.fastestWin;
  return {
    bestWave: count(value.bestWave),
    bestScore: count(value.bestScore),
    fastestWin: typeof fastest === 'number' && Number.isFinite(fastest) && fastest > 0 ? fastest : null,
    played: count(value.played),
    won: count(value.won),
  };
}

/** Keeps each valid field and falls back to the default for the rest, so an old or damaged blob still loads. */
function toSettings(value: unknown): Settings {
  const s = isObject(value) ? value : {};
  const d = DEFAULT_SETTINGS;
  const speed = s.defaultSpeed;
  return {
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
    volume: typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : d.volume,
    haptics: typeof s.haptics === 'boolean' ? s.haptics : d.haptics,
    defaultSpeed: speed === 1 || speed === 2 || speed === 3 ? speed : d.defaultSpeed,
    showGrid: typeof s.showGrid === 'boolean' ? s.showGrid : d.showGrid,
  };
}

const storage = createStorage(indexedDbStore());

export const {
  saveRun,
  loadRun,
  clearRun,
  hasRun,
  loadRecord,
  loadRecords,
  recordResult,
  loadSettings,
  saveSettings,
  requestPersistence,
} = storage;
