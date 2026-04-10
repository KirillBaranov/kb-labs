/**
 * Unit tests for KBPlatform client SDK.
 *
 * Covers:
 *   - call() sends correct request format
 *   - call() handles error responses
 *   - llm.complete() passes arguments correctly
 *   - cache.get() / cache.set() typed correctly
 *   - vectorStore.search() passes query
 *   - telemetry.event() buffers and flushes
 *   - auth header sent on all requests
 *   - network error handling
 *   - generic call() for any adapter
 *   - shutdown() flushes telemetry
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KBPlatform } from '../client.js';

// ── Mock fetch ────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockOkResponse(result: unknown = null) {
  return {
    ok: true,
    json: async () => ({ ok: true, result, durationMs: 5 }),
    text: async () => JSON.stringify({ ok: true, result, durationMs: 5 }),
  };
}

function mockErrorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ ok: false, error: { message } }),
    json: async () => ({ ok: false, error: { message } }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('KBPlatform', () => {
  let platform: KBPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    platform = new KBPlatform({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      defaultTags: { source: 'test-app' },
    });
  });

  afterEach(async () => {
    await platform.shutdown();
  });

  // ── Generic call ──────────────────────────────────────────────────────

  it('call() sends correct request format', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse('result'));

    await platform.call('cache', 'get', 'my-key');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/platform/v1/cache/get',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ args: ['my-key'] }),
      }),
    );
  });

  it('call() includes auth header', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse());

    await platform.call('cache', 'get', 'key');

    const callArgs = mockFetch.mock.calls[0]![1];
    expect(callArgs.headers.Authorization).toBe('Bearer test-key');
  });

  it('call() handles error responses', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(502, 'Provider timeout'));

    await expect(platform.call('llm', 'complete', 'test')).rejects.toThrow('Provider timeout');
  });

  it('call() handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    await expect(platform.call('llm', 'complete', 'test')).rejects.toThrow('fetch failed');
  });

  // ── LLM proxy ─────────────────────────────────────────────────────────

  it('llm.complete() passes arguments correctly', async () => {
    const llmResult = {
      content: 'Hello!',
      usage: { promptTokens: 10, completionTokens: 5 },
      model: 'gpt-4',
    };
    mockFetch.mockResolvedValueOnce(mockOkResponse(llmResult));

    const result = await platform.llm.complete('Say hello', { temperature: 0.5 });

    expect(result.content).toBe('Hello!');
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.args).toEqual(['Say hello', { temperature: 0.5 }]);
  });

  // ── Cache proxy ───────────────────────────────────────────────────────

  it('cache.get() returns typed value', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ data: 42 }));

    const result = await platform.cache.get<{ data: number }>('my-key');

    expect(result).toEqual({ data: 42 });
    expect(mockFetch.mock.calls[0]![0]).toBe('http://localhost:4000/platform/v1/cache/get');
  });

  it('cache.set() sends key, value, ttl', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse());

    await platform.cache.set('key', 'value', 60000);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.args).toEqual(['key', 'value', 60000]);
  });

  // ── VectorStore proxy ─────────────────────────────────────────────────

  it('vectorStore.search() passes query', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse([{ id: '1', score: 0.9 }]));

    const results = await platform.vectorStore.search({ query: 'test', limit: 10 });

    expect(results).toEqual([{ id: '1', score: 0.9 }]);
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.args).toEqual([{ query: 'test', limit: 10 }]);
  });

  // ── Telemetry convenience ─────────────────────────────────────────────

  it('telemetry.event() buffers without sending', () => {
    platform.telemetry.event('user.signup', { plan: 'pro' });

    // No fetch calls yet (buffered)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('telemetry.flush() sends buffered events', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ accepted: 1, rejected: 0 }), text: async () => '' });

    platform.telemetry.event('user.signup', { plan: 'pro' });
    platform.telemetry.metric('latency', 142, { endpoint: '/api' });
    await platform.telemetry.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/telemetry/v1/ingest');
    const body = JSON.parse(opts.body);
    expect(body.events).toHaveLength(2);
    expect(body.events[0].type).toBe('user.signup');
    expect(body.events[1].type).toBe('metric');
  });

  it('shutdown() flushes remaining events', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ accepted: 1, rejected: 0 }), text: async () => '' });

    platform.telemetry.event('final.event');
    await platform.shutdown();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ── Generic adapter call ──────────────────────────────────────────────

  it('generic call() works for any adapter', async () => {
    mockFetch.mockResolvedValueOnce(mockOkResponse({ rows: [1, 2, 3] }));

    const result = await platform.call<{ rows: number[] }>('sqlDatabase', 'query', 'SELECT 1');

    expect(result.rows).toEqual([1, 2, 3]);
    expect(mockFetch.mock.calls[0]![0]).toBe('http://localhost:4000/platform/v1/sqlDatabase/query');
  });
});
