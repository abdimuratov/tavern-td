import preact from '@preact/preset-vite';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/**
 * Every source file under `dir` (relative to the repo), as repo paths with
 * forward slashes. Only .ts and .json count, so a stray .DS_Store on the Mac
 * can't split the APK's hash from the Pages build's.
 */
function filesUnder(dir: string): string[] {
  return readdirSync(ROOT + dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|json)$/.test(e.name))
    .map((e) => `${e.parentPath.slice(ROOT.length).replace(/\\/g, '/')}/${e.name}`);
}

/**
 * The sim hash Versus compares before the lobby (docs/versus-design.md §4.6):
 * FNV-1a over every file of src/sim (less its testing/ folder) and src/content,
 * sorted by path, each as its path and its text with line ends made `\n`. So
 * two builds agree exactly when their rules and numbers do, on any machine.
 */
function simHash(): string {
  const paths = [...filesUnder('src/sim').filter((p) => !p.startsWith('src/sim/testing/')), ...filesUnder('src/content')].sort();
  let h = 0x811c9dc5;
  const feed = (text: string): void => {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const path of paths) {
    feed(`${path}\0`);
    feed(`${readFileSync(ROOT + path, 'utf8').replace(/\r\n?/g, '\n')}\0`);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The git commit this build is from, or 'dev' outside a checkout. */
function buildId(): string {
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

// `--mode android` builds for the Capacitor APK: assets are bundled inside it,
// served from the root, and need no service worker.
export default defineConfig(({ mode }) => {
  const android = mode === 'android';
  return {
    base: android ? '/' : '/tavern-td/',
    define: {
      __PLATFORM__: JSON.stringify(android ? 'android' : 'web'),
      __SIM_HASH__: JSON.stringify(simHash()),
      __BUILD__: JSON.stringify(buildId()),
    },
    build: { target: 'es2023', outDir: android ? 'dist-android' : 'dist' },
    plugins: [
      preact(),
      VitePWA({
        disable: android,
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/*.png', 'favicon.svg'],
        workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
        manifest: {
          id: '/tavern-td/',
          name: 'Tavern TD',
          short_name: 'Tavern TD',
          description: 'A collection of tower defense games.',
          start_url: '/tavern-td/',
          scope: '/tavern-td/',
          display: 'standalone',
          orientation: 'landscape',
          background_color: '#12100e',
          theme_color: '#12100e',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
