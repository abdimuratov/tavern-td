import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The browser bundle of the game logic and its replay fixture, built fresh before each run. */
export const SIM_BUNDLE = fileURLToPath(new URL('../test-results/sim/sim.js', import.meta.url));

/**
 * Builds `src/sim` with the test Game Mode into one script for the
 * determinism test to inject. It runs after Playwright clears test-results,
 * and outside the app's own config, so no app plugin or service worker is involved.
 */
export default async function globalSetup(): Promise<void> {
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      target: 'es2023',
      outDir: 'test-results/sim',
      emptyOutDir: true,
      minify: false,
      lib: { entry: 'e2e/sim-entry.ts', formats: ['iife'], name: 'TavernSim', fileName: () => 'sim.js' },
    },
  });
}
