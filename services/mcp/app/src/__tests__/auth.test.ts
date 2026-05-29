import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from '@kb-labs/gateway-auth';
import type { ICache } from '@kb-labs/core-platform';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import { extractBearer, loadJwtConfig, resolveAuthContext } from '../mcp/auth.js';

const mockCache = {} as ICache;
const cfg = { secret: 'test-secret' };

describe('extractBearer', () => {
  it('returns null for undefined', () => {
    expect(extractBearer(undefined)).toBeNull();
  });
  it('returns null when scheme is missing', () => {
    expect(extractBearer('tok123')).toBeNull();
  });
  it('extracts the token', () => {
    expect(extractBearer('Bearer tok123')).toBe('tok123');
  });
  it('is case-insensitive on the scheme', () => {
    expect(extractBearer('bearer tok123')).toBe('tok123');
  });
});

describe('loadJwtConfig', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('uses GATEWAY_JWT_SECRET when set', () => {
    process.env.GATEWAY_JWT_SECRET = 's3cr3t';
    expect(loadJwtConfig().secret).toBe('s3cr3t');
  });

  it('falls back to a dev secret outside production', () => {
    delete process.env.GATEWAY_JWT_SECRET;
    process.env.NODE_ENV = 'development';
    expect(loadJwtConfig().secret).toBeTruthy();
  });

  it('throws in production without a secret', () => {
    delete process.env.GATEWAY_JWT_SECRET;
    process.env.NODE_ENV = 'production';
    expect(() => loadJwtConfig()).toThrow(/GATEWAY_JWT_SECRET/);
  });
});

describe('resolveAuthContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no header is present', async () => {
    expect(await resolveAuthContext(undefined, mockCache, cfg)).toBeNull();
  });

  it('returns null when the header has no bearer token', async () => {
    expect(await resolveAuthContext('Basic xyz', mockCache, cfg)).toBeNull();
  });

  it('delegates verification to AuthService.verify', async () => {
    const ctx: AuthContext = {
      type: 'machine',
      userId: 'host-1',
      namespaceId: 'tenant-1',
      tier: 'free',
      permissions: ['host:connect'],
    };
    const spy = vi.spyOn(AuthService.prototype, 'verify').mockResolvedValue(ctx);
    const result = await resolveAuthContext('Bearer tok', mockCache, cfg);
    expect(spy).toHaveBeenCalledWith('tok');
    expect(result).toBe(ctx);
  });

  it('returns null when the token is invalid', async () => {
    vi.spyOn(AuthService.prototype, 'verify').mockResolvedValue(null);
    expect(await resolveAuthContext('Bearer bad', mockCache, cfg)).toBeNull();
  });
});
