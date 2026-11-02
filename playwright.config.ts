import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// Locally you can reuse an installed browser, e.g. PLAYWRIGHT_CHANNEL=msedge
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DEV_ADMIN_PASSWORD: 'e2e-admin-password',
      DEV_APARTMENT_CODES: '11111111,22222222,33333333,44444444',
      BUILDING_NAME: 'Pfarrweg',
    },
  },
});
