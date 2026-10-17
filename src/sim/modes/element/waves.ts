import {
  BOSS_HP_BASE, BOSS_HP_GROWTH, BOSS_TRAITS, CREEPS_PER_WAVE, DIFFICULTY_HP, ELEMENT_EXPRESS_WAVES, ELEMENT_FULL_WAVES,
  ESSENCE_AFTER, EXPRESS_WAVES, FIRST_BOSS_BREAK, FIRST_SPAWN, FULL_WAVES, INTEREST_PERIOD, INTEREST_RATE,
  INTEREST_STOPS_AFTER, LUMBER_AFTER, SCORE, SCORE_BONUS, bossId,
  type ElementWave, type RunLength,
} from '../../../content/element';
import { TICK_RATE } from '../../core/constants';
import type { SimEvent } from '../../core/events';
import type { WaveGroup, WaveSpec } from '../../core/specs';
import type { Difficulty, GameState } from '../../core/state';
import { earnGold } from '../../economy';
import { sellValue } from './build';
import { applyDraw } from './elements';
import { elState, modeEvent } from './state';

// Waves, breaks, grants, interest and score (docs/research/element-td-rules.md
// §5, §7, §10): wavedata.lua, wave.lua, interest.lua and scoring.lua.

/** The fixed Waves of a length: 55 for Full (the boss Waves follow), 30 for Express. */
export function fixedWaves(length: RunLength): number {
  return length === 'full' ? FULL_WAVES : EXPRESS_WAVES;
}

export function waveRow(length: RunLength, wave: number): ElementWave | undefined {
  return (length === 'full' ? ELEMENT_FULL_WAVES : ELEMENT_EXPRESS_WAVES)[wave - 1];
}

/** Boss Wave n's HP per creep: 384,076 × Difficulty × 1.3ⁿ, floored (creep_health.lua GetBossMaxHealth); bulky doubles it. */
export function bossHp(difficulty: Difficulty, n: number, bulky: boolean): number {
  let growth = 1;
  for (let i = 0; i < n; i++) growth *= BOSS_HP_GROWTH;
  const hp = Math.floor(BOSS_HP_BASE * DIFFICULTY_HP[difficulty] * growth);
  return bulky ? hp * 2 : hp;
}

/**
 * A boss Wave: each creep takes the next trait of the cycle, a bulky one two
 * of the 30 slots and 1 s instead of 0.5 s to the next spawn (wave.lua), so 26 creeps.
 */
export function bossGroups(difficulty: Difficulty, n: number): WaveGroup[] {
  const groups: WaveGroup[] = [];
  let slots = 0;
  let delay = FIRST_SPAWN;
  for (let k = 0; slots < CREEPS_PER_WAVE; k++) {
    const trait = BOSS_TRAITS[k % BOSS_TRAITS.length]!;
    const bulky = trait === 'bulky';
    groups.push({ creep: bossId(trait), count: 1, interval: 0, delay, hp: bossHp(difficulty, n, bulky) });
    slots += bulky ? 2 : 1;
    delay += bulky ? 1 : 0.5;
  }
  return groups;
}

/** Wave `index` (0-based): a fixed Wave, or boss Wave index − 54 after Full's 55. */
export function waveSpec(state: GameState, index: number): WaveSpec | undefined {
  const es = elState(state);
  const wave = index + 1;
  const row = waveRow(es.length, wave);
  if (row) {
    return {
      groups: [{ creep: row.creep, count: row.count, interval: row.interval, delay: FIRST_SPAWN, hp: row.hp[state.difficulty] }],
      bountyMult: row.bounty[state.difficulty],
    };
  }
  if (es.length !== 'full' || wave <= FULL_WAVES) return undefined;
  // Boss creeps pay nothing.
  return { groups: bossGroups(state.difficulty, wave - FULL_WAVES), bountyMult: 0 };
}

/** Seconds of break before `wave`: the table, 60 before the first boss Wave, none before later ones. */
export function breakSeconds(state: GameState, wave: number): number {
  const es = elState(state);
  const row = waveRow(es.length, wave);
  if (row) return row.breakBefore[state.difficulty];
  return wave === FULL_WAVES + 1 ? FIRST_BOSS_BREAK : 0;
}

/** Starts the break before `wave`: its countdown and the Lumber, draw and Pure Essence the cleared Wave brings. */
export function startBreak(state: GameState, cleared: number, events: SimEvent[]): void {
  const es = elState(state);
  const next = cleared + 1;
  const ticks = Math.round(breakSeconds(state, next) * TICK_RATE);
  es.breakTicks = ticks;
  es.breakUntil = state.tick + ticks;
  if (cleared >= 1 && LUMBER_AFTER[es.length].includes(cleared)) {
    es.lumber++;
    modeEvent(events, 'element.lumber', { lumber: es.lumber });
    const draw = es.draws.find((d) => d.after === cleared && !d.done);
    if (draw) applyDraw(state, draw, events, false);
  }
  if (ESSENCE_AFTER[es.length].includes(cleared)) {
    es.essence++;
    modeEvent(events, 'element.essence', { essence: es.essence, bought: false });
  }
  modeEvent(events, 'element.break', { wave: next, ticks });
}

// --- Interest ----------------------------------------------------------------------

const PERIOD = INTEREST_PERIOD * TICK_RATE;

/** Wave 1's first spawn starts the 15 s clock. */
export function startInterest(state: GameState): void {
  const it = elState(state).interest;
  if (it.next < 0 && it.left < 0 && !it.stopped) it.next = state.tick + PERIOD;
}

/** Pays ⌊2% of gold⌋ when due, or stops for good once enough Waves are cleared. */
export function runInterest(state: GameState, events: SimEvent[]): void {
  const es = elState(state);
  const it = es.interest;
  if (it.next < 0 || state.tick < it.next) return;
  if (es.completed >= INTEREST_STOPS_AFTER[es.length]) {
    stopInterest(state);
    return;
  }
  const gold = Math.floor(state.gold * INTEREST_RATE);
  it.next += PERIOD;
  earnGold(state, gold, events);
  modeEvent(events, 'element.interest', { gold, next: it.next });
}

function stopInterest(state: GameState): void {
  const it = elState(state).interest;
  it.next = -1;
  it.left = -1;
  it.locks = [];
  it.stopped = true;
}

/** A leak of Wave `wave` pauses interest, keeping its remaining time, until that Wave is cleared. */
export function pauseInterest(state: GameState, wave: number): void {
  const es = elState(state);
  const it = es.interest;
  if (it.stopped || es.completed >= INTEREST_STOPS_AFTER[es.length]) return;
  if (!it.locks.includes(wave)) it.locks.push(wave);
  if (it.next >= 0) {
    it.left = it.next - state.tick;
    it.next = -1;
  }
}

/** Clearing a Wave lifts its pause; the last lock gone, the clock runs on from where it stopped. */
export function clearInterestLock(state: GameState, wave: number): void {
  const es = elState(state);
  const it = es.interest;
  if (es.completed >= INTEREST_STOPS_AFTER[es.length]) {
    stopInterest(state);
    return;
  }
  it.locks = it.locks.filter((w) => w !== wave);
  if (it.locks.length === 0 && it.left >= 0) {
    it.next = state.tick + it.left;
    it.left = -1;
  }
}

// --- Score ---------------------------------------------------------------------------

/** Gold plus what every finished tower would sell for (playerdata.lua GetPlayerNetworth). */
export function netWorth(state: GameState): number {
  let total = state.gold;
  for (const t of state.towers) {
    const ready = elState(state).towers[String(t.id)]?.ready ?? 0;
    if (state.tick >= ready) total += sellValue(state, t);
  }
  return total;
}

/** Seconds from Wave 1's first spawn to the last fixed Wave's clear. */
export function clearSeconds(state: GameState): number | null {
  const es = elState(state);
  return es.firstSpawn >= 0 && es.clearTick >= 0 ? (es.clearTick - es.firstSpawn) / TICK_RATE : null;
}

/** Score for clearing `wave`, in the port's operation order (scoring.lua). */
export function scoreWaveClear(state: GameState, wave: number): void {
  const es = elState(state);
  const d = SCORE_BONUS[state.difficulty];
  const fixed = fixedWaves(es.length);
  if (wave <= fixed) {
    const clear = (wave + SCORE.waveOffset[es.length]) * SCORE.perWave;
    const clean = es.waveLeaks === 0 ? SCORE.cleanBonus : 0;
    es.score += Math.max(0, Math.ceil(clear * (1 + clean) * (1 + d)));
    if (wave === fixed) {
      es.clearTick = state.tick;
      const t = clearSeconds(state) ?? 0;
      const par = SCORE.par[es.length] / 60;
      const speed = t > 0 ? ((par / t) * 60 - 1) * SCORE.speedFactor[es.length] : 0;
      es.score = Math.ceil((es.score + netWorth(state)) * (1 + speed));
    }
    return;
  }
  const n = wave - FULL_WAVES;
  es.score += Math.ceil(CREEPS_PER_WAVE * SCORE.perBoss * (1 + (n - 1) * SCORE.bossGrowth) * (1 + d));
}

/** The score as the Record keeps it: a Run that ends mid boss Wave adds that Wave's boss kills (GetGameFinished). */
export function finalScore(state: GameState): number {
  const es = elState(state);
  const n = state.wave.number - FULL_WAVES;
  if (state.phase !== 'lost' || es.length !== 'full' || n < 1 || es.completed >= state.wave.number) return es.score;
  const d = SCORE_BONUS[state.difficulty];
  return Math.ceil(es.score + (es.bossKills % CREEPS_PER_WAVE) * SCORE.perBoss * (1 + (n - 1) * SCORE.bossGrowth) * (1 + d));
}
