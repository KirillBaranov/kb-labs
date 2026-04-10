/**
 * @file index.test.ts
 * Integration tests for FileAnalytics with manifest-based context injection.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import createAdapter from "./index.js";
import type {
  AnalyticsContext,
  IAnalytics,
} from "@kb-labs/core-platform/adapters";
import { readFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

describe("FileAnalytics - Manifest-based Context Injection", () => {
  const testDir = path.join(process.cwd(), ".test-analytics");
  const testCwd = "/Users/test/workspace";

  beforeEach(async () => {
    // Create test directory
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir),
      );
      for (const file of files) {
         
        await unlink(path.join(testDir, file));
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Context Priority - options.workspace and options.analytics", () => {
    it("should use options.workspace when provided (manifest-based injection)", async () => {
      const analytics = createAdapter(
        {
          baseDir: testDir,
          workspace: { cwd: testCwd }, // From manifest-based workspace context
        },
        {},
      ) as IAnalytics;

      await analytics.track("test.event", { foo: "bar" });

      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir),
      );
      expect(files.length).toBeGreaterThan(0);

      const filePath = path.join(testDir, files[0]!);
      const content = await readFile(filePath, "utf-8");
      const event = JSON.parse(content.split("\n")[0]!);

      // Verify event has workspace context
      expect(event.ctx).toBeDefined();
      expect(event.ctx.workspace).toBe(testCwd);
    });

    it("should use options.analytics when provided (manifest-based injection)", async () => {
      const analyticsContext: AnalyticsContext = {
        source: { product: "@kb-labs/test-product", version: "1.0.0" },
        runId: "test-run-123",
        actor: { type: "user", id: "test-user", name: "Test User" },
        ctx: { workspace: testCwd, branch: "test-branch" },
      };

      const analytics = createAdapter(
        {
          baseDir: testDir,
          workspace: { cwd: testCwd },
          analytics: analyticsContext, // From manifest-based analytics context
        },
        {},
      ) as IAnalytics;

      await analytics.track("test.event", { foo: "bar" });

      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir),
      );
      const filePath = path.join(testDir, files[0]!);
      const content = await readFile(filePath, "utf-8");
      const event = JSON.parse(content.split("\n")[0]!);

      // Verify event uses provided analyticsContext
      expect(event.source.product).toBe("@kb-labs/test-product");
      expect(event.source.version).toBe("1.0.0");
      expect(event.runId).toBe("test-run-123");
      expect(event.actor?.id).toBe("test-user");
      expect(event.ctx.workspace).toBe(testCwd);
      expect(event.ctx.branch).toBe("test-branch");
    });

    it("should fall back to process.cwd() when no cwd provided", async () => {
      const analytics = createAdapter(
        {
          baseDir: testDir,
          // No cwd provided
        },
        {},
      ) as IAnalytics;

      await analytics.track("test.event", { foo: "bar" });

      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir),
      );
      const filePath = path.join(testDir, files[0]!);
      const content = await readFile(filePath, "utf-8");
      const event = JSON.parse(content.split("\n")[0]!);

      // Should use process.cwd() as fallback
      expect(event.ctx.workspace).toBe(process.cwd());
    });

    it('should use "unknown" source when no analytics context provided', async () => {
      const analytics = createAdapter(
        {
          baseDir: testDir,
          workspace: { cwd: testCwd },
          // No analytics context provided
        },
        {},
      ) as IAnalytics;

      await analytics.track("test.event", { foo: "bar" });

      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir),
      );
      const filePath = path.join(testDir, files[0]!);
      const content = await readFile(filePath, "utf-8");
      const event = JSON.parse(content.split("\n")[0]!);

      // Should use fallback "unknown" source
      expect(event.source.product).toBe("unknown");
      expect(event.source.version).toBe("0.0.0");
    });
  });

  describe("Real-world Scenario - REST API", () => {
    it("should work as in REST API with manifest-based injection", async () => {
      // Simulate initPlatform passing contexts via manifest
      const workspaceContext = { cwd: "/Users/kirillbaranov/Desktop/kb-labs" };
      const analyticsContext: AnalyticsContext = {
        source: { product: "@kb-labs/workspace-root", version: "0.0.1" },
        runId: "f8cb323c-54a4-45bb-afa1-8f17b5cf497e",
        actor: {
          type: "user",
          id: "kirillBaranovJob@yandex.ru",
          name: "KirillBaranov",
        },
        ctx: {
          workspace: "/Users/kirillbaranov/Desktop/kb-labs",
          branch: "main",
        },
      };

      const adapterConfig = {
        baseDir: testDir, // User config
        workspace: workspaceContext, // Injected by loader
        analytics: analyticsContext, // Injected by loader
      };

      // FileAnalytics receives contexts as-is
      const analytics = createAdapter(
        {
          baseDir: adapterConfig.baseDir,
          workspace: adapterConfig.workspace,
          analytics: adapterConfig.analytics,
        },
        {},
      ) as IAnalytics;

      await analytics.track("cache.get.hit", {
        requestId: "cache_1768104393285_wgxtqv0",
        key: "metrics:history:30m",
        durationMs: 5,
      });

      const files = await import("node:fs/promises").then((fs) =>
        fs.readdir(testDir),
      );
      const filePath = path.join(testDir, files[0]!);
      const content = await readFile(filePath, "utf-8");
      const event = JSON.parse(content.split("\n")[0]!);

      // Verify event matches real REST API output
      expect(event.schema).toBe("kb.v1");
      expect(event.type).toBe("cache.get.hit");
      expect(event.source.product).toBe("@kb-labs/workspace-root");
      expect(event.source.version).toBe("0.0.1");
      expect(event.runId).toBe("f8cb323c-54a4-45bb-afa1-8f17b5cf497e");
      expect(event.actor?.type).toBe("user");
      expect(event.actor?.id).toBe("kirillBaranovJob@yandex.ru");
      expect(event.ctx.workspace).toBe("/Users/kirillbaranov/Desktop/kb-labs");
      expect(event.ctx.branch).toBe("main");
      expect(event.payload).toMatchObject({
        requestId: "cache_1768104393285_wgxtqv0",
        key: "metrics:history:30m",
        durationMs: 5,
      });
    });
  });
});
