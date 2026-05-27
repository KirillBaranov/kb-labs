import { defineConfig, devices } from '@playwright/test'

/**
 * E2E suite for Studio user authentication (ADR-0020, Phase 4).
 * 33 mandatory acceptance scenarios.
 *
 * Environment variables:
 *   STUDIO_URL        Studio base URL   (default: http://localhost:4000)
 *   GATEWAY_URL       Gateway API URL   (default: http://localhost:4000)
 *   ADMIN_EMAIL       Bootstrap admin   (default: admin@kb-cloud.test)
 *   ADMIN_PASSWORD    Bootstrap pass    (default: AdminPass123!)
 *   TENANT_ID         Default tenant    (default: kb-cloud)
 *
 * For session-expiry tests (scenarios 5, 6, 7a/b):
 *   AUTH_ACCESS_TTL_SEC   access token TTL in seconds (default: 5 for e2e)
 *   AUTH_REFRESH_TTL_SEC  refresh token TTL in seconds (default: 30 for e2e)
 */
export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,   // auth state is shared — serialise to avoid races
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.STUDIO_URL ?? 'http://localhost:4000',
    actionTimeout: 10_000,
    // Store cookies per test context so sessions don't bleed.
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
