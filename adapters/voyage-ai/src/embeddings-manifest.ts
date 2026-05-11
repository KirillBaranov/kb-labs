import type { AdapterManifest } from "@kb-labs/core-platform";

export const manifest: AdapterManifest = {
  manifestVersion: "1.0.0",
  id: "voyage-ai-embeddings",
  name: "Voyage AI Embeddings",
  version: "0.1.0",
  description:
    "Voyage AI text embeddings adapter (voyage-3, voyage-3.5, voyage-code-3, etc.)",
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
      description: "Voyage AI API key (defaults to VOYAGE_API_KEY env var)",
    },
    model: {
      type: "string",
      default: "voyage-3",
      description: "Embedding model to use",
      enum: [
        "voyage-3",
        "voyage-3-lite",
        "voyage-3.5",
        "voyage-code-3",
        "voyage-finance-2",
        "voyage-law-2",
        "voyage-multilingual-2",
      ],
    },
    inputType: {
      type: "string",
      description: "Input type hint for retrieval tasks",
      enum: ["query", "document"],
    },
  },
};
