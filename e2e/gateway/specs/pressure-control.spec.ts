/**
 * E2E: HTTP pressure control via core ResourceBroker (ADR-0056).
 *
 * Assumes the gateway was started with KB_GATEWAY_CONFIG_PATH pointing at
 * `e2e/gateway/fixtures/kb.config.pressure.json`:
 *
 *   - perService.rest:      5 req/s    (resource `gateway:service:rest`)
 *   - perRoute /health:     3 req/s    (resource `gateway:route:health`)
 *   - perTenant:            30 req/min (resource `gateway:tenant:<namespaceId>`)
 *
 * The fixture sets `safetyMargin: 1` so the configured numbers are exact.
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { GATEWAY } from '@kb-labs/e2e-shared/urls.js';
import { issueToken } from '@kb-labs/e2e-shared/auth.js';

async function fireMany(
  request: APIRequestContext,
  url: string,
  count: number,
  options: { headers?: Record<string, string> } = {},
): Promise<Array<{ status: number; retryAfter: string | null }>> {
  const promises = Array.from({ length: count }, () =>
    request.get(url, { headers: options.headers }).then(res => ({
      status: res.status(),
      retryAfter: res.headers()['retry-after'] ?? null,
    })),
  );
  return Promise.all(promises);
}

async function registerWithNamespace(
  request: APIRequestContext,
  namespaceId: string,
  name: string,
) {
  const res = await request.post(`${GATEWAY}/auth/register`, {
    data: { name, namespaceId, capabilities: [] },
  });
  if (!res.ok()) {
    throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

test.describe('Gateway pressure control', () => {
  // Auto-skip the whole suite if the running gateway was not started with
  // pressure-overlay config. Lets the spec live in main without breaking CI
  // on stacks that didn't load `KB_GATEWAY_CONFIG_PATH` overlay.
  test.beforeAll(async ({ request }) => {
    const probe = await fireMany(request, `${GATEWAY}/health`, 12);
    const anyRejected = probe.some(r => r.status === 429);
    test.skip(
      !anyRejected,
      'Gateway is running without pressure overlay — skipping pressure-control specs. ' +
        'To run: start gateway with KB_GATEWAY_CONFIG_PATH=$(pwd)/e2e/gateway/fixtures/kb.config.pressure.json',
    );
    // Wait past the RPS window so the actual tests start from a clean slate.
    await new Promise(resolve => setTimeout(resolve, 1500));
  });

  test('GW-PC-01: per-service limit returns 429 once the RPS budget is exhausted', async ({ request }) => {
    // /health is overridden separately (route layer); hit an actual rest-upstream path instead.
    // Any path under `/api/v1` that REST responds to is fine; `/api/v1/health` works through proxy.
    const results = await fireMany(request, `${GATEWAY}/api/v1/health`, 20);
    const ok = results.filter(r => r.status === 200);
    const tooMany = results.filter(r => r.status === 429);

    expect(ok.length).toBeLessThanOrEqual(5);
    expect(tooMany.length).toBeGreaterThanOrEqual(15);
    for (const r of tooMany) {
      expect(r.retryAfter).not.toBeNull();
      expect(Number(r.retryAfter)).toBeGreaterThanOrEqual(1);
    }
  });

  test('GW-PC-02: RPS window recovers within ~1 second', async ({ request }) => {
    // Burn through the limit first.
    await fireMany(request, `${GATEWAY}/api/v1/health`, 20);
    // Then wait past the 1-second window and try again.
    await new Promise(resolve => setTimeout(resolve, 1200));
    const after = await fireMany(request, `${GATEWAY}/api/v1/health`, 3);
    expect(after.every(r => r.status === 200)).toBe(true);
  });

  test('GW-PC-03: per-route override applies before per-service', async ({ request }) => {
    // /health route override = 3 RPS, stricter than per-service.
    const results = await fireMany(request, `${GATEWAY}/health`, 10);
    const ok = results.filter(r => r.status === 200);
    const tooMany = results.filter(r => r.status === 429);
    expect(ok.length).toBeLessThanOrEqual(3);
    expect(tooMany.length).toBeGreaterThanOrEqual(7);
  });

  test('GW-PC-04: per-tenant limit isolates namespaces', async ({ request }) => {
    // Wait past any leftover RPS pressure from prior tests.
    await new Promise(resolve => setTimeout(resolve, 1500));

    const credsA = await registerWithNamespace(request, 'pc-tenant-a', 'pc-a');
    const credsB = await registerWithNamespace(request, 'pc-tenant-b', 'pc-b');
    const tokenA = (await issueToken(request, credsA)).accessToken;
    const tokenB = (await issueToken(request, credsB)).accessToken;

    // Tenant A: 35 requests, expect at most 30 OK (perTenant: 30/min).
    // Use the gateway-owned `/hosts` route which is auth-protected and
    // not affected by the per-route /health override or by the rest service limit.
    const headersA = { Authorization: `Bearer ${tokenA}` };
    const headersB = { Authorization: `Bearer ${tokenB}` };
    const aResults: Array<{ status: number }> = [];
    for (let i = 0; i < 35; i++) {
      const res = await request.get(`${GATEWAY}/hosts`, { headers: headersA });
      aResults.push({ status: res.status() });
    }
    const aOk = aResults.filter(r => r.status === 200).length;
    const aTooMany = aResults.filter(r => r.status === 429).length;
    expect(aOk).toBeLessThanOrEqual(30);
    expect(aTooMany).toBeGreaterThanOrEqual(5);

    // Tenant B: same instant, different namespace — should be unaffected.
    const bResult = await request.get(`${GATEWAY}/hosts`, { headers: headersB });
    expect(bResult.status()).toBe(200);
  });

  test('GW-PC-05: Retry-After header reflects actual wait window', async ({ request }) => {
    // Burn through the route-override budget so the next call is denied.
    await fireMany(request, `${GATEWAY}/health`, 10);

    const denied = await request.get(`${GATEWAY}/health`);
    expect(denied.status()).toBe(429);
    const retryAfter = Number(denied.headers()['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);

    // Wait Retry-After + a small buffer, then expect the next call to succeed.
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000 + 250));
    const after = await request.get(`${GATEWAY}/health`);
    expect(after.status()).toBe(200);
  });
});
