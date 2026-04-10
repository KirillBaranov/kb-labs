import { describe, it, expect } from 'vitest';
import { mockLLM } from '../mock-llm.js';

describe('mockLLM', () => {
  describe('basic usage', () => {
    it('should return default response', async () => {
      const llm = mockLLM();
      const res = await llm.complete('hello');

      expect(res.content).toBe('mock response');
      expect(res.model).toBe('mock');
      expect(res.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
    });

    it('should track calls with vi.fn() spy', async () => {
      const llm = mockLLM();
      await llm.complete('hello');
      await llm.complete('world');

      expect(llm.complete).toHaveBeenCalledTimes(2);
      expect(llm.complete).toHaveBeenCalledWith('hello');
      expect(llm.complete).toHaveBeenCalledWith('world');
    });

    it('should record calls in .calls array', async () => {
      const llm = mockLLM();
      await llm.complete('hello');

      expect(llm.calls).toHaveLength(1);
      expect(llm.calls[0]!.prompt).toBe('hello');
      expect(llm.calls[0]!.response.content).toBe('mock response');
    });

    it('should expose lastCall', async () => {
      const llm = mockLLM();
      await llm.complete('first');
      await llm.complete('second');

      expect(llm.lastCall?.prompt).toBe('second');
    });
  });

  describe('onComplete() with string matcher', () => {
    it('should match substring and return specific response', async () => {
      const llm = mockLLM()
        .onComplete('commit').respondWith('feat: add feature')
        .onAnyComplete().respondWith('default');

      const res1 = await llm.complete('Generate commit message');
      expect(res1.content).toBe('feat: add feature');

      const res2 = await llm.complete('something else');
      expect(res2.content).toBe('default');
    });
  });

  describe('onComplete() with regex matcher', () => {
    it('should match regex pattern', async () => {
      const llm = mockLLM()
        .onComplete(/explain/i).respondWith('This code does X');

      const res = await llm.complete('Please explain this function');
      expect(res.content).toBe('This code does X');
    });
  });

  describe('onComplete() with function matcher', () => {
    it('should use custom matcher function', async () => {
      const llm = mockLLM()
        .onComplete((p) => p.length > 100).respondWith('long prompt handled');

      const shortRes = await llm.complete('short');
      expect(shortRes.content).toBe('mock response'); // default

      const longRes = await llm.complete('a'.repeat(101));
      expect(longRes.content).toBe('long prompt handled');
    });
  });

  describe('onComplete() with function response', () => {
    it('should accept a response factory function', async () => {
      const llm = mockLLM()
        .onAnyComplete().respondWith((prompt) => `Echo: ${prompt}`);

      const res = await llm.complete('hello');
      expect(res.content).toBe('Echo: hello');
    });
  });

  describe('onComplete() with LLMResponse object', () => {
    it('should accept full LLMResponse', async () => {
      const llm = mockLLM()
        .onAnyComplete().respondWith({
          content: 'custom',
          usage: { promptTokens: 10, completionTokens: 5 },
          model: 'gpt-4',
        });

      const res = await llm.complete('test');
      expect(res.content).toBe('custom');
      expect(res.usage.promptTokens).toBe(10);
      expect(res.model).toBe('gpt-4');
    });
  });

  describe('onAnyComplete()', () => {
    it('should set default response', async () => {
      const llm = mockLLM()
        .onAnyComplete().respondWith('always this');

      const res = await llm.complete('anything');
      expect(res.content).toBe('always this');
    });
  });

  describe('rule priority', () => {
    it('should match first matching rule', async () => {
      const llm = mockLLM()
        .onComplete('commit').respondWith('first')
        .onComplete('commit').respondWith('second');

      const res = await llm.complete('commit');
      expect(res.content).toBe('first');
    });
  });

  describe('streaming', () => {
    it('should yield configured chunks', async () => {
      const llm = mockLLM().streaming(['hello', ' ', 'world']);

      const chunks: string[] = [];
      for await (const chunk of llm.stream('test')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['hello', ' ', 'world']);
      expect(llm.stream).toHaveBeenCalledWith('test');
    });
  });

  describe('failing', () => {
    it('should throw on complete()', async () => {
      const error = new Error('rate limit exceeded');
      const llm = mockLLM().failing(error);

      await expect(llm.complete('test')).rejects.toThrow('rate limit exceeded');
    });

    it('should throw on stream()', async () => {
      const llm = mockLLM().failing(new Error('down'));

      await expect(async () => {
        for await (const _ of llm.stream('test')) { /* consume */ }
      }).rejects.toThrow('down');
    });

    it('should throw on chatWithTools()', async () => {
      const llm = mockLLM().failing(new Error('fail'));

      await expect(
        llm.chatWithTools!(
          [{ role: 'user', content: 'test' }],
          { tools: [] },
        ),
      ).rejects.toThrow('fail');
    });
  });

  describe('chatWithTools', () => {
    it('should return configured tool calls', async () => {
      const llm = mockLLM().withToolCalls([
        { id: 'call-1', name: 'search', input: { query: 'test' } },
      ]);

      const res = await llm.chatWithTools!(
        [{ role: 'user', content: 'find something' }],
        { tools: [{ name: 'search', description: 'Search', inputSchema: {} }] },
      );

      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0]!.name).toBe('search');
      expect(res.toolCalls![0]!.input).toEqual({ query: 'test' });
    });

    it('should record tool call history', async () => {
      const llm = mockLLM();
      await llm.chatWithTools!(
        [{ role: 'user', content: 'test' }],
        { tools: [] },
      );

      expect(llm.toolCalls).toHaveLength(1);
      expect(llm.toolCalls[0]!.messages[0]!.content).toBe('test');
    });
  });

  describe('resetCalls', () => {
    it('should clear all recorded calls and spies', async () => {
      const llm = mockLLM();
      await llm.complete('test');

      expect(llm.calls).toHaveLength(1);
      expect(llm.complete).toHaveBeenCalledOnce();

      llm.resetCalls();

      expect(llm.calls).toHaveLength(0);
      expect(llm.complete).not.toHaveBeenCalled();
      expect(llm.lastCall).toBeUndefined();
    });
  });
});
