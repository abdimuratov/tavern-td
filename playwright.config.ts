import { defineConfig, devices } from '@playwright/test';

const landscape = (device: (typeof devices)[string]) => ({
  ...device,
  viewport: { width: device.viewport.height, height: device.viewport.width },
});

/**
 * Chromium flags for Versus' test, two pages connected over loopback WebRTC
 * (docs/versus-design.md §9): loopback candidates allowed, and host candidates
 * as plain addresses rather than mDNS names a CI machine may not resolve.
 * Only the Chromium projects get them; they change nothing but WebRTC.
 */
const loopbackWebRtc = {
  launchOptions: { args: ['--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'] },
};

// Runs against the production build, so the service worker and base path are
// real, with Versus' Relay (server/) run locally beside it on port 8787;
// e2e/fixtures.ts points every page at it.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/tavern-td/' },
  webServer: [
    {
      command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/tavern-td/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node server/src/main.ts',
      url: 'http://localhost:8787/health',
      env: { PORT: '8787' },
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'mac-chrome', use: { ...devices['Desktop Chrome'], ...loopbackWebRtc } },
    { name: 'mac-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: landscape(devices['iPhone 15']) },
    { name: 'android', use: { ...landscape(devices['Pixel 7']), ...loopbackWebRtc } },
  ],
});
