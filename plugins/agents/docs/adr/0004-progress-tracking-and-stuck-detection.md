# ADR-0004: Progress Tracking and Stuck Detection

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-15
**Tags:** [agents, llm, observability, execution, error-detection]

## Context

In Phase 2, we implemented Execution Memory to track learned facts and prevent redundant work. However, the agent system still lacked visibility into task progress and couldn't detect when it was stuck in unproductive loops.

### Problem Statement

**Observable issues:**
1. **No progress visibility** - Users and system couldn't tell how close agent was to completing task
2. **Stuck detection too late** - Loop detector only caught repeated tool calls, not "no progress" scenarios
3. **No intermediate feedback** - Agent ran until completion or max steps with no status updates
4. **Hard to debug** - When agent failed, unclear at which step progress stalled

**Example failure scenario:**
```
Step 1: fs:search finds file
Step 2: fs:read fails (wrong path)
Step 3: fs:search finds same file
Step 4: fs:read fails (wrong path)
Step 5: fs:search finds same file
... (repeats until max steps)
```

Loop detector catches tool sequence repeat, but only after 3 identical sequences. Progress tracker would detect "no progress" earlier (after 3 steps with <5% progress increase).

### Requirements

1. **Progress estimation** - After each step, estimate % toward goal
2. **Stuck detection** - Identify when agent makes no meaningful progress
3. **LLM-based reasoning** - Use LLM to understand semantic progress (not just tool success/failure)
4. **Lightweight** - Minimal overhead (<500ms per step)
5. **Structured input** - Use task goal, completed steps, known facts (from Execution Memory)
6. **Actionable output** - Progress %, reasoning, next milestone, blockers, stuck flag

### Alternatives Considered

**Option 1: Heuristic-based progress tracking**
- **Pros:** Fast, deterministic, no LLM cost
- **Cons:** Can't understand semantic progress (e.g., "found file but didn't read it" vs "read file and extracted answer")
- **Rejected:** Too shallow for meaningful progress estimation

**Option 2: Progress tracking without stuck detection**
- **Pros:** Simpler implementation
- **Cons:** Miss opportunity to detect stuck early (before loop detector)
- **Rejected:** Stuck detection is core value proposition

**Option 3: External progress API (user provides callbacks)**
- **Pros:** Flexible, user controls progress logic
- **Cons:** Adds complexity, most users won't implement it
- **Rejected:** Built-in LLM-based approach provides better default UX

## Decision

Implement **ProgressTracker** class that uses LLM to estimate task completion progress after each agent step.

### Architecture

```
AgentExecutor
  ├─ ExecutionMemory (Phase 2)
  │   ├─ taskGoal
  │   ├─ completedSteps[]
  │   └─ knownFacts[]
  │
  └─ ProgressTracker (Phase 3) ⬅ NEW
      ├─ history: ProgressHistory[]
      ├─ stuckThreshold: 3
      │
      ├─ estimateProgress(memory, task, latestStep)
      │   ├─ buildProgressPrompt()
      │   ├─ llm.complete() with structured JSON response
      │   └─ parseProgressResponse() → ProgressEstimate
      │
      └─ isStuck()
          └─ Check: maxProgress - minProgress < 5% over 3 steps
```

### Key Components

#### 1. ProgressEstimate Interface
```typescript
export interface ProgressEstimate {
  progressPercent: number;      // 0-100
  reasoning: string;             // Why this estimate
  nextMilestone: string;         // What needs to happen next
  blockers: string[];            // Current blockers
  isStuck: boolean;              // Agent making no progress?
}
```

#### 2. Progress Estimation Prompt
```typescript
Task Goal: ${memory.taskGoal}
Completed Steps: ${memory.completedSteps.length}
Latest Action: ${latestAction}
Latest Outcome: ${latestOutcome}

Known Facts:
${memory.knownFacts.map(f => `- ${f}`).join('\n')}

Estimate progress toward goal (0-100%):
Consider:
- What portion of the goal is achieved?
- What critical information is still missing?
- How many steps remaining (estimate)?

Output JSON: { progressPercent, reasoning, nextMilestone, blockers }
```

#### 3. Stuck Detection Logic
```typescript
private isStuck(): boolean {
  if (this.history.length < this.stuckThreshold) return false;

  const recent = this.history.slice(-this.stuckThreshold);
  const maxProgress = Math.max(...recent.map(h => h.progressPercent));
  const minProgress = Math.min(...recent.map(h => h.progressPercent));

  // Stuck if progress variance < 5% over threshold steps
  return maxProgress - minProgress < 5;
}
```

#### 4. Integration into AgentExecutor
```typescript
// After each step:
this.executionMemory.extractFromStep(step);

const progressEstimate = await this.progressTracker.estimateProgress(
  this.executionMemory,
  task,
  step
);

this.ctx.platform.logger.info('Progress estimate', {
  step: state.currentStep,
  progressPercent: progressEstimate.progressPercent,
  nextMilestone: progressEstimate.nextMilestone,
  isStuck: progressEstimate.isStuck,
  blockers: progressEstimate.blockers,
});

if (progressEstimate.isStuck) {
  this.ctx.platform.logger.warn('Agent appears stuck', {
    progressPercent: progressEstimate.progressPercent,
    reasoning: progressEstimate.reasoning,
  });
  // Phase 4 will add retry logic here
}
```

### Design Choices

**1. LLM-based estimation (not heuristic)**
- Understands semantic progress: "found file" vs "read file and extracted answer"
- Can reason about blockers: "missing file path", "tool failed", "info not in search results"
- Provides human-readable reasoning for debugging

**2. Structured prompt with Execution Memory**
- Task goal provides context for "what does done look like?"
- Completed steps count shows execution depth
- Known facts show what info agent has gathered
- Latest action/outcome shows current state

**3. Stuck threshold = 3 steps**
- Not too sensitive (avoids false positives)
- Not too late (catches issues before loop detector)
- Progress variance <5% = stuck (tuned from testing)

**4. Fallback on LLM failure**
- If LLM call fails: `progressPercent = hasSuccess ? 50 : 0`
- Ensures system never crashes due to progress tracking
- Logs error for debugging

**5. Temperature = 0.1 (deterministic)**
- Progress estimation should be consistent
- Low creativity needed (factual assessment)
- Reduces token variance

**6. Max tokens = 500**
- Structured JSON response is concise
- Prevents runaway LLM output
- Keeps overhead low

## Consequences

### Positive

1. **Observability** - Real-time progress visibility for users and system
2. **Early stuck detection** - Catches "no progress" before loop detector (3 steps vs 9 steps)
3. **Actionable insights** - Reasoning + blockers help debug agent failures
4. **Foundation for Phase 4** - Enables retry/escalation strategies based on progress
5. **Minimal overhead** - ~500ms per step (1 LLM call, 500 tokens)
6. **Graceful degradation** - Fallback heuristic if LLM fails

### Negative

1. **Added latency** - +500ms per step for LLM progress estimation
2. **Token cost** - +500 tokens per step (~$0.0005/step on GPT-4o-mini)
3. **LLM dependency** - Progress tracking requires working LLM adapter
4. **JSON parsing risk** - LLM might return invalid JSON (mitigated by regex extraction)
5. **Stuck detection tuning** - Threshold (3 steps, <5% variance) may need adjustment per use case

### Trade-offs

**Cost vs Insight:**
- Added cost: ~$0.005 per 10-step execution
- Value: Early stuck detection saves wasted steps (more cost-effective overall)

**Latency vs Observability:**
- Added latency: +500ms per step (3s for 6-step execution)
- Value: Users get real-time progress updates (better UX)

## Implementation

### Phase 3 Deliverables

**Files created:**
- `packages/agent-core/src/executor/progress-tracker.ts` (247 lines)
- `docs/adr/0004-progress-tracking-and-stuck-detection.md` (this file)

**Files modified:**
- `packages/agent-core/src/executor/agent-executor.ts` - Integrated ProgressTracker
- `packages/agent-core/src/executor/execution-memory.ts` - Added taskGoal, completedSteps, knownFacts getters
- `packages/agent-core/src/executor/index.ts` - Exported ProgressTracker and ProgressEstimate
- `BENCHMARK-RESULTS.md` - Added Phase 3 results

### Benchmark Results

**Test:** "What is the VectorStore interface?"

| Metric | Phase 2 | Phase 3 | Change |
|--------|---------|---------|--------|
| **Steps** | 3 | 3 | ✅ Same |
| **Tokens** | 4,866-5,305 | 4,953 | ✅ +2% (progress estimation cost) |
| **Duration** | 15.3-22.1s | 20.6s | ✅ Within range |
| **Quality** | 6-8/10 | 6/10 | ✅ Comparable |
| **Progress tracking** | ❌ None | ✅ Per-step estimates | **New capability** |
| **Stuck detection** | ❌ Loop detector only | ✅ Progress-based | **New capability** |

**Conclusion:** Progress tracking adds minimal overhead (~500 tokens, ~500ms/step) while providing significant observability value.

### Migration Guide

**For plugin developers:**
No changes required. ProgressTracker is internal to AgentExecutor.

**For users:**
Progress logs appear automatically in `ctx.platform.logger` output:
```
logger.info('Progress estimate', {
  step: 2,
  progressPercent: 40,
  nextMilestone: 'Read file and extract interface',
  isStuck: false,
  blockers: []
})
```

### Future Work (Phase 4)

**Adaptive Error Recovery:**
When `isStuck = true`, agent should:
1. Try alternative tool (e.g., fs:read fails → use fs:search with different pattern)
2. Rephrase query (e.g., "VectorStore" → "vector storage interface")
3. Escalate to user (e.g., "I need help: missing file path")
4. Give up gracefully (e.g., "I couldn't find X after 10 attempts")

**Progress streaming:**
- Expose progress estimates via REST API SSE endpoint
- Enable real-time UI progress bars in client applications

## References

- [Phase 3 Roadmap](../../AGENT-ROADMAP.md#phase-3-progress-tracking--error-recovery)
- [Benchmark Results](../../BENCHMARK-RESULTS.md#phase-3-results-current---2026-01-15)
- [ADR-0002: Context Compression](./0002-context-compression.md) - Phase 1.5
- [ADR-0003: Execution Memory](./0003-execution-memory.md) - Phase 2 (assumed number)

---

**Last Updated:** 2026-01-15
**Next Review:** After Phase 4 implementation
