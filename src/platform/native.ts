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

/** A short tick of feedback. A no-op on the web, where iPhone can't vibrate anyway. */
export async function tapHaptic(): Promise<void> {
  if (!isNative) return;
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
  await Haptics.impact({ style: ImpactStyle.Light });
}
