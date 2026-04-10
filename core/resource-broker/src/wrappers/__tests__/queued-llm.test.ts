/**
 * Unit tests for QueuedLLM wrapper - metadata routing
 *
 * These tests verify that QueuedLLM correctly reads metadata.resource
 * from LLMRouter and routes requests to the appropriate ResourceBroker resource.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueuedLLM } from '../queued-llm.js';
import type { ILLM, LLMResponse } from '@kb-labs/core-platform';
import type { ResourceResponse } from '../../types.js';

/** Captured enqueue request for assertions */
interface CapturedRequest {
  resource: string;
  operation: string;
  args: unknown[];
  priority: string;
  estimatedTokens?: number;
}

describe('QueuedLLM', () => {
  let mockBroker: {
    enqueue: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
    isShuttingDown: ReturnType<typeof vi.fn>;
  };
  let mockLLM: ILLM;
  let queuedLLM: QueuedLLM;
  let enqueueCall: CapturedRequest | null;

  const mockResponse: LLMResponse = {
    content: 'Mock response',
    model: 'gpt-4o-mini',
    usage: { promptTokens: 10, completionTokens: 5 },
  };

  beforeEach(() => {
    enqueueCall = null;

    // Mock broker that captures enqueue calls
    mockBroker = {
      enqueue: vi.fn(async <T>(request: CapturedRequest): Promise<ResourceResponse<T>> => {
        enqueueCall = request;
        return {
          success: true,
          data: mockResponse as T,
          retries: 0,
          waitTime: 0,
          processingTime: 10,
          totalTime: 10,
        };
      }),
      register: vi.fn(),
      getStats: vi.fn(() => ({
        resources: {},
        totalRequests: 0,
        totalSuccess: 0,
        totalErrors: 0,
        queueSize: 0,
        uptime: 0,
      })),
      shutdown: vi.fn(async () => {}),
      isShuttingDown: vi.fn(() => false),
    };

    // Mock LLM (used for stream passthrough)
    mockLLM = {
      complete: vi.fn(async () => mockResponse),
      stream: vi.fn(async function* () {
        yield 'chunk1';
        yield 'chunk2';
      }),
    };

    queuedLLM = new QueuedLLM(mockBroker, mockLLM);
  });

  describe('metadata.resource routing', () => {
    it('should use default "llm" resource when no metadata provided', async () => {
      await queuedLLM.complete('Hello');

      expect(enqueueCall).not.toBeNull();
      expect(enqueueCall!.resource).toBe('llm');
    });

    it('should use metadata.resource when provided by LLMRouter', async () => {
      await queuedLLM.complete('Hello', {
        metadata: {
          tier: 'medium',
          provider: 'anthropic',
          resource: 'llm:anthropic',
        },
      });

      expect(enqueueCall).not.toBeNull();
      expect(enqueueCall!.resource).toBe('llm:anthropic');
    });

    it('should route to llm:openai for OpenAI provider', async () => {
      await queuedLLM.complete('Hello', {
        model: 'gpt-4o-mini',
        metadata: {
          tier: 'small',
          provider: 'openai',
          resource: 'llm:openai',
        },
      });

      expect(enqueueCall!.resource).toBe('llm:openai');
    });

    it('should route to llm:vibeproxy for Vibeproxy provider', async () => {
      await queuedLLM.complete('Hello', {
        model: 'claude-sonnet-4-5',
        metadata: {
          tier: 'medium',
          provider: 'vibeproxy',
          resource: 'llm:vibeproxy',
        },
      });

      expect(enqueueCall!.resource).toBe('llm:vibeproxy');
    });

    it('should fallback to "llm" when metadata exists but resource is undefined', async () => {
      await queuedLLM.complete('Hello', {
        metadata: {
          tier: 'small',
          provider: 'openai',
          // resource is undefined
        },
      });

      expect(enqueueCall!.resource).toBe('llm');
    });

    it('should preserve full metadata in args for downstream wrappers', async () => {
      const options = {
        model: 'gpt-4o',
        temperature: 0.7,
        metadata: {
          tier: 'large' as const,
          provider: 'openai',
          resource: 'llm:openai',
        },
      };

      await queuedLLM.complete('Hello', options);

      // Verify args include the full options with metadata
      expect(enqueueCall!.args).toEqual(['Hello', options]);
    });
  });

  describe('priority handling', () => {
    it('should use default "normal" priority', async () => {
      await queuedLLM.complete('Hello');

      expect(enqueueCall!.priority).toBe('normal');
    });

    it('should use provided priority', async () => {
      await queuedLLM.complete('Hello', { priority: 'high' } as any);

      expect(enqueueCall!.priority).toBe('high');
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens from prompt', async () => {
      await queuedLLM.complete('Hello world');

      expect(enqueueCall!.estimatedTokens).toBeGreaterThan(0);
    });

    it('should estimate more tokens for longer prompts', async () => {
      await queuedLLM.complete('Short');
      const shortTokens = enqueueCall!.estimatedTokens;

      await queuedLLM.complete('This is a much longer prompt with many more words');
      const longTokens = enqueueCall!.estimatedTokens;

      expect(longTokens).toBeGreaterThan(shortTokens!);
    });
  });

  describe('error handling', () => {
    it('should throw when broker returns failure', async () => {
      mockBroker.enqueue = vi.fn(async (): Promise<ResourceResponse> => ({
        success: false,
        error: new Error('Rate limit exceeded'),
        retries: 0,
        waitTime: 0,
        processingTime: 0,
        totalTime: 0,
      }));

      await expect(queuedLLM.complete('Hello')).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw generic error when broker fails without error object', async () => {
      mockBroker.enqueue = vi.fn(async (): Promise<ResourceResponse> => ({
        success: false,
        retries: 0,
        waitTime: 0,
        processingTime: 0,
        totalTime: 0,
      }));

      await expect(queuedLLM.complete('Hello')).rejects.toThrow('LLM request failed');
    });
  });

  describe('stream passthrough', () => {
    it('should bypass queue for streaming (real-time UX)', async () => {
      const chunks: string[] = [];
      for await (const chunk of queuedLLM.stream('Hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['chunk1', 'chunk2']);
      // Stream should NOT go through broker
      expect(mockBroker.enqueue).not.toHaveBeenCalled();
      // Stream should go directly to realLLM
      expect(mockLLM.stream).toHaveBeenCalledWith('Hello', undefined);
    });
  });

  describe('chatWithTools passthrough', () => {
    it('should pass through to realLLM (not queued yet)', async () => {
      const mockToolResponse = {
        content: 'Tool response',
        model: 'gpt-4o',
        usage: { promptTokens: 20, completionTokens: 10 },
        toolCalls: [{ id: '1', name: 'test', input: {} }],
      };

      mockLLM.chatWithTools = vi.fn(async () => mockToolResponse);

      const result = await queuedLLM.chatWithTools(
        [{ role: 'user', content: 'Hello' }],
        { tools: [], model: 'gpt-4o' }
      );

      expect(result).toEqual(mockToolResponse);
      expect(mockLLM.chatWithTools).toHaveBeenCalled();
    });

    it('should throw if realLLM does not support chatWithTools', async () => {
      // Remove chatWithTools from mockLLM
      delete (mockLLM as any).chatWithTools;

      await expect(
        queuedLLM.chatWithTools([{ role: 'user', content: 'Hello' }], { tools: [], model: 'gpt-4o' })
      ).rejects.toThrow('Underlying LLM does not support chatWithTools');
    });
  });
});
