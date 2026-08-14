/**
 * @module @kb-labs/adapters-openai/manifest
 * Adapter manifest for OpenAI LLM.
 */

import type { AdapterManifest } from "@kb-labs/sdk/adapters";

/**
 * Adapter manifest for OpenAI LLM.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "openai-llm",
  name: "OpenAI LLM",
  version: "1.0.0",
  description: "OpenAI language model adapter (GPT-4, GPT-3.5, etc.)",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "ILLM",
  capabilities: {
    streaming: true,
    custom: {
      functionCalling: true,
    },
  },
  // This is the install-time projection, deliberately separate from the
  // runtime schema. It tells kb-create where the value is stored and which
  // process receives a secret; doctor can therefore diagnose it after an
  // installation without guessing from a TypeScript config shape.
  launcher: {
    requirements: [
      {
        id: "openai-api-key",
        required: true,
        secret: true,
        env: "OPENAI_API_KEY",
        services: ["gateway"],
        hint: "Create an API key at platform.openai.com and pass it through OPENAI_API_KEY.",
      },
      {
        id: "openai-model",
        path: "/platform/adapterOptions/llm/model",
        default: "gpt-4o",
      },
      {
        id: "openai-temperature",
        path: "/platform/adapterOptions/llm/temperature",
        default: 0.7,
      },
    ],
  },
  configSchema: {
    apiKey: {
      type: "string",
      description: "OpenAI API key (defaults to OPENAI_API_KEY env var)",
    },
    model: {
      type: "string",
      default: "gpt-4o",
      description: "Model to use (gpt-4o, gpt-4-turbo, gpt-3.5-turbo, etc.)",
    },
    temperature: {
      type: "number",
      default: 0.7,
      description: "Sampling temperature (0.0 to 2.0)",
    },
    maxTokens: {
      type: "number",
      description: "Maximum tokens to generate",
    },
  },
};
