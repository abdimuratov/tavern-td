import { registerSW } from 'virtual:pwa-register';

/**
 * Precaches the app for offline play. When a new version has been deployed,
 * `onUpdate` receives a function that activates it and reloads.
 */
export function registerServiceWorker(onUpdate: (reload: () => void) => void): void {
  if (__PLATFORM__ !== 'web' || !('serviceWorker' in navigator)) return;
  const update = registerSW({
    onNeedRefresh: () => onUpdate(() => void update(true)),
  });
}
