import { createRun, gem, step, type Command, type Difficulty, type GameState, type SimEvent, type Tower } from '../../../src/sim';

export type GemRun = gem.GemGameState;

export function newGemRun(seed = 1, difficulty: Difficulty = 'normal'): GemRun {
  return createRun({ mode: 'gem', seed, difficulty }) as GemRun;
}

/** One tick with these commands. */
export function send(state: GameState, ...commands: Command[]): SimEvent[] {
  return step(state, commands);
}

export function ofType<T extends SimEvent['type']>(events: readonly SimEvent[], type: T): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

export function reasons(events: readonly SimEvent[]): string[] {
  return ofType(events, 'rejected').map((e) => e.reason);
}

export function modeEvents(events: readonly SimEvent[], name: string): Extract<SimEvent, { type: 'mode' }>[] {
  return ofType(events, 'mode').filter((e) => e.name === name);
}

/** Steps until the Wave in progress ends (or the Run does). */
export function finishWave(state: GameState, max = 30 * 600): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max && state.phase === 'wave'; i++) all.push(...step(state, []));
  return all;
}

export function towerAtId(state: GameState, id: number): Tower {
  const t = state.towers.find((x) => x.id === id);
  if (!t) throw new Error(`no tower ${id}`);
  return t;
}

/** Anchors (col, row) for Draft gems in a row along the open field south of checkpoint 2–3's lane. */
export const OPEN_SPOTS: readonly (readonly [number, number])[] = [
  [42, 20], [44, 20], [46, 20], [48, 20], [50, 20], [42, 24], [44, 24], [46, 24], [48, 24], [50, 24],
  [58, 20], [60, 20], [62, 20], [64, 20], [58, 24], [60, 24], [62, 24], [64, 24],
];

/** Places five Draft gems on the given anchors in one tick. */
export function placeFive(state: GameState, spots: readonly (readonly [number, number])[]): SimEvent[] {
  return send(state, ...spots.slice(0, 5).map(([col, row]) => ({ type: 'gem.placeDraft', col, row })));
}

/** Five free anchors for round `round` in the open south field, clear of every route. */
export function spotsFor(round: number): [number, number][] {
  return Array.from({ length: 5 }, (_, i) => [14 + 3 * i, 40 + 3 * round] as [number, number]);
}

/**
 * Places a full Draft for this round, then rewrites the five gems' specs, so a
 * test can choose what the Draft holds. Returns the five tower ids.
 */
export function draftWith(state: GemRun, round: number, specs: readonly string[]): number[] {
  const events = placeFive(state, spotsFor(round));
  const refused = reasons(events);
  if (refused.length > 0) throw new Error(`placement refused: ${refused.join(', ')}`);
  const ids = [...state.mode.draft];
  ids.forEach((id, i) => {
    if (specs[i] !== undefined) towerAtId(state, id).spec = specs[i]!;
  });
  return ids;
}

/** Keeps the first Draft gem and plays the Wave out, `lives` kept topped up so leaks can't end the Run. */
export function skipRound(state: GemRun, round: number, keep = 0): number {
  const ids = draftWith(state, round, []);
  send(state, { type: 'gem.keep', tower: ids[keep]! });
  state.lives = 99;
  finishWave(state);
  state.lives = 1;
  return ids[keep]!;
}
