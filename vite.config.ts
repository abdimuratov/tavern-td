import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// `--mode android` builds for the Capacitor APK: assets are bundled inside it,
// served from the root, and need no service worker.
export default defineConfig(({ mode }) => {
  const android = mode === 'android';
  return {
    base: android ? '/' : '/tavern-td/',
    define: { __PLATFORM__: JSON.stringify(android ? 'android' : 'web') },
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
