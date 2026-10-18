import { signal } from '@preact/signals';

// Maul's own UI state between taps. None of it is in the Run: it is only what
// the player is in the middle of picking.

/** The tower the build menu has chosen, which a tap on open ground builds; null for none. */
export const building = signal<string | null>(null);
