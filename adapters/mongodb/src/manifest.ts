/**
 * @module @kb-labs/adapters-mongodb/manifest
 * Adapter manifest for MongoDB document database.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for MongoDB document database.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "mongodb-documentdb",
  name: "MongoDB Document Database",
  version: "1.0.0",
  description: "NoSQL document database using MongoDB",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "IDocumentDatabase",
  capabilities: {
    transactions: true,
    search: true,
    custom: {
      aggregation: true,
      indexes: true,
      fullText: true,
    },
  },
  configSchema: {
    uri: {
      type: "string",
      description: "MongoDB connection URI (e.g., mongodb://localhost:27017)",
    },
    database: {
      type: "string",
      description: "Database name",
    },
    poolSize: {
      type: "number",
      default: 10,
      description: "Connection pool size",
    },
  },
};
