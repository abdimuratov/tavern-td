import { h, render } from 'preact';
import { setupAudio } from '../platform/audio';
import { setupNative } from '../platform/native';
import { registerServiceWorker } from '../platform/pwa';
import { loadSettings } from '../platform/storage';
import { isPortrait, watchViewport } from '../platform/viewport';
import { App } from '../ui/App';
import { offlineReady, pendingUpdate, portrait } from '../ui/state';
import { createShell } from './shell';

async function boot(): Promise<void> {
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
}

function fpsReadout(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fps';
  document.body.appendChild(el);
  return el;
}

void boot();
