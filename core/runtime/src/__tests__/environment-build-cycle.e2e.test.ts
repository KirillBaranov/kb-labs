/**
 * @module @kb-labs/core-runtime/__tests__/environment-build-cycle.e2e
 * Live E2E: provision docker environment -> run real build command -> verify -> teardown.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { initPlatform, resetPlatform } from '../loader.js';
import { platform } from '../container.js';

const executeMock = vi.fn(async () => ({
  ok: true,
  data: { ok: true },
  executionTimeMs: 1,
}));
const shutdownMock = vi.fn(async () => undefined);
const createExecutionBackendMock = vi.fn(() => ({
  execute: executeMock,
  shutdown: shutdownMock,
}));

vi.mock('@kb-labs/plugin-execution-factory', () => ({
  createExecutionBackend: createExecutionBackendMock,
}));

function hasDocker(): boolean {
  try {
    execFileSync('docker', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasAdapterPackage(moduleName: string): boolean {
  try {
    const require = createRequire(import.meta.url);
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

describe('environment build cycle e2e', () => {
  beforeEach(() => {
    resetPlatform();
    executeMock.mockClear();
    shutdownMock.mockClear();
    createExecutionBackendMock.mockClear();
  });

  afterEach(async () => {
    try {
      await platform.shutdown();
    } catch {
      // Best-effort shutdown in tests.
    }
    resetPlatform();
  });

  it.skipIf(
    !hasDocker() ||
      !hasAdapterPackage('@kb-labs/adapters-sqlite') ||
      !hasAdapterPackage('@kb-labs/adapters-environment-docker')
  )(
    'provisions environment, runs TypeScript build in container, and tears down cleanly',
    async () => {
      const workspaceRoot = path.resolve(process.cwd(), '../../..');
      const originalProcessSend = (process as any).send;
      (process as any).send = undefined;

      try {
        await initPlatform(
          {
            adapters: {
              db: '@kb-labs/adapters-sqlite',
              environment: '@kb-labs/adapters-environment-docker',
            } as any,
            adapterOptions: {
              db: {
                filename: ':memory:',
              },
              environment: {
                defaultImage: 'node:20-alpine',
                autoRemove: false,
                mountWorkspace: true,
                workspaceMountPath: '/workspace',
                workspace: {
                  cwd: workspaceRoot,
                },
                defaultTtlMs: 10 * 60 * 1000,
                janitorIntervalMs: 5 * 60 * 1000,
                janitorBatchSize: 10,
              },
            } as any,
            execution: {
              mode: 'in-process',
            },
          },
          workspaceRoot
        );
      } finally {
        (process as any).send = originalProcessSend;
      }

      const command = [
        'sh',
        '-lc',
        [
          'set -e',
          'mkdir -p /workspace/.kb-env-build-demo',
          'cd /workspace/.kb-env-build-demo',
          "cat > package.json <<'JSON'",
          '{',
          '  "name": "kb-env-build-demo",',
          '  "version": "1.0.0",',
          '  "private": true,',
          '  "scripts": {',
          '    "build": "tsc index.ts --target es2020 --module commonjs --outDir dist --pretty false"',
          '  },',
          '  "devDependencies": {',
          '    "typescript": "^5.9.3"',
          '  }',
          '}',
          'JSON',
          "cat > index.ts <<'TS'",
          "const value: number = 42;",
          "console.log('kb env build demo', value);",
          'TS',
          'npm install --silent',
          'npm run build --silent',
        ].join(' && '),
      ];

      const env = await platform.environmentManager!.createEnvironment({
        runId: 'run-env-build-e2e',
        templateId: 'env-build-demo',
        workspacePath: workspaceRoot,
        command,
      });

      const environmentId = env.environmentId;
      let status = await platform.environmentManager!.getEnvironmentStatus(environmentId);
      const deadline = Date.now() + 3 * 60 * 1000;

      while (status.status !== 'terminated' && status.status !== 'failed' && Date.now() < deadline) {
        await sleep(750);
        status = await platform.environmentManager!.getEnvironmentStatus(environmentId);
      }

      const inspectExitCode = execFileSync(
        'docker',
        ['inspect', '-f', '{{.State.ExitCode}}', environmentId],
        { encoding: 'utf8' }
      ).trim();

      const logs = execFileSync('docker', ['logs', environmentId], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      expect(Number(inspectExitCode)).toBe(0);
      expect(logs).toContain('kb env build demo 42');

      await platform.environmentManager!.destroyEnvironment(environmentId, 'e2e.complete');
      const afterDestroy = await platform.environmentManager!.getEnvironmentStatus(environmentId);
      expect(afterDestroy.status).toBe('terminated');
    }
  );
});
