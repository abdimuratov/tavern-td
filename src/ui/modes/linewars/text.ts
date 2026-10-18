import { LW_CREEPS, LW_SENDS, RIVAL_INCOME, type LwCreepSpec, type SendId } from '../../../content/linewars';
import { RACES, type RaceId } from '../../../content/maul';
import { linewars, TICK_RATE, type Difficulty, type GameState } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import { clock, num } from '../../format';
import type { EndText, RunChoices } from '../../mode-ui';
import { ARMOR_NAME, BEST_AGAINST, countdown, KIND_TAG, raceName } from '../maul/text';

// Line Wars' words: the Rival's Difficulty, why a Send can't be bought, a
// Send's tags, the toasts and the end card. Player text says Rival, never AI.

/** "×1.1", "×0.85", "×1". */
export function factorText(factor: number): string {
  return `×${num(factor)}`;
}

/** How the Rival plays on each Difficulty, in a line (design §12). */
const RIVAL_PLAY: Readonly<Record<Difficulty, string>> = {
  easy: 'A short maze full of gaps, and Sends for Income only',
  normal: 'A full maze, and big Sends saved up from 10:00',
  hard: 'Quick, and from 6:00 its Sends go for your weakest armor',
  insane: 'Quicker still, and flyers whenever your air is thin',
};

/** The New Run line for a Difficulty: the Rival's income factor and how it plays. */
export function difficultyText(d: Difficulty): string {
  return `Rival's income ${factorText(RIVAL_INCOME[d])} · ${RIVAL_PLAY[d]}`;
}

export function isRace(v: unknown): v is RaceId {
  return typeof v === 'string' && (RACES as readonly string[]).includes(v);
}

/** "Rimeborn vs Ironclad": your Race, then the Rival's (or Random). */
export function matchup(choices: RunChoices): string {
  const mine = choices['race'];
  const rival = choices['rivalRace'];
  if (!isRace(mine)) return '';
  return `${raceName(mine)} vs ${isRace(rival) ? raceName(rival) : 'Random'}`;
}

/** The creep a Send buys. */
export function sendCreep(send: SendId): LwCreepSpec {
  return LW_CREEPS[LW_SENDS[send].creep]!;
}

/** A Send's tags, as the send menu's tooltip and "In your Field" show them: Air, Boss, Fast, Armored… */
export function sendTags(send: SendId): string[] {
  const c = sendCreep(send);
  if (c.flying) return ['Air'];
  if (c.maul.kind === 'boss') return ['Boss'];
  const tag = KIND_TAG[c.maul.kind];
  return tag ? [tag] : [];
}

/** Its armor and what hits it hardest, its HP and what a Leak of it steals. */
export function sendAbout(send: SendId, hp: number): string {
  const spec = LW_SENDS[send];
  const c = sendCreep(send);
  return [
    `${spec.count > 1 ? `${spec.count} creeps, ${num(hp)} HP each` : `${num(hp)} HP`}`,
    `${ARMOR_NAME[c.armorType]} armor ${c.armor}: ${BEST_AGAINST[c.armorType]} hits hardest`,
    `a Leak steals ${spec.steals} ${spec.steals === 1 ? 'life' : 'lives'}`,
  ].join(' · ');
}

/**
 * Why you can't buy a Send right now, in a few words, or null when you can:
 * locked, out of Stock, short of gold, or the cap on creeps out at once.
 */
export function sendWhy(o: linewars.SendOption, gold: number, live: number, cap: number): string | null {
  if (o.blocked === null) return null;
  if (o.unlockIn > 0) return `unlocks in ${countdown(o.unlockIn / TICK_RATE)}`;
  if (o.stock <= 0) return o.restockIn > 0 ? `out of Stock: 1 more in ${Math.max(1, Math.ceil(o.restockIn / TICK_RATE))} s` : 'out of Stock';
  if (o.price > gold) return `needs ${o.price} gold`;
  if (live + o.count > cap) return `${cap} of yours are out already`;
  return o.blocked;
}

/** "Harpies (Air) in 0:28": the next Send to unlock, for "In your Field". */
export function nextUnlockText(next: { readonly send: SendId; readonly name: string; readonly ticksLeft: number }): string {
  const c = sendCreep(next.send);
  const tag = c.flying ? ' (Air)' : c.maul.kind === 'boss' ? ' (Boss)' : '';
  return `${next.name}${tag} in ${countdown(next.ticksLeft / TICK_RATE)}`;
}

/** "+42 in 6 s" counts down whole seconds to the next Income tick. */
export function incomeSeconds(ticksLeft: number): number {
  return Math.max(1, Math.ceil(ticksLeft / TICK_RATE));
}

/** The Sudden Death clock: its countdown before 15:00, then what it does. */
export function suddenText(st: linewars.LwStatus): string {
  return st.sudden ? 'Sudden Death · −1 ♥ each tick' : `Sudden Death in ${countdown(st.suddenIn / TICK_RATE)}`;
}

/** "+2 ♥ stolen": your creeps' Leaks this tick. */
export function stolenText(lives: number): string {
  return `+${lives} ♥ stolen`;
}

/** "−2 ♥ Tusked Warlord got through", or "−3 ♥ 3 creeps got through" when several leak at once. */
export function leakedText(lives: number, creeps: readonly string[]): string {
  const what = creeps.length === 1 ? creeps[0]! : `${creeps.length} creeps`;
  return `−${lives} ♥ ${what} got through`;
}

/** A toast when the Rival sends flyers or a boss; null for anything else. */
export function rivalSendText(send: SendId): string | null {
  const c = sendCreep(send);
  const name = LW_SENDS[send].name;
  if (c.flying) return `The Rival sent ${name}: they fly over your maze`;
  if (c.maul.kind === 'boss') return `The Rival sent a ${name}`;
  return null;
}

/** How far a saved Run has got: its time. */
export function progressText(state: GameState): string {
  return `${clock(Math.floor(state.tick / TICK_RATE))} in`;
}

/** Victory, Defeat or Draw, and why the Run ended (design §10). */
export function lwEndText(state: GameState): EndText {
  const r = linewars.lwRecord(state);
  const d = DIFFICULTY_NAME[state.difficulty];
  const wave = String(r.wave);
  if (r.draw) return { won: false, title: 'Draw', summary: `Both Sides ran out of lives together, on the same Income, on ${d}`, wave };
  if (r.won) {
    const summary = r.why === 'drain' ? `Sudden Death drained the Rival first, on ${d}`
      : r.why === 'income' ? `Both Sides ran out together, and your Income was higher, on ${d}`
        : `You took the Rival's last life on ${d}`;
    return { won: true, title: 'Victory', summary, wave };
  }
  const summary = r.why === 'drain' ? 'Sudden Death drained your last life first'
    : r.why === 'income' ? "Both Sides ran out together, and the Rival's Income was higher"
      : 'The Rival took your last life';
  return { won: false, title: 'Defeat', summary, wave };
}

/** "Best steal: 12 lives" on New Run. */
export function bestSteal(n: number): string {
  return `Best steal: ${n} ${n === 1 ? 'life' : 'lives'}`;
}
