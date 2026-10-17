import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNative: true,
  impact: vi.fn(async () => undefined),
  notification: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative } }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: native.impact, notification: native.notification },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

const { haptic, setHapticsEnabled, tapHaptic } = await import('../src/platform/native');

let clock = 0;
beforeEach(() => {
  native.impact.mockClear();
  native.notification.mockClear();
  setHapticsEnabled(true);
  clock += 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

describe('haptic', () => {
  it('maps each kind to a Capacitor Haptics style', async () => {
    await haptic('tap');
    await haptic('confirm');
    await haptic('leak');
    await haptic('error');
    expect(native.impact.mock.calls).toEqual([[{ style: 'LIGHT' }], [{ style: 'MEDIUM' }], [{ style: 'HEAVY' }]]);
    expect(native.notification).toHaveBeenCalledWith({ type: 'ERROR' });
  });

  it('honours the haptics setting', async () => {
    setHapticsEnabled(false);
    await haptic('confirm');
    await tapHaptic();
    expect(native.impact).not.toHaveBeenCalled();
  });

  it('buzzes once for a burst of the same kind', async () => {
    for (let i = 0; i < 10; i++) await haptic('leak');
    await haptic('tap');
    expect(native.impact).toHaveBeenCalledTimes(2);
    clock += 100;
    await haptic('leak');
    expect(native.impact).toHaveBeenCalledTimes(3);
  });

  it('never throws when the plugin fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    native.impact.mockRejectedValueOnce(new Error('plugin not implemented'));
    await expect(haptic('tap')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps tapHaptic working', async () => {
    await tapHaptic();
    expect(native.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
  });
});
