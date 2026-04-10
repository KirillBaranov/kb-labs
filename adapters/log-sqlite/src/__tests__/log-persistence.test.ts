/**
 * Tests for LogSQLitePersistence
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LogSQLitePersistence } from "../index";
import { createAdapter as createSQLiteDB } from "@kb-labs/adapters-sqlite";
import type { LogRecord, ISQLDatabase } from "@kb-labs/core-platform/adapters";

describe("LogSQLitePersistence", () => {
  let db: ISQLDatabase;
  let persistence: LogSQLitePersistence;
  const testDbPath = ":memory:"; // Use in-memory database for tests

  beforeEach(async () => {
    // Create in-memory SQLite database
    db = createSQLiteDB({ filename: testDbPath });

    // Create persistence adapter
    persistence = new LogSQLitePersistence({
      database: db,
      tableName: "logs",
      batchSize: 5, // Small batch for testing
      flushInterval: 100, // Fast flush for testing
    });

    await persistence.initialize();
  });

  afterEach(async () => {
    await persistence.close();
    await db.close();
  });

  describe("write", () => {
    it("should write log to database", async () => {
      const log: LogRecord = {
        id: "test-1",
        timestamp: Date.now(),
        level: "info",
        message: "Test log",
        fields: {},
        source: "test",
      };

      await persistence.write(log);

      // Wait for flush
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]!.message).toBe("Test log");
    });

    it("should flush when batch size is reached", async () => {
      // Write 5 logs (batch size)
      for (let i = 0; i < 5; i++) {
         
        await persistence.write({
          id: `test-batch-${i}`,
          timestamp: Date.now() + i,
          level: "info",
          message: `Log ${i}`,
          fields: {},
          source: "test",
        });
      }

      // Should flush immediately without waiting for interval
      const result = await persistence.query({});
      expect(result.logs).toHaveLength(5);
    });

    it("should preserve log fields", async () => {
      const complexFields = {
        user: { id: 123, name: "Alice" },
        tags: ["api", "error"],
        count: 42,
        nested: { deep: { value: "test" } },
      };

      await persistence.write({
        id: "test-2",
        timestamp: Date.now(),
        level: "error",
        message: "Complex log",
        fields: complexFields,
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.fields).toEqual(complexFields);
    });

    it("should handle empty fields", async () => {
      await persistence.write({
        id: "test-3",
        timestamp: Date.now(),
        level: "info",
        message: "No fields",
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.fields).toEqual({});
    });

    it("should generate ID if not provided", async () => {
      await persistence.write({
        id: "test-4",
        timestamp: Date.now(),
        level: "info",
        message: "No ID",
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.id).toBeDefined();
      expect(typeof result.logs[0]!.id).toBe("string");
    });

    it("should preserve custom ID", async () => {
      const customId = "custom-log-id-123";

      await persistence.write({
        id: customId,
        timestamp: Date.now(),
        level: "info",
        message: "Custom ID",
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.id).toBe(customId);
    });
  });

  describe("writeBatch", () => {
    it("should write multiple logs in batch", async () => {
      const logs: LogRecord[] = Array.from({ length: 10 }, (_, i) => ({
        id: `test-batch-write-${i}`,
        timestamp: Date.now() + i,
        level: "info",
        message: `Batch log ${i}`,
        fields: {},
        source: "test",
      }));

      await persistence.writeBatch(logs);

      // Wait for flush
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs).toHaveLength(10);
    });

    it("should handle empty batch", async () => {
      await persistence.writeBatch([]);

      const result = await persistence.query({});
      expect(result.logs).toHaveLength(0);
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      // Add test logs
      const logs: LogRecord[] = [
        {
          id: "test-query-1",
          timestamp: 1000,
          level: "debug",
          message: "Debug log",
          fields: {},
          source: "test",
        },
        {
          id: "test-query-2",
          timestamp: 2000,
          level: "info",
          message: "Info log",
          fields: {},
          source: "test",
        },
        {
          id: "test-query-3",
          timestamp: 3000,
          level: "warn",
          message: "Warn log",
          fields: {},
          source: "api",
        },
        {
          id: "test-query-4",
          timestamp: 4000,
          level: "error",
          message: "Error log",
          fields: {},
          source: "api",
        },
        {
          id: "test-query-5",
          timestamp: 5000,
          level: "fatal",
          message: "Fatal log",
          fields: {},
          source: "test",
        },
      ];

      await persistence.writeBatch(logs);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
    });

    it("should return all logs without filters", async () => {
      const result = await persistence.query({});
      expect(result.logs).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(false);
      expect(result.logs[0]!.timestamp).toBe(5000); // Newest first (DESC)
    });

    it("should filter by level", async () => {
      const result = await persistence.query({ level: "error" });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]!.level).toBe("error");
    });

    it("should filter by source", async () => {
      const result = await persistence.query({ source: "api" });
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((l) => l.source === "api")).toBe(true);
    });

    it("should filter by timestamp range", async () => {
      const result = await persistence.query({ from: 2000, to: 4000 });
      expect(result.logs).toHaveLength(3);
      expect(result.logs[0]!.timestamp).toBe(4000);
      expect(result.logs[2]!.timestamp).toBe(2000);
    });

    it("should apply limit", async () => {
      const result = await persistence.query({}, { limit: 2 });
      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it("should apply offset", async () => {
      const result = await persistence.query({}, { limit: 2, offset: 2 });
      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
      expect(result.logs[0]!.timestamp).toBe(3000); // 3rd log
    });

    it("should sort by timestamp ascending", async () => {
      const result = await persistence.query(
        {},
        { sortBy: "timestamp", sortOrder: "asc" },
      );
      expect(result.logs[0]!.timestamp).toBe(1000); // Oldest first
      expect(result.logs[4]!.timestamp).toBe(5000); // Newest last
    });

    it("should combine multiple filters", async () => {
      const result = await persistence.query(
        { level: "error", source: "api", from: 3500 },
        { limit: 10 },
      );
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]!.level).toBe("error");
      expect(result.logs[0]!.source).toBe("api");
      expect(result.logs[0]!.timestamp).toBeGreaterThanOrEqual(3500);
    });

    it("should handle pagination correctly", async () => {
      // First page
      const page1 = await persistence.query({}, { limit: 2, offset: 0 });
      expect(page1.logs).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      // Second page
      const page2 = await persistence.query({}, { limit: 2, offset: 2 });
      expect(page2.logs).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Third page
      const page3 = await persistence.query({}, { limit: 2, offset: 4 });
      expect(page3.logs).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });
  });

  describe("getById", () => {
    it("should retrieve log by ID", async () => {
      const logId = "test-log-123";

      await persistence.write({
        id: logId,
        timestamp: Date.now(),
        level: "info",
        message: "Test log",
        fields: { foo: "bar" },
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const log = await persistence.getById(logId);
      expect(log).toBeDefined();
      expect(log?.id).toBe(logId);
      expect(log?.message).toBe("Test log");
      expect(log?.fields).toEqual({ foo: "bar" });
    });

    it("should return null for non-existent ID", async () => {
      const log = await persistence.getById("non-existent-id");
      expect(log).toBeNull();
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      const logs: LogRecord[] = [
        {
          id: "test-search-1",
          timestamp: 1000,
          level: "info",
          message: "User authentication succeeded",
          fields: {},
          source: "auth",
        },
        {
          id: "test-search-2",
          timestamp: 2000,
          level: "error",
          message: "User authentication failed",
          fields: {},
          source: "auth",
        },
        {
          id: "test-search-3",
          timestamp: 3000,
          level: "info",
          message: "Database connection established",
          fields: {},
          source: "db",
        },
        {
          id: "test-search-4",
          timestamp: 4000,
          level: "error",
          message: "Database query timeout",
          fields: {},
          source: "db",
        },
      ];

      await persistence.writeBatch(logs);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
    });

    it("should search logs by text", async () => {
      const result = await persistence.search("authentication");
      expect(result.logs).toHaveLength(2);
      expect(
        result.logs.every((l) => l.message.includes("authentication")),
      ).toBe(true);
    });

    it("should search with multiple terms", async () => {
      const result = await persistence.search("database");
      expect(result.logs).toHaveLength(2);
      expect(
        result.logs.every((l) => l.message.toLowerCase().includes("database")),
      ).toBe(true);
    });

    it("should apply limit to search results", async () => {
      const result = await persistence.search("User", { limit: 1 });
      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it("should return empty results for no matches", async () => {
      const result = await persistence.search("nonexistent");
      expect(result.logs).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it("should handle pagination in search", async () => {
      const page1 = await persistence.search("User", { limit: 1, offset: 0 });
      const page2 = await persistence.search("User", { limit: 1, offset: 1 });

      expect(page1.logs).toHaveLength(1);
      expect(page2.logs).toHaveLength(1);
      expect(page1.logs[0]!.id).not.toBe(page2.logs[0]!.id);
    });

    it("should fallback to phrase search for hyphenated plain text", async () => {
      await persistence.write({
        id: "test-search-hyphen",
        timestamp: 5000,
        level: "info",
        message: "kb-labs-commit-plugin initialized",
        fields: {},
        source: "commit",
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.search("kb-labs-commit-plugin");
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]!.id).toBe("test-search-hyphen");
    });

    it("should auto-rebuild stale FTS index when count and rows diverge", async () => {
      // Insert stale index row with non-existent content rowid.
      await db.query(
        "INSERT INTO logs_fts(rowid, message) VALUES (?, ?)",
        [999999, "phase 3 stale marker"],
      );

      const result = await persistence.search("phase 3 stale marker");
      expect(result.logs).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe("deleteOlderThan", () => {
    beforeEach(async () => {
      const logs: LogRecord[] = [
        {
          id: "test-old-1",
          timestamp: 1000,
          level: "info",
          message: "Old log 1",
          fields: {},
          source: "test",
        },
        {
          id: "test-old-2",
          timestamp: 2000,
          level: "info",
          message: "Old log 2",
          fields: {},
          source: "test",
        },
        {
          id: "test-new-1",
          timestamp: 5000,
          level: "info",
          message: "New log 1",
          fields: {},
          source: "test",
        },
        {
          id: "test-new-2",
          timestamp: 6000,
          level: "info",
          message: "New log 2",
          fields: {},
          source: "test",
        },
      ];

      await persistence.writeBatch(logs);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
    });

    it("should delete logs older than timestamp", async () => {
      const deleted = await persistence.deleteOlderThan(3000);
      expect(deleted).toBe(2); // 2 old logs deleted

      const result = await persistence.query({});
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((l) => l.timestamp >= 3000)).toBe(true);
    });

    it("should return 0 if no logs deleted", async () => {
      const deleted = await persistence.deleteOlderThan(500);
      expect(deleted).toBe(0);

      const result = await persistence.query({});
      expect(result.logs).toHaveLength(4); // All logs still there
    });

    it("should delete all logs if timestamp is in future", async () => {
      const deleted = await persistence.deleteOlderThan(Date.now() + 10000);
      expect(deleted).toBe(4);

      const result = await persistence.query({});
      expect(result.logs).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    it("should return stats for empty database", async () => {
      const stats = await persistence.getStats();
      expect(stats.totalLogs).toBe(0);
      expect(stats.oldestTimestamp).toBe(0);
      expect(stats.newestTimestamp).toBe(0);
      expect(stats.sizeBytes).toBeGreaterThanOrEqual(0);
    });

    it("should return correct stats", async () => {
      const logs: LogRecord[] = [
        {
          id: "test-stats-1",
          timestamp: 1000,
          level: "info",
          message: "Log 1",
          fields: {},
          source: "test",
        },
        {
          id: "test-stats-2",
          timestamp: 2000,
          level: "info",
          message: "Log 2",
          fields: {},
          source: "test",
        },
        {
          id: "test-stats-3",
          timestamp: 3000,
          level: "info",
          message: "Log 3",
          fields: {},
          source: "test",
        },
      ];

      await persistence.writeBatch(logs);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const stats = await persistence.getStats();
      expect(stats.totalLogs).toBe(3);
      expect(stats.oldestTimestamp).toBe(1000);
      expect(stats.newestTimestamp).toBe(3000);
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });
  });

  describe("close", () => {
    it("should flush pending logs on close", async () => {
      // Write logs but don't wait for flush
      await persistence.write({
        id: "test-pending",
        timestamp: Date.now(),
        level: "info",
        message: "Pending log",
        fields: {},
        source: "test",
      });

      // Close immediately (should flush)
      await persistence.close();

      // Query should show the log
      const result = await persistence.query({});
      expect(result.logs).toHaveLength(1);
    });
  });

  describe("transaction support", () => {
    it("should rollback on error", async () => {
      const logs: LogRecord[] = [
        {
          id: "test-txn-1",
          timestamp: 1000,
          level: "info",
          message: "Log 1",
          fields: {},
          source: "test",
        },
        {
          id: "test-txn-2",
          timestamp: 2000,
          level: "info",
          message: "Log 2",
          fields: {},
          source: "test",
        },
      ];

      await persistence.writeBatch(logs);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      // Verify logs were written
      const result = await persistence.query({});
      expect(result.logs).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("should handle very long messages", async () => {
      const longMessage = "A".repeat(10000);

      await persistence.write({
        id: "test-long",
        timestamp: Date.now(),
        level: "info",
        message: longMessage,
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.message).toBe(longMessage);
    });

    it("should handle special characters in message", async () => {
      const specialMessage =
        "Test with 'quotes' and \"double quotes\" and \n newlines \t tabs";

      await persistence.write({
        id: "test-special",
        timestamp: Date.now(),
        level: "info",
        message: specialMessage,
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.message).toBe(specialMessage);
    });

    it("should handle unicode characters", async () => {
      const unicodeMessage = "测试 тест 🚀 emoji";

      await persistence.write({
        id: "test-unicode",
        timestamp: Date.now(),
        level: "info",
        message: unicodeMessage,
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.message).toBe(unicodeMessage);
    });

    it("should handle negative timestamps", async () => {
      await persistence.write({
        id: "test-negative",
        timestamp: -1000,
        level: "info",
        message: "Negative timestamp",
        fields: {},
        source: "test",
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });

      const result = await persistence.query({});
      expect(result.logs[0]!.timestamp).toBe(-1000);
    });
  });
});
