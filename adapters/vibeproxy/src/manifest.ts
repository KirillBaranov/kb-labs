/**
 * @module @kb-labs/adapters-vibeproxy/manifest
 * Adapter manifest for VibeProxy LLM.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for VibeProxy LLM.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "vibeproxy-llm",
  name: "VibeProxy LLM",
  version: "0.1.0",
  description:
    "VibeProxy local adapter supporting multiple LLM providers (Claude, GPT, etc.)",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ILLM",
  capabilities: {
    streaming: false, // TODO: implement SSE streaming
    custom: {
      functionCalling: true,
      multiProvider: true,
    },
  },
  configSchema: {
    baseURL: {
      type: "string",
      default: "http://localhost:8317",
      description: "VibeProxy server URL",
    },
    apiKey: {
      type: "string",
      default: "any-string",
      description: "API key (any string works for local VibeProxy)",
    },
    model: {
      type: "string",
      default: "claude-sonnet-4-20250514",
      description: "Model to use (claude-*, gpt-*, etc.)",
    },
    timeout: {
      type: "number",
      default: 120000,
      description: "Request timeout in milliseconds",
    },
  },
};
