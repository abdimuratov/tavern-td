import type { SimEvent } from '../core/events';
import type { GameState } from '../core/state';

// Gold and lives change only through these, so the HUD hears about every change.

export function earnGold(state: GameState, amount: number, events: SimEvent[]): void {
  if (amount === 0) return;
  state.gold += amount;
  events.push({ type: 'goldChanged', gold: state.gold, delta: amount });
}

export function canAfford(state: GameState, amount: number): boolean {
  return amount <= state.gold;
}

/** Spends the gold if the player has it; false (and nothing spent) otherwise. */
export function spendGold(state: GameState, amount: number, events: SimEvent[]): boolean {
  if (!canAfford(state, amount)) return false;
  earnGold(state, -amount, events);
  return true;
}

export function loseLives(state: GameState, amount: number, events: SimEvent[]): void {
  if (amount === 0) return;
  state.lives -= amount;
  events.push({ type: 'livesChanged', lives: state.lives, delta: -amount });
}

export function gainLives(state: GameState, amount: number, events: SimEvent[]): void {
  loseLives(state, -amount, events);
}
