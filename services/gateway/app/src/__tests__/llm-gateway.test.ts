/**
 * Integration tests for AI Gateway LLM endpoint.
 *
 * Covers:
 *   POST /llm/v1/chat/completions
 *     - 401 without auth
 *     - 400 with invalid body
 *     - 400 with invalid tier
 *     - 503 when LLM not available
 *     - 200 non-streaming completion (simple complete)
 *     - 200 non-streaming with tool calls (chatWithTools)
 *     - 200 streaming (SSE format)
 *     - 500 on LLM error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ICache, ILogger, ILLM, LLMResponse, LLMToolCallResponse } from '@kb-labs/core-platform';
import type { JwtConfig } from '@kb-labs/gateway-auth';
import { createAuthMiddleware } from '../auth/middleware.js';
import { registerLLMGatewayRoutes } from '../llm/routes.js';

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock platform singleton — must be before import
const mockLLM: ILLM & { chatWithTools: any } = {
  complete: vi.fn(),
  stream: vi.fn(),
  chatWithTools: vi.fn(),
};

vi.mock('@kb-labs/core-runtime', () => ({
  platform: {
    get llm() { return mockLLM; },
  },
}));

function makeCache(): ICache {
  const store = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async set(k: string, v: unknown) { store.set(k, v); },
    async delete(k: string) { store.delete(k); },
    async clear() { store.clear(); },
  } as unknown as ICache;
}

const noopLogger: ILogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => noopLogger),
} as unknown as ILogger;

const stubJwtConfig: JwtConfig = { secret: 'test-secret' };

// Seed a static token so we can authenticate requests
const TEST_TOKEN = 'test-llm-token';
const TEST_AUTH_HEADER = `Bearer ${TEST_TOKEN}`;

// ── Test app builder ──────────────────────────────────────────────────────

async function buildApp(): Promise<{ app: FastifyInstance; cache: ICache }> {
  const cache = makeCache();

  // Seed machine token for auth
  await cache.set(`host:token:${TEST_TOKEN}`, {
    hostId: 'host-test',
    namespaceId: 'ns-test',
  });

  const app = Fastify({ logger: false });

  await app.register(async function scope(s) {
    s.addHook('onRequest', createAuthMiddleware(cache, stubJwtConfig));
    registerLLMGatewayRoutes(s as any, noopLogger);
  });

  await app.ready();
  return { app, cache };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeCompletionPayload(overrides: Record<string, unknown> = {}) {
  return {
    model: 'medium',
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

const MOCK_LLM_RESPONSE: LLMResponse = {
  content: 'Hello! How can I help?',
  usage: { promptTokens: 10, completionTokens: 8 },
  model: 'gpt-4o',
};

const MOCK_TOOL_CALL_RESPONSE: LLMToolCallResponse = {
  content: '',
  usage: { promptTokens: 15, completionTokens: 20 },
  model: 'gpt-4o',
  toolCalls: [
    {
      id: 'call_abc123',
      name: 'get_weather',
      input: { location: 'Moscow' },
    },
  ],
  stopReason: 'tool_use',
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /llm/v1/chat/completions', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    const result = await buildApp();
    app = result.app;
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      payload: makeCompletionPayload(),
    });

    expect(res.statusCode).toBe(401);
  });

  // ── Validation ────────────────────────────────────────────────────────

  it('returns 400 with empty body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('returns 400 with invalid tier', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload({ model: 'gpt-4o' }), // literal model name, not tier
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with no messages', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload({ messages: [] }),
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Non-streaming completion ──────────────────────────────────────────

  it('returns 200 with OpenAI-compatible response (non-streaming)', async () => {
    (mockLLM.complete as any).mockResolvedValue(MOCK_LLM_RESPONSE);

    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // OpenAI format checks
    expect(body.object).toBe('chat.completion');
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(body.model).toBe('medium'); // tier, not concrete model
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].message.content).toBe('Hello! How can I help?');
    expect(body.choices[0].finish_reason).toBe('stop');
    expect(body.usage.prompt_tokens).toBe(10);
    expect(body.usage.completion_tokens).toBe(8);
    expect(body.usage.total_tokens).toBe(18);
  });

  it('passes temperature and max_tokens to LLM', async () => {
    (mockLLM.complete as any).mockResolvedValue(MOCK_LLM_RESPONSE);

    await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload({ temperature: 0.5, max_tokens: 100 }),
    });

    expect(mockLLM.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        temperature: 0.5,
        maxTokens: 100,
      }),
    );
  });

  it('extracts system prompt from messages', async () => {
    (mockLLM.complete as any).mockResolvedValue(MOCK_LLM_RESPONSE);

    await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
      }),
    });

    expect(mockLLM.complete).toHaveBeenCalledWith(
      'Hi',
      expect.objectContaining({ systemPrompt: 'You are helpful.' }),
    );
  });

  // ── Tool calling ──────────────────────────────────────────────────────

  it('returns tool_calls in OpenAI format when LLM requests tools', async () => {
    (mockLLM.chatWithTools as any).mockResolvedValue(MOCK_TOOL_CALL_RESPONSE);

    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload({
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: { type: 'object', properties: { location: { type: 'string' } } },
            },
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.choices[0].finish_reason).toBe('tool_calls');
    expect(body.choices[0].message.tool_calls).toHaveLength(1);
    expect(body.choices[0].message.tool_calls[0]).toEqual({
      id: 'call_abc123',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"location":"Moscow"}',
      },
    });
  });

  // ── Streaming ─────────────────────────────────────────────────────────

  it('returns SSE stream with correct format', async () => {
    // Mock stream as async iterable
    const chunks = ['Hello', ', ', 'world', '!'];
    (mockLLM.stream as any).mockReturnValue(
      (async function* () {
        for (const c of chunks) {yield c;}
      })(),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload({ stream: true }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    // Parse SSE events
    const lines = res.body.split('\n').filter((l) => l.startsWith('data: '));
    const events = lines.map((l) => l.replace('data: ', ''));

    // First event: role chunk
    const first = JSON.parse(events[0]!);
    expect(first.object).toBe('chat.completion.chunk');
    expect(first.choices[0].delta.role).toBe('assistant');

    // Middle events: content chunks
    const contentChunks = events
      .slice(1, -2) // skip first (role) and last two (finish + [DONE])
      .map((e) => JSON.parse(e));
    const streamedText = contentChunks.map((c) => c.choices[0].delta.content).join('');
    expect(streamedText).toBe('Hello, world!');

    // Last JSON event: finish chunk
    const finish = JSON.parse(events[events.length - 2]!);
    expect(finish.choices[0].finish_reason).toBe('stop');

    // Final: [DONE] sentinel
    expect(events[events.length - 1]).toBe('[DONE]');
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('returns 500 when LLM throws', async () => {
    (mockLLM.complete as any).mockRejectedValue(new Error('Provider timeout'));

    const res = await app.inject({
      method: 'POST',
      url: '/llm/v1/chat/completions',
      headers: { authorization: TEST_AUTH_HEADER },
      payload: makeCompletionPayload(),
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.type).toBe('server_error');
  });

  // ── Tiers ─────────────────────────────────────────────────────────────

  it('accepts all valid tiers: small, medium, large', async () => {
    (mockLLM.complete as any).mockResolvedValue(MOCK_LLM_RESPONSE);

    for (const tier of ['small', 'medium', 'large']) {
      const res = await app.inject({
        method: 'POST',
        url: '/llm/v1/chat/completions',
        headers: { authorization: TEST_AUTH_HEADER },
        payload: makeCompletionPayload({ model: tier }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().model).toBe(tier);
    }
  });
});
