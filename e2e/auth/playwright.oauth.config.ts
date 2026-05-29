import { defineConfig, devices } from '@playwright/test'

/**
 * OAuth/OIDC redirect-login E2E (ADR-0020, Step 6 + identity-provider v2).
 *
 * Runs against the dedicated OAuth docker stack (docker-compose.oauth-ci.yml):
 *   - studio-https : TLS origin named kb-cloud.kblabs.ru (:4443)
 *   - idp-stub     : real OIDC IdP (HTTPS :9443)
 *
 * Both hostnames resolve to 127.0.0.1 via Chromium host-resolver-rules below,
 * and the self-signed test cert is accepted via ignoreHTTPSErrors. This makes
 * the browser exercise the *real* cross-site OAuth round-trip — studio → gateway
 * /start → IdP login → callback → session cookies — exactly as in production,
 * including Secure cookies over https and a genuine cross-origin redirect.
 *
 * Kept in its own testDir (specs-oauth) + its own config so the plain-http
 * auth-ci suite (playwright.config.ts → ./specs) is completely unaffected.
 */

const STUDIO_HTTPS = process.env.OAUTH_STUDIO_URL ?? 'https://kb-cloud.kblabs.ru'

// Map the public hostnames onto the locally-exposed container ports. The gateway
// builds redirect_uri with no port (→ :443), so kb-cloud.kblabs.ru:443 must land
// on the studio-https container (4443); the IdP authorize host is idp-stub:9443.
const HOST_RESOLVER_RULES = [
  'MAP kb-cloud.kblabs.ru:443 127.0.0.1:4443',
  'MAP idp-stub:9443 127.0.0.1:9443',
].join(',')

export default defineConfig({
  testDir: './specs-oauth',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'report-oauth', open: 'never' }],
  ],
  use: {
    baseURL: STUDIO_HTTPS,
    actionTimeout: 10_000,
    // Self-signed test CA — the gateway trusts it via NODE_EXTRA_CA_CERTS; the
    // browser just ignores the cert error (it is test material).
    ignoreHTTPSErrors: true,
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [`--host-resolver-rules=${HOST_RESOLVER_RULES}`],
        },
      },
    },
  ],
})
