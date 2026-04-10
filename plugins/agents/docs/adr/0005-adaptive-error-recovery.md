# ADR-0005: Adaptive Error Recovery

**Date:** 2026-01-15
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-15
**Tags:** [agents, llm, error-recovery, observability, self-healing]

## Context

In Phase 3, we implemented Progress Tracking to detect when the agent is stuck (no progress over 3 steps). However, the system had no mechanism to recover from errors or stuck states - it would simply continue until hitting max steps or loop detection limits.

### Problem Statement

**Observable issues:**
1. **No error recovery** - Agent detected stuck state but couldn't do anything about it
2. **Wasted execution steps** - Agent repeated failed approaches until max steps exhausted
3. **Loop detection too late** - Loops detected after 3 identical sequences (9+ steps wasted)
4. **No alternative strategies** - Agent never tried different tools or parameter adjustments
5. **Poor user experience** - Tasks failed without actionable feedback or recovery attempts

**Example failure scenario:**
```
Step 1: fs:search finds file → "path/to/file.ts:123: code"
Step 2: fs:read with "file.ts" → ENOENT (wrong path - extracted only filename)
Step 3: fs:search finds same file
Step 4: fs:read with "file.ts" → ENOENT (same mistake)
Step 5: fs:search finds same file
... (repeats until max steps)
```

Agent detected stuck state (isStuck=true, blockers=["fs:read failed: ENOENT"]) but had no recovery strategy. Phase 4 should suggest: "Use full path from fs:search result, not just filename".

### Requirements

1. **Recovery strategy generation** - Analyze stuck state and suggest actionable recovery plans
2. **Multiple strategy types** - Support retry, alternative-tool, parameter-adjustment, escalate, give-up
3. **LLM-based reasoning** - Use LLM to understand context and choose best recovery approach
4. **Confidence scoring** - Rate recovery strategies (0-1) for future threshold-based execution
5. **Observability-first** - Log recovery strategies without executing them (Phase 5 will execute)
6. **Integration with stuck detection** - Trigger on both progress-based stuck and loop detection
7. **Prevent infinite retries** - Track retry attempts per tool to avoid endless loops

### Alternatives Considered

**Option 1: Heuristic-based recovery (rule-based)**
- **Pros:** Fast, deterministic, no LLM cost
- **Cons:** Can't understand semantic context (e.g., "why did fs:read fail with this specific path?")
- **Rejected:** Too rigid, won't handle novel failure scenarios

**Option 2: Execute recovery strategies immediately**
- **Pros:** Full autonomous recovery
- **Cons:** Risky (might make things worse), harder to debug, no user oversight
- **Rejected:** Observability-first approach safer for Phase 4 (execution in Phase 5)

**Option 3: Single recovery strategy (always retry)**
- **Pros:** Simple implementation
- **Cons:** Miss opportunity for smarter strategies (alternative tools, escalation)
- **Rejected:** 5 strategies provide more sophisticated recovery options

**Option 4: User-provided recovery callbacks**
- **Pros:** Flexible, user controls recovery logic
- **Cons:** Adds complexity, most users won't implement it
- **Rejected:** Built-in LLM-based approach provides better default UX

## Decision

Implement **ErrorRecovery** class that uses LLM to generate recovery strategies when agent is stuck or loops detected.

### Architecture

```
AgentExecutor
  ├─ ExecutionMemory (Phase 2)
  ├─ ProgressTracker (Phase 3)
  │   └─ isStuck detection
  │
  └─ ErrorRecovery (Phase 4) ⬅ NEW
      ├─ retryAttempts: Map<string, number>
      ├─ maxRetries: 2
      │
      ├─ shouldAttemptRecovery(progressEstimate, memory)
      │   └─ Check: isStuck OR hasBlockers OR lowProgressManySteps
      │
      └─ generateRecoveryAction(progressEstimate, memory, latestStep)
          ├─ buildRecoveryPrompt()
          ├─ llm.complete() with structured JSON response
          ├─ parseRecoveryResponse() → RecoveryAction
          └─ fallback: getFallbackRecoveryAction() if LLM fails
```

### Key Components

#### 1. Recovery Strategy Types

```typescript
export type RecoveryStrategyType =
  | 'retry' // Retry same tool with backoff (if < maxRetries)
  | 'alternative-tool' // Try different tool for same goal
  | 'parameter-adjustment' // Modify tool parameters based on error
  | 'escalate' // Ask user for help with specific question
  | 'give-up'; // Accept failure gracefully with explanation
```

#### 2. RecoveryAction Interface

```typescript
export interface RecoveryAction {
  strategy: RecoveryStrategyType;
  reasoning: string; // Why this strategy chosen
  action: {
    toolName: string;
    parameters?: Record<string, unknown>;
    escalationMessage?: string; // For 'escalate' strategy
  };
  expectedOutcome: string; // What should happen if successful
  confidence: number; // 0-1 (used for threshold-based execution in Phase 5)
}
```

#### 3. Recovery Generation Prompt

```typescript
Task Goal: ${memory.taskGoal}
Current Progress: ${progressEstimate.progressPercent}%
Steps Completed: ${memory.completedSteps.length}

Latest Step:
- Action: ${latestAction}
- Outcome: ${latestOutcome}
- Success: ${latestSuccess}

Known Facts:
${memory.knownFacts.map(f => `- ${f}`).join('\n')}

Blockers:
${progressEstimate.blockers.map(b => `- ${b}`).join('\n')}

Analysis:
${progressEstimate.reasoning}

Generate a recovery strategy:
1. Analyze why agent is stuck
2. Choose best recovery approach (retry/alternative-tool/parameter-adjustment/escalate/give-up)
3. Provide specific action (tool name + parameters)
4. Estimate confidence (0-1)

Output JSON: { strategy, reasoning, action, expectedOutcome, confidence }
```

#### 4. Integration into AgentExecutor

**On stuck detection:**
```typescript
if (progressEstimate.isStuck) {
  if (this.errorRecovery.shouldAttemptRecovery(progressEstimate, this.executionMemory)) {
    const recoveryAction = await this.errorRecovery.generateRecoveryAction(
      progressEstimate,
      this.executionMemory,
      step
    );

    console.log('[PHASE 4] Recovery strategy generated:', {
      strategy: recoveryAction.strategy,
      reasoning: recoveryAction.reasoning,
      confidence: recoveryAction.confidence,
    });

    // Phase 5 will execute recovery action here if confidence > threshold
  }
}
```

**On loop detection:**
```typescript
if (loopResult.detected) {
  // Create synthetic ProgressEstimate with loop as blocker
  const loopProgressEstimate: ProgressEstimate = {
    progressPercent: progressEstimate.progressPercent,
    reasoning: `Loop detected: ${loopResult.description}`,
    nextMilestone: 'Break the loop',
    blockers: [...progressEstimate.blockers, loopResult.description],
    isStuck: true, // Force stuck state
  };

  const recoveryAction = await this.errorRecovery.generateRecoveryAction(
    loopProgressEstimate,
    this.executionMemory,
    step
  );

  console.log('[PHASE 4] Recovery strategy for loop:', {
    loopType: loopResult.type,
    strategy: recoveryAction.strategy,
  });
}
```

### Design Choices

**1. LLM-based strategy selection (not heuristic)**
- Understands semantic context: "fs:read failed with ENOENT because extracted filename instead of full path"
- Can reason about best recovery: "Use alternative tool (mind:rag-query) since fs:search not finding what we need"
- Provides human-readable reasoning for debugging

**2. Confidence scoring**
- Enables threshold-based execution in Phase 5 (e.g., auto-execute if confidence ≥ 0.8)
- Low confidence (< 0.5) → escalate to user
- High confidence (≥ 0.8) → safe to auto-execute

**3. Retry tracking per tool**
- `retryAttempts: Map<string, number>` tracks attempts per tool
- Prevents infinite retry loops (maxRetries = 2)
- Resets when different tool suggested

**4. Observability-first approach**
- Phase 4 only **logs** recovery strategies (doesn't execute)
- Safer for initial rollout (no risk of making things worse)
- Allows us to collect data on strategy quality before auto-execution
- Phase 5 will execute strategies with confidence threshold

**5. Fallback on LLM failure**
- If LLM call fails: analyze failed tools heuristically
- Default to 'parameter-adjustment' for first failure, 'escalate' for repeated failures
- Ensures system never crashes due to recovery strategy generation

**6. Temperature = 0.2 (low variance)**
- Recovery strategies should be consistent
- Low creativity needed (factual analysis of errors)
- Reduces token variance

**7. Max tokens = 600**
- Structured JSON response is concise
- Prevents runaway LLM output
- Keeps overhead low

**8. Integration with loop detection**
- Loop detection also triggers recovery (not just stuck detection)
- Creates synthetic ProgressEstimate with loop as blocker
- Enables recovery for both stuck and loop scenarios

### Bonus: Anti-Hallucination Fix

During Phase 4 testing, discovered critical bug where agent repeatedly failed `fs:read` with ENOENT because it extracted only filename from `fs:search` results instead of full path.

**Root cause:** LLM hallucinated file paths by extracting just filename from fs:search output like:
```
kb-labs-agents/packages/agent-core/src/executor/progress-tracker.ts:50: class ProgressTracker
```
Agent used: `progress-tracker.ts` ❌
Should use: `kb-labs-agents/packages/agent-core/src/executor/progress-tracker.ts` ✅

**Fix:** Added explicit instructions in ReActPromptBuilder for fs:read and fs:search:
```typescript
**CRITICAL - Path Format:**
- fs:read requires the FULL RELATIVE PATH from project root
- If fs:search shows: `kb-labs-agents/packages/agent-core/src/file.ts:50: code`
- Use fs:read with: `kb-labs-agents/packages/agent-core/src/file.ts`
- Extract the path BEFORE the colon (:line_number)
- DO NOT use just the filename ("file.ts") - this will cause ENOENT errors!
```

**Result:** Agent now correctly uses full paths from fs:search results (verified in testing).

## Consequences

### Positive

1. **Self-healing capability** - Agent can now analyze and suggest recovery from stuck states
2. **Multiple recovery strategies** - 5 different approaches for different failure types
3. **LLM-based intelligence** - Understands semantic context of failures (not just pattern matching)
4. **Confidence scoring** - Enables smart threshold-based execution in Phase 5
5. **Observability-first** - Safe rollout (logs only, no auto-execution yet)
6. **Anti-hallucination improvement** - Fixed fs:search path extraction bug via prompt engineering
7. **Foundation for Phase 5** - Provides recovery actions ready for execution
8. **Minimal overhead** - ~600ms per recovery generation (only when stuck, not every step)

### Negative

1. **Added latency when stuck** - +600ms for recovery strategy generation (only on stuck/loop)
2. **Token cost** - +600 tokens per recovery (~$0.0006/recovery on GPT-4o-mini)
3. **LLM dependency** - Recovery requires working LLM adapter
4. **JSON parsing risk** - LLM might return invalid JSON (mitigated by regex extraction + fallback)
5. **No auto-execution yet** - Phase 4 only logs strategies (Phase 5 needed for full autonomy)
6. **Retry threshold tuning** - maxRetries = 2 may need adjustment per use case

### Trade-offs

**Cost vs Recovery:**
- Added cost: ~$0.0006 per stuck scenario
- Value: Prevents wasting remaining steps on doomed approach (saves tokens overall)

**Latency vs Intelligence:**
- Added latency: +600ms when stuck (not per step)
- Value: Smart recovery strategies vs blind retries

**Observability vs Autonomy:**
- Phase 4: Only logs strategies (safe but not autonomous)
- Phase 5: Will execute strategies (autonomous but needs testing)
- Chose observability-first for safer rollout

## Implementation

### Phase 4 Deliverables

**Files created:**
- `packages/agent-core/src/executor/error-recovery.ts` (340 lines)
- `docs/adr/0005-adaptive-error-recovery.md` (this file)
- `TODO-ROADMAP.md` (tracks missing features from ROADMAP Phase 2-4)

**Files modified:**
- `packages/agent-core/src/executor/agent-executor.ts` - Integrated ErrorRecovery for stuck and loop scenarios
- `packages/agent-core/src/executor/index.ts` - Exported ErrorRecovery, RecoveryAction, RecoveryStrategyType
- `packages/agent-core/src/planning/react-prompt-builder.ts` - Added anti-hallucination instructions for fs:read/fs:search path usage

### Test Results

**Test 1:** "What is the ProgressTracker class?"
- **Result:** ✅ Success in 4 steps
- **Duration:** 25.8s
- **Tokens:** 9,207
- **Notes:** fs:search path fix worked! Agent correctly used full path on first try

**Test 2:** "Explain agent system architecture"
- **Result:** ❌ Loop detected at step 15
- **Phase 4 activation:** ✅ Recovery strategy generated
- **Strategy:** `parameter-adjustment` with confidence 0.8
- **Reasoning:** "Try mind:rag-query with more specific question about agent executor core"
- **Duration:** ~60s
- **Tokens:** 41,242
- **Notes:** Phase 4 successfully identified loop and suggested actionable recovery

**Test 3:** "What tools are available?"
- **Result:** ❌ Loop detected
- **Phase 4 activation:** ✅ Recovery strategy generated
- **Strategy:** `escalate` with confidence 0.9
- **Reasoning:** "Agent needs user to clarify which tools (CLI tools, agent tools, or platform tools)"
- **Notes:** Phase 4 correctly identified ambiguous query requiring user input

### Migration Guide

**For plugin developers:**
No changes required. ErrorRecovery is internal to AgentExecutor.

**For users:**
Recovery strategies appear automatically in console logs when agent gets stuck:
```
[PHASE 4] Recovery strategy generated: {
  strategy: 'parameter-adjustment',
  reasoning: 'fs:read failed due to incorrect path format',
  confidence: 0.85
}
```

**For testing:**
Run agent tasks and observe recovery suggestions when stuck:
```bash
pnpm kb agent:run --agentId=mind-assistant --task="Your task"
# Watch for [PHASE 4] logs when agent gets stuck
```

### Future Work (Phase 5)

**Auto-Execution of Recovery Strategies:**
Phase 5 will execute recovery actions based on confidence threshold:
```typescript
if (recoveryAction.confidence >= 0.8) {
  // High confidence - execute immediately
  await executeRecoveryAction(recoveryAction);
} else if (recoveryAction.confidence >= 0.5) {
  // Medium confidence - ask user for approval
  const approved = await askUserApproval(recoveryAction);
  if (approved) await executeRecoveryAction(recoveryAction);
} else {
  // Low confidence - escalate to user
  await escalateToUser(recoveryAction);
}
```

**Full ROADMAP Phase 4 (Self-Learning System):**
Current Phase 4 is "lite version" (LLM-based recovery only). Full ROADMAP Phase 4 includes:
1. **Error Observation Collector** - Record errors in corpus for pattern extraction (~1 day)
2. **Zero-Config Tool Introspection** - LLM-based tool analysis from definitions (~0.5 days)
3. **Pattern Extraction** - Background job to extract patterns from error corpus (~1 day)
4. **Learning-Enhanced Recovery** - Check learned patterns first, LLM fallback (~1 day)

See [TODO-ROADMAP.md](../../TODO-ROADMAP.md) for detailed breakdown and estimates.

**Progress Streaming:**
- Expose recovery strategies via REST API SSE endpoint
- Enable real-time UI showing recovery attempts in client applications

## References

- [Phase 4 Roadmap](../../AGENT-ROADMAP.md#phase-4-adaptive-error-recovery)
- [TODO Roadmap](../../TODO-ROADMAP.md) - Tracks missing features from Phase 2-4
- [Benchmark Results](../../BENCHMARK-RESULTS.md#phase-4-results) - Phase 4 test results
- [ADR-0003: Execution Memory](./0003-execution-memory.md) - Phase 2
- [ADR-0004: Progress Tracking](./0004-progress-tracking-and-stuck-detection.md) - Phase 3

---

**Last Updated:** 2026-01-15
**Next Review:** After Phase 5 implementation (auto-execution) or ROADMAP Phase 4 completion
**Status:** Phase 4 complete (observability-first). Phase 5 needed for auto-execution. Full ROADMAP Phase 4 tracked in TODO-ROADMAP.md.
