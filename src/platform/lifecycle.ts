export type BackgroundReason = 'hidden' | 'pagehide' | 'pause';

/** The parts of `document` and `window` this module listens on, so tests can pass plain EventTargets. */
export interface LifecycleTargets {
  document: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  window: EventTarget;
}

/**
 * Calls `handler` once per trip to the background: tab or app hidden, page
 * unloaded or put in the back/forward cache, or the Android activity paused
 * (Capacitor dispatches `pause` and `resume` on `document`, no App plugin
 * needed). Several of these fire for one trip, so the handler runs again only
 * after the app has come back. Start the autosave synchronously inside the
 * handler: iOS may freeze the page soon after it returns.
 */
export function onBackground(
  handler: (reason: BackgroundReason) => void | Promise<void>,
  targets: LifecycleTargets = { document, window },
): () => void {
  const { document: doc, window: win } = targets;
  let away = false;

  const leave = (reason: BackgroundReason): void => {
    if (away) return;
    away = true;
    try {
      void Promise.resolve(handler(reason)).catch(logFailure);
    } catch (err) {
      logFailure(err);
    }
  };
  const back = (): void => {
    away = false;
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') leave('hidden');
    else back();
  };
  const onPageHide = (): void => leave('pagehide');
  const onPause = (): void => leave('pause');

  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pause', onPause);
  doc.addEventListener('resume', back);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', back);

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pause', onPause);
    doc.removeEventListener('resume', back);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('pageshow', back);
  };
}

function logFailure(err: unknown): void {
  console.error('[lifecycle] background handler failed', err);
}
