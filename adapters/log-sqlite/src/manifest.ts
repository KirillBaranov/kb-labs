/**
 * @module @kb-labs/adapters-log-sqlite/manifest
 * Adapter manifest for SQLite log persistence extension.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for SQLite log persistence extension.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "log-persistence",
  name: "SQLite Log Persistence",
  version: "1.0.0",
  description: "SQLite persistence for historical log storage and search",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "extension",
  implements: "ILogPersistence",
  requires: {
    adapters: [{ id: "db", alias: "database" }],
    platform: ">= 1.0.0",
  },
  extends: {
    adapter: "logger",
    hook: "onLog",
    method: "write",
    priority: 5,
  },
  capabilities: {
    batch: true,
    search: true,
    transactions: true,
  },
};
