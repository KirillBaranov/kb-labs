# ADR-0018: Reasoning-Based Classification with Mandatory Escalation

**Status:** Accepted
**Date:** 2025-12-27
**Deciders:** Kirill Baranov
**Related:**
- [ADR-0013: LLM Prompt Strategy](0013-llm-prompt-strategy.md)
- [ADR-0015: Post-Processing Commit Type Validation](0015-post-processing-commit-type-validation.md)
- [ADR-0016: Hybrid Pattern Detection Commit Classification](0016-hybrid-pattern-detection-commit-classification.md)

---

## Context and Problem Statement

The commit plugin exhibited a strong bias toward classifying commits as `feat` type (~99% of cases), even when changes were clearly refactoring, bug fixes, or internal chores. Analysis revealed two root causes:

1. **Superficial Analysis**: LLM was asked to classify commits based on file summaries (`+X/-Y lines`) without understanding the semantic nature of the changes
2. **Insufficient Context**: For large changesets (10+ files), the LLM attempted to classify without fetching diff content, leading to over-generalized "new behavior" classifications

**Example Problem:**
```
File: kb-labs-core/packages/core-contracts/src/index.ts
Status: Modified (unstaged)
LLM Classification: feat (newBehavior: true)
Reasoning: "New package created with its own functionality and exports"

Actual Reality: Existing package, re-exporting types from plugin-contracts (refactor)
```

The LLM was classifying modifications to existing packages as new features because it lacked:
- Explicit reasoning framework (why is this feat vs refactor?)
- Full diff context for complex changes
- Understanding of file lifecycle (new file vs modified file)

---

## Decision Drivers

1. **Accuracy**: Need precise commit type classification for semantic versioning and changelog generation
2. **Transparency**: Users should understand WHY a commit was classified a certain way
3. **Confidence**: System should know when it's uncertain and escalate to deeper analysis
4. **Performance**: Can't always fetch full diff for every file (expensive for 100+ file changesets)
5. **Agnostic**: Solution must work for any codebase, not tied to specific project patterns

---

## Considered Options

### Option 1: Pattern-Based Classification (Regex Rules)
**Pros:**
- Fast, deterministic
- No LLM costs

**Cons:**
- Brittle, requires maintenance for new patterns
- Can't understand semantic context
- Fails on edge cases (e.g., refactor that adds new file)

**Verdict:** ❌ Rejected - too simplistic for complex real-world changes

### Option 2: Always Fetch Full Diff
**Pros:**
- Maximum context for LLM
- Most accurate classification

**Cons:**
- Extremely expensive for large changesets (100+ files)
- Slow (2-3 minutes for full diff)
- Wastes tokens on simple changes (e.g., package.json version bump)

**Verdict:** ❌ Rejected - poor cost/performance tradeoff

### Option 3: Reasoning-Based Schema + Mandatory Escalation (CHOSEN)
**Pros:**
- Explicit reasoning framework guides LLM thinking
- Two-phase approach: fast Phase 1, deep Phase 2 only when needed
- Mandatory escalation ensures complex changes get diff context
- Transparent reasoning exposed in commit plan
- Cost-effective (escalates only when necessary)

**Cons:**
- More complex implementation
- Requires careful prompt engineering

**Verdict:** ✅ **Accepted** - best balance of accuracy, cost, and transparency

---

## Decision Outcome

### Chosen Solution: Reasoning-Based Classification + Mandatory Escalation

We implemented a three-part solution:

#### Part 1: Explicit Reasoning Schema

Introduced `CommitReasoningSchema` with explicit boolean flags:

```typescript
export const CommitReasoningSchema = z.object({
  newBehavior: z.boolean().describe(
    'Does this change introduce new behavior, features, or capabilities that users can interact with?'
  ),
  fixesBug: z.boolean().describe(
    'Does this change fix a bug, regression, or incorrect behavior?'
  ),
  internalOnly: z.boolean().describe(
    'Is this change internal-only (refactoring, cleanup, tooling) with no user-facing impact?'
  ),
  explanation: z.string().describe(
    'Brief explanation of the reasoning behind the classification'
  ),
  confidence: z.number().min(0).max(1).describe(
    'Confidence score (0-1) for this classification'
  ),
});
```

**Why this works:**
- Forces LLM to explicitly think through three orthogonal questions
- Provides structured reasoning trail
- Confidence score enables fallback logic

#### Part 2: Enhanced Prompt with Classification Rules

Updated `llm-prompt.ts` with explicit rules:

```
CLASSIFICATION RULES (use reasoning flags to determine type):

1. feat: newBehavior=true + fixesBug=false
   Examples: new API endpoint, new CLI command, new React component

2. fix: fixesBug=true (regardless of other flags)
   Examples: fix crash, fix validation, fix incorrect calculation

3. refactor: internalOnly=true + newBehavior=false + fixesBug=false
   Examples: extract function, rename variable, reorganize code structure

4. chore: internalOnly=true + housekeeping/tooling changes
   Examples: update dependencies, configure tooling, generate types

...

10. CRITICAL: Check IsNewFile flag FIRST before classifying:
    - IsNewFile: false = file existed before → likely refactor/fix/chore, NOT feat
    - IsNewFile: true = truly new file → might be feat (if adds new capability)
```

**Why this works:**
- Explicit mapping from reasoning flags to commit types
- Prevents misclassification due to ambiguous wording
- IsNewFile flag distinguishes new files from modifications

#### Part 3: Mandatory Escalation for 10+ Files

Modified `commit-plan.ts` escalation logic:

```typescript
// Phase 2: Escalate if LLM requests more context, confidence is low, or 10+ files
const shouldEscalate = parsed.needsMoreContext
  || parsed.averageConfidence < CONFIDENCE_THRESHOLD
  || summaries.length >= 10;

if (shouldEscalate) {
  const reason = summaries.length >= 10
    ? `${summaries.length} files (≥10)`
    : `confidence ${(parsed.averageConfidence * 100).toFixed(0)}%`;

  await logger.debug(`Escalating to Phase 2: ${reason}`, {
    fileCount: summaries.length,
    confidence: parsed.averageConfidence,
  });

  onProgress?.(`${reason} - fetching diff...`);

  // Fetch full diff and re-analyze with Phase 2 prompt
  const diff = await analyzer.getDiff();
  // ... Phase 2 analysis with full diff context
}
```

**Why this works:**
- Humans struggle to accurately classify 10+ files without seeing content
- Ensures LLM always gets diff context for complex changes
- Prevents over-generalized classifications based on file count alone

---

## Implementation Details

### Phase 1 (Fast Path - File Summaries Only)
**Input:**
```
Files changed:
- kb-labs-core/packages/core-contracts/src/index.ts (modified, +5/-2, IsNewFile: false)
- kb-labs-core/packages/core-contracts/package.json (modified, +1/-0, IsNewFile: false)

Recent commits:
- fix(core): add missing dependency to package.json
- refactor(contracts): extract types to separate file
```

**Output:**
```json
{
  "commits": [
    {
      "type": "refactor",
      "scope": "core-contracts",
      "message": "extract types to plugin-contracts",
      "reasoning": {
        "newBehavior": false,
        "fixesBug": false,
        "internalOnly": true,
        "explanation": "Re-exporting types from plugin-contracts, no new functionality",
        "confidence": 0.65
      }
    }
  ],
  "needsMoreContext": false,
  "averageConfidence": 0.65
}
```

**Result:** Confidence < 0.7 → **Escalates to Phase 2**

### Phase 2 (Deep Analysis - With Full Diff)
**Input:** Full git diff content
```diff
diff --git a/kb-labs-core/packages/core-contracts/src/index.ts b/...
@@ -1,5 +1,8 @@
+// Re-export plugin contracts types used in core contracts
+export type { HostType, HostContext, PermissionSpec, PluginContextDescriptor } from '@kb-labs/plugin-contracts';
+
 // Execution request/response types
 export * from './execution-request.js';
 export * from './execution-response.js';
```

**Output:**
```json
{
  "commits": [
    {
      "type": "refactor",
      "scope": "core-contracts",
      "message": "use plugin-contracts types instead of duplicates",
      "reasoning": {
        "newBehavior": false,
        "fixesBug": false,
        "internalOnly": true,
        "explanation": "Removed duplicate type definitions, re-exported from plugin-contracts. Internal refactoring with no user-facing changes.",
        "confidence": 0.95
      }
    }
  ]
}
```

**Result:** Confidence 0.95 → **Accurate classification**

---

## Consequences

### Positive

1. **Improved Accuracy**: Early testing shows better classification on modified files (refactor instead of feat)
2. **Transparent Reasoning**: Users can see WHY a commit was classified a certain way
3. **Confidence-Based Escalation**: System knows when it's uncertain and fetches more context
4. **Mandatory Escalation for Complexity**: 10+ files always get diff context, preventing superficial analysis
5. **Cost-Effective**: Only fetches diff when needed (low confidence or high complexity)
6. **Agnostic**: Works for any codebase (not tied to kb-labs patterns)

### Negative

1. **Increased Complexity**: Two-phase LLM approach is more complex than single-phase
2. **Token Cost**: Phase 2 uses significantly more tokens (22K tokens for 62 files vs ~1K for Phase 1)
3. **Slower**: 2-3 minutes for Phase 2 vs ~30 seconds for Phase 1
4. **Still Not Perfect**: LLM can still misclassify if prompt rules are ambiguous

### Neutral

1. **Learning**: We'll need to iterate on prompt rules based on real-world edge cases
2. **Monitoring**: Should track classification accuracy over time (future ADR for metrics)

---

## Validation and Testing

### Test Case 1: Modified Existing Package
**Input:**
- 2 files modified in `core-contracts`
- Removed duplicate types, added re-exports
- IsNewFile: false for both files

**Expected:** `refactor` (internalOnly: true, newBehavior: false)
**Result:** ⏳ In progress (next test)

### Test Case 2: New Package Creation
**Input:**
- 15 files created in `core-ipc` (untracked)
- IsNewFile: true for all files
- Full implementation of IPC system

**Expected:** `feat` (newBehavior: true, internalOnly: false)
**Result:** ⏳ In progress (next test)

### Test Case 3: Bug Fix in Existing File
**Input:**
- 1 file modified: `commit-core/src/generator/commit-plan.ts`
- Added optional chaining: `analytics?.track(...)`
- IsNewFile: false

**Expected:** `fix` (fixesBug: true)
**Result:** ⏳ In progress (next test)

---

## Follow-Up Work

1. **Benchmark Suite** (ADR-0017): Create comprehensive test cases for classification accuracy
2. **Interactive Mode**: Add user confirmation for low-confidence classifications
3. **Metrics Collection**: Track classification accuracy, escalation rate, token usage
4. **Prompt Iteration**: Refine rules based on misclassification patterns
5. **Conservative Bias Fallback**: If confidence < 0.5, default to `refactor` instead of `feat`

---

## References

- [Conventional Commits Specification](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [ADR-0013: LLM Prompt Strategy](0013-llm-prompt-strategy.md)
- [ADR-0015: Post-Processing Commit Type Validation](0015-post-processing-commit-type-validation.md)
- [ADR-0016: Hybrid Pattern Detection](0016-hybrid-pattern-detection-commit-classification.md)

---

## Notes

This ADR documents the solution to the "feat bias" problem discovered on 2025-12-27. The implementation combines explicit reasoning (CommitReasoningSchema), clear classification rules (10 rules in prompt), and mandatory escalation (10+ files). This balances accuracy, cost, and transparency while remaining agnostic to specific codebase patterns.

**Key Insight:** The LLM needed explicit reasoning questions ("Is this new behavior? Does this fix a bug? Is this internal-only?") rather than being asked to directly classify. This mirrors how human developers think through commit types.
