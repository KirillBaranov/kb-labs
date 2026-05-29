/**
 * Tests for JWT secret validation in bootstrap (H6 security fix).
 * Bootstrap is otherwise hard to unit-test (requires full platform),
 * so we test the validation logic through environment variable behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture original env
const originalEnv = { ...process.env };

// Mock all heavy bootstrap deps before importing bootstrap
vi.mock('@kb-labs/core-platform', () => ({
  logDiagnosticEvent: vi.fn(),
}));

vi.mock('@kb-labs/core-runtime', () => ({
  platform: {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn() }) },
    cache: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), clear: vi.fn() },
    getAdapter: vi.fn().mockReturnValue(null),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
  createServiceBootstrap: vi.fn().mockResolvedValue(undefined),
  getPlatformRoot: vi.fn().mockReturnValue('/tmp/kb-platform'),
}));

vi.mock('../config.js', () => ({
  loadGatewayConfig: vi.fn().mockResolvedValue({
    port: 4000,
    upstreams: {},
    staticTokens: {},
  }),
}));

vi.mock('../server.js', () => ({
  createServer: vi.fn().mockResolvedValue({
    listen: vi.fn().mockResolvedValue('http://localhost:4000'),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../hosts/registry.js', () => ({
  HostRegistry: vi.fn().mockImplementation(() => ({
    restore: vi.fn().mockResolvedValue(0),
  })),
}));

vi.mock('@kb-labs/gateway-core', () => ({
  SqliteHostStore: vi.fn(),
}));

vi.mock('@kb-labs/shared-http', () => ({
  createCorrelatedLogger: vi.fn().mockReturnValue({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

describe('bootstrap — JWT secret validation (H6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env to original state before each test
    process.env = { ...originalEnv };
    delete process.env.GATEWAY_JWT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when NODE_ENV=production and GATEWAY_JWT_SECRET is not set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.GATEWAY_JWT_SECRET;

    const { bootstrap } = await import('../bootstrap.js');
    await expect(bootstrap('/tmp/test')).rejects.toThrow('GATEWAY_JWT_SECRET');
  });

  it('does not throw in dev mode when GATEWAY_JWT_SECRET is not set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.GATEWAY_JWT_SECRET;

    const { bootstrap } = await import('../bootstrap.js');
    await expect(bootstrap('/tmp/test')).resolves.not.toThrow();
  });

  it('does not throw in production when GATEWAY_JWT_SECRET is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.GATEWAY_JWT_SECRET = 'a'.repeat(64);

    const { bootstrap } = await import('../bootstrap.js');
    await expect(bootstrap('/tmp/test')).resolves.not.toThrow();
  });
});
