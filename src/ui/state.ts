import { signal } from '@preact/signals';

export const portrait = signal(false);
export const tapCount = signal(0);
export const lastTap = signal<{ col: number; row: number } | null>(null);
/** True once the service worker's first install has finished. */
export const offlineReady = signal(false);
/** Set when a new version is waiting; calling it reloads into that version. */
export const pendingUpdate = signal<(() => void) | null>(null);
