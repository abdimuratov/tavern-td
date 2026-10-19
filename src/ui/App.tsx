import { useEffect, useState } from 'preact/hooks';
import { BoardOverlay, Hud } from './Hud';
import { Menu } from './menu/Menu';
import { RunMenu } from './RunMenu';
import { offlineReady, pendingUpdate, portrait, runMenu, screen, session } from './state';
import { VersusScreen } from './versus/Screens';
import { versus, versusRunOn } from './versus/state';

const OFFLINE_TOAST_MS = 5000;

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

/** Waits while a Versus Run is on: reloading would drop the Rival (versus-design §6). */
function UpdateToast() {
  const reload = pendingUpdate.value;
  if (!reload || versusRunOn(versus.value)) return null;
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
  const s = session.value;
  const menu = runMenu.value;
  return (
    <>
      {screen.value === 'menu' && <Menu />}
      {screen.value === 'versus' && <VersusScreen />}
      {s && <BoardOverlay s={s} />}
      {s && <Hud s={s} />}
      {s && menu && <RunMenu s={s} page={menu} />}
      <OfflineReadyToast />
      <UpdateToast />
      {portrait.value && <RotateScreen />}
    </>
  );
}
