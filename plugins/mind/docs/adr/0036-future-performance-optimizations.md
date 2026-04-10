# ADR-0036: Future Performance Optimizations (Draft)

**Date:** 2025-11-29
**Status:** Draft
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-29
**Tags:** [mind-orchestrator, performance, future, daemon]

## Context

After implementing ADR-0035 (65% speedup), we identified additional optimization opportunities that require more significant architectural changes:

**Current state (post ADR-0035):**
- Thinking mode: ~29s (was 60-90s)
- Auto mode: ~26s (was ~60s)
- Cache works only within single process (CLI limitation)

**Remaining bottlenecks:**
1. **LLM latency** - 80% of time spent in LLM calls
2. **Process startup overhead** - each CLI command starts new Node.js process
3. **No cache reuse** - CLI creates new orchestrator every time
4. **Sequential LLM calls** - decompose → gather → check → synthesize

## Proposed Optimizations

### 1. Persistent Daemon Mode (HIGH IMPACT)

**Effect:** Cache hits become 0ms instead of 29s

**Implementation:**
```bash
# Start daemon
kb daemon start --port 3000

# CLI sends requests to daemon
kb mind rag-query --text "..." # → HTTP request to localhost:3000

# Stop daemon
kb daemon stop
```

**Architecture:**
- Daemon runs `AgentQueryOrchestrator` instance
- CLI commands become thin clients (HTTP requests)
- Cache persists between queries
- Connection pooling for OpenAI API

**Benefits:**
- Query cache works across CLI calls
- No process startup overhead (~500ms saved)
- Persistent LLM connection pool
- Background re-indexing possible

**Implementation effort:** 2-3 days

---

### 2. OpenAI Prompt Caching (MODERATE IMPACT)

**Effect:** 50% reduction in repeated prompt costs + ~20-30% latency

**Implementation:**
```typescript
// Enable prompt caching in LLM adapter layer
const result = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT }, // This gets cached!
    { role: 'user', content: userQuery }
  ],
  // OpenAI automatically caches system prompts
});
```

**What gets cached:**
- Decomposer system prompts (same for all queries)
- Synthesizer system prompts
- Completeness checker prompts

**Benefits:**
- 50% cost reduction for cached prompts
- 20-30% latency reduction
- No code changes needed (OpenAI feature)

**Implementation effort:** 1-2 hours (enable flag)

---

### 3. Batch/Parallel LLM Calls (MODERATE IMPACT)

**Effect:** ~25% latency reduction

**Current flow:**
```
1. Decompose query    (1 LLM call)
2. Gather chunks      (0 LLM calls)
3. Check completeness (1 LLM call)
4. Synthesize answer  (1 LLM call)
Total: 3 sequential LLM calls
```

**Optimized flow:**
```
1. Decompose + Plan   (1 LLM call - combined)
2. Gather chunks      (0 LLM calls)
3. Synthesize + Check (1 LLM call - combined)
Total: 2 sequential LLM calls
```

**Benefits:**
- Reduce LLM round trips
- Lower overall latency
- Simpler pipeline

**Challenges:**
- More complex prompts
- Harder to debug
- Less modular

**Implementation effort:** 1-2 days

---

### 4. Token Reduction (MINOR IMPACT)

**Effect:** ~10-15% latency

**Strategies:**
- Truncate chunk snippets to essential parts
- Shorter system prompts
- Smaller context windows

**Example:**
```typescript
// Before: full chunk (500+ tokens)
const chunk = {
  text: fullChunkText, // 500 tokens
  path: "...",
  span: {...}
};

// After: truncated (200 tokens)
const chunk = {
  text: truncateToRelevant(fullChunkText, query), // 200 tokens
  path: "...",
  span: {...}
};
```

**Benefits:**
- Faster LLM responses
- Lower costs

**Risks:**
- Might lose context
- Need careful truncation logic

**Implementation effort:** 1 day

---

### 5. Early Deduplication (MINOR IMPACT)

**Effect:** ~5-10% latency

**Current:** Deduplication after all iterations

**Optimized:** Deduplicate after each gather
```typescript
// In executeThinkingMode
gathered.chunks = this.deduplicateChunks(gathered.chunks);

// After each additional query
if (additionalChunks.length > 0) {
  gathered.chunks.push(...additionalChunks);
  gathered.chunks = this.deduplicateChunks(gathered.chunks); // Dedupe immediately
}
```

**Benefits:**
- Fewer chunks in LLM context
- Faster check/synthesize calls

**Implementation effort:** 30 minutes

## Recommendation

**Phase 1 (Quick Wins - Next Week):**
1. ✅ Enable OpenAI prompt caching (1-2 hours)
2. ✅ Early deduplication (30 minutes)
3. ✅ Token reduction for chunks (1 day)

**Expected:** ~30-40% additional speedup → **15-20s for thinking mode**

**Phase 2 (Daemon Mode - Next Month):**
1. Implement persistent daemon (2-3 days)
2. Add daemon lifecycle management
3. Update CLI to use daemon

**Expected:** Cache hits = **0ms**, misses = 15-20s

**Phase 3 (Advanced - Future):**
1. Batch LLM calls (research needed)
2. Streaming responses (when not JSON mode)
3. Distributed caching (Redis)

## Draft Status

This ADR is a **draft** and will be finalized when:
- [ ] Daemon mode architecture designed
- [ ] Prompt caching tested in production
- [ ] Token reduction benchmarked
- [ ] Team review completed

**Target finalization:** 2025-12-15
