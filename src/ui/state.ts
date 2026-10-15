import { signal } from '@preact/signals';

export const portrait = signal(false);
export const tapCount = signal(0);
export const lastTap = signal<{ col: number; row: number } | null>(null);
/** Set when a new version is waiting; calling it reloads into that version. */
export const pendingUpdate = signal<(() => void) | null>(null);
