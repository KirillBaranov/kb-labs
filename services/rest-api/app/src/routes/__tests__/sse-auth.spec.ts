import { describe, expect, it, vi } from 'vitest';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { buildRegistrySseAuthHook } from '../sse-auth';

function baseConfig(overrides: Partial<RestApiConfig> = {}): RestApiConfig {
  const { events, ...rest } = overrides;
  const config: RestApiConfig = {
    port: 5050,
    basePath: '/api/v1',
    apiVersion: 'test',
    cors: {
      origins: [],
      allowCredentials: true,
      profile: 'dev',
    },
    plugins: [],
    mockMode: false,
    ...rest,
    events: events
      ? {
          registry: events.registry
            ? {
                token: events.registry.token,
                headerName: events.registry.headerName ?? 'authorization',
                queryParam: events.registry.queryParam ?? 'access_token',
              }
            : undefined,
        }
      : undefined,
  };
  return config;
}

describe('buildRegistrySseAuthHook', () => {
  it('returns undefined when auth is not configured', () => {
    const hook = buildRegistrySseAuthHook(baseConfig());
    expect(hook).toBeUndefined();
  });

  it('allows requests with valid bearer token', () => {
    const hook = buildRegistrySseAuthHook(
      baseConfig({
        events: {
          registry: {
            token: 'secret',
            headerName: 'authorization',
            queryParam: 'access_token',
          },
        },
      })
    );
    expect(hook).toBeDefined();
    const done = vi.fn();
    const request = {
      headers: {
        authorization: 'Bearer secret',
      },
      query: {},
    };
    const reply = {
      code: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    hook?.(request as any, reply as any, done as any);
    expect(done).toHaveBeenCalledTimes(1);
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('rejects requests with invalid token', () => {
    const hook = buildRegistrySseAuthHook(
      baseConfig({
        events: {
          registry: {
            token: 'secret',
            headerName: 'x-api-token',
            queryParam: 'auth',
          },
        },
      })
    );
    const done = vi.fn();
    const request = {
      headers: {
        'x-api-token': 'wrong',
      },
      query: { auth: 'wrong' },
    };
    const reply = {
      statusCode: undefined as number | undefined,
      payload: undefined as unknown,
      code(status: number) {
        this.statusCode = status;
        return this;
      },
      header() {
        return this;
      },
      send(payload: unknown) {
        this.payload = payload;
      },
    };
    hook?.(request as any, reply as any, done as any);
    expect(done).not.toHaveBeenCalled();
    expect(reply.statusCode).toBe(401);
    expect(reply.payload).toMatchObject({
      status: 'unauthorized',
      reason: 'invalid_token',
    });
  });
});


