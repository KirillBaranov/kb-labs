/**
 * @module @kb-labs/adapters-openai/embeddings-manifest
 * Adapter manifest for OpenAI embeddings.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for OpenAI embeddings.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "openai-embeddings",
  name: "OpenAI Embeddings",
  version: "1.0.0",
  description:
    "OpenAI text embeddings adapter (text-embedding-3-small, text-embedding-3-large, etc.)",
  author: "KB Labs",
  license: "MIT",
  type: "core",
  implements: "IEmbeddings",
  capabilities: {
    batch: true,
  },
  configSchema: {
    apiKey: {
      type: "string",
      description: "OpenAI API key (defaults to OPENAI_API_KEY env var)",
    },
    model: {
      type: "string",
      default: "text-embedding-3-small",
      description: "Embedding model to use",
      enum: [
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002",
      ],
    },
    dimensions: {
      type: "number",
      description: "Number of dimensions (for v3 models)",
    },
  },
};
