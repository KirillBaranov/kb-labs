/**
 * Mind Analytics - tracking for orchestrator queries
 * Transport is delegated to platform analytics adapter (IAnalytics).
 */

import type { IAnalytics } from '@kb-labs/sdk';
import type { AgentResponse, AgentErrorResponse } from '../types';
import type {
  MindAnalyticsContext,
  QueryStartedPayload,
  QueryCompletedPayload,
  QueryFailedPayload,
} from './types';
import { calculateLLMCost } from './types';
import { createHash } from 'crypto';

const MIND_SOURCE = {
  product: '@kb-labs/mind',
  version: '0.1.0',
};

function hashSha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 16);
}

export interface MindAnalyticsOptions {
  enabled?: boolean;
  detailed?: boolean;
  llmModel?: string;
  analyticsAdapter?: IAnalytics | null;
}

export function createMindAnalytics(options: MindAnalyticsOptions = {}) {
  const { enabled = true, detailed = false, llmModel = 'gpt-4o-mini', analyticsAdapter = null } = options;

  const safeEmit = async (type: string, payload: Record<string, unknown>) => {
    if (!enabled || !analyticsAdapter?.track) {return;}
    try {
      await analyticsAdapter.track(type, {
        source: MIND_SOURCE,
        ...payload,
      });
    } catch {
      // Silently ignore analytics errors - never break query flow
    }
  };

  return {
    async trackQueryStart(ctx: {
      queryId: string;
      text: string;
      mode: string;
      scopeId: string;
      agentMode: boolean;
    }): Promise<void> {
      const payload: QueryStartedPayload = {
        queryId: ctx.queryId,
        text: ctx.text.substring(0, 100),
        textHash: hashSha256(ctx.text),
        mode: ctx.mode as QueryStartedPayload['mode'],
        scopeId: ctx.scopeId,
        agentMode: ctx.agentMode,
      };
      await safeEmit('mind.query.started', payload);
    },

    async trackQueryCompleted(
      ctx: MindAnalyticsContext,
      result: AgentResponse,
    ): Promise<void> {
      const durationMs = Date.now() - ctx.startTime;
      const costLlm = calculateLLMCost(ctx.tokensIn, ctx.tokensOut, llmModel);

      const payload: QueryCompletedPayload = {
        queryId: ctx.queryId,
        durationMs,

        // Quality
        confidence: result.confidence,
        complete: result.complete,
        sourcesCount: result.sources.length,
        sourcesBreakdown: result.sourcesSummary ?? { code: 0, docs: 0, external: {} },

        // LLM
        llmCalls: ctx.llmCalls,
        tokensIn: ctx.tokensIn,
        tokensOut: ctx.tokensOut,
        llmProvider: 'openai',
        llmModel,

        // Cost
        costLlm,
        costEmbedding: 0,
        costTotal: costLlm,

        // Cache
        cached: result.meta.cached,

        // Performance
        mode: ctx.mode,
        subqueriesCount: ctx.subqueries.length,
        iterationsCount: ctx.iterations,
        compressionApplied: ctx.compressionApplied,
        retrievalProfile: ctx.retrieval?.retrievalProfile,
        stalenessLevel: ctx.retrieval?.stalenessLevel,
        failClosed: ctx.retrieval?.failClosed ?? false,
        conflictsDetected: ctx.retrieval?.conflictsDetected ?? 0,
        confidenceAdjustments: ctx.retrieval?.confidenceAdjustments,
        indexRevision: ctx.retrieval?.indexRevision ?? result.meta.indexVersion,
      };

      await safeEmit('mind.query.completed', payload);
    },

    async trackQueryFailed(
      ctx: MindAnalyticsContext,
      error: AgentErrorResponse,
    ): Promise<void> {
      const payload: QueryFailedPayload = {
        queryId: ctx.queryId,
        durationMs: Date.now() - ctx.startTime,
        errorCode: error.error.code,
        errorMessage: error.error.message,
        recoverable: error.error.recoverable,
      };

      await safeEmit('mind.query.failed', payload);
    },

    async trackStage(
      stage: string,
      ctx: MindAnalyticsContext,
      data: Record<string, unknown> = {},
    ): Promise<void> {
      if (!detailed) {return;}

      await safeEmit(`mind.${stage}.completed`, {
        queryId: ctx.queryId,
        stage,
        durationMs: Date.now() - ctx.startTime,
        ...data,
      });
    },

    createContext(options: {
      queryId: string;
      scopeId: string;
      mode: MindAnalyticsContext['mode'];
    }): MindAnalyticsContext {
      return {
        queryId: options.queryId,
        scopeId: options.scopeId,
        mode: options.mode,
        startTime: Date.now(),
        llmCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
        subqueries: [],
        iterations: 0,
        compressionApplied: false,
      };
    },

    updateContext(
      ctx: MindAnalyticsContext,
      updates: Partial<Omit<MindAnalyticsContext, 'queryId' | 'scopeId' | 'mode' | 'startTime'>>,
    ): void {
      if (updates.llmCalls !== undefined) {ctx.llmCalls += updates.llmCalls;}
      if (updates.tokensIn !== undefined) {ctx.tokensIn += updates.tokensIn;}
      if (updates.tokensOut !== undefined) {ctx.tokensOut += updates.tokensOut;}
      if (updates.subqueries) {ctx.subqueries.push(...updates.subqueries);}
      if (updates.iterations !== undefined) {ctx.iterations = updates.iterations;}
      if (updates.compressionApplied !== undefined) {ctx.compressionApplied = updates.compressionApplied;}
      if (updates.retrieval !== undefined) {ctx.retrieval = updates.retrieval;}
    },
  };
}

export type MindAnalytics = ReturnType<typeof createMindAnalytics>;
