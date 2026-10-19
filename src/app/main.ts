import { h, render } from 'preact';
import { setupAudio } from '../platform/audio';
import { setupNative } from '../platform/native';
import { registerServiceWorker } from '../platform/pwa';
import { loadSettings } from '../platform/storage';
import { isPortrait, watchViewport } from '../platform/viewport';
import { App } from '../ui/App';
import { offlineReady, pendingUpdate, portrait } from '../ui/state';
import { createShell } from './shell';
import { joinInUrl } from './versus-link';

async function boot(): Promise<void> {
  // A Versus Join link (`…/tavern-td/#join=TTDJ1.…`): read the code, and drop it from the address at once.
  const link = joinInUrl(location.href);
  if (link) history.replaceState(null, '', link.clean);

  const boardHost = document.getElementById('board');
  const uiHost = document.getElementById('ui');
  if (!boardHost || !uiHost) throw new Error('index.html is missing #board or #ui');

  void setupNative();
  setupAudio();
  registerServiceWorker({
    onOfflineReady: () => { offlineReady.value = true; },
    onUpdate: (reload) => { pendingUpdate.value = reload; },
  });
  watchViewport((size) => {
    portrait.value = isPortrait(size);
  });
  render(h(App, {}), uiHost);

  const query = new URLSearchParams(location.search);
  const fpsEl = query.has('fps') ? fpsReadout() : null;
  const shell = createShell(boardHost, fpsEl ? { fps: (n) => { fpsEl.textContent = `${n.toFixed(0)} fps`; } } : {});
  shell.applySettings(await loadSettings());

  // Dev builds only: `?sandbox` plays the core's test Game Mode, `?stress` the performance budget.
  // The branch is dropped from production builds, so the test mode never ships.
  if (import.meta.env.DEV && (query.has('sandbox') || query.has('stress'))) {
    const { sandboxTarget } = await import('./sandbox');
    await shell.playTarget(sandboxTarget(location.search));
    return;
  }
  await shell.showMenu();
  if (link) shell.joinVersus(link.code);
  // A link opened while the app is up only changes the fragment, so the page doesn't load again.
  window.addEventListener('hashchange', () => {
    const next = joinInUrl(location.href);
    if (!next) return;
    history.replaceState(null, '', next.clean);
    shell.joinVersus(next.code);
  });
}

function fpsReadout(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fps';
  document.body.appendChild(el);
  return el;
}

void boot();
