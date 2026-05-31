import { describe, it, expect } from 'vitest';
import {
  AgentResponseSchema,
  AGENT_RESPONSE_SCHEMA_VERSION,
  MindConfigSchema,
  resolveMindConfig,
  SearchRequestSchema,
} from '../src/index';

/**
 * A representative `agent-response-v1` object, matching the legacy
 * `@kb-labs/mind` shape (plugins/mind/orchestrator/src/types.ts). This guards
 * the frozen contract: the schema must accept exactly this shape.
 *
 * Phase 4 replaces/augments this with a byte-exact capture from the live
 * legacy plugin before the answer emitter is wired.
 */
const LEGACY_AGENT_RESPONSE = {
  answer: 'The auth flow lives in src/auth.ts.',
  sources: [
    { file: 'src/auth.ts', lines: [10, 42], snippet: 'export function login()', kind: 'code', relevance: 0.92 },
    { file: 'docs/auth.md', kind: 'doc' },
  ],
  confidence: 0.81,
  complete: true,
  sourcesSummary: { code: 1, docs: 1, external: {} },
  warnings: [],
  suggestions: [{ type: 'related', label: 'See logout()', ref: 'src/auth.ts' }],
  meta: {
    schemaVersion: AGENT_RESPONSE_SCHEMA_VERSION,
    requestId: 'req-123',
    mode: 'auto',
    timingMs: 2341,
    cached: false,
    confidence: 0.81,
    complete: true,
    sources: 2,
  },
};

describe('agent-response-v1 frozen contract', () => {
  it('accepts the legacy agent-response shape', () => {
    const parsed = AgentResponseSchema.parse(LEGACY_AGENT_RESPONSE);
    expect(parsed.meta.schemaVersion).toBe('agent-response-v1');
    expect(parsed.sources).toHaveLength(2);
  });

  it('round-trips without mutating the payload', () => {
    const parsed = AgentResponseSchema.parse(LEGACY_AGENT_RESPONSE);
    expect(parsed).toEqual(LEGACY_AGENT_RESPONSE);
  });

  it('preserves unknown meta keys (open shape)', () => {
    const parsed = AgentResponseSchema.parse({
      ...LEGACY_AGENT_RESPONSE,
      meta: { ...LEGACY_AGENT_RESPONSE.meta, indexVersion: 'v7', custom: 'x' },
    });
    expect(parsed.meta.indexVersion).toBe('v7');
    expect((parsed.meta as Record<string, unknown>).custom).toBe('x');
  });

  it('rejects an invalid source kind', () => {
    expect(() =>
      AgentResponseSchema.parse({
        ...LEGACY_AGENT_RESPONSE,
        sources: [{ file: 'x', kind: 'nonsense' }],
      }),
    ).toThrow();
  });
});

describe('config resolution', () => {
  it('fills defaults from an empty config', () => {
    const cfg = resolveMindConfig(undefined);
    expect(cfg.defaultIndex).toBe('default');
    expect(cfg.modes.instant.useLLM).toBe(false);
    expect(cfg.modes.thinking.maxSubqueries).toBe(5);
    expect(cfg.chunk.maxTokens).toBe(400);
  });

  it('honors overrides', () => {
    const cfg = resolveMindConfig({ defaultIndex: 'code', retrieval: { limit: 25 } });
    expect(cfg.defaultIndex).toBe('code');
    expect(cfg.retrieval.limit).toBe(25);
    expect(cfg.retrieval.rrfK).toBe(60); // default preserved
  });

  it('validates the full config schema', () => {
    expect(() => MindConfigSchema.parse({ retrieval: { limit: -1 } })).toThrow();
  });
});

describe('search request', () => {
  it('requires non-empty text', () => {
    expect(() => SearchRequestSchema.parse({ text: '' })).toThrow();
    expect(SearchRequestSchema.parse({ text: 'hello' }).text).toBe('hello');
  });
});
