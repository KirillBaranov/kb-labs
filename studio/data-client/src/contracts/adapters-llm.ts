/**
 * @module @kb-labs/studio-data-client/contracts/adapters
 * Platform adapter analytics contracts
 */

/**
 * LLM usage statistics by model
 */
export interface LLMModelStats {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  costPer1KTokens: number;
  tokensPerRequest: number;
  errorRate: number;
  avgDurationMs: number;
  cacheReadTokens: number;
  billableTokens: number;
  cacheSavingsUsd: number;
}

/**
 * LLM usage statistics response
 */
export interface LLMUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  totalCacheReadTokens: number;
  totalBillableTokens: number;
  totalCacheSavingsUsd: number;
  byModel: Record<string, LLMModelStats>;
  errors: number;
  timeRange: {
    from: string;
    to: string;
  };
}
