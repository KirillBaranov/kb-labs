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

interface ProdConfig {
  platform?: {
    adapters?: Record<string, unknown>;
    adapterOptions?: {
      serviceTransport?: { services?: Record<string, { url?: string }> };
    };
  };
  gateway?: unknown;
}

const prod = JSON.parse(readFileSync(prodConfigPath, 'utf-8')) as ProdConfig;

describe('gateway prod config', () => {
  it('gateway section validates against GatewayConfigSchema', () => {
    expect(() => GatewayConfigSchema.parse(prod.gateway)).not.toThrow();
  });

  it('declares the serviceTransport adapter the gateway requires', () => {
    expect(prod.platform?.adapters?.serviceTransport).toBeTruthy();
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
