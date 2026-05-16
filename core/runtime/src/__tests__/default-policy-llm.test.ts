import { describe, it, expect, vi } from 'vitest';
import {
  DefaultExecutionPolicyLLM,
  createDefaultExecutionPolicyLLM,
} from '../wrappers/default-execution-policy-llm.js';
import type { ILLM, LLMResponse, LLMExecutionPolicy, LLMOptions } from '@kb-labs/core-platform';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockLLM(overrides: Partial<ILLM> = {}): ILLM & { lastOptions: LLMOptions | undefined } {
  let lastOptions: LLMOptions | undefined;

  const llm: ILLM & { lastOptions: LLMOptions | undefined } = {
    lastOptions,
    async complete(_prompt: string, options?: LLMOptions): Promise<LLMResponse> {
      llm.lastOptions = options;
      return { content: 'response', usage: { promptTokens: 5, completionTokens: 5 }, model: 'test' };
    },
    stream: vi.fn(),
    ...overrides,
  };

  return llm;
}

const defaultPolicy: LLMExecutionPolicy = {
  cache: { mode: 'auto' },
  stream: { mode: 'disabled' },
};

// ── createDefaultExecutionPolicyLLM ──────────────────────────────────────────

describe('createDefaultExecutionPolicyLLM', () => {
  it('returns the same LLM when no defaults provided', () => {
    const llm = mockLLM();
    expect(createDefaultExecutionPolicyLLM(llm)).toBe(llm);
  });

  it('returns the same LLM when empty defaults provided', () => {
    const llm = mockLLM();
    expect(createDefaultExecutionPolicyLLM(llm, {})).toBe(llm);
  });

  it('returns DefaultExecutionPolicyLLM when defaults have content', () => {
    const llm = mockLLM();
    const wrapped = createDefaultExecutionPolicyLLM(llm, defaultPolicy);
    expect(wrapped).toBeInstanceOf(DefaultExecutionPolicyLLM);
  });
});

// ── Policy merging ────────────────────────────────────────────────────────────

describe('DefaultExecutionPolicyLLM — policy merging', () => {
  it('injects defaults when no call-level options provided', async () => {
    const llm = mockLLM();
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);
    await wrapper.complete('hello');
    expect(llm.lastOptions?.execution?.cache?.mode).toBe('auto');
    expect(llm.lastOptions?.execution?.stream?.mode).toBe('disabled');
  });

  it('call-level cache overrides default cache, keeps default stream', async () => {
    const llm = mockLLM();
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);

    await wrapper.complete('hello', {
      execution: { cache: { mode: 'disabled' } },
    });

    // cache should be overridden, stream should come from defaults
    expect(llm.lastOptions?.execution?.cache?.mode).toBe('disabled');
    expect(llm.lastOptions?.execution?.stream?.mode).toBe('disabled');
  });

  it('does not mutate call-level options object', async () => {
    const llm = mockLLM();
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);

    const callOptions: LLMOptions = { temperature: 0.5 };
    await wrapper.complete('hello', callOptions);

    // original should be unchanged
    expect(callOptions.execution).toBeUndefined();
    expect(callOptions.temperature).toBe(0.5);
  });

  it('passes through non-execution options unchanged', async () => {
    const llm = mockLLM();
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);

    await wrapper.complete('hello', { temperature: 0.7, maxTokens: 100 });

    expect(llm.lastOptions?.temperature).toBe(0.7);
    expect(llm.lastOptions?.maxTokens).toBe(100);
  });
});

// ── getProtocolCapabilities ───────────────────────────────────────────────────

describe('getProtocolCapabilities', () => {
  it('delegates to underlying LLM when it has the method', async () => {
    const caps = { cache: { supported: true }, stream: { supported: true } };
    const llm = mockLLM({
      getProtocolCapabilities: async () => caps,
    });
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);
    expect(await wrapper.getProtocolCapabilities()).toBe(caps);
  });

  it('returns fallback when underlying LLM lacks getProtocolCapabilities', async () => {
    const llm = mockLLM();
    delete (llm as Partial<ILLM>).getProtocolCapabilities;
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);
    const caps = await wrapper.getProtocolCapabilities();
    expect(caps.cache.supported).toBe(false);
    expect(caps.stream.supported).toBe(true);
  });
});

// ── chatWithTools ─────────────────────────────────────────────────────────────

describe('chatWithTools', () => {
  it('throws when underlying LLM does not support chatWithTools', async () => {
    const llm = mockLLM();
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);
    await expect(wrapper.chatWithTools([], {} as never)).rejects.toThrow(
      'does not support chatWithTools'
    );
  });

  it('delegates to underlying LLM when chatWithTools is supported', async () => {
    const mockResponse = { content: 'tool result', toolCalls: [] };
    const chatWithTools = vi.fn(async () => mockResponse);
    const llm = mockLLM({ chatWithTools });

    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);
    const result = await wrapper.chatWithTools([], { tools: [] } as never);

    expect(result).toBe(mockResponse);
    expect(chatWithTools).toHaveBeenCalledOnce();
  });
});

// ── stream delegation ─────────────────────────────────────────────────────────

describe('stream', () => {
  it('delegates stream() to underlying LLM with merged policy', () => {
    const streamResult = (async function* () { yield 'chunk'; })();
    const llm = mockLLM({ stream: vi.fn(() => streamResult) });
    const wrapper = new DefaultExecutionPolicyLLM(llm, defaultPolicy);

    const iterable = wrapper.stream('hello', { temperature: 0.3 });
    expect(llm.stream).toHaveBeenCalledOnce();
    expect(iterable).toBe(streamResult);

    // Verify policy was merged into the call
    const callArg = (llm.stream as ReturnType<typeof vi.fn>).mock.calls[0]![1] as LLMOptions;
    expect(callArg.execution?.cache?.mode).toBe('auto');
    expect(callArg.temperature).toBe(0.3);
  });
});
