import { expect, test as base, type BrowserContext } from '@playwright/test';

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

/** The Relay the tests use: server/ run locally as Playwright's second webServer, never the deployed one. */
export const LOCAL_RELAY = 'http://localhost:8787';

/** Points the app at a Relay, or at none with '' (an init script). */
export function useRelay(url: string): void {
  globalThis.TAVERN_RELAY_URL = url;
}

/** A context as every test gets one: silent, and on the local Relay, so no test wakes the deployed one. */
export async function testContext(context: BrowserContext, relay = LOCAL_RELAY): Promise<void> {
  await context.addInitScript(silenceAudio);
  await context.addInitScript(useRelay, relay);
}

/** Every test page starts silent and on the local Relay (testContext). */
export const test = base.extend({
  context: async ({ context }, use) => {
    await testContext(context);
    await use(context);
  },
});

export { expect };
