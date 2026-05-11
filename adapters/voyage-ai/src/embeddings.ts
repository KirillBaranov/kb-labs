/**
 * @module @kb-labs/adapters-voyage-ai/embeddings
 * Voyage AI implementation of IEmbeddings interface.
 */

import type { IEmbeddings } from "@kb-labs/core-platform";

export const EMBEDDING_MODELS = {
  "voyage-3": 1024,
  "voyage-3-lite": 512,
  "voyage-3.5": 2048,
  "voyage-code-3": 1024,
  "voyage-finance-2": 1024,
  "voyage-law-2": 1024,
  "voyage-multilingual-2": 1024,
} as const;

export type EmbeddingModel = keyof typeof EMBEDDING_MODELS;

export type InputType = "query" | "document";

export interface VoyageAIEmbeddingsConfig {
  /** Voyage AI API key (defaults to VOYAGE_API_KEY env var) */
  apiKey?: string;
  /** Embedding model to use */
  model?: EmbeddingModel;
  /** Input type hint for retrieval tasks */
  inputType?: InputType;
}

const API_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

export class VoyageAIEmbeddings implements IEmbeddings {
  private apiKey: string;
  private model: EmbeddingModel;
  private inputType: InputType | undefined;
  readonly dimensions: number;

  constructor(config: VoyageAIEmbeddingsConfig = {}) {
    const key = config.apiKey ?? process.env["VOYAGE_API_KEY"];
    if (!key) {
      throw new Error(
        "Voyage AI API key is required. Set VOYAGE_API_KEY env var or pass apiKey in config.",
      );
    }
    this.apiKey = key;
    this.model = config.model ?? "voyage-3";
    this.inputType = config.inputType;
    this.dimensions = EMBEDDING_MODELS[this.model];
  }

  private async request(input: string | string[]): Promise<number[][]> {
    const body: Record<string, unknown> = {
      model: this.model,
      input,
    };
    if (this.inputType) {
      body["input_type"] = this.inputType;
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Voyage AI API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as VoyageResponse;
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.request(text);
    if (!embedding) {
      throw new Error("Voyage AI embeddings API returned empty response");
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.request(texts);
  }

  async getDimensions(): Promise<number> {
    return this.dimensions;
  }
}

export function createAdapter(config?: VoyageAIEmbeddingsConfig): VoyageAIEmbeddings {
  return new VoyageAIEmbeddings(config);
}

export { manifest } from "./embeddings-manifest.js";

export default createAdapter;
