/**
 * @module @kb-labs/core-config/__tests__/init-workspace
 * Smoke tests for initWorkspaceConfig
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { initWorkspaceConfig } from "../api/init-workspace";
import os from "node:os";

describe("initWorkspaceConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `kb-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates new workspace config in YAML format", async () => {
    const result = await initWorkspaceConfig({
      cwd: tmpDir,
      format: "yaml",
      products: ["aiReview"],
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatch(/\.kb\/kb\.config\.yaml$/);

    const configPath = path.join(tmpDir, ".kb", "kb.config.yaml");
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain('schemaVersion: "1.0"');
    expect(content).toContain("aiReview");
  });

  it("creates new workspace config in JSON format", async () => {
    const result = await initWorkspaceConfig({
      cwd: tmpDir,
      format: "json",
      products: ["aiReview"],
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatch(/\.kb\/kb\.config\.json$/);

    const configPath = path.join(tmpDir, ".kb", "kb.config.json");
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.products).toHaveProperty("aiReview");
  });

  it("is idempotent - second run skips unchanged config", async () => {
    // First run
    await initWorkspaceConfig({
      cwd: tmpDir,
      format: "yaml",
      products: ["aiReview"],
    });

    // Second run with same options
    const result2 = await initWorkspaceConfig({
      cwd: tmpDir,
      format: "yaml",
      products: ["aiReview"],
    });

    expect(result2.skipped).toHaveLength(1);
    expect(result2.created).toHaveLength(0);
    expect(result2.updated).toHaveLength(0);
  });

  it("detects conflicts without --force", async () => {
    // Create initial config
    const configPath = path.join(tmpDir, ".kb", "kb.config.yaml");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      'schemaVersion: "1.0"\nproducts:\n  aiReview: {}\n',
      "utf-8",
    );

    // Try to overwrite with different content
    const result = await initWorkspaceConfig({
      cwd: tmpDir,
      format: "yaml",
      products: ["aiReview", "aiDocs"],
      force: false,
    });

    const conflicts = result.actions.filter((a) => a.kind === "conflict");
    expect(conflicts.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("supports dry-run mode", async () => {
    const result = await initWorkspaceConfig({
      cwd: tmpDir,
      format: "yaml",
      products: ["aiReview"],
      dryRun: true,
    });

    expect(result.actions.length).toBeGreaterThan(0);

    // File should not actually be created
    const configPath = path.join(tmpDir, ".kb", "kb.config.yaml");
    await expect(fs.access(configPath)).rejects.toThrow();
  });

  it("warns when deprecated profiles option is provided", async () => {
    const result = await initWorkspaceConfig({
      cwd: tmpDir,
      format: "yaml",
      profiles: { default: "legacy" },
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      result.warnings.some((w) => w.includes("profiles option is deprecated")),
    ).toBe(true);
  });
});
