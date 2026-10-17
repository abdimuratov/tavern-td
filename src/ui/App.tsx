import { useEffect, useState } from 'preact/hooks';
import { lastTap, offlineReady, pendingUpdate, portrait, tapCount } from './state';

const OFFLINE_TOAST_MS = 5000;

function Hud() {
  const cell = lastTap.value;
  return (
    <div class="hud" data-testid="hud">
      <strong>Tavern TD</strong>{' '}
      <span class="muted">taps</span> <span data-testid="tap-count">{tapCount.value}</span>
      {' · '}
      <span class="muted">cell</span>{' '}
      <span data-testid="tap-cell">{cell ? `${cell.col},${cell.row}` : '–'}</span>
    </div>
  );
}

function RotateScreen() {
  return (
    <div class="rotate" data-testid="rotate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M2 14a8 8 0 0 0 6 7.7M22 10a8 8 0 0 0-6-7.7" />
      </svg>
      <div>Turn your phone sideways to play.</div>
    </div>
  );
}

function UpdateToast() {
  const reload = pendingUpdate.value;
  if (!reload) return null;
  return (
    <div class="toast interactive">
      New version ready.
      <button type="button" onClick={reload}>Reload</button>
    </div>
  );
}

/** Shown once, on the first launch that finishes precaching, then hides itself. */
function OfflineReadyToast() {
  const ready = offlineReady.value;
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setShown(false), OFFLINE_TOAST_MS);
    return () => clearTimeout(id);
  }, [ready]);
  if (!ready || !shown) return null;
  return <div class="toast" data-testid="offline-ready">Ready to play offline.</div>;
}

export function App() {
  return (
    <>
      <Hud />
      <OfflineReadyToast />
      <UpdateToast />
      {portrait.value && <RotateScreen />}
    </>
  );
}
