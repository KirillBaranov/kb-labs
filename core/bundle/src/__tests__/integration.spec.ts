/**
 * @module @kb-labs/core-bundle/__tests__/integration.spec.ts
 * Integration tests for the complete bundle system (v3 structure)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadBundle, clearCaches } from '../index';

describe('Bundle Integration Tests', () => {
  let testDir: string;
  let fixtureDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-bundle-integration-${Date.now()}`);
    fixtureDir = path.join(__dirname, '../__fixtures__/workspace');

    // Copy fixture workspace to test directory
    await fsp.mkdir(testDir, { recursive: true });
    await copyDir(fixtureDir, testDir);

    clearCaches();
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
    clearCaches();
  });

  describe('Full Bundle Loading', () => {
    it('should load complete bundle', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      expect(bundle.product).toBe('aiReview');
      expect(bundle.config).toBeDefined();
      expect(bundle.profile).toBeDefined();
      expect(bundle.policy).toBeDefined();
      expect(bundle.trace).toBeDefined();
      expect(Array.isArray(bundle.trace)).toBe(true);
    });

    it('should resolve profile correctly', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      expect(bundle.profile).not.toBeNull();
      expect(bundle.profile!.id).toBe('default');
      expect(bundle.profile!.label).toBe('Default Profile');
    });

    it('should merge configuration from profile', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      expect(bundle.config).toBeDefined();

      const config = bundle.config as any;
      expect(config.maxFiles).toBe(25);
      expect(config.debug).toBe(true);
      expect(config.rules).toEqual(['custom-rules.yml']);
    });

    it('should work with production profile', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'production'
      });

      expect(bundle.profile!.id).toBe('production');

      const config = bundle.config as any;
      expect(config.maxFiles).toBe(100);
      expect(config.debug).toBe(false);
    });

    it('should provide policy permits function', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      expect(bundle.policy.permits).toBeDefined();
      expect(typeof bundle.policy.permits).toBe('function');
    });

    it('should provide merge trace', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      expect(bundle.trace).toBeDefined();
      expect(Array.isArray(bundle.trace)).toBe(true);
      expect(bundle.trace.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing workspace config', async () => {
      const emptyDir = path.join(tmpdir(), `kb-labs-empty-${Date.now()}`);
      await fsp.mkdir(emptyDir, { recursive: true });

      try {
        await expect(
          loadBundle({
            cwd: emptyDir,
            product: 'aiReview',
            profileId: 'default'
          })
        ).rejects.toThrow(/No workspace configuration found/);
      } finally {
        await fsp.rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('should handle missing profile', async () => {
      await expect(
        loadBundle({
          cwd: testDir,
          product: 'aiReview',
          profileId: 'nonexistent'
        })
      ).rejects.toThrow(/Profile "nonexistent" not found/);
    });

    it('should handle product not in profile', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'nonexistentProduct',
        profileId: 'default'
      });

      // Should still load but config may be empty
      expect(bundle.product).toBe('nonexistentProduct');
      expect(bundle.config).toBeDefined();
    });
  });

  describe('Cache Management', () => {
    it('should clear caches correctly', async () => {
      // Load once to populate cache
      await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      // Clear caches
      clearCaches();

      // Load again - should work after cache clear
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      expect(bundle.config).toBeDefined();
    });
  });

  describe('Multiple Products', () => {
    it('should load different products from same profile', async () => {
      const aiReviewBundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      const releaseBundle = await loadBundle({
        cwd: testDir,
        product: 'release',
        profileId: 'default'
      });

      expect(aiReviewBundle.product).toBe('aiReview');
      expect(releaseBundle.product).toBe('release');

      const releaseConfig = releaseBundle.config as any;
      expect(releaseConfig.version).toBe('1.0.0');
      expect(releaseConfig.prerelease).toBe(false);
    });
  });

  describe('Platform Configuration', () => {
    it('should load platform config from kb.config', async () => {
      const bundle = await loadBundle({
        cwd: testDir,
        product: 'aiReview',
        profileId: 'default'
      });

      // Platform config is loaded but not directly exposed in Bundle
      // It's used internally by the system
      expect(bundle).toBeDefined();
      expect(bundle.trace).toBeDefined();
    });
  });
});

/**
 * Recursively copy directory
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}
