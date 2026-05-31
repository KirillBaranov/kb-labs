import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { GatewayConfigSchema } from '@kb-labs/gateway-contracts';

// Guard against config/schema drift: the prod config baked into the gateway
// image (Dockerfile COPYs .kb/kb.config.prod.json → .kb/kb.config.json) must
// stay valid against the current GatewayConfigSchema. A url→serviceId upstream
// migration that updated the dev config but not this file shipped a gateway
// that crash-looped in prod on `loadGatewayConfig` — this test makes that
// failure mode impossible to merge.

const __dirname = dirname(fileURLToPath(import.meta.url));
const prodConfigPath = resolve(__dirname, '../../.kb/kb.config.prod.json');
const prodLockPath = resolve(__dirname, '../../.kb/marketplace.prod.lock');

interface ProdConfig {
  platform?: {
    adapters?: Record<string, string>;
    adapterOptions?: {
      serviceTransport?: { services?: Record<string, { url?: string }> };
    };
  };
  gateway?: unknown;
}

interface ProdLock {
  installed?: Record<string, { enabled?: boolean }>;
}

const prod = JSON.parse(readFileSync(prodConfigPath, 'utf-8')) as ProdConfig;
const lock = JSON.parse(readFileSync(prodLockPath, 'utf-8')) as ProdLock;

describe('gateway prod config', () => {
  it('gateway section validates against GatewayConfigSchema', () => {
    expect(() => GatewayConfigSchema.parse(prod.gateway)).not.toThrow();
  });

  it('declares the serviceTransport adapter the gateway requires', () => {
    expect(prod.platform?.adapters?.serviceTransport).toBeTruthy();
  });

  it('the serviceTransport adapter is installed+enabled in the prod lock', () => {
    // serviceTransport is HARD-required: the gateway throws at boot if the
    // adapter is missing (no fallback, unlike analytics/logs which degrade to
    // InMemory/NoOp). The platform only instantiates adapters present and
    // enabled in the marketplace lock — so a config that names it while the
    // lock omits it crash-loops in prod. Assert the two stay in lockstep.
    const pkg = prod.platform?.adapters?.serviceTransport;
    expect(pkg, 'config.platform.adapters.serviceTransport must be set').toBeTruthy();
    const entry = lock.installed?.[pkg!];
    expect(entry, `serviceTransport adapter "${pkg}" is missing from marketplace.prod.lock`).toBeTruthy();
    expect(entry?.enabled, `serviceTransport adapter "${pkg}" is in the lock but not enabled`).toBe(true);
  });

  it('every upstream serviceId resolves to a serviceTransport service', () => {
    const gateway = GatewayConfigSchema.parse(prod.gateway);
    const services = prod.platform?.adapterOptions?.serviceTransport?.services ?? {};
    for (const [name, upstream] of Object.entries(gateway.upstreams)) {
      expect(
        services[upstream.serviceId],
        `upstream "${name}" → serviceId "${upstream.serviceId}" is not defined in adapterOptions.serviceTransport.services`,
      ).toBeTruthy();
      expect(services[upstream.serviceId]?.url).toMatch(/^https?:\/\//);
    }
  });
});
