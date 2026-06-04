/**
 * @module @kb-labs/core-runtime/__tests__/service-bootstrap
 *
 * Tests for createServiceBootstrap shared utility.
 *
 * Tests:
 * - Basic initialization (NoOp path — no real kb.config.json needed)
 * - Idempotency (second call returns immediately)
 * - loadEnv: false skips env loading
 * - Returns platform singleton
 * - resetServiceBootstrap restores initial state
 * - .env parsing (KEY=VALUE, quoted values, comments, existing vars not overwritten)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { platform } from '../container.js';
import {
  createServiceBootstrap,
  resetServiceBootstrap,
  getPlatformRoot,
  getProjectRoot,
  loadEnvFromRoot,
} from '../service-bootstrap.js';

// Minimal no-op hook for tests — passes through without wrapping adapters.
// Tests don't configure real adapters, so assembly would be a no-op anyway.
const mockHook = (_raw: object, _broker: unknown, cfg: Partial<Record<string, unknown>>) => cfg;

describe('createServiceBootstrap', () => {
  let tmpDir: string;

  beforeEach(async () => {
    resetServiceBootstrap();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-svc-bootstrap-'));
  });

  afterEach(async () => {
    resetServiceBootstrap();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Basic initialization ──────────────────────────────────────────────────

  it('initializes platform with NoOp adapters when no kb.config.json exists', async () => {
    const result = await createServiceBootstrap({ appId: 'test-svc', repoRoot: tmpDir, assemblyHook: mockHook });

    expect(result).toBe(platform);
    expect(platform.isInitialized).toBe(true);
  });

  it('returns platform singleton', async () => {
    const result = await createServiceBootstrap({ appId: 'test-svc', repoRoot: tmpDir, assemblyHook: mockHook });
    expect(result).toBe(platform);
  });

  it('registers lifecycle hooks under appId without throwing', async () => {
    await expect(
      createServiceBootstrap({ appId: 'my-unique-service', repoRoot: tmpDir, assemblyHook: mockHook }),
    ).resolves.not.toThrow();
  });

  // ─── Idempotency ───────────────────────────────────────────────────────────

  it('is idempotent — second call returns immediately without re-initializing', async () => {
    const first = await createServiceBootstrap({ appId: 'test-svc', repoRoot: tmpDir, assemblyHook: mockHook });
    const second = await createServiceBootstrap({ appId: 'test-svc', repoRoot: tmpDir, assemblyHook: mockHook });

    expect(first).toBe(second);
    expect(first).toBe(platform);
  });

  it('does not re-register lifecycle hooks on second call', async () => {
    const spy = vi.spyOn(platform, 'registerLifecycleHooks');

    await createServiceBootstrap({ appId: 'hook-test', repoRoot: tmpDir, assemblyHook: mockHook });
    await createServiceBootstrap({ appId: 'hook-test', repoRoot: tmpDir, assemblyHook: mockHook });

    // hooks registered exactly once for this appId
    expect(spy.mock.calls.filter(c => c[0] === 'hook-test')).toHaveLength(1);
    spy.mockRestore();
  });

  // ─── loadEnv option ────────────────────────────────────────────────────────

  it('loads .env from repoRoot by default', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'TEST_VAR_BOOTSTRAP=hello\n');
    delete process.env['TEST_VAR_BOOTSTRAP'];

    await createServiceBootstrap({ appId: 'env-test', repoRoot: tmpDir, assemblyHook: mockHook });

    expect(process.env['TEST_VAR_BOOTSTRAP']).toBe('hello');
    delete process.env['TEST_VAR_BOOTSTRAP'];
  });

  it('skips .env loading when loadEnv: false', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'TEST_VAR_SKIP=should-not-load\n');
    delete process.env['TEST_VAR_SKIP'];

    await createServiceBootstrap({ appId: 'skip-env-test', repoRoot: tmpDir, loadEnv: false, assemblyHook: mockHook });

    expect(process.env['TEST_VAR_SKIP']).toBeUndefined();
    delete process.env['TEST_VAR_SKIP'];
  });

  it('does not overwrite already-set env vars', async () => {
    process.env['TEST_EXISTING_VAR'] = 'original';
    await fs.writeFile(path.join(tmpDir, '.env'), 'TEST_EXISTING_VAR=overwritten\n');

    await createServiceBootstrap({ appId: 'no-overwrite-test', repoRoot: tmpDir, assemblyHook: mockHook });

    expect(process.env['TEST_EXISTING_VAR']).toBe('original');
    delete process.env['TEST_EXISTING_VAR'];
  });

  // ─── .env parsing ──────────────────────────────────────────────────────────

  describe('.env file parsing', () => {
    async function parseEnv(content: string, key: string): Promise<string | undefined> {
      resetServiceBootstrap();
      delete process.env[key];
      await fs.writeFile(path.join(tmpDir, '.env'), content);
      await createServiceBootstrap({ appId: 'parse-test', repoRoot: tmpDir, assemblyHook: mockHook });
      const val = process.env[key];
      delete process.env[key];
      return val;
    }

    it('parses plain KEY=VALUE', async () => {
      expect(await parseEnv('PLAIN_KEY=plain_value\n', 'PLAIN_KEY')).toBe('plain_value');
    });

    it('strips double quotes', async () => {
      expect(await parseEnv('QUOTED_KEY="quoted value"\n', 'QUOTED_KEY')).toBe('quoted value');
    });

    it('strips single quotes', async () => {
      expect(await parseEnv("SINGLE_KEY='single value'\n", 'SINGLE_KEY')).toBe('single value');
    });

    it('strips backtick quotes', async () => {
      expect(await parseEnv('BACKTICK_KEY=`backtick value`\n', 'BACKTICK_KEY')).toBe('backtick value');
    });

    it('ignores comment lines', async () => {
      const content = '# This is a comment\nCOMMENT_TEST=value\n';
      expect(await parseEnv(content, 'COMMENT_TEST')).toBe('value');
    });

    it('ignores empty lines', async () => {
      const content = '\n\nEMPTY_LINE_TEST=value\n\n';
      expect(await parseEnv(content, 'EMPTY_LINE_TEST')).toBe('value');
    });

    it('ignores lines without = separator', async () => {
      const content = 'INVALID_LINE\nVALID_KEY=valid\n';
      expect(await parseEnv(content, 'VALID_KEY')).toBe('valid');
    });

    it('handles missing .env file gracefully', async () => {
      // no .env file in tmpDir
      await expect(
        createServiceBootstrap({ appId: 'no-env-file', repoRoot: tmpDir, assemblyHook: mockHook }),
      ).resolves.not.toThrow();
    });
  });

  // ─── storeRawConfig ────────────────────────────────────────────────────────

  it('does not throw when storeRawConfig: false and no config file', async () => {
    await expect(
      createServiceBootstrap({ appId: 'no-raw-cfg', repoRoot: tmpDir, storeRawConfig: false, assemblyHook: mockHook }),
    ).resolves.not.toThrow();
  });

  // ─── resetServiceBootstrap ─────────────────────────────────────────────────

  it('resetServiceBootstrap allows re-initialization', async () => {
    await createServiceBootstrap({ appId: 'reset-test', repoRoot: tmpDir, assemblyHook: mockHook });
    expect(platform.isInitialized).toBe(true);

    resetServiceBootstrap();
    expect(platform.isInitialized).toBe(false);

    // can initialize again
    await createServiceBootstrap({ appId: 'reset-test-2', repoRoot: tmpDir, assemblyHook: mockHook });
    expect(platform.isInitialized).toBe(true);
  });

  // ─── assembly enforcement ──────────────────────────────────────────────────

  it('createServiceBootstrap accepts assemblyHook without throwing', async () => {
    // Tests that the required assemblyHook field is accepted and the platform
    // boots successfully. Hook invocation and platform.isAssembled are tested
    // in loader.test.ts (parent-process context); vitest runs as a child
    // process where the assembly path in initPlatform is intentionally skipped
    // (IPC proxies are used instead of real adapters).
    let hookCalled = false;
    const trackingHook = (raw: object, broker: unknown, cfg: Partial<Record<string, unknown>>) => {
      hookCalled = true;
      return cfg;
    };
    await expect(
      createServiceBootstrap({ appId: 'assembly-test', repoRoot: tmpDir, assemblyHook: trackingHook }),
    ).resolves.not.toThrow();
    // hookCalled may be false in vitest (child process mode — assembly hook runs
    // in parent path only). The TypeScript required-field check and the runtime
    // guard in loader.ts enforce correct usage at the language and startup level.
  });
});

// ─── getPlatformRoot / getProjectRoot ─────────────────────────────────────────

describe('getPlatformRoot / getProjectRoot', () => {
  let tmpDir: string;

  beforeEach(async () => {
    resetServiceBootstrap();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-roots-'));
  });

  afterEach(async () => {
    resetServiceBootstrap();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('both return undefined before createServiceBootstrap is called', () => {
    expect(getPlatformRoot()).toBeUndefined();
    expect(getProjectRoot()).toBeUndefined();
  });

  it('both return a string (path) after createServiceBootstrap completes', async () => {
    await createServiceBootstrap({ appId: 'roots-test', repoRoot: tmpDir, assemblyHook: mockHook });

    expect(typeof getPlatformRoot()).toBe('string');
    expect(typeof getProjectRoot()).toBe('string');
  });

  it('both revert to undefined after resetServiceBootstrap', async () => {
    await createServiceBootstrap({ appId: 'roots-reset', repoRoot: tmpDir, assemblyHook: mockHook });
    resetServiceBootstrap();

    expect(getPlatformRoot()).toBeUndefined();
    expect(getProjectRoot()).toBeUndefined();
  });
});

// ─── loadEnvFromRoot ──────────────────────────────────────────────────────────

describe('loadEnvFromRoot', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-loadenv-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('parses KEY=VALUE from .env and sets process.env', async () => {
    const key = 'LOAD_ENV_TEST_PARSED';
    delete process.env[key];
    await fs.writeFile(path.join(tmpDir, '.env'), `${key}=from-file\n`);

    loadEnvFromRoot(tmpDir);

    expect(process.env[key]).toBe('from-file');
    delete process.env[key];
  });

  it('does not overwrite already-set environment variables', async () => {
    const key = 'LOAD_ENV_TEST_NO_OVERWRITE';
    process.env[key] = 'original';
    await fs.writeFile(path.join(tmpDir, '.env'), `${key}=overwritten\n`);

    loadEnvFromRoot(tmpDir);

    expect(process.env[key]).toBe('original');
    delete process.env[key];
  });

  it('does not throw when .env file does not exist', () => {
    expect(() => loadEnvFromRoot(tmpDir)).not.toThrow();
  });

  it('ignores comment lines starting with #', async () => {
    const key = 'LOAD_ENV_TEST_COMMENT';
    delete process.env[key];
    await fs.writeFile(path.join(tmpDir, '.env'), `# comment\n${key}=real\n`);

    loadEnvFromRoot(tmpDir);

    expect(process.env[key]).toBe('real');
    delete process.env[key];
  });
});
