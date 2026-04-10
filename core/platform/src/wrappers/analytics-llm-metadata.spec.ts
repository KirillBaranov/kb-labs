/**
 * @module @kb-labs/core-platform/wrappers/__tests__/analytics-llm-metadata
 * Tests for AnalyticsLLM metadata tracking from LLMRouter
 *
 * These tests verify that AnalyticsLLM correctly reads and tracks
 * tier/provider metadata in analytics events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsLLM } from './analytics-llm.js';
import type { ILLM, IAnalytics, LLMResponse, LLMToolCallResponse } from '../index.js';

describe('AnalyticsLLM - Metadata Tracking', () => {
  let mockAnalytics: IAnalytics;
  let mockLLM: ILLM;
  let analyticsLLM: AnalyticsLLM;
  let trackedEvents: Array<{ event: string; properties: Record<string, unknown> }>;

  const mockResponse: LLMResponse = {
    content: 'Hello!',
    model: 'gpt-4o-mini',
    usage: { promptTokens: 10, completionTokens: 5 },
  };

  beforeEach(() => {
    trackedEvents = [];

    // Mock analytics that captures all track calls
    mockAnalytics = {
      track: vi.fn(async (event: string, properties?: Record<string, unknown>) => {
        trackedEvents.push({ event, properties: properties ?? {} });
      }),
      identify: vi.fn(),
      flush: vi.fn(),
    };

    // Mock LLM
    mockLLM = {
      complete: vi.fn(async () => mockResponse),
      stream: vi.fn(async function* () {
        yield 'chunk1';
        yield 'chunk2';
      }),
    };

    analyticsLLM = new AnalyticsLLM(mockLLM, mockAnalytics);
  });

  describe('complete() - metadata in events', () => {
    it('should track tier in started and completed events', async () => {
      await analyticsLLM.complete('Hello', {
        metadata: { tier: 'medium' },
      });

      const startEvent = trackedEvents.find((e) => e.event === 'llm.completion.started');
      const completeEvent = trackedEvents.find((e) => e.event === 'llm.completion.completed');

      expect(startEvent).toBeDefined();
      expect(startEvent!.properties.tier).toBe('medium');

      expect(completeEvent).toBeDefined();
      expect(completeEvent!.properties.tier).toBe('medium');
    });

    it('should track provider in events', async () => {
      await analyticsLLM.complete('Hello', {
        metadata: { tier: 'medium', provider: 'anthropic' },
      });

      const startEvent = trackedEvents.find((e) => e.event === 'llm.completion.started');
      const completeEvent = trackedEvents.find((e) => e.event === 'llm.completion.completed');

      expect(startEvent!.properties.provider).toBe('anthropic');
      expect(completeEvent!.properties.provider).toBe('anthropic');
    });

    it('should track full metadata from LLMRouter', async () => {
      await analyticsLLM.complete('Hello', {
        model: 'claude-sonnet-4-5',
        metadata: {
          tier: 'medium',
          provider: 'vibeproxy',
          resource: 'llm:vibeproxy',
        },
      });

      const completeEvent = trackedEvents.find((e) => e.event === 'llm.completion.completed');

      expect(completeEvent!.properties.tier).toBe('medium');
      expect(completeEvent!.properties.provider).toBe('vibeproxy');
      // Note: resource is not tracked (implementation detail for QueuedLLM)
    });

    it('should handle missing metadata gracefully (undefined tier/provider)', async () => {
      await analyticsLLM.complete('Hello');

      const startEvent = trackedEvents.find((e) => e.event === 'llm.completion.started');
      const completeEvent = trackedEvents.find((e) => e.event === 'llm.completion.completed');

      expect(startEvent!.properties.tier).toBeUndefined();
      expect(startEvent!.properties.provider).toBeUndefined();
      expect(completeEvent!.properties.tier).toBeUndefined();
      expect(completeEvent!.properties.provider).toBeUndefined();
    });

    it('should track metadata in error events', async () => {
      mockLLM.complete = vi.fn(async () => {
        throw new Error('API Error');
      });

      await expect(
        analyticsLLM.complete('Hello', {
          metadata: { tier: 'large', provider: 'openai' },
        })
      ).rejects.toThrow('API Error');

      const errorEvent = trackedEvents.find((e) => e.event === 'llm.completion.error');

      expect(errorEvent).toBeDefined();
      expect(errorEvent!.properties.tier).toBe('large');
      expect(errorEvent!.properties.provider).toBe('openai');
      expect(errorEvent!.properties.error).toBe('API Error');
    });
  });

  describe('stream() - metadata in events', () => {
    it('should track tier/provider in stream events', async () => {
      const chunks: string[] = [];
      for await (const chunk of analyticsLLM.stream('Hello', {
        metadata: { tier: 'small', provider: 'openai' },
      })) {
        chunks.push(chunk);
      }

      const startEvent = trackedEvents.find((e) => e.event === 'llm.stream.started');
      const completeEvent = trackedEvents.find((e) => e.event === 'llm.stream.completed');

      expect(startEvent!.properties.tier).toBe('small');
      expect(startEvent!.properties.provider).toBe('openai');
      expect(completeEvent!.properties.tier).toBe('small');
      expect(completeEvent!.properties.provider).toBe('openai');
    });

    it('should track metadata in stream error events', async () => {
      mockLLM.stream = vi.fn(async function* () {
        yield 'chunk1';
        throw new Error('Stream Error');
      });

      const chunks: string[] = [];
      try {
        for await (const chunk of analyticsLLM.stream('Hello', {
          metadata: { tier: 'medium', provider: 'anthropic' },
        })) {
          chunks.push(chunk);
        }
      } catch {
        // Expected
      }

      const errorEvent = trackedEvents.find((e) => e.event === 'llm.stream.error');

      expect(errorEvent).toBeDefined();
      expect(errorEvent!.properties.tier).toBe('medium');
      expect(errorEvent!.properties.provider).toBe('anthropic');
    });
  });

  describe('chatWithTools() - metadata in events', () => {
    const mockToolResponse: LLMToolCallResponse = {
      content: 'Tool response',
      model: 'gpt-4o',
      usage: { promptTokens: 20, completionTokens: 10 },
      toolCalls: [{ id: '1', name: 'test_tool', input: {} }],
    };

    beforeEach(() => {
      mockLLM.chatWithTools = vi.fn(async () => mockToolResponse);
    });

    it('should track tier/provider in chatWithTools events', async () => {
      await analyticsLLM.chatWithTools([{ role: 'user', content: 'Hello' }], {
        tools: [{ name: 'test_tool', description: 'Test', inputSchema: { type: 'object', properties: {} } }],
        model: 'gpt-4o',
        metadata: { tier: 'large', provider: 'openai' },
      } as any);

      const startEvent = trackedEvents.find((e) => e.event === 'llm.chatWithTools.started');
      const completeEvent = trackedEvents.find((e) => e.event === 'llm.chatWithTools.completed');

      expect(startEvent!.properties.tier).toBe('large');
      expect(startEvent!.properties.provider).toBe('openai');
      expect(completeEvent!.properties.tier).toBe('large');
      expect(completeEvent!.properties.provider).toBe('openai');
    });

    it('should track metadata in chatWithTools error events', async () => {
      mockLLM.chatWithTools = vi.fn(async () => {
        throw new Error('Tool Error');
      });

      await expect(
        analyticsLLM.chatWithTools([{ role: 'user', content: 'Hello' }], {
          tools: [],
          model: 'gpt-4o',
          metadata: { tier: 'medium', provider: 'vibeproxy' },
        } as any)
      ).rejects.toThrow('Tool Error');

      const errorEvent = trackedEvents.find((e) => e.event === 'llm.chatWithTools.error');

      expect(errorEvent).toBeDefined();
      expect(errorEvent!.properties.tier).toBe('medium');
      expect(errorEvent!.properties.provider).toBe('vibeproxy');
    });
  });

  describe('Real-world routing scenarios', () => {
    it('should track small tier → OpenAI routing', async () => {
      await analyticsLLM.complete('Quick question', {
        model: 'gpt-4o-mini',
        metadata: {
          tier: 'small',
          provider: 'openai',
          resource: 'llm:openai',
        },
      });

      const event = trackedEvents.find((e) => e.event === 'llm.completion.completed');
      expect(event!.properties.tier).toBe('small');
      expect(event!.properties.provider).toBe('openai');
      expect(event!.properties.model).toBe('gpt-4o-mini');
    });

    it('should track medium tier → Anthropic routing', async () => {
      (mockLLM.complete as any).mockResolvedValue({
        content: 'Response',
        model: 'claude-sonnet-4-5-20250929',
        usage: { promptTokens: 100, completionTokens: 50 },
      });

      await analyticsLLM.complete('Complex question', {
        model: 'claude-sonnet-4-5',
        metadata: {
          tier: 'medium',
          provider: 'vibeproxy',
          resource: 'llm:vibeproxy',
        },
      });

      const event = trackedEvents.find((e) => e.event === 'llm.completion.completed');
      expect(event!.properties.tier).toBe('medium');
      expect(event!.properties.provider).toBe('vibeproxy');
      expect(event!.properties.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should track large tier → Opus routing', async () => {
      (mockLLM.complete as any).mockResolvedValue({
        content: 'Deep analysis',
        model: 'claude-opus-4-5-20250929',
        usage: { promptTokens: 500, completionTokens: 1000 },
      });

      await analyticsLLM.complete('Architecture question', {
        model: 'claude-opus-4-5',
        metadata: {
          tier: 'large',
          provider: 'vibeproxy',
          resource: 'llm:vibeproxy',
        },
      });

      const event = trackedEvents.find((e) => e.event === 'llm.completion.completed');
      expect(event!.properties.tier).toBe('large');
      expect(event!.properties.provider).toBe('vibeproxy');
      expect(event!.properties.model).toBe('claude-opus-4-5-20250929');
    });
  });
});
