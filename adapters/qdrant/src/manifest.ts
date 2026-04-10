/**
 * @module @kb-labs/adapters-qdrant/manifest
 * Adapter manifest for Qdrant vector store.
 */

import type { AdapterManifest } from "@kb-labs/core-platform";

/**
 * Adapter manifest for Qdrant vector store.
 */
export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "qdrant-vectorstore",
  name: "Qdrant Vector Store",
  version: "1.0.0",
  description: "High-performance vector database for semantic search and RAG",
  author: "KB Labs Team",
  license: "KBPL-1.1",
  type: "core",
  implements: "IVectorStore",
  capabilities: {
    search: true,
    batch: true,
    custom: {
      hybridSearch: true,
      filtering: true,
    },
  },
  configSchema: {
    url: {
      type: "string",
      description: "Qdrant server URL (e.g., http://localhost:6333)",
    },
    apiKey: {
      type: "string",
      description: "API key for authentication (optional)",
    },
    collectionName: {
      type: "string",
      default: "kb-vectors",
      description: "Collection name",
    },
    dimension: {
      type: "number",
      default: 1536,
      description: "Vector dimension (default: 1536 for OpenAI embeddings)",
    },
    timeout: {
      type: "number",
      default: 30000,
      description: "Request timeout in milliseconds",
    },
  },
};
