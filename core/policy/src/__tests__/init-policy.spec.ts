/**
 * @module @kb-labs/core-policy/__tests__/init-policy
 * Smoke tests for initPolicy
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { initPolicy } from "../api/init-policy";
import os from "node:os";

describe("initPolicy", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `kb-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("appends policy scaffold to YAML config", async () => {
    // Create workspace config
    const configPath = path.join(tmpDir, ".kb", "kb.config.yaml");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      'schemaVersion: "1.0"\nprofiles: {}\n',
      "utf-8",
    );

    const result = await initPolicy({
      cwd: tmpDir,
      bundleName: "default",
      scaffoldCommented: true,
    });

    expect(result.updated).toHaveLength(1);

    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain("# policy:");
    expect(content).toContain("#   schemaVersion:");
    expect(content).toContain("maintainer:");
  });

  it("skips policy scaffold for JSON config", async () => {
    // Create workspace config in JSON
    const configPath = path.join(tmpDir, ".kb", "kb.config.json");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({ schemaVersion: "1.0", profiles: {} }),
      "utf-8",
    );

    const result = await initPolicy({
      cwd: tmpDir,
      bundleName: "default",
      scaffoldCommented: true,
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("skipped for JSON"))).toBe(
      true,
    );
  });

  it("is idempotent - skips if already exists", async () => {
    const configPath = path.join(tmpDir, ".kb", "kb.config.yaml");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      'schemaVersion: "1.0"\n# policy:\n#   bundle: default\n',
      "utf-8",
    );

    const result = await initPolicy({
      cwd: tmpDir,
      bundleName: "default",
      scaffoldCommented: true,
    });

    expect(result.skipped).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("already exists"))).toBe(
      true,
    );
  });

  it("supports dry-run mode", async () => {
    const configPath = path.join(tmpDir, ".kb", "kb.config.yaml");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    const originalContent = 'schemaVersion: "1.0"\nprofiles: {}\n';
    await fs.writeFile(configPath, originalContent, "utf-8");

    const result = await initPolicy({
      cwd: tmpDir,
      bundleName: "default",
      scaffoldCommented: true,
      dryRun: true,
    });

    expect(result.actions.length).toBeGreaterThan(0);

    // File should not be modified
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toBe(originalContent);
  });
});
