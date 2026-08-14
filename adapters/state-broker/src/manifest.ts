import type { AdapterManifest } from "@kb-labs/sdk/adapters";

export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "state-broker",
  name: "StateBroker Cache",
  version: "1.0.0",
  description:
    "Built-in KB Labs StateBroker-backed cache; no Redis server required",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ICache",
  capabilities: {
    custom: {
      ttl: true,
      patterns: true,
      atomic: true,
      sortedSets: true,
    },
  },
  launcher: { requirements: [
    { id: "state-broker-url", path: "/platform/adapterOptions/cache/url", default: "http://localhost:7777" },
    { id: "state-broker-namespace", path: "/platform/adapterOptions/cache/namespace", default: "kb:" },
  ] },
  configSchema: {
    url: {
      type: "string",
      default: "http://localhost:7777",
      description:
        "State daemon URL; falls back to in-memory mode when unavailable",
    },
    namespace: {
      type: "string",
      default: "kb:",
      description: "Namespace prefix for cache keys",
    },
  },
};

export default manifest;
