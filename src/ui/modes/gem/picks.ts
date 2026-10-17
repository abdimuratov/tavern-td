import { signal } from '@preact/signals';

// Gem's own UI state between taps. None of it is in the Run: it is only what
// the player is in the middle of picking.

/** The structure a swap starts from while the player picks the second one; 0 for none. */
export const swapFrom = signal(0);
/** The slate being moved while the player picks where; 0 for none. */
export const movingSlate = signal(0);
/** Whether the Extra Chance picker is open. */
export const extraChanceOpen = signal(false);
