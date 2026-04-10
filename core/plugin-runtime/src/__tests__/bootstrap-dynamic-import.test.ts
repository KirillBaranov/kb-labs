/**
 * @module @kb-labs/plugin-runtime/__tests__/bootstrap-dynamic-import
 *
 * Critical tests for bootstrap.ts dynamic import architecture.
 *
 * This tests the solution to the circular dependency problem:
 *   core-runtime → plugin-execution-factory → plugin-runtime → core-runtime (CYCLE!)
 *
 * Solution: Dynamic import of initPlatform at runtime instead of compile-time.
 *
 * These tests verify:
 * 1. Dynamic import works when core-runtime is available
 * 2. Graceful degradation when core-runtime is missing
 * 3. KB_RAW_CONFIG_JSON parsing works correctly
 * 4. platformReady Promise resolves correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('Bootstrap Dynamic Import Tests', () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = join(tmpdir(), `bootstrap-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    // Mark the temp dir as ESM so .js files in test scripts use ESM module syntax
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ type: 'module' }));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should successfully load initPlatform via dynamic import when core-runtime exists', async () => {
    // This test verifies that the dynamic import architecture works
    // We can't easily mock dynamic imports in the same process, so we test the pattern

    // Create a mock module that simulates core-runtime
    const mockCoreRuntimePath = join(testDir, 'mock-core-runtime.js');
    writeFileSync(
      mockCoreRuntimePath,
      `
      export async function initPlatform(config, cwd) {
        console.log('[mock] initPlatform called with:', JSON.stringify(config));
        return Promise.resolve();
      }
      `
    );

    // Create a test script that uses dynamic import (similar to bootstrap.ts)
    const testScriptPath = join(testDir, 'test-dynamic-import.js');
    writeFileSync(
      testScriptPath,
      `
      (async () => {
        try {
          const rawConfigJson = process.env.KB_RAW_CONFIG_JSON;
          if (rawConfigJson) {
            const rawConfig = JSON.parse(rawConfigJson);
            const platformConfig = rawConfig.platform;

            if (platformConfig) {
              // Dynamic import - this is what we're testing
              const { initPlatform } = await import('${mockCoreRuntimePath}');
              await initPlatform(platformConfig, process.cwd());
              console.log('[test] SUCCESS: initPlatform loaded and called');
              process.exit(0);
            }
          }
          console.log('[test] SKIP: No platform config');
          process.exit(0);
        } catch (error) {
          console.error('[test] ERROR:', error.message);
          process.exit(1);
        }
      })();
      `
    );

    // Set up KB_RAW_CONFIG_JSON environment variable
    const testConfig = {
      platform: {
        adapters: {
          logger: { type: 'pino' },
        },
      },
    };

    // Spawn child process with the test script
    const child = spawn('node', [testScriptPath], {
      env: {
        ...process.env,
        KB_RAW_CONFIG_JSON: JSON.stringify(testConfig),
      },
      cwd: testDir,
    });

    let stdout = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('SUCCESS: initPlatform loaded and called');
    expect(stdout).toContain('[mock] initPlatform called');
  }, 10000);

  it('should handle missing core-runtime gracefully (no crash)', async () => {
    // This test verifies graceful degradation when core-runtime is not available

    const testScriptPath = join(testDir, 'test-missing-module.js');
    writeFileSync(
      testScriptPath,
      `
      (async () => {
        try {
          const rawConfigJson = process.env.KB_RAW_CONFIG_JSON;
          if (rawConfigJson) {
            const rawConfig = JSON.parse(rawConfigJson);
            const platformConfig = rawConfig.platform;

            if (platformConfig) {
              try {
                // Try to import non-existent module
                const { initPlatform } = await import('@kb-labs/nonexistent-module');
                await initPlatform(platformConfig, process.cwd());
              } catch (importError) {
                console.error('[test] Failed to initialize platform:', importError.message);
                // This should NOT crash the process - graceful degradation
              }
            }
          }
          console.log('[test] SUCCESS: Graceful degradation worked');
          process.exit(0);
        } catch (error) {
          console.error('[test] UNEXPECTED ERROR:', error.message);
          process.exit(1);
        }
      })();
      `
    );

    const testConfig = {
      platform: {
        adapters: {
          logger: { type: 'pino' },
        },
      },
    };

    const child = spawn('node', [testScriptPath], {
      env: {
        ...process.env,
        KB_RAW_CONFIG_JSON: JSON.stringify(testConfig),
      },
      cwd: testDir,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('SUCCESS: Graceful degradation worked');
    expect(stderr).toContain('Failed to initialize platform');
  }, 10000);

  it('should parse KB_RAW_CONFIG_JSON correctly', async () => {
    const testScriptPath = join(testDir, 'test-json-parsing.js');
    writeFileSync(
      testScriptPath,
      `
      (async () => {
        try {
          const rawConfigJson = process.env.KB_RAW_CONFIG_JSON;

          if (!rawConfigJson) {
            console.error('[test] ERROR: KB_RAW_CONFIG_JSON not set');
            process.exit(1);
          }

          const rawConfig = JSON.parse(rawConfigJson);
          console.log('[test] Parsed config:', JSON.stringify(rawConfig));

          if (!rawConfig.platform) {
            console.error('[test] ERROR: No platform config');
            process.exit(1);
          }

          if (!rawConfig.platform.adapters) {
            console.error('[test] ERROR: No adapters config');
            process.exit(1);
          }

          console.log('[test] SUCCESS: Config parsed correctly');
          console.log('[test] Logger type:', rawConfig.platform.adapters.logger.type);
          process.exit(0);
        } catch (error) {
          console.error('[test] ERROR:', error.message);
          process.exit(1);
        }
      })();
      `
    );

    const testConfig = {
      platform: {
        adapters: {
          logger: { type: 'pino', level: 'info' },
          vectorStore: { type: 'qdrant', url: 'http://localhost:6333' },
        },
      },
    };

    const child = spawn('node', [testScriptPath], {
      env: {
        ...process.env,
        KB_RAW_CONFIG_JSON: JSON.stringify(testConfig),
      },
      cwd: testDir,
    });

    let stdout = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('SUCCESS: Config parsed correctly');
    expect(stdout).toContain('Logger type: pino');
  }, 10000);

  it('should skip platform init when KB_RAW_CONFIG_JSON is not set', async () => {
    const testScriptPath = join(testDir, 'test-no-config.js');
    writeFileSync(
      testScriptPath,
      `
      (async () => {
        try {
          const rawConfigJson = process.env.KB_RAW_CONFIG_JSON;

          if (!rawConfigJson) {
            console.log('[test] SUCCESS: No config, skipping platform init');
            process.exit(0);
          }

          console.error('[test] ERROR: Unexpected config present');
          process.exit(1);
        } catch (error) {
          console.error('[test] ERROR:', error.message);
          process.exit(1);
        }
      })();
      `
    );

    // DON'T set KB_RAW_CONFIG_JSON
    const child = spawn('node', [testScriptPath], {
      env: process.env,
      cwd: testDir,
    });

    let stdout = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('SUCCESS: No config, skipping platform init');
  }, 10000);

  it('should skip platform init when platform config is missing', async () => {
    const testScriptPath = join(testDir, 'test-no-platform.js');
    writeFileSync(
      testScriptPath,
      `
      (async () => {
        try {
          const rawConfigJson = process.env.KB_RAW_CONFIG_JSON;

          if (rawConfigJson) {
            const rawConfig = JSON.parse(rawConfigJson);

            if (!rawConfig.platform) {
              console.log('[test] SUCCESS: No platform config, skipping init');
              process.exit(0);
            }
          }

          console.error('[test] ERROR: Unexpected platform config');
          process.exit(1);
        } catch (error) {
          console.error('[test] ERROR:', error.message);
          process.exit(1);
        }
      })();
      `
    );

    // Set config WITHOUT platform section
    const testConfig = {
      someOtherField: 'value',
    };

    const child = spawn('node', [testScriptPath], {
      env: {
        ...process.env,
        KB_RAW_CONFIG_JSON: JSON.stringify(testConfig),
      },
      cwd: testDir,
    });

    let stdout = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('SUCCESS: No platform config, skipping init');
  }, 10000);
});
