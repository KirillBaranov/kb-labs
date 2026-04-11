import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import Fastify from 'fastify';

import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { registerObservabilityRoutes } from '../observability';
import { exec } from 'node:child_process';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

const BASE_CONFIG: RestApiConfig = {
  port: 3000,
  basePath: '/api/v1',
  apiVersion: 'test',
  cors: {
    origins: [],
    allowCredentials: true,
    profile: 'dev',
  },
  plugins: [],
  mockMode: false,
};

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('registerObservabilityRoutes', () => {
  let app: ReturnType<typeof Fastify>;
  const repoRoot = '/mock/repo';

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await registerObservabilityRoutes(app, BASE_CONFIG, repoRoot);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/observability/state-broker', () => {
    it('returns State Broker statistics', async () => {
      const mockStats = {
        totalEntries: 42,
        hitRate: 0.85,
        namespaces: ['mind', 'workflow'],
        uptime: 3600,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockStats),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();

      expect(payload.ok).toBe(true);
      expect(payload.data).toEqual(mockStats);
      expect(payload.meta.source).toBe('state-broker');
      expect(payload.meta.daemonUrl).toBeDefined();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats'),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('uses KB_STATE_DAEMON_URL environment variable', async () => {
      const customUrl = 'http://custom-daemon:8888';
      process.env.KB_STATE_DAEMON_URL = customUrl;

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.meta.daemonUrl).toBe(customUrl);

      expect(mockFetch).toHaveBeenCalledWith(
        `${customUrl}/stats`,
        expect.anything()
      );

      delete process.env.KB_STATE_DAEMON_URL;
    });

    it('falls back to default URL when env var not set', async () => {
      delete process.env.KB_STATE_DAEMON_URL;

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(200);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7777/stats',
        expect.anything()
      );
    });

    it('returns 503 when State Broker responds with error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(503);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('STATE_BROKER_UNAVAILABLE');
      expect(payload.error.message).toContain('not available');
      expect(payload.error.details.status).toBe(500);
    });

    it('returns 503 when State Broker times out', async () => {
      const abortError = new Error('Timeout');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValue(abortError);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(503);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('STATE_BROKER_TIMEOUT');
      expect(payload.error.message).toContain('did not respond in time');
      expect(payload.error.details.isTimeout).toBe(true);
    });

    it('returns 503 when State Broker connection fails', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(503);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('STATE_BROKER_ERROR');
      expect(payload.error.message).toBe('Connection refused');
      expect(payload.error.details.isTimeout).toBe(false);
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/state-broker',
      });

      expect(response.statusCode).toBe(503);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('STATE_BROKER_ERROR');
      expect(payload.error.message).toBe('String error');
    });
  });

  describe('GET /api/v1/observability/devkit', () => {
    it('returns DevKit health check results', async () => {
      const mockHealth = {
        healthScore: 85,
        grade: 'B',
        issues: {
          critical: 0,
          warning: 5,
        },
        packages: {
          total: 90,
          withIssues: 12,
        },
      };

      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        callback(null, {
          stdout: JSON.stringify(mockHealth),
          stderr: '',
        });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();

      expect(payload.ok).toBe(true);
      expect(payload.data).toEqual(mockHealth);
      expect(payload.meta.source).toBe('devkit-cli');
      expect(payload.meta.repoRoot).toBe(repoRoot);
      expect(payload.meta.command).toBe('npx kb-devkit-health --json');
    });

    it('executes DevKit command in repo root', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        callback(null, { stdout: '{}', stderr: '' });
        return {} as any;
      });

      await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(mockExec).toHaveBeenCalledWith(
        'npx kb-devkit-health --json',
        expect.objectContaining({
          cwd: repoRoot,
          timeout: 30000,
          env: expect.objectContaining({
            CI: 'true',
          }),
        }),
        expect.any(Function)
      );
    });

    it('logs warnings when stderr is present', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        callback(null, {
          stdout: '{"healthScore": 70}',
          stderr: 'Warning: deprecated package found',
        });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();
      expect(payload.data.healthScore).toBe(70);
    });

    it('returns 500 when DevKit command fails', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        callback(new Error('Command failed'), { stdout: '', stderr: 'Error output' });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('DEVKIT_ERROR');
      expect(payload.error.message).toContain('Command failed');
    });

    it('includes partial data when DevKit fails but outputs JSON', async () => {
      const partialHealth = {
        healthScore: 50,
        grade: 'F',
        issues: { critical: 10 },
      };

      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        const error = new Error('Exit code 1') as any;
        error.stdout = JSON.stringify(partialHealth);
        callback(error, { stdout: error.stdout, stderr: '' });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe('DEVKIT_ERROR');
      expect(payload.error.details.partialData).toEqual(partialHealth);
    });

    it('handles invalid JSON in partial data gracefully', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        const error = new Error('Exit code 1') as any;
        error.stdout = 'invalid json{';
        callback(error, { stdout: error.stdout, stderr: '' });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.error.details.partialData).toBeNull();
    });

    it('handles DevKit command timeout', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        const error = new Error('Command timed out after 30000ms');
        callback(error, { stdout: '', stderr: '' });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.ok).toBe(false);
      expect(payload.error.message).toContain('timed out');
    });

    it('handles non-Error exceptions', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((cmd: any, options: any, callback: any) => {
        callback('String error', { stdout: '', stderr: '' });
        return {} as any;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/observability/devkit',
      });

      expect(response.statusCode).toBe(500);
      const payload = response.json();

      expect(payload.error.code).toBe('DEVKIT_ERROR');
      expect(payload.error.message).toBe('Failed to execute DevKit health check');
    });
  });
});
