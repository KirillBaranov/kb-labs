/**
 * @file index.test.ts
 * Unit tests for MongoDB adapter connection config resolution.
 *
 * Regression guard for the cloud-deploy bug where the platform passes
 * `{ url: "mongodb://host:port/db" }` but the adapter only understood
 * `{ uri, database }`. The Mongo driver then received `new MongoClient(undefined)`
 * and threw an opaque `Cannot read properties of undefined (reading 'startsWith')`,
 * crashing the whole platform lifecycle into NoOp adapters.
 */

import { describe, it, expect } from "vitest";
import { resolveConnection } from "./index.js";

describe("resolveConnection", () => {
  it("accepts explicit uri + database", () => {
    expect(
      resolveConnection({ uri: "mongodb://127.0.0.1:27017", database: "kblabs" }),
    ).toEqual({ uri: "mongodb://127.0.0.1:27017", database: "kblabs" });
  });

  it("derives uri and database from a single url with a db path", () => {
    expect(resolveConnection({ url: "mongodb://127.0.0.1:27017/kblabs" })).toEqual({
      uri: "mongodb://127.0.0.1:27017",
      database: "kblabs",
    });
  });

  it("preserves query options when stripping the db path from url", () => {
    expect(
      resolveConnection({ url: "mongodb://127.0.0.1:27017/kblabs?retryWrites=true" }),
    ).toEqual({
      uri: "mongodb://127.0.0.1:27017?retryWrites=true",
      database: "kblabs",
    });
  });

  it("supports mongodb+srv urls", () => {
    expect(
      resolveConnection({ url: "mongodb+srv://cluster.example.com/kblabs" }),
    ).toEqual({
      uri: "mongodb+srv://cluster.example.com",
      database: "kblabs",
    });
  });

  it("lets explicit database override the url path", () => {
    expect(
      resolveConnection({ url: "mongodb://127.0.0.1:27017/ignored", database: "override" }),
    ).toEqual({
      uri: "mongodb://127.0.0.1:27017",
      database: "override",
    });
  });

  it("throws a clear error when no connection config is provided", () => {
    // Before the fix this returned `{ uri: undefined }` and crashed the Mongo
    // driver with `Cannot read properties of undefined (reading 'startsWith')`.
    expect(() => resolveConnection({})).toThrowError(/missing connection config/);
  });

  it("throws a clear error when url has no database path and none is set", () => {
    expect(() => resolveConnection({ url: "mongodb://127.0.0.1:27017" })).toThrowError(
      /has no database path/,
    );
  });
});
