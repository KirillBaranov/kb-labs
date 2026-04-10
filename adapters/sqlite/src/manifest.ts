/**
 * @module @kb-labs/adapters-sqlite/manifest
 * Adapter manifest for SQLite database.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for SQLite database.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "sqlite-database",
  name: "SQLite Database",
  version: "1.0.0",
  description: "Lightweight embedded SQL database using better-sqlite3",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ISQLDatabase",
  contexts: ["workspace"],
  capabilities: {
    transactions: true,
    search: true,
    custom: {
      prepared: true,
      fts: true,
      json: true,
    },
  },
  configSchema: {
    filename: {
      type: "string",
      description: "Database file path (use :memory: for in-memory database)",
    },
    readonly: {
      type: "boolean",
      default: false,
      description: "Open database in readonly mode",
    },
    timeout: {
      type: "number",
      default: 5000,
      description: "Busy timeout in milliseconds",
    },
  },
};
