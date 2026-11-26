import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_ORIGIN: 'http://localhost:3100',
      ADMIN_PASSWORD: 'test-only-password-8942',
      SESSION_SECRET: 'test-only-secret-at-least-thirty-two-characters',
      LOCAL_DATABASE_PATH: '.data/e2e-postgres',
      OPENAI_API_KEY: '',
    },
  },
});
