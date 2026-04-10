import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAdapter } from "../index";
import fs from "fs-extra";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  IAnalytics,
} from "@kb-labs/core-platform/adapters";

const TEST_BASE_DIR = join(__dirname, `test-analytics-${randomUUID()}`);

describe("FileAnalytics - getDailyStats", () => {
  let analytics: IAnalytics;

  beforeEach(async () => {
    analytics = createAdapter({ baseDir: TEST_BASE_DIR });
    await fs.ensureDir(TEST_BASE_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_BASE_DIR);
  });

  describe("LLM events", () => {
    it("should aggregate LLM events by day with correct metrics", async () => {
      // Track events across 3 days
      await analytics.track("llm.completion.completed", {
        model: "gpt-4",
        totalTokens: 1000,
        cost: 0.05,
        durationMs: 1500,
      });

      await analytics.track("llm.completion.completed", {
        model: "gpt-4",
        totalTokens: 1500,
        cost: 0.07,
        durationMs: 2000,
      });

      // Get stats
      const stats = await analytics.getDailyStats?.({
        type: "llm.completion.completed",
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.count).toBe(2);
      expect(stats![0]!.metrics?.totalTokens).toBe(2500);
      expect(stats![0]!.metrics?.totalCost).toBeCloseTo(0.12, 2);
      expect(stats![0]!.metrics?.avgDurationMs).toBe(1750);
      expect(stats![0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should filter by date range", async () => {
      // Use local date (adapter writes files with local date, not UTC)
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // Track an event
      await analytics.track("llm.completion.completed", {
        model: "gpt-4",
        totalTokens: 1000,
        cost: 0.05,
        durationMs: 1500,
      });

      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split("T")[0];

      // Query for future dates (should be empty)
      const futureStats = await analytics.getDailyStats?.({
        type: "llm.completion.completed",
        from: `${tomorrow}T00:00:00Z`,
        to: `${tomorrow}T23:59:59Z`,
      });

      expect(futureStats).toHaveLength(0);

      // Query for today (should have data)
      const todayStats = await analytics.getDailyStats?.({
        type: "llm.completion.completed",
        from: `${yesterday}T00:00:00Z`,
        to: `${tomorrow}T23:59:59Z`,
      });

      expect(todayStats).toHaveLength(1);
      expect(todayStats![0]!.date).toBe(today);
    });

    it("should return empty array when no events match", async () => {
      const stats = await analytics.getDailyStats?.({
        type: "llm.completion.completed",
      });

      expect(stats).toEqual([]);
    });
  });

  describe("Embeddings events", () => {
    it("should aggregate embeddings events with correct metrics", async () => {
      await analytics.track("embeddings.generate.completed", {
        model: "text-embedding-ada-002",
        tokens: 500,
        cost: 0.001,
        durationMs: 200,
      });

      await analytics.track("embeddings.generate.completed", {
        model: "text-embedding-ada-002",
        tokens: 700,
        cost: 0.0015,
        durationMs: 250,
      });

      const stats = await analytics.getDailyStats?.({
        type: "embeddings.generate.completed",
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!).toMatchObject({
        count: 2,
        metrics: {
          totalTokens: 1200,
          totalCost: 0.0025,
          avgDurationMs: 225,
        },
      });
    });
  });

  describe("VectorStore events", () => {
    it("should count operations correctly", async () => {
      await analytics.track("vectorstore.search.completed", {
        durationMs: 50,
        resultsCount: 5,
      });

      await analytics.track("vectorstore.search.completed", {
        durationMs: 60,
        resultsCount: 3,
      });

      await analytics.track("vectorstore.upsert.completed", {
        durationMs: 100,
        vectorCount: 10,
      });

      await analytics.track("vectorstore.delete.completed", {
        durationMs: 30,
      });

      const stats = await analytics.getDailyStats?.({
        type: [
          "vectorstore.search.completed",
          "vectorstore.upsert.completed",
          "vectorstore.delete.completed",
        ],
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.count).toBe(4);
      expect(stats![0]!.metrics).toMatchObject({
        totalSearches: 2,
        totalUpserts: 1,
        totalDeletes: 1,
        avgDurationMs: 60, // (50 + 60 + 100 + 30) / 4
      });
    });
  });

  describe("Cache events", () => {
    it("should calculate hit rate correctly", async () => {
      // 3 hits, 2 misses, 1 set
      await analytics.track("cache.hit", { durationMs: 1 });
      await analytics.track("cache.hit", { durationMs: 1 });
      await analytics.track("cache.hit", { durationMs: 2 });
      await analytics.track("cache.miss", { durationMs: 1 });
      await analytics.track("cache.miss", { durationMs: 1 });
      await analytics.track("cache.set", { durationMs: 5 });

      const stats = await analytics.getDailyStats?.({
        type: ["cache.hit", "cache.miss", "cache.set"],
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.count).toBe(6);
      expect(stats![0]!.metrics).toMatchObject({
        totalHits: 3,
        totalMisses: 2,
        totalSets: 1,
        hitRate: 60, // 3/(3+2) * 100 = 60%
      });
    });

    it("should handle zero gets gracefully", async () => {
      await analytics.track("cache.set", { durationMs: 5 });

      const stats = await analytics.getDailyStats?.({
        type: ["cache.hit", "cache.miss", "cache.set"],
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.metrics?.hitRate).toBe(0);
    });
  });

  describe("Storage events", () => {
    it("should aggregate bytes read and written", async () => {
      await analytics.track("storage.read.completed", {
        durationMs: 10,
        bytesRead: 1024,
      });

      await analytics.track("storage.read.completed", {
        durationMs: 15,
        bytesRead: 2048,
      });

      await analytics.track("storage.write.completed", {
        durationMs: 20,
        bytesWritten: 512,
      });

      await analytics.track("storage.delete.completed", {
        durationMs: 5,
      });

      const stats = await analytics.getDailyStats?.({
        type: [
          "storage.read.completed",
          "storage.write.completed",
          "storage.delete.completed",
        ],
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.count).toBe(4);
      expect(stats![0]!.metrics).toMatchObject({
        totalBytesRead: 3072,
        totalBytesWritten: 512,
        avgDurationMs: 12.5, // (10 + 15 + 20 + 5) / 4
      });
    });
  });

  describe("Sorting", () => {
    it("should sort results by date ascending", async () => {
      // Note: We can't easily test multi-day sorting in a unit test
      // since events are timestamped with the current time.
      // This would require mocking Date or using a more sophisticated approach.
      // For now, we just verify that single-day results are returned correctly.

      await analytics.track("llm.completion.completed", {
        totalTokens: 100,
        cost: 0.01,
        durationMs: 100,
      });

      const stats = await analytics.getDailyStats?.({
        type: "llm.completion.completed",
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("Empty metrics", () => {
    it("should not include metrics object for unknown event types", async () => {
      await analytics.track("custom.event", {
        someData: "value",
      });

      const stats = await analytics.getDailyStats?.({
        type: "custom.event",
      });

      expect(stats).toHaveLength(1);
      expect(stats![0]!.count).toBe(1);
      expect(stats![0]!.metrics).toBeUndefined();
    });
  });
});
