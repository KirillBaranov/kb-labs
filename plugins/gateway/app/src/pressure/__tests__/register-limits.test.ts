import { describe, it, expect, vi } from 'vitest';
import { ResourceBroker, InMemoryRateLimitBackend } from '@kb-labs/core-resource-broker';
import type { ILogger } from '@kb-labs/core-platform';
import type { PressureConfig } from '@kb-labs/gateway-contracts';
import { registerPressureLimits } from '../register-limits.js';

function mockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

function makeBroker(): ResourceBroker {
  return new ResourceBroker(new InMemoryRateLimitBackend());
}

describe('registerPressureLimits', () => {
  it('registers nothing when config is undefined', () => {
    const broker = makeBroker();
    const result = registerPressureLimits(broker, undefined, mockLogger());
    expect(result).toEqual({ perServiceRegistered: 0, perRouteRegistered: 0, perTenantEnabled: false });
    expect(broker.getRegisteredResources()).toEqual([]);
  });

  it('registers nothing when pressure.enabled is false', () => {
    const broker = makeBroker();
    const cfg: PressureConfig = {
      enabled: false,
      perService: { rest: { requestsPerSecond: 5 } },
      perRoute: [{ resource: 'gateway:route:x', pathPrefix: '/x', limits: { requestsPerSecond: 1 } }],
    };
    const result = registerPressureLimits(broker, cfg, mockLogger());
    expect(result.perServiceRegistered).toBe(0);
    expect(broker.getRegisteredResources()).toEqual([]);
  });

  it('registers one resource per perService entry', () => {
    const broker = makeBroker();
    const cfg: PressureConfig = {
      enabled: true,
      perService: {
        rest: { requestsPerSecond: 10 },
        workflow: { requestsPerSecond: 20 },
      },
      perRoute: [],
    };
    const result = registerPressureLimits(broker, cfg, mockLogger());
    expect(result.perServiceRegistered).toBe(2);
    expect(broker.hasResource('gateway:service:rest')).toBe(true);
    expect(broker.hasResource('gateway:service:workflow')).toBe(true);
  });

  it('registers one resource per perRoute override', () => {
    const broker = makeBroker();
    const cfg: PressureConfig = {
      enabled: true,
      perService: {},
      perRoute: [
        { resource: 'gateway:route:a', pathPrefix: '/a', limits: { requestsPerSecond: 1 } },
        { resource: 'gateway:route:b', pathPrefix: '/b', limits: { requestsPerSecond: 2 } },
      ],
    };
    const result = registerPressureLimits(broker, cfg, mockLogger());
    expect(result.perRouteRegistered).toBe(2);
    expect(broker.hasResource('gateway:route:a')).toBe(true);
    expect(broker.hasResource('gateway:route:b')).toBe(true);
  });

  it('reports perTenantEnabled when perTenant.enabled is true', () => {
    const broker = makeBroker();
    const cfg: PressureConfig = {
      enabled: true,
      perService: {},
      perRoute: [],
      perTenant: { enabled: true, limits: { requestsPerMinute: 60 } },
    };
    const result = registerPressureLimits(broker, cfg, mockLogger());
    expect(result.perTenantEnabled).toBe(true);
  });

  it('is idempotent — second call does not throw and resource stays registered', () => {
    const broker = makeBroker();
    const cfg: PressureConfig = {
      enabled: true,
      perService: { rest: { requestsPerSecond: 5 } },
      perRoute: [],
    };
    registerPressureLimits(broker, cfg, mockLogger());
    expect(() => registerPressureLimits(broker, cfg, mockLogger())).not.toThrow();
    expect(broker.hasResource('gateway:service:rest')).toBe(true);
  });

  it('emits a single pressure.boot info log', () => {
    const broker = makeBroker();
    const logger = mockLogger();
    const cfg: PressureConfig = {
      enabled: true,
      perService: { rest: { requestsPerSecond: 5 } },
      perRoute: [{ resource: 'gateway:route:x', pathPrefix: '/x', limits: { requestsPerSecond: 1 } }],
      perTenant: { enabled: true, limits: { requestsPerMinute: 60 } },
    };
    registerPressureLimits(broker, cfg, logger);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('pressure.boot', {
      event: 'pressure.boot',
      perService: 1,
      perRoute: 1,
      perTenant: true,
    });
  });
});
