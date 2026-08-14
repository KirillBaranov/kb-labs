/**
 * @module @kb-labs/adapters-redis/manifest
 * Adapter manifest for Redis cache.
 */

import type { AdapterManifest } from "@kb-labs/sdk/adapters";

/**
 * Adapter manifest for Redis cache.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "redis-cache",
  name: "Redis Cache",
  version: "1.0.0",
  description: "High-performance distributed cache using Redis",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ICache",
  capabilities: {
    custom: {
      ttl: true,
      patterns: true,
      atomic: true,
    },
  },
  launcher: { requirements: [
    { id: "redis-host", path: "/platform/adapterOptions/cache/host", default: "localhost" },
    { id: "redis-port", path: "/platform/adapterOptions/cache/port", default: 6379 },
    { id: "redis-key-prefix", path: "/platform/adapterOptions/cache/keyPrefix", default: "kb:" },
  ] },
  configSchema: {
    host: {
      type: "string",
      default: "localhost",
      description: "Redis server host",
    },
    port: {
      type: "number",
      default: 6379,
      description: "Redis server port",
    },
    keyPrefix: {
      type: "string",
      default: "kb:",
      description: "Prefix for all cache keys",
    },
    password: {
      type: "string",
      description: "Redis password (optional)",
    },
  },
};
