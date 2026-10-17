import { createStore, del, get, set, type UseStore } from 'idb-keyval';
import { DIFFICULTIES, original, type Difficulty } from '../sim';

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

/**
 * The Original's Campaign, kept apart from Run saves: a save code holds a
 * Run, never the Campaign. Stars earned, Stages finished and the unlocks all
 * follow from the Stage Records.
 */
export interface CampaignProgress {
  /** Stage Records by Stage number. A Stage has one once it is won. */
  stages: Record<string, original.StageRecord>;
  /** The Talents held, chosen on the Stage-select screen. */
  talents: string[];
}

export const EMPTY_CAMPAIGN: Readonly<CampaignProgress> = { stages: {}, talents: [] };

export interface CampaignUpdate {
  readonly before: CampaignProgress;
  readonly after: CampaignProgress;
  /** False if the new Campaign could not be written; `after` still holds for this screen. */
  readonly saved: boolean;
}

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
  /**
   * `board` keeps Records apart within one Game Mode and Difficulty when their
   * results don't compare, such as Element's Full and Express. Without one the
   * Record is the Game Mode's only one, as Gem's is.
   */
  loadRecord(modeId: string, difficulty: Difficulty, board?: string): Promise<ModeRecord>;
  loadRecords(modeId: string, board?: string): Promise<Record<Difficulty, ModeRecord>>;
  /** Merges a finished Run into its Record. Calls are queued, so two quick results both count. */
  recordResult(modeId: string, difficulty: Difficulty, result: RunResult, board?: string): Promise<RecordUpdate>;
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<boolean>;
  loadCampaign(): Promise<CampaignProgress>;
  /**
   * Reads the Campaign, changes it with `change` and writes the result. Calls
   * are queued, so a Run's end and a Talent bought at once both count.
   */
  updateCampaign(change: (campaign: CampaignProgress) => CampaignProgress): Promise<CampaignUpdate>;
  /** Best effort; resolves to whether storage is persistent. Safe to call any number of times. */
  requestPersistence(): Promise<boolean>;
}

interface StoredRun {
  version: number;
  savedAt: number;
  json: string;
}

const runKey = (modeId: string): string => `run/${modeId}`;
/** `record/gem/normal`; with a board, `record/element/express/normal`. */
const recordKey = (modeId: string, difficulty: Difficulty, board?: string): string =>
  board ? `record/${modeId}/${board}/${difficulty}` : `record/${modeId}/${difficulty}`;
const SETTINGS_KEY = 'settings';
const CAMPAIGN_KEY = 'campaign/original';

/** Every call resolves; failures are logged and reported as false, undefined or defaults. */
export function createStorage(kv: KeyValueStore, options: StorageOptions = {}): AppStorage {
  const now = options.now ?? Date.now;
  const persist = options.persist ?? persistBrowserStorage;
  let persistence: Promise<boolean> | undefined;
  let recordQueue: Promise<unknown> = Promise.resolve();
  let campaignQueue: Promise<unknown> = Promise.resolve();

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

  async function loadRecord(modeId: string, difficulty: Difficulty, board?: string): Promise<ModeRecord> {
    return toRecord(await read(recordKey(modeId, difficulty, board)));
  }

  async function loadRecords(modeId: string, board?: string): Promise<Record<Difficulty, ModeRecord>> {
    const entries = await Promise.all(DIFFICULTIES.map(async (d) => [d, await loadRecord(modeId, d, board)] as const));
    return Object.fromEntries(entries) as Record<Difficulty, ModeRecord>;
  }

  async function mergeResult(modeId: string, difficulty: Difficulty, result: RunResult, board?: string): Promise<RecordUpdate> {
    const prev = await loadRecord(modeId, difficulty, board);
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
    const saved = await write(recordKey(modeId, difficulty, board), record);
    return { record, improved, saved };
  }

  function recordResult(modeId: string, difficulty: Difficulty, result: RunResult, board?: string): Promise<RecordUpdate> {
    const update = recordQueue.then(() => mergeResult(modeId, difficulty, result, board));
    recordQueue = update.catch(() => undefined);
    return update;
  }

  async function loadSettings(): Promise<Settings> {
    return toSettings(await read(SETTINGS_KEY));
  }

  async function loadCampaign(): Promise<CampaignProgress> {
    return toCampaign(await read(CAMPAIGN_KEY));
  }

  function updateCampaign(change: (campaign: CampaignProgress) => CampaignProgress): Promise<CampaignUpdate> {
    const update = campaignQueue.then(async () => {
      const before = await loadCampaign();
      const after = toCampaign(change(structuredClone(before)));
      const saved = await write(CAMPAIGN_KEY, after);
      return { before, after, saved };
    });
    campaignQueue = update.catch(() => undefined);
    return update;
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
    loadCampaign,
    updateCampaign,
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

/** Most Stars one Stage pays: what keeping every life earns. */
const STAGE_STARS = original.starsFor(Number.POSITIVE_INFINITY);

function toStageRecord(value: unknown): original.StageRecord | null {
  if (!isObject(value)) return null;
  const stars = value.stars;
  const hardest = value.hardest;
  const fastest = value.fastest;
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > STAGE_STARS) return null;
  return {
    stars,
    hardest: typeof hardest === 'string' && (DIFFICULTIES as readonly string[]).includes(hardest) ? hardest as Difficulty : null,
    fastest: typeof fastest === 'number' && Number.isFinite(fastest) && fastest > 0 ? fastest : null,
  };
}

/**
 * Keeps each Stage Record that reads right, by a whole Stage number. Talents
 * a player couldn't hold (an unknown id, two from one row) are all dropped,
 * which refunds their Stars: a reset is free anyway.
 */
function toCampaign(value: unknown): CampaignProgress {
  const c = isObject(value) ? value : {};
  const stages: Record<string, original.StageRecord> = {};
  if (isObject(c.stages)) {
    for (const [key, raw] of Object.entries(c.stages)) {
      const record = /^[1-9]\d*$/.test(key) ? toStageRecord(raw) : null;
      if (record) stages[key] = record;
    }
  }
  const held = Array.isArray(c.talents) ? c.talents : [];
  const talents = original.talentsProblem(held) === null ? (held as string[]).slice() : [];
  return { stages, talents };
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
  loadCampaign,
  updateCampaign,
  requestPersistence,
} = storage;
