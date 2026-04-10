/**
 * @module @kb-labs/adapters-pino/manifest
 * Adapter manifest for Pino logger.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for Pino logger.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "pino-logger",
  name: "Pino Logger",
  version: "1.0.0",
  description: "Production-ready structured logger based on Pino",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ILogger",
  optional: {
    adapters: ["analytics"],
  },
  capabilities: {
    streaming: true,
  },
  configSchema: {
    level: {
      type: "string",
      enum: ["trace", "debug", "info", "warn", "error", "fatal"],
      default: "info",
      description: "Minimum log level",
    },
    pretty: {
      type: "boolean",
      default: false,
      description: "Enable pretty printing for development",
    },
    streaming: {
      type: "object",
      description: "Log streaming/buffering configuration",
      properties: {
        enabled: { type: "boolean", default: false },
        bufferSize: { type: "number", default: 1000 },
        bufferMaxAge: { type: "number", default: 3600000 },
      },
    },
  },
};
