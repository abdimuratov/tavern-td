import { signal } from '@preact/signals';

// Element's own UI state between taps. None of it is in the Run: it is only
// what the player is in the middle of picking.

/** The tower the build menu has chosen, which a tap on a plot builds; null for none. */
export const building = signal<string | null>(null);
/** Whether the Elements panel (summons and Pure Essence) is open. */
export const elementsOpen = signal(false);
