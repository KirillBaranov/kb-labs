import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createAdapter } from "./index.js";

describe("SQLiteAdapter", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kb-test-sqlite-"));
    dbPath = join(tmpDir, "test.db");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("Basic Operations", () => {
    it("should create a table", async () => {
      const db = createAdapter({ filename: dbPath });

      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );

      const result = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
        [],
      );
      expect(result.rows).toHaveLength(1);
      await db.close();
    });

    it("should insert and select data", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
        [],
      );

      await db.query("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Alice",
        25,
      ]);
      await db.query("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Bob",
        30,
      ]);

      const result = await db.query<{ id: number; name: string; age: number }>(
        "SELECT * FROM users WHERE age > ?",
        [20],
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]?.name).toBe("Alice");
      expect(result.rows[1]?.name).toBe("Bob");
      await db.close();
    });

    it("should update data", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
        [],
      );
      await db.query("INSERT INTO users (name, age) VALUES (?, ?)", [
        "Alice",
        25,
      ]);

      await db.query("UPDATE users SET age = ? WHERE name = ?", [26, "Alice"]);

      const result = await db.query<{ age: number }>(
        "SELECT age FROM users WHERE name = ?",
        ["Alice"],
      );
      expect(result.rows[0]?.age).toBe(26);
      await db.close();
    });

    it("should delete data", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      await db.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      await db.query("INSERT INTO users (name) VALUES (?)", ["Bob"]);

      await db.query("DELETE FROM users WHERE name = ?", ["Alice"]);

      const result = await db.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.name).toBe("Bob");
      await db.close();
    });
  });

  describe("Transactions", () => {
    it("should commit a transaction", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );

      const tx = await db.transaction();
      await tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      await tx.query("INSERT INTO users (name) VALUES (?)", ["Bob"]);
      await tx.commit();

      const result = await db.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );
      expect(result.rows).toHaveLength(2);
      await db.close();
    });

    it("should rollback a transaction", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );

      const tx = await db.transaction();
      await tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      await tx.rollback();

      const result = await db.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );
      expect(result.rows).toHaveLength(0);
      await db.close();
    });

    it("should not allow operations after commit", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );

      const tx = await db.transaction();
      await tx.commit();

      await expect(
        tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]),
      ).rejects.toThrow("Transaction already completed");
      await db.close();
    });

    it("should not allow operations after rollback", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );

      const tx = await db.transaction();
      await tx.rollback();

      await expect(
        tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]),
      ).rejects.toThrow("Transaction already completed");
      await db.close();
    });
  });

  describe("Query Results", () => {
    it("should return field metadata", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
        [],
      );

      const result = await db.query("SELECT id, name, age FROM users", []);

      expect(result.fields).toHaveLength(3);
      expect(result.fields![0]).toEqual({ name: "id", type: "INTEGER" });
      expect(result.fields![1]).toEqual({ name: "name", type: "TEXT" });
      expect(result.fields![2]).toEqual({ name: "age", type: "INTEGER" });
      await db.close();
    });

    it("should return rowCount", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      await db.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      await db.query("INSERT INTO users (name) VALUES (?)", ["Bob"]);

      const result = await db.query("SELECT * FROM users", []);

      expect(result.rowCount).toBe(2);
      await db.close();
    });
  });

  describe("Error Handling", () => {
    it("should throw on invalid SQL", async () => {
      const db = createAdapter({ filename: dbPath });

      await expect(db.query("INVALID SQL", [])).rejects.toThrow();
      await db.close();
    });

    it("should throw when using after close", async () => {
      const db = createAdapter({ filename: dbPath });
      await db.close();

      await expect(db.query("SELECT 1", [])).rejects.toThrow(
        "Database is closed",
      );
    });
  });

  describe("In-Memory Database", () => {
    it("should support in-memory database", async () => {
      const db = createAdapter({ filename: ":memory:" });
      await db.query("CREATE TABLE temp (id INTEGER PRIMARY KEY)", []);

      const result = await db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='temp'",
        [],
      );

      expect(result.rows).toHaveLength(1);
      await db.close();
    });
  });
});
