import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** Android-only setup: landscape lock and an immersive, status-bar-free screen. */
export async function setupNative(): Promise<void> {
  if (!isNative) return;
  const [{ ScreenOrientation }, { StatusBar }] = await Promise.all([
    import('@capacitor/screen-orientation'),
    import('@capacitor/status-bar'),
  ]);
  await Promise.allSettled([
    ScreenOrientation.lock({ orientation: 'landscape' }),
    StatusBar.hide(),
  ]);
}

/**
 * `tap` for selecting, `confirm` for a placement or purchase, `error` for a
 * rejected action (a Block, too little gold), `leak` for a creep reaching the exit.
 */
export type HapticKind = 'tap' | 'confirm' | 'error' | 'leak';

/** A burst of the same kind (ten creeps leaking at once) buzzes once, not ten times. */
const HAPTIC_GAP_MS = 60;

let hapticsEnabled = true;
const lastHaptic = new Map<HapticKind, number>();
let hapticsModule: Promise<typeof import('@capacitor/haptics')> | undefined;

/** Apply the `haptics` setting, at boot and whenever it changes. */
export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

/** Android only: a no-op on the web, where iPhone can't vibrate anyway. Never throws. */
export async function haptic(kind: HapticKind): Promise<void> {
  if (!isNative || !hapticsEnabled) return;
  const now = performance.now();
  const last = lastHaptic.get(kind);
  if (last !== undefined && now - last < HAPTIC_GAP_MS) return;
  lastHaptic.set(kind, now);
  try {
    const { Haptics, ImpactStyle, NotificationType } = await (hapticsModule ??= import('@capacitor/haptics'));
    switch (kind) {
      case 'tap': return await Haptics.impact({ style: ImpactStyle.Light });
      case 'confirm': return await Haptics.impact({ style: ImpactStyle.Medium });
      case 'error': return await Haptics.notification({ type: NotificationType.Error });
      case 'leak': return await Haptics.impact({ style: ImpactStyle.Heavy });
    }
  } catch (err) {
    console.warn('[native] haptic failed', err);
  }
}

/** @deprecated Use `haptic('tap')`, which also honours the haptics setting. */
export function tapHaptic(): Promise<void> {
  return haptic('tap');
}
