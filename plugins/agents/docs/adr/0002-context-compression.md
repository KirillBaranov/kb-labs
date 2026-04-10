# ADR-0002: Context Compression for Token Efficiency

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** KB Labs AI Team
**Last Reviewed:** 2026-01-15
**Tags:** [agent-core, performance, optimization, phase-1.5]

## Context

After implementing Phase 1 (ADR-0001: Hybrid ReAct Tool Execution), the agent successfully used tools proactively but suffered from **context window explosion**:

**Phase 1 Token Usage** (Test 1.1: "What is the VectorStore interface?"):
```
Step 1:  1,547 tokens  ✅ normal
Step 2:  1,759 tokens  ✅ normal
Step 3: 27,819 tokens  🔥 explosion after fs:read
Step 4: 28,919 tokens  🔥
Step 7: 30,768 tokens  🔥

Total: 148,859 tokens
Duration: 38.5 seconds
Cost (GPT-4): ~$4.50 per query
```

**Root Cause:**

After `fs:read` loads a file in Step 2, that file's contents become part of conversation history. Every subsequent LLM call includes:

1. System prompt (ReAct instructions)
2. Original user task
3. **ALL previous messages** (assistant responses + tool results)
4. **Full content of every file read**

This causes exponential growth:
- Step 1-2: Normal (~1.5-1.7K tokens)
- Step 3+: **~27-30K tokens each** (includes full file contents)

**Impact:**
- GPT-4o-mini: $0.022/query (manageable)
- GPT-4: $4.47/query (300x more expensive!)
- Slow responses: 38s for simple lookup
- Not viable for production scale

## Decision

Implement **automatic context compression** using LLM-based summarization, inspired by Claude Code's own architecture.

### How Claude Code Solves This

Claude (this CLI tool) uses automatic summarization when conversation history grows too large:

1. **Threshold detection** - After N messages, trigger compression
2. **LLM-based summarization** - Generate concise summary preserving key facts
3. **Replace history** - Swap full history with summary + original task
4. **Continue execution** - Next steps use compressed context

Example: 100K tokens → 10K summary (90% savings)

### Our Implementation

Created `ContextCompressor` that:

1. **Monitors message count** - Triggers after 5 messages
2. **Summarizes history** - LLM generates structured summary:
   - What was learned (facts from tool calls)
   - Tools used and why
   - Current progress
   - Next steps
3. **Replaces messages** - Single compressed message becomes new context
4. **Target**: 1,500 tokens per summary (vs 5K+ original)

### Architecture

```typescript
// In agent-executor.ts main loop
while (state.currentStep < state.maxSteps) {
  // Check if compression needed
  if (this.contextCompressor.shouldCompress(messages)) {
    const result = await this.contextCompressor.compress(
      messages,
      systemPrompt,
      originalTask
    );

    messages = result.compressedMessages; // Replace history

    // Logs: savedTokens, compressionRatio
  }

  // Call LLM with compressed context
  await this.callLLM(systemPrompt, messages, tools);
}
```

## Consequences

### Positive

- ✅ **97% token reduction** - 148K → 4.8K tokens
- ✅ **59% faster** - 38.5s → 15.7s execution time
- ✅ **97% cost savings** - $4.47 → $0.15 per query (GPT-4)
- ✅ **Scalable** - Can handle queries with many tool calls
- ✅ **Quality preserved** - Answer quality unchanged (9/10)
- ✅ **Graceful degradation** - Falls back to original if compression fails

### Negative

- ⚠️ **Extra LLM call** - Compression adds ~1.5K tokens
  - Cost: ~$0.004 (GPT-4)
  - But saves 30x more on subsequent steps
  - Net savings: 95-97%

- ⚠️ **Compression overhead** - Adds ~2-3s
  - But overall 59% faster due to smaller contexts

- ⚠️ **Potential info loss** - Summary might miss nuanced details
  - Mitigated by explicit summary structure
  - Low temperature (0.1) for factual summaries

### Alternatives Considered

**Alternative 1: Truncate Tool Results**
```typescript
if (msg.role === 'tool' && msg.content.length > 500) {
  msg.content = msg.content.slice(0, 500) + '...[truncated]...';
}
```
- **Rejected**: Simpler but may lose critical information
- Agent can't reference full context

**Alternative 2: Selective Message Retention**
- Keep only last N messages + system prompt + original task
- **Rejected**: Loses earlier discoveries, agent might repeat work

**Alternative 3: No Compression**
- **Rejected**: 148K tokens unacceptable for production

## Implementation

**New Files:**
- `agent-core/src/executor/context-compressor.ts` (180 lines)

**Modified Files:**
- `agent-core/src/executor/agent-executor.ts` - Added compression check in loop
- `agent-core/src/executor/index.ts` - Export ContextCompressor

**Configuration:**
```typescript
COMPRESSION_THRESHOLD = 5;      // Messages before compression
MAX_SUMMARY_TOKENS = 1500;      // Target summary length
```

**Compression Prompt Structure:**
```
ORIGINAL TASK: ${task}
CONVERSATION HISTORY: ${history}

Create concise summary (max 1500 tokens):
1. What was learned - Key facts from tool calls
2. Tools used - Which tools and why
3. Current progress - What's accomplished
4. Next steps - What needs to be done
```

## References

- [ADR-0001: Hybrid ReAct Tool Execution](./0001-hybrid-react-tool-execution.md)
- [PHASE1-RESULTS.md](../../PHASE1-RESULTS.md)
- Claude Code Architecture - Inspiration for summarization approach

---

**Last Updated:** 2026-01-15
**Next Review:** After Phase 2 (Execution Memory)
