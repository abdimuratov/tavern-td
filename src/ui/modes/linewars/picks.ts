import { signal } from '@preact/signals';
import type { SendId } from '../../../content/linewars';

// Line Wars' own UI state between taps. None of it is in the Run: it is only
// what the player is in the middle of picking.

/** The tower the build menu has chosen, which a tap in your Field builds; null for none. */
export const building = signal<string | null>(null);

/** Your last Send, for Space to repeat, and the Run (by seed) it was bought in. */
export const lastSend = signal<{ readonly seed: number; readonly send: SendId } | null>(null);
