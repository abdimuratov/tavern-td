import { registerSW } from 'virtual:pwa-register';

export interface ServiceWorkerHandlers {
  /** The first install finished: the app now opens with no network. */
  onOfflineReady(): void;
  /** A new version has been deployed; calling `reload` activates it and reloads. */
  onUpdate(reload: () => void): void;
}

/**
 * Precaches the app for offline play. Each installed copy (a Dock or Home
 * Screen app) has its own storage, so each one precaches on its first online
 * launch.
 */
export function registerServiceWorker(on: ServiceWorkerHandlers): void {
  if (__PLATFORM__ !== 'web' || !('serviceWorker' in navigator)) return;
  const update = registerSW({
    onOfflineReady: () => on.onOfflineReady(),
    onNeedRefresh: () => on.onUpdate(() => void update(true)),
  });
}
