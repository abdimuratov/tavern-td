import { h, render } from 'preact';
import { setAudioSettings, setupAudio } from '../platform/audio';
import { setHapticsEnabled, setupNative } from '../platform/native';
import { registerServiceWorker } from '../platform/pwa';
import { loadSettings } from '../platform/storage';
import { isPortrait, watchViewport } from '../platform/viewport';
import { App } from '../ui/App';
import { offlineReady, pendingUpdate, portrait } from '../ui/state';
import { startPlay, type Play } from './game';

declare global {
  interface Window {
    /** The running play screen, for the e2e tests and the Safari inspector. */
    tavern?: Play;
  }
}

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

  const settings = loadSettings();
  // Until the main menu exists, the app boots straight into the dev sandbox.
  // It stays behind this one dynamic import so the menu can replace it.
  const { sandboxTarget } = await import('./sandbox');
  const fpsEl = new URLSearchParams(location.search).has('fps') ? fpsReadout() : null;
  const play = await startPlay(sandboxTarget(location.search), boardHost, fpsEl ? { fps: (n) => { fpsEl.textContent = `${n.toFixed(0)} fps`; } } : {});
  window.tavern = play;

  const s = await settings;
  setAudioSettings(s);
  setHapticsEnabled(s.haptics);
  play.controller.setSpeed(s.defaultSpeed);
}

function fpsReadout(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fps';
  document.body.appendChild(el);
  return el;
}

void boot();
