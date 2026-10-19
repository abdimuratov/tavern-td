export type BackgroundReason = 'hidden' | 'pagehide' | 'pause';
export type ForegroundReason = 'visible' | 'pageshow' | 'resume';

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

/**
 * Calls `handler` once each time the app is shown again after a trip to the
 * background (the same trips onBackground counts): the tab or app visible
 * again, the page back from the back/forward cache, or the Android activity
 * resumed. Several of these fire for one return, so it runs once until the app
 * leaves again; the page's first load is no return and calls nothing. Versus
 * uses it to tell the Rival it's back.
 */
export function onForeground(
  handler: (reason: ForegroundReason) => void | Promise<void>,
  targets: LifecycleTargets = { document, window },
): () => void {
  const { document: doc, window: win } = targets;
  let away = false;

  const leave = (): void => {
    away = true;
  };
  const back = (reason: ForegroundReason): void => {
    if (!away) return;
    away = false;
    try {
      void Promise.resolve(handler(reason)).catch(logForegroundFailure);
    } catch (err) {
      logForegroundFailure(err);
    }
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') leave();
    else back('visible');
  };
  const onPageShow = (): void => back('pageshow');
  const onResume = (): void => back('resume');

  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pause', leave);
  doc.addEventListener('resume', onResume);
  win.addEventListener('pagehide', leave);
  win.addEventListener('pageshow', onPageShow);

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pause', leave);
    doc.removeEventListener('resume', onResume);
    win.removeEventListener('pagehide', leave);
    win.removeEventListener('pageshow', onPageShow);
  };
}

function logFailure(err: unknown): void {
  console.error('[lifecycle] background handler failed', err);
}

function logForegroundFailure(err: unknown): void {
  console.error('[lifecycle] foreground handler failed', err);
}
