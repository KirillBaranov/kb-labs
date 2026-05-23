/**
 * Unit tests for registry-http credential provider chain.
 * Verifies that KB_REGISTRY_URL decouples the data layer URL
 * from the execution gateway URL stored in credentials.json.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs to control credentials.json reads
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, readFile: vi.fn(), writeFile: vi.fn(), chmod: vi.fn() };
});

// Mock SDK env reader
vi.mock('@kb-labs/sdk', () => ({
  useEnv: (key: string) => process.env[key],
}));

import * as fsPromises from 'node:fs/promises';
import { registryPost } from '../registry-http.js';

const mockedReadFile = vi.mocked(fsPromises.readFile);
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const FAKE_CREDS = JSON.stringify({
  gatewayUrl: 'http://localhost:4000',
  accessToken: 'local-token',
  refreshToken: 'local-refresh',
  expiresAt: Date.now() + 60 * 60 * 1000, // 1h from now
  handle: 'kirill',
  namespaceId: 'ns_test',
});

function makeOkResponse(body: unknown = {}): Response {
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear all relevant env vars before each test
  delete process.env.KB_REGISTRY_TOKEN;
  delete process.env.KB_REGISTRY_URL;
  delete process.env.KB_GATEWAY_URL;
  delete process.env.KB_REGISTRY_AUTHOR_HANDLE;
  mockedReadFile.mockResolvedValue(FAKE_CREDS as any);
  mockFetch.mockResolvedValue(makeOkResponse({ ok: true }));
});

afterEach(() => {
  delete process.env.KB_REGISTRY_TOKEN;
  delete process.env.KB_REGISTRY_URL;
  delete process.env.KB_GATEWAY_URL;
  delete process.env.KB_REGISTRY_AUTHOR_HANDLE;
});

describe('registry-http credential provider chain', () => {
  describe('RH-01: KB_REGISTRY_URL + KB_REGISTRY_TOKEN (explicit CI/CD)', () => {
    it('uses KB_REGISTRY_URL as base URL when both token and registry URL are set', async () => {
      process.env.KB_REGISTRY_TOKEN = 'ci-token';
      process.env.KB_REGISTRY_URL = 'https://registry.example.com/api/v1/registry';

      await registryPost('/packages/test', {});

      const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      expect(calledUrl).toBe('https://registry.example.com/api/v1/registry/packages/test');
      // credentials.json should not be read
      expect(mockedReadFile).not.toHaveBeenCalled();
    });

    it('KB_REGISTRY_URL takes priority over KB_GATEWAY_URL', async () => {
      process.env.KB_REGISTRY_TOKEN = 'ci-token';
      process.env.KB_REGISTRY_URL = 'https://registry.example.com/api/v1/registry';
      process.env.KB_GATEWAY_URL = 'https://gateway.example.com'; // should be ignored

      await registryPost('/packages/test', {});

      const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      expect(calledUrl).toContain('registry.example.com');
      expect(calledUrl).not.toContain('gateway.example.com');
    });

    it('strips trailing slash from KB_REGISTRY_URL', async () => {
      process.env.KB_REGISTRY_TOKEN = 'ci-token';
      process.env.KB_REGISTRY_URL = 'https://registry.example.com/api/v1/registry/';

      await registryPost('/packages/test', {});

      const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      expect(calledUrl).toBe('https://registry.example.com/api/v1/registry/packages/test');
    });
  });

  describe('RH-02: KB_GATEWAY_URL + KB_REGISTRY_TOKEN (legacy CI/CD)', () => {
    it('derives registry URL from KB_GATEWAY_URL when KB_REGISTRY_URL is not set', async () => {
      process.env.KB_REGISTRY_TOKEN = 'ci-token';
      process.env.KB_GATEWAY_URL = 'https://api.kblabs.ru';

      await registryPost('/packages/test', {});

      const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      expect(calledUrl).toBe('https://api.kblabs.ru/api/v1/registry/packages/test');
      expect(mockedReadFile).not.toHaveBeenCalled();
    });
  });

  describe('RH-03: credentials.json + KB_REGISTRY_URL override', () => {
    it('uses KB_REGISTRY_URL as base URL when credentials.json is present (execution ≠ data layer)', async () => {
      // No token env var — falls through to credentials.json
      // But KB_REGISTRY_URL overrides the gatewayUrl for the registry base URL
      process.env.KB_REGISTRY_URL = 'https://api.kblabs.ru/api/v1/registry';

      await registryPost('/packages/test', {});

      const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      // Should use KB_REGISTRY_URL, not localhost:4000 from credentials.json
      expect(calledUrl).toBe('https://api.kblabs.ru/api/v1/registry/packages/test');
    });
  });

  describe('RH-04: credentials.json fully (no env overrides)', () => {
    it('derives registry URL from credentials.json.gatewayUrl when no env vars set', async () => {
      // No env vars — uses credentials.json.gatewayUrl + /api/v1/registry
      await registryPost('/packages/test', {});

      const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
      expect(calledUrl).toBe('http://localhost:4000/api/v1/registry/packages/test');
    });

    it('sends Bearer token from credentials.json', async () => {
      await registryPost('/packages/test', {});

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer local-token');
    });
  });

  describe('RH-05: no credentials, no env vars → error', () => {
    it('throws authentication error when no credentials are available', async () => {
      mockedReadFile.mockRejectedValue(new Error('ENOENT'));

      await expect(registryPost('/packages/test', {})).rejects.toThrow('Not authenticated');
    });
  });
});
