# ADR-0003: Execution Memory for Learned Facts

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** KB Labs AI Team
**Last Reviewed:** 2026-01-15
**Tags:** [agent-core, memory, optimization, phase-2]

## Context

After Phase 1.5 (Context Compression), the agent performs well but still has redundancy issues:

**Problem: Redundant Work**
- Agent re-reads same files multiple times
- Re-calls same tools with similar queries
- Forgets what it learned in previous steps
- No way to check "have I already found this?"

**Example Inefficiency:**
```
Step 1: fs:search "VectorStore" → finds vector-store.ts
Step 3: fs:search "VectorStore interface" → finds vector-store.ts again (redundant!)
Step 5: fs:read vector-store.ts → reads file
Step 7: fs:read vector-store.ts → reads same file again (wasteful!)
```

**Performance Impact:**
- Unnecessary tool calls waste time and tokens
- Context window fills with duplicate information
- Agent can't build on previous knowledge efficiently

**Prior Art:**
- Context Compression (Phase 1.5) addresses token explosion but doesn't prevent redundant calls
- LangChain Memory: Conversation memory, but not tool-call specific
- ReAct pattern: Provides structured thinking but no persistent memory

## Decision

Implement **Execution Memory** system that:

1. **Tracks Findings** - Extracts key facts from each tool execution
2. **Prevents Redundancy** - Checks if info already known before calling tools
3. **Injects into Prompts** - Makes learned facts available in system prompt
4. **Auto-extracts** - Parses tool outputs to extract concise facts

### Architecture

```
AgentExecutor
   ↓
ExecutionMemory
   ↓
Finding[] = [
  { tool: "fs:search", query: "VectorStore", fact: "Found 3 files...", step: 1 },
  { tool: "fs:read", query: "vector-store.ts", fact: "File contains: interface VectorStore...", step: 2, filePath: "..." }
]
   ↓
MemorySummary (formatted for prompt injection)
```

### Key Components

**1. Finding Interface** (`execution-memory.ts`):
```typescript
interface Finding {
  tool: string;           // Tool that produced this finding
  query: string;          // What was asked/searched for
  fact: string;           // Key fact learned
  step: number;           // When this was learned
  success: boolean;       // Success/failure status
  filePath?: string;      // Optional: file path if relevant
}
```

**2. ExecutionMemory Class**:
- `addFinding(finding)` - Manually add a finding
- `extractFromStep(step)` - Auto-extract findings from tool outputs
- `hasFindingFor(tool, query)` - Check if we already have this info
- `getSummary()` - Get formatted findings for prompt injection

**3. Tool-Specific Fact Extraction**:
- **fs:read** - Extracts key exports, interfaces, classes (not full file)
- **mind:rag-query** - Extracts answer from JSON response
- **fs:search** - Summarizes file count and sample paths
- **Generic** - Truncates output to 200 chars

**4. Memory Injection**:
```typescript
// In buildReActSystemPrompt()
const memorySummary = this.executionMemory.getSummary();

if (memorySummary.count > 0) {
  return reactPrompt + '\n\n# Execution Memory\n\n' + memorySummary.formattedText;
}
```

**Memory Format:**
```markdown
# Execution Memory

**Files Already Read:**
- kb-labs-mind/packages/mind-engine/src/storage/vector-store.ts: File contains: interface VectorStore, addVectors, getVectors...

**Previous Search Results:**
- VectorStore: Found 3 files: vector-store.ts, vector-store.test.ts, ...

**Other Findings:**
- fs:list (src/): 12 files found
```

### Integration Points

**Agent Executor Flow:**
```typescript
// Start of execution
executionMemory.clear();

// Main loop
for each step:
  1. Build prompt with memory: buildReActSystemPrompt()
  2. Call LLM
  3. Execute tools
  4. Extract findings: executionMemory.extractFromStep(step)
  5. Memory now available for next iteration
```

## Consequences

### Positive

- ✅ **Prevents redundant calls** - Agent can check memory before calling tools
- ✅ **Compact representation** - Stores facts, not full outputs (memory-efficient)
- ✅ **Auto-extraction** - No manual annotation needed
- ✅ **Categorized** - Files, searches, other findings grouped for clarity
- ✅ **Simple API** - Easy to use, integrates naturally into executor loop
- ✅ **Foundation for future** - Enables retrieval-augmented reasoning, planning

### Negative

- ⚠️ **Limited benefit in short tasks** - Most value in 5+ step scenarios
- ⚠️ **Not cross-session** - Memory clears between agent runs
- ⚠️ **Similarity matching is basic** - Uses simple string comparison (could miss near-duplicates)
- ⚠️ **Tool-specific extraction** - Requires knowledge of tool output formats

### Alternatives Considered

**Alternative 1: Full Tool Output Caching**
- Store complete tool outputs, check cache before calling
- **Rejected**: Memory explosion, doesn't help with similar-but-not-identical queries

**Alternative 2: Vector-Based Similarity Search**
- Embed findings, use cosine similarity to find relevant memories
- **Rejected**: Over-engineered for Phase 2, adds LLM dependency

**Alternative 3: No Memory (Status Quo)**
- Keep Phase 1.5, accept redundancy
- **Rejected**: Leaves optimization opportunity on table

## Implementation

**New Files:**
1. `agent-core/src/executor/execution-memory.ts` (348 lines)
   - Finding interface
   - ExecutionMemory class
   - Tool-specific fact extractors
   - Memory summary formatter

**Modified Files:**
- `agent-core/src/executor/agent-executor.ts`
  - Added `private executionMemory: ExecutionMemory`
  - Call `executionMemory.clear()` at start
  - Call `executionMemory.extractFromStep(step)` after each step
  - Inject memory into `buildReActSystemPrompt()`
- `agent-core/src/executor/index.ts` - Export ExecutionMemory

**Build Status:**
- ✅ TypeScript compilation successful
- ✅ Phase 2 integration complete
- ✅ Tests passing (3 steps, 4.9K-5.3K tokens, 15-22s)

**Benchmark Results (Test 1.1):**
- Steps: 3 (same as Phase 1.5)
- Tokens: 4,866-5,305 (similar to Phase 1.5's 4,881)
- Duration: 15.3-22.1s (similar to Phase 1.5's 15.7s)
- Quality: 7-8/10 (vs 9/10 in Phase 1.5 - mind:rag-query failing)

**Why Limited Impact:**
- Test 1.1 only has 3 steps - not enough to show memory benefit
- Agent didn't make redundant calls in this specific test
- Memory most valuable in longer scenarios (architecture questions, debugging)

**Future Enhancements:**
- Phase 3: Planning with memory-aware decision making
- Phase 4: Cross-session memory persistence
- Phase 5: Similarity-based memory retrieval

## References

- [BENCHMARK-RESULTS.md](../../BENCHMARK-RESULTS.md) - Test suite results
- [ADR-0001: Hybrid ReAct Tool Execution](./0001-hybrid-react-tool-execution.md)
- [ADR-0002: Context Compression](./0002-context-compression.md)
- [AGENT-IMPROVEMENTS-ROADMAP.md](../../AGENT-IMPROVEMENTS-ROADMAP.md)

**Research:**
- MemGPT: Memory management for LLM agents
- Reflexion: Self-reflection for agents with episodic memory
- AutoGPT: Task memory and context management

---

**Last Updated:** 2026-01-15
**Next Review:** After Phase 3 implementation
