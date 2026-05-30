import { describe, it, expect } from 'vitest';
import type { GatewayConfig } from '@kb-labs/gateway-contracts';
import { resolveResourceId } from '../resolve.js';

const cfg = (overrides: Partial<GatewayConfig> = {}): GatewayConfig => ({
  port: 4000,
  upstreams: {},
  staticTokens: {},
  ...overrides,
});

describe('resolveResourceId', () => {
  it('returns null when pressure config is absent', () => {
    expect(resolveResourceId('GET', '/api/v1/rest/x', cfg())).toBeNull();
  });

  it('returns null when pressure.enabled is false', () => {
    const c = cfg({
      pressure: { enabled: false, perService: {}, perRoute: [] },
    });
    expect(resolveResourceId('GET', '/api/v1/rest/x', c)).toBeNull();
  });

  it('resolves to a per-service resource via upstream prefix match', () => {
    const c = cfg({
      upstreams: { rest: { serviceId: 'rest', prefix: '/api/v1/rest' } },
      pressure: {
        enabled: true,
        perService: { rest: { requestsPerSecond: 10 } },
        perRoute: [],
      },
    });
    expect(resolveResourceId('GET', '/api/v1/rest/health', c)).toEqual({
      resource: 'gateway:service:rest',
      layer: 'service',
      upstream: 'rest',
    });
  });

  it('returns null when upstream matches but perService is empty for it', () => {
    const c = cfg({
      upstreams: { workflow: { serviceId: 'rest', prefix: '/api/v1/workflow' } },
      pressure: { enabled: true, perService: {}, perRoute: [] },
    });
    expect(resolveResourceId('GET', '/api/v1/workflow/x', c)).toBeNull();
  });

  it('matches a per-route override over a per-service one', () => {
    const c = cfg({
      upstreams: { rest: { serviceId: 'rest', prefix: '/api/v1/rest' } },
      pressure: {
        enabled: true,
        perService: { rest: { requestsPerSecond: 100 } },
        perRoute: [{
          resource: 'gateway:route:webhooks',
          pathPrefix: '/api/v1/rest/webhooks',
          limits: { requestsPerSecond: 5 },
        }],
      },
    });
    const r = resolveResourceId('POST', '/api/v1/rest/webhooks/github', c);
    expect(r?.layer).toBe('route');
    expect(r?.resource).toBe('gateway:route:webhooks');
  });

  it('filters per-route override by HTTP method when methods are set', () => {
    const c = cfg({
      upstreams: { rest: { serviceId: 'rest', prefix: '/api/v1/rest' } },
      pressure: {
        enabled: true,
        perService: { rest: { requestsPerSecond: 100 } },
        perRoute: [{
          resource: 'gateway:route:post-only',
          pathPrefix: '/api/v1/rest/x',
          methods: ['POST'],
          limits: { requestsPerSecond: 5 },
        }],
      },
    });
    const post = resolveResourceId('POST', '/api/v1/rest/x', c);
    const get = resolveResourceId('GET', '/api/v1/rest/x', c);
    expect(post?.layer).toBe('route');
    expect(get?.layer).toBe('service');
  });

  it('without methods restriction matches any HTTP method', () => {
    const c = cfg({
      pressure: {
        enabled: true,
        perService: {},
        perRoute: [{
          resource: 'gateway:route:any',
          pathPrefix: '/x',
          limits: { requestsPerSecond: 5 },
        }],
      },
    });
    expect(resolveResourceId('PATCH', '/x/y', c)?.resource).toBe('gateway:route:any');
    expect(resolveResourceId('DELETE', '/x', c)?.resource).toBe('gateway:route:any');
  });

  it('returns the first matching override when multiple match', () => {
    const c = cfg({
      pressure: {
        enabled: true,
        perService: {},
        perRoute: [
          { resource: 'gateway:route:first', pathPrefix: '/a', limits: { requestsPerSecond: 1 } },
          { resource: 'gateway:route:second', pathPrefix: '/a/b', limits: { requestsPerSecond: 2 } },
        ],
      },
    });
    expect(resolveResourceId('GET', '/a/b/c', c)?.resource).toBe('gateway:route:first');
  });

  it('ignores query string when matching prefix', () => {
    const c = cfg({
      upstreams: { rest: { serviceId: 'rest', prefix: '/api/v1/rest' } },
      pressure: { enabled: true, perService: { rest: { requestsPerSecond: 5 } }, perRoute: [] },
    });
    expect(
      resolveResourceId('GET', '/api/v1/rest/x?token=foo', c)?.resource,
    ).toBe('gateway:service:rest');
  });
});
