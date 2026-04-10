import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { createAdapter } from "./index.js";
import { createSecureSQL, SQLPermissionError } from "./secure-sql.js";

describe("SecureSQLAdapter", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kb-test-secure-sql-"));
    dbPath = join(tmpDir, "test.db");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("Permission Checks", () => {
    it("should allow read when permission granted", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      await base.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      const secure = createSecureSQL(base, { read: true });

      const result = await secure.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );

      expect(result.rows).toHaveLength(1);
      await base.close();
    });

    it("should deny read when permission not granted", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      const secure = createSecureSQL(base, { read: false });

      await expect(secure.query("SELECT * FROM users", [])).rejects.toThrow(
        SQLPermissionError,
      );
      await base.close();
    });

    it("should allow write when permission granted", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      const secure = createSecureSQL(base, { write: true });

      await secure.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);

      const result = await base.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );
      expect(result.rows).toHaveLength(1);
      await base.close();
    });

    it("should deny write when permission not granted", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      const secure = createSecureSQL(base, { write: false });

      await expect(
        secure.query("INSERT INTO users (name) VALUES (?)", ["Alice"]),
      ).rejects.toThrow(SQLPermissionError);
      await base.close();
    });

    it("should allow delete when permission granted", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      await base.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      const secure = createSecureSQL(base, { write: true });

      await secure.query("DELETE FROM users WHERE name = ?", ["Alice"]);

      const result = await base.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );
      expect(result.rows).toHaveLength(0);
      await base.close();
    });

    it("should deny delete when permission not granted", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      const secure = createSecureSQL(base, { write: false });

      await expect(secure.query("DELETE FROM users", [])).rejects.toThrow(
        SQLPermissionError,
      );
      await base.close();
    });
  });

  describe("Table Allowlist", () => {
    it("should allow access to allowlisted tables", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE users (id INTEGER PRIMARY KEY)", []);
      await base.query("CREATE TABLE posts (id INTEGER PRIMARY KEY)", []);
      const secure = createSecureSQL(base, {
        allowlist: ["users"],
        read: true,
      });

      const result = await secure.query("SELECT * FROM users", []);

      expect(result.rows).toBeDefined();
      await base.close();
    });

    it("should deny access to non-allowlisted tables", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE users (id INTEGER PRIMARY KEY)", []);
      await base.query("CREATE TABLE restricted (id INTEGER PRIMARY KEY)", []);
      const secure = createSecureSQL(base, {
        allowlist: ["users"],
        read: true,
      });

      await expect(
        secure.query("SELECT * FROM restricted", []),
      ).rejects.toThrow(SQLPermissionError);
      await base.close();
    });

    it("should handle joins with allowlisted tables", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE users (id INTEGER PRIMARY KEY)", []);
      await base.query(
        "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)",
        [],
      );
      const secure = createSecureSQL(base, {
        allowlist: ["users", "posts"],
        read: true,
      });

      const result = await secure.query(
        "SELECT * FROM users JOIN posts ON users.id = posts.user_id",
        [],
      );

      expect(result.rows).toBeDefined();
      await base.close();
    });
  });

  describe("Table Denylist", () => {
    it("should deny access to denylisted tables", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE admin_users (id INTEGER PRIMARY KEY)", []);
      const secure = createSecureSQL(base, {
        denylist: ["admin_users"],
        read: true,
      });

      await expect(
        secure.query("SELECT * FROM admin_users", []),
      ).rejects.toThrow(SQLPermissionError);
      await base.close();
    });

    it("should denylist take precedence over allowlist", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE conflict (id INTEGER PRIMARY KEY)", []);
      const secure = createSecureSQL(base, {
        allowlist: ["conflict"],
        denylist: ["conflict"],
        read: true,
      });

      await expect(secure.query("SELECT * FROM conflict", [])).rejects.toThrow(
        SQLPermissionError,
      );
      await base.close();
    });
  });

  describe("Schema Modification Prevention", () => {
    it("should deny CREATE TABLE when schema=false", async () => {
      const base = createAdapter({ filename: dbPath });
      const secure = createSecureSQL(base, { schema: false });

      await expect(
        secure.query("CREATE TABLE bad (id INTEGER)", []),
      ).rejects.toThrow(SQLPermissionError);
      await base.close();
    });

    it("should deny ALTER TABLE when schema=false", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE users (id INTEGER PRIMARY KEY)", []);
      const secure = createSecureSQL(base, { schema: false });

      await expect(
        secure.query("ALTER TABLE users ADD COLUMN name TEXT", []),
      ).rejects.toThrow(SQLPermissionError);
      await base.close();
    });

    it("should deny DROP TABLE when schema=false", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query("CREATE TABLE users (id INTEGER PRIMARY KEY)", []);
      const secure = createSecureSQL(base, { schema: false });

      await expect(secure.query("DROP TABLE users", [])).rejects.toThrow(
        SQLPermissionError,
      );
      await base.close();
    });

    it("should allow schema modifications when schema=true", async () => {
      const base = createAdapter({ filename: dbPath });
      const secure = createSecureSQL(base, { schema: true });

      await secure.query("CREATE TABLE users (id INTEGER PRIMARY KEY)", []);

      const result = await base.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
        [],
      );
      expect(result.rows).toHaveLength(1);
      await base.close();
    });
  });

  describe("Transactions with Permissions", () => {
    it("should enforce permissions in transactions", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      const secure = createSecureSQL(base, { write: false, read: true });

      const tx = await secure.transaction();

      await expect(
        tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]),
      ).rejects.toThrow(SQLPermissionError);
      await tx.rollback();
      await base.close();
    });

    it("should allow valid operations in transactions", async () => {
      const base = createAdapter({ filename: dbPath });
      await base.query(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)",
        [],
      );
      const secure = createSecureSQL(base, { write: true });

      const tx = await secure.transaction();
      await tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
      await tx.commit();

      const result = await base.query<{ name: string }>(
        "SELECT * FROM users",
        [],
      );
      expect(result.rows).toHaveLength(1);
      await base.close();
    });
  });
});
