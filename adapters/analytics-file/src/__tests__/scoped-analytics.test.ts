/**
 * @module @kb-labs/adapters-analytics-file/__tests__/scoped-analytics
 * Tests for analytics source attribution and scoping
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createAdapter } from "../index.js";
import type {
  IAnalytics,
  AnalyticsContext,
} from "@kb-labs/core-platform/adapters";

/** Local date stamp for event file names. Adapter uses local date, not UTC. */
function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function eventFile(dir: string, stamp: string): string {
  return join(dir, `events-${stamp}.jsonl`);
}

describe("Analytics Source Attribution", () => {
  let testDir: string;
  let analytics: IAnalytics;

  beforeEach(async () => {
    // Create temporary directory for test events
    testDir = await mkdtemp(join(tmpdir(), "analytics-test-"));
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Default behavior (current implementation)", () => {
    it("should use source from AnalyticsContext", async () => {
      // Create analytics with explicit context (simulating root package.json)
      const context: AnalyticsContext = {
        source: {
          product: "@kb-labs/ai-review",
          version: "1.0.0",
        },
        runId: "test-run-123",
      };

      analytics = createAdapter({ baseDir: testDir, analytics: context });
      const stamp = todayStamp();
      await analytics.track("test.event", { foo: "bar" });

      const files = await readFile(eventFile(testDir, stamp), "utf-8");
      const event = JSON.parse(files.trim());

      expect(event.source).toEqual({
        product: "@kb-labs/ai-review",
        version: "1.0.0",
      });
    });

    it("should use default source if no context provided", async () => {
      analytics = createAdapter({ baseDir: testDir });
      const stamp = todayStamp();
      await analytics.track("test.event", { foo: "bar" });

      const files = await readFile(eventFile(testDir, stamp), "utf-8");
      const event = JSON.parse(files.trim());

      expect(event.source).toEqual({
        product: "unknown",
        version: "0.0.0",
      });
    });
  });

  describe("Multiple plugins tracking events", () => {
    it("should track events from different plugins with same analytics instance", async () => {
      // This test demonstrates the CURRENT PROBLEM:
      // All events show the same source, even if they come from different plugins

      const rootContext: AnalyticsContext = {
        source: {
          product: "@kb-labs/ai-review", // Root package.json
          version: "1.0.0",
        },
        runId: "test-run-123",
      };

      analytics = createAdapter({ baseDir: testDir, analytics: rootContext });
      const stamp = todayStamp();

      await analytics.track("mind.rag-index.started", { scope: "default" });
      await analytics.track("workflow.run.started", { workflowId: "test-workflow" });
      await analytics.track("commit.generated", { commits: 2 });

      const files = await readFile(eventFile(testDir, stamp), "utf-8");
      const events = files
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(events).toHaveLength(3);

      // CURRENT BEHAVIOR: All events show same source (ROOT)
      // This is the problem we're trying to fix!
      expect(events[0].source.product).toBe("@kb-labs/ai-review");
      expect(events[1].source.product).toBe("@kb-labs/ai-review");
      expect(events[2].source.product).toBe("@kb-labs/ai-review");

      // DESIRED BEHAVIOR (after fix):
      // expect(events[0].source.product).toBe('@kb-labs/mind');
      // expect(events[1].source.product).toBe('@kb-labs/workflow');
      // expect(events[2].source.product).toBe('@kb-labs/commit');
    });
  });

  describe("Event schema validation", () => {
    it("should create events with kb.v1 schema", async () => {
      const context: AnalyticsContext = {
        source: { product: "test-product", version: "1.0.0" },
        runId: "test-run-123",
        actor: { type: "user", id: "test@example.com", name: "Test User" },
        ctx: { workspace: "/test/workspace", branch: "main" },
      };

      analytics = createAdapter({ baseDir: testDir, analytics: context });
      const stamp = todayStamp();
      await analytics.track("test.event", { data: "test" });

      const files = await readFile(eventFile(testDir, stamp), "utf-8");
      const event = JSON.parse(files.trim());

      // Validate kb.v1 schema
      expect(event).toMatchObject({
        schema: "kb.v1",
        type: "test.event",
        source: { product: "test-product", version: "1.0.0" },
        runId: "test-run-123",
        actor: { type: "user", id: "test@example.com", name: "Test User" },
        ctx: { workspace: "/test/workspace", branch: "main" },
        payload: { data: "test" },
      });

      // Verify auto-generated fields
      expect(event.id).toBeDefined();
      expect(event.ts).toBeDefined();
      expect(event.ingestTs).toBeDefined();
    });
  });

  describe("getEvents filtering by source", () => {
    it("should filter events by source.product", async () => {
      const context: AnalyticsContext = {
        source: { product: "@kb-labs/mind", version: "0.1.0" },
        runId: "test-run-123",
      };

      analytics = createAdapter({ baseDir: testDir, analytics: context });

      await analytics.track("mind.event1", {});
      await analytics.track("mind.event2", {});
      await analytics.track("mind.event3", {});

      // Filter by source
      const result = await analytics.getEvents!({ source: "@kb-labs/mind" });

      expect(result.total).toBe(3);
      expect(result.events).toHaveLength(3);
      expect(
        result.events.every((e) => e.source.product === "@kb-labs/mind"),
      ).toBe(true);
    });

    it("should return empty when filtering for non-existent source", async () => {
      const context: AnalyticsContext = {
        source: { product: "@kb-labs/mind", version: "0.1.0" },
        runId: "test-run-123",
      };

      analytics = createAdapter({ baseDir: testDir, analytics: context });
      await analytics.track("mind.event", {});

      // Filter for different source
      const result = await analytics.getEvents!({
        source: "@kb-labs/workflow",
      });

      expect(result.total).toBe(0);
      expect(result.events).toHaveLength(0);
    });
  });

  describe("getStats aggregation by source", () => {
    it("should aggregate events by source", async () => {
      // Create multiple analytics instances with different sources
      const mindAnalytics = createAdapter(
        { baseDir: testDir },
        {
          source: { product: "@kb-labs/mind", version: "0.1.0" },
          runId: "run-1",
        },
      );

      const workflowAnalytics = createAdapter(
        { baseDir: testDir },
        {
          source: { product: "@kb-labs/workflow", version: "2.0.0" },
          runId: "run-2",
        },
      );

      // Track events from different sources
      await mindAnalytics.track("mind.event1", {});
      await mindAnalytics.track("mind.event2", {});
      await workflowAnalytics.track("workflow.event1", {});

      // Get stats (reads all events from directory)
      const stats = await mindAnalytics.getStats!();

      expect(stats.totalEvents).toBe(3);
      expect(stats.bySource).toEqual({
        "@kb-labs/mind": 2,
        "@kb-labs/workflow": 1,
      });
    });
  });
});
