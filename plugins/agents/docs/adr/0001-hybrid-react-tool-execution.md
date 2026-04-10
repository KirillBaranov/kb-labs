# ADR-0001: Hybrid ReAct Tool Execution Pattern

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** KB Labs AI Team
**Last Reviewed:** 2026-01-15
**Tags:** [agent-core, reasoning, tool-calling, phase-1]

## Context

The KB Labs agent system suffered from critical usability issues that made it "maximally stupid and almost useless" with GPT-4o-mini:

**Baseline Problems:**
- **Passive tool usage** - Agent didn't proactively call tools unless explicitly instructed
- **Training data preference** - Answered from LLM training data instead of searching actual codebase
- **No structured thinking** - Jumped directly to answers without exploration
- **Poor quality** - Generic responses (0.75/10 average, 0% success rate)

**Example failure** (Test 1.1: "What is the VectorStore interface?"):
```
Result: 0 tools used
Output: 859 tokens of generic ML theory about vector databases
Quality: 0/10 - completely useless
```

**Baseline Metrics:**
- Success Rate: 0% (0/3 tests passed)
- Tool Usage: 25% (only 1/4 tests used tools)
- Proactive Tool Use: 0%

**Initial fix attempt** using ReAct pattern prompting (Thought → Action → Observation) showed promise but hit an **execution gap**:

```
Agent output:
**Thought:** I need to find VectorStore interface definition
**Action:** mind:rag-query
**Action Input:** "VectorStore interface definition"

[0 tools actually executed - gap between intent and execution!]
```

The agent showed correct **intent** but didn't trigger **execution**.

## Decision

Implement **Hybrid ReAct Tool Execution** combining:

1. **Task Classification** - LLM-based query categorization (simple-lookup, code-finding, architecture, multi-step, code-generation) with 1-hour caching
2. **ReAct Pattern Prompting** - Structured Thought → Action → Observation format enforcing tool-first thinking
3. **Text Parsing Fallback** - Extract tool calls from ReAct text when native function calling doesn't trigger

### Architecture

```
User Query
   ↓
Task Classifier (LLM + cache)
   ↓
ReAct Prompt Builder (task-specific guidance)
   ↓
Agent Executor
   ↓
LLM Response
   ↓
Native Tool Calls Present?
  YES → Execute native tool calls
  NO  → Parse **Action:** **Action Input:**
        → Execute parsed tool calls
```

### Key Components

**1. Task Classifier** (`agent-core/src/planning/task-classifier.ts`):
- Classifies queries with LLM, falls back to heuristics
- Outputs: type, complexity (1-10), strategy, required tools
- Cached for 1 hour via `useCache()` composable

**2. ReAct Prompt Builder** (`agent-core/src/planning/react-prompt-builder.ts`):
- Task-specific system prompts enforcing tool-first thinking
- Critical rules: "MUST use tools to search codebase BEFORE answering"
- Examples per task type

**3. ReAct Parser** (`agent-core/src/executor/react-parser.ts`):
- Regex extraction: `**Thought:**`, `**Action:**`, `**Action Input:**`
- JSON parsing with string fallback
- Tool name normalization (removes markdown, lowercases)

**4. Agent Executor Integration**:
```typescript
// Hybrid approach
let toolCallsToExecute = llmResponse.toolCalls || [];

if (toolCallsToExecute.length === 0 && this.reactParser.hasReActPattern(content)) {
  const parsed = this.reactParser.parse(content);
  const toolCall = this.reactParser.toToolCall(parsed);
  if (toolCall) {
    toolCallsToExecute = [toolCall];
  }
}

// Execute tools (native or parsed)
for (const toolCall of toolCallsToExecute) {
  await this.toolExecutor.execute(toolCall);
}
```

## Consequences

### Positive

- ✅ **Proactive tool usage** - Agent calls tools without explicit instruction (0% → 100%)
- ✅ **Codebase-first** - Searches actual code instead of training data
- ✅ **Structured thinking** - Clear reasoning visible to users
- ✅ **Graceful degradation** - Falls back to text parsing when native calling fails
- ✅ **Task-aware** - Different strategies for lookup vs architecture queries
- ✅ **Composable** - `useCache()` fits existing platform patterns

### Negative

- ⚠️ **High token usage** - 148K tokens for simple lookup (fixed in Phase 1.5)
- ⚠️ **Slower execution** - 38s for simple query (fixed in Phase 1.5)
- ⚠️ **Regex fragility** - Text parsing is less reliable than native calling

### Alternatives Considered

**Alternative 1: Pure Native Tool Calling (No ReAct prompting)**
- **Rejected**: Tried in baseline - agent skipped tools 75% of time
- Simpler but doesn't enforce structured thinking

**Alternative 2: Pure Text-Based Tool Execution (No native calling)**
- **Rejected**: More fragile, higher error rate
- Full control but loses reliability of native calling

**Alternative 3: No Task Classification**
- **Rejected**: One-size-fits-all prompts less effective
- Misses future optimization opportunities

## Implementation

**New Files:**
1. `agent-core/src/planning/task-classifier.ts` (270 lines)
2. `agent-core/src/planning/react-prompt-builder.ts` (350 lines)
3. `agent-core/src/executor/react-parser.ts` (180 lines)
4. `shared-command-kit/src/helpers/use-cache.ts` (96 lines)

**Modified Files:**
- `agent-core/src/executor/agent-executor.ts` - Added classification + ReAct + hybrid parsing
- `agent-core/src/index.ts` - Export planning module
- `shared-command-kit/src/helpers/index.ts` - Export useCache
- `sdk/src/index.ts` - Re-export useCache

**Build Status:**
- ✅ All packages built successfully
- ✅ TypeScript strictNullChecks compliant
- ⚠️ High token usage → addressed in Phase 1.5

## References

- [BENCHMARKS.md](../../BENCHMARKS.md) - Test suite definition
- [BENCHMARK-RESULTS.md](../../BENCHMARK-RESULTS.md) - Baseline metrics
- [PHASE1-RESULTS.md](../../PHASE1-RESULTS.md) - Implementation report
- [ADR-0002: Context Compression](./0002-context-compression.md) - Fixes token usage
- [AGENT-IMPROVEMENTS-ROADMAP.md](../../AGENT-IMPROVEMENTS-ROADMAP.md)

**Research:**
- Yao et al. (2023): "ReAct: Synergizing Reasoning and Acting in Language Models"
- Wei et al. (2022): "Chain of Thought Prompting"

---

**Last Updated:** 2026-01-15
**Next Review:** After Phase 2 implementation
