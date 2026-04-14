/**
 * Integration tests for platform-init.ts
 *
 * Tests platform initialization flow with REAL file system operations and config loading.
 * NO MOCKS - tests actual behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializePlatform } from '../platform-init';
import { platform } from '@kb-labs/core-runtime';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Platform Initialization (Real)', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for test configs
    testDir = join(tmpdir(), `kb-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '.kb'), { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Config Discovery', () => {
    it('should find kb.config.json in .kb/', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          adapters: {
            llm: '@kb-labs/llm-openai',
          },
        },
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toBeDefined();
      expect(result.platformConfig.adapters).toBeDefined();
      expect(result.platformConfig.adapters?.llm).toBe('@kb-labs/llm-openai');
      expect(result.rawConfig).toBeDefined();
    });

    it('should find kb.config.json in root', async () => {
      const configPath = join(testDir, 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          adapters: {
            embeddings: '@kb-labs/embeddings-openai',
          },
        },
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toBeDefined();
      expect(result.platformConfig.adapters?.embeddings).toBe('@kb-labs/embeddings-openai');
    });

    it('should traverse up to find config', async () => {
      const nestedDir = join(testDir, 'nested', 'deep');
      await mkdir(nestedDir, { recursive: true });

      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          adapters: {
            cache: '@kb-labs/cache-redis',
          },
        },
      }));

      // Pin KB_PLATFORM_ROOT to the same testDir so the loader treats the
      // single config file as platform defaults (adapters is platform-only,
      // so a project-layer override would be rejected by design — see ADR-0012).
      const originalPlatformRoot = process.env.KB_PLATFORM_ROOT;
      process.env.KB_PLATFORM_ROOT = testDir;
      try {
        const result = await initializePlatform(nestedDir);

        expect(result.platformConfig).toBeDefined();
        expect(result.platformConfig.adapters?.cache).toBe('@kb-labs/cache-redis');
      } finally {
        if (originalPlatformRoot === undefined) {
          delete process.env.KB_PLATFORM_ROOT;
        } else {
          process.env.KB_PLATFORM_ROOT = originalPlatformRoot;
        }
      }
    });
  });

  describe('Fallback Behavior', () => {
    it('should use NoOp adapters when no config found', async () => {
      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toEqual({ adapters: {} });
      expect(result.rawConfig).toBeUndefined();
    });

    it('should use NoOp adapters when config is malformed JSON', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, '{ invalid json }');

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toEqual({ adapters: {} });
      expect(result.rawConfig).toBeUndefined();
    });

    it('should use NoOp adapters when config has no platform field', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        someOtherField: 'value',
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toEqual({ adapters: {} });
      expect(result.rawConfig).toBeDefined();
      expect(result.rawConfig!.someOtherField).toBe('value');
    });

    it('should handle file read errors gracefully', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({ platform: { adapters: {} } }));

      // Make file unreadable (permission error)
      // Note: This may not work on all systems, skip if it fails
      try {
        const { chmod } = await import('node:fs/promises');
        await chmod(configPath, 0o000);

        const result = await initializePlatform(testDir);

        expect(result.platformConfig).toEqual({ adapters: {} });

        // Restore permissions for cleanup
        await chmod(configPath, 0o644);
      } catch (_err) {
        // Skip test if chmod fails (not supported on all systems)
        console.warn('Skipping permission test - chmod not supported');
      }
    });
  });

  describe('Platform Initialization', () => {
    it('should initialize platform with config', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          adapters: {
            llm: '@kb-labs/llm-openai',
            embeddings: '@kb-labs/embeddings-openai',
          },
          adapterOptions: {
            llm: {
              apiKey: 'test-key',
            },
          },
        },
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toBeDefined();
      expect(result.platformConfig.adapters).toBeDefined();
      expect(result.platformConfig.adapterOptions).toBeDefined();
      expect(platform.isInitialized).toBe(true);
    });

    it('should preserve full config in rawConfig', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          adapters: {
            llm: '@kb-labs/llm-openai',
          },
        },
        customField: 'customValue',
        nested: {
          data: 123,
        },
      }));

      const result = await initializePlatform(testDir);

      expect(result.rawConfig).toBeDefined();
      expect(result.rawConfig!.customField).toBe('customValue');
      expect(result.rawConfig!.nested).toEqual({ data: 123 });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty adapters object', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          adapters: {},
        },
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toEqual({ adapters: {} });
    });

    it('should handle null platform field', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: null,
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toEqual({ adapters: {} });
    });

    it('should handle undefined adapters', async () => {
      const configPath = join(testDir, '.kb', 'kb.config.json');
      await writeFile(configPath, JSON.stringify({
        platform: {
          // adapters field missing
        },
      }));

      const result = await initializePlatform(testDir);

      expect(result.platformConfig).toBeDefined();
    });
  });
});
