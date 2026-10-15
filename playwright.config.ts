import { defineConfig, devices } from '@playwright/test';

const landscape = (device: (typeof devices)[string]) => ({
  ...device,
  viewport: { width: device.viewport.height, height: device.viewport.width },
});

// Runs against the production build, so the service worker and base path are real.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173/tavern-td/' },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/tavern-td/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mac-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mac-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: landscape(devices['iPhone 15']) },
    { name: 'android', use: landscape(devices['Pixel 7']) },
  ],
});
