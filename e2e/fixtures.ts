import { expect, test as base } from '@playwright/test';

/**
 * Routes a page's Web Audio output through a silent gain, so a test run makes
 * no sound on the machine running it. The app still creates, resumes and
 * plays into its AudioContext exactly as it would. An init script, for a page
 * or for a whole browser context (Versus' two players).
 */
export function silenceAudio(): void {
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
}

/** Every test page starts silent (silenceAudio). */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(silenceAudio);
    await use(page);
  },
});

export { expect };
