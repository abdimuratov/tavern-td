import { describe, expect, it, vi } from 'vitest';
import { onBackground, onForeground, type BackgroundReason, type ForegroundReason, type LifecycleTargets } from '../src/platform/lifecycle';

function fakePage() {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const window = new EventTarget();
  const targets: LifecycleTargets = { document, window };
  return {
    targets,
    hide() {
      document.visibilityState = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    },
    show() {
      document.visibilityState = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    },
    pagehide: () => window.dispatchEvent(new Event('pagehide')),
    pageshow: () => window.dispatchEvent(new Event('pageshow')),
    pause: () => document.dispatchEvent(new Event('pause')),
    resume: () => document.dispatchEvent(new Event('resume')),
  };
}

describe('onBackground', () => {
  it('fires once per trip to the background, however many events arrive', () => {
    const page = fakePage();
    const handler = vi.fn<(reason: BackgroundReason) => void>();
    onBackground(handler, page.targets);

    page.pause();
    page.hide();
    page.pagehide();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('pause');

    page.show();
    page.hide();
    page.pagehide();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith('hidden');
  });

  it('re-arms on any sign of coming back', () => {
    const page = fakePage();
    const handler = vi.fn();
    onBackground(handler, page.targets);

    page.pagehide();
    page.pageshow();
    page.pause();
    page.resume();
    page.hide();
    expect(handler.mock.calls.map(([reason]) => reason)).toEqual(['pagehide', 'pause', 'hidden']);
  });

  it('ignores a visibilitychange to visible', () => {
    const page = fakePage();
    const handler = vi.fn();
    onBackground(handler, page.targets);
    page.show();
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops after unsubscribing', () => {
    const page = fakePage();
    const handler = vi.fn();
    const off = onBackground(handler, page.targets);
    off();
    page.hide();
    page.pagehide();
    page.pause();
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps working when a handler throws or rejects', async () => {
    const page = fakePage();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    onBackground(() => {
      calls++;
      if (calls === 1) throw new Error('sync');
      return Promise.reject(new Error('async'));
    }, page.targets);

    page.hide();
    page.show();
    page.hide();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe('onForeground', () => {
  it('fires once per return from the background, however many events arrive', () => {
    const page = fakePage();
    const handler = vi.fn<(reason: ForegroundReason) => void>();
    onForeground(handler, page.targets);

    page.pause();
    page.hide();
    page.resume();
    page.show();
    page.pageshow();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('resume');

    page.hide();
    page.show();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith('visible');

    page.pagehide();
    page.pageshow();
    expect(handler.mock.calls.map(([reason]) => reason)).toEqual(['resume', 'visible', 'pageshow']);
  });

  it('calls nothing on the first load or while the app stays shown', () => {
    const page = fakePage();
    const handler = vi.fn();
    onForeground(handler, page.targets);
    page.pageshow();
    page.show();
    page.resume();
    expect(handler).not.toHaveBeenCalled();
  });

  it('pairs with onBackground: one call each per trip', () => {
    const page = fakePage();
    const trips: string[] = [];
    onBackground(() => void trips.push('away'), page.targets);
    onForeground(() => void trips.push('back'), page.targets);
    page.hide();
    page.pagehide();
    page.show();
    page.pageshow();
    page.pause();
    page.resume();
    expect(trips).toEqual(['away', 'back', 'away', 'back']);
  });

  it('stops after unsubscribing, and survives a handler that throws or rejects', async () => {
    const page = fakePage();
    const gone = vi.fn();
    const off = onForeground(gone, page.targets);
    off();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    onForeground(() => {
      calls++;
      if (calls === 1) throw new Error('sync');
      return Promise.reject(new Error('async'));
    }, page.targets);
    page.hide();
    page.show();
    page.hide();
    page.show();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(2);
    expect(gone).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
