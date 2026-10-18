import { expect, test as base } from '@playwright/test';

/**
 * Every test page starts with Web Audio's output routed through a silent gain,
 * so a test run makes no sound on the machine running it. The app still
 * creates, resumes and plays into its AudioContext exactly as it would.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const Base = window.BaseAudioContext;
      const real = Base ? Object.getOwnPropertyDescriptor(Base.prototype, 'destination')?.get : undefined;
      if (!Base || !real) return;
      const silent = new WeakMap<BaseAudioContext, GainNode>();
      Object.defineProperty(Base.prototype, 'destination', {
        configurable: true,
        get(this: BaseAudioContext) {
          let gain = silent.get(this);
          if (!gain) {
            gain = this.createGain();
            gain.gain.value = 0;
            gain.connect(real.call(this) as AudioDestinationNode);
            silent.set(this, gain);
          }
          return gain;
        },
      });
    });
    await use(page);
  },
});

export { expect };
