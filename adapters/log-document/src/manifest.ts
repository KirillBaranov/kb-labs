/**
 * @module @kb-labs/adapters-log-document/manifest
 *
 * Manifest for the Document-backed log persistence adapter. It depends on
 * the platform's `documentDatabase` service — register a concrete document
 * driver (sqlite, postgres, mongo) first and this adapter rides on top.
 */

import type { AdapterManifest } from "@kb-labs/sdk/adapters";

export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "log-document",
  name: "Document-backed Log Persistence",
  version: "1.0.0",
  description:
    "ILogPersistence implementation storing log entries in any IDocumentDatabase. Driver-agnostic.",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "extension",
  implements: "ILogPersistence",
  extends: {
    adapter: "logger",
    hook: "onLog",
    method: "write",
    priority: 0,
  },
  contexts: ["workspace", "process"],
  requires: {
    adapters: [{ id: "documentDatabase", alias: "documentDatabase" }],
  },
  capabilities: {
    batch: true,
    search: true,
    custom: {
      retentionPolicy: true,
    },
  },
  configSchema: {
    collection: {
      type: "string",
      default: "logs",
      description: "Name of the document collection that stores log entries.",
    },
    batchSize: {
      type: "number",
      default: 100,
      description: "Batch size for buffered writes.",
    },
    flushInterval: {
      type: "number",
      default: 5000,
      description: "Maximum delay before a partial batch is flushed (ms).",
    },
  },
};
