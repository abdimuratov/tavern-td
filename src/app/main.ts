import { h, render } from 'preact';
import { createBoard } from '../render/board';
import { setupNative, tapHaptic } from '../platform/native';
import { registerServiceWorker } from '../platform/pwa';
import { isPortrait, watchViewport } from '../platform/viewport';
import { App } from '../ui/App';
import { lastTap, offlineReady, pendingUpdate, portrait, tapCount } from '../ui/state';

async function boot(): Promise<void> {
  const boardHost = document.getElementById('board');
  const uiHost = document.getElementById('ui');
  if (!boardHost || !uiHost) throw new Error('index.html is missing #board or #ui');

  void setupNative();
  registerServiceWorker({
    onOfflineReady: () => { offlineReady.value = true; },
    onUpdate: (reload) => { pendingUpdate.value = reload; },
  });
  render(h(App, {}), uiHost);

  const board = await createBoard(boardHost, {
    cols: 24,
    rows: 14,
    onTap(cell) {
      tapCount.value += 1;
      lastTap.value = cell;
      void tapHaptic();
    },
  });

  watchViewport((size) => {
    portrait.value = isPortrait(size);
    board.resize(size);
  });
}

void boot();
