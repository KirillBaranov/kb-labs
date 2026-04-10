/**
 * @module @kb-labs/core/config/__tests__/preset-lockfile.spec.ts
 * Tests for preset resolution and lockfile functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  resolvePreset,
  getPresetConfigForProduct,
  readLockfile,
  writeLockfile,
  updateLockfile,
  isLockfileUpToDate,
  clearCaches,
} from "../index";

describe("Preset and Lockfile System", () => {
  let testDir: string;
  let presetDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-preset-test-${Date.now()}`);
    presetDir = path.join(testDir, "node_modules", "@kb-labs", "org-preset");
    await fsp.mkdir(presetDir, { recursive: true });
    clearCaches();
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
    clearCaches();
  });

  describe("Preset Resolution", () => {
    it("should resolve preset from local node_modules", async () => {
      // Create preset package
      const packageJson = {
        name: "@kb-labs/org-preset",
        version: "1.3.2",
        description: "KB Labs org preset",
      };
      await fsp.writeFile(
        path.join(presetDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const configDefaults = {
        products: {
          "ai-review": {
            enabled: true,
            rules: ["security", "performance"],
          },
          devlink: {
            watch: true,
            build: true,
          },
        },
      };
      await fsp.writeFile(
        path.join(presetDir, "config.defaults.json"),
        JSON.stringify(configDefaults, null, 2),
      );

      const preset = await resolvePreset("@kb-labs/org-preset@1.3.2", testDir);

      expect(preset.name).toBe("@kb-labs/org-preset");
      expect(preset.version).toBe("1.3.2");
      expect(preset.path).toBe(presetDir);
      expect(preset.config).toEqual(configDefaults);
    });

    it("should get preset config for specific product", async () => {
      // Create preset package
      const packageJson = {
        name: "@kb-labs/org-preset",
        version: "1.3.2",
      };
      await fsp.writeFile(
        path.join(presetDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const configDefaults = {
        products: {
          "ai-review": {
            enabled: true,
            rules: ["security", "performance"],
          },
        },
      };
      await fsp.writeFile(
        path.join(presetDir, "config.defaults.json"),
        JSON.stringify(configDefaults, null, 2),
      );

      const preset = await resolvePreset("@kb-labs/org-preset@1.3.2", testDir);
      const aiReviewConfig = getPresetConfigForProduct(preset, "aiReview");

      expect(aiReviewConfig).toEqual({
        enabled: true,
        rules: ["security", "performance"],
      });
    });

    it("should throw error for invalid preset reference", async () => {
      await expect(resolvePreset("invalid-preset", testDir)).rejects.toThrow(
        "Invalid preset reference",
      );
    });

    it("should throw error for missing preset", async () => {
      await expect(
        resolvePreset("@kb-labs/missing-preset@1.0.0", testDir),
      ).rejects.toThrow("Preset not found");
    });
  });

  describe("Lockfile Management", () => {
    it("should create and read lockfile", async () => {
      const lockfileData = {
        $schema: "https://schemas.kb-labs.dev/lockfile.schema.json",
        schemaVersion: "1.0" as const,
        orgPreset: "@kb-labs/org-preset@1.3.2",
        profile: "node-ts-lib@1.2.0",
        hashes: {
          "ai-review": "sha256-abc123",
          devlink: "sha256-def456",
        },
        generatedAt: new Date().toISOString(),
      };

      await writeLockfile(testDir, lockfileData);
      const readData = await readLockfile(testDir);

      expect(readData).toEqual(lockfileData);
    });

    it("should update lockfile with new hashes", async () => {
      // Create initial lockfile
      const initialData = {
        schemaVersion: "1.0" as const,
        hashes: {
          "ai-review": "sha256-old123",
        },
        generatedAt: new Date().toISOString(),
      };
      await writeLockfile(testDir, initialData);

      // Update with new config hashes
      const newConfigs = {
        aiReview: { enabled: true, rules: ["new-rule"] },
        devlink: { watch: true },
      };

      const updatedData = await updateLockfile(testDir, {
        configHashes: newConfigs,
      });

      expect(updatedData.hashes["ai-review"]).toBeDefined();
      expect(updatedData.hashes["devlink"]).toBeDefined();
      expect(updatedData.hashes["ai-review"]).not.toBe("sha256-old123");
    });

    it("should check if lockfile is up to date", async () => {
      const configs = {
        aiReview: { enabled: true, rules: ["test"] },
      };

      // No lockfile exists
      expect(await isLockfileUpToDate(testDir, configs)).toBe(false);

      // Create lockfile
      await updateLockfile(testDir, { configHashes: configs });

      // Should be up to date now
      expect(await isLockfileUpToDate(testDir, configs)).toBe(true);

      // Change config
      const newConfigs = {
        aiReview: { enabled: false, rules: ["different"] },
      };
      expect(await isLockfileUpToDate(testDir, newConfigs)).toBe(false);
    });

    it("should return null for missing lockfile", async () => {
      const lockfile = await readLockfile(testDir);
      expect(lockfile).toBeNull();
    });
  });
});
