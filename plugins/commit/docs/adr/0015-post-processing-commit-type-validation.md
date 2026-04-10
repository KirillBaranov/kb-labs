# ADR-0015: Post-Processing Commit Type Validation

**Date:** 2025-12-16
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-16
**Tags:** [llm, validation, conventional-commits, quality]

## Context

LLM-based commit generation occasionally produces incorrect commit types when analyzing file changes. Specifically, the LLM was marking commits with deleted files or mostly deletions as `feat` (feature), which violates conventional commit semantics:

**Problem Example:**
```
feat(analytics-core): add core analytics functionality and tests
  - packages/.../analytics-edge-cases.spec.ts (deleted, +0/-1579)
  - packages/.../buffer.spec.ts (deleted, +0/-856)
  - ... (22 files total, all deletions)
```

This commit deletes 22 test files but is incorrectly labeled as `feat` (feature addition). The correct type should be `chore` (cleanup) or `refactor` (restructuring).

**Root Causes:**
1. **Phase 1 (file summaries only)**: LLM sees file paths like "add-analytics-core" and infers "add" → `feat`
2. **Phase 2 (with diff)**: LLM sees diff content but may misinterpret the context
3. **LLM training bias**: Training data may have examples where "feat" is used for any significant change

**Constraints:**
- Cannot modify LLM training data
- Prompt engineering alone is insufficient (tested, still fails)
- Need deterministic validation for critical commit type rules
- Must preserve LLM intelligence for complex cases

## Decision

Implement **post-processing validation** after LLM response parsing to enforce commit type heuristics based on file change statistics.

**Architecture:**

```
LLM Response → parseResponse() → Post-Processing → Validated Commits
                                      ↓
                                fixCommitType()
                                (heuristic rules)
```

**Validation Rules:**

1. **All Files Deleted Rule:**
   - If ALL files in commit have `status === 'deleted'`
   - AND commit type is `feat`
   - THEN change type to `chore`
   - AND fix message: `"add X"` → `"remove X"`

2. **Mostly Deletions Rule:**
   - If >80% of changes are deletions (`totalDeletions / totalChanges > 0.8`)
   - AND commit type is `feat`
   - THEN change type to `refactor`

**Prompt Updates (Defense in Depth):**

Phase 1 System Prompt:
```
10. CRITICAL: If ALL files in a commit have status "deleted", use type "chore" or "refactor", NOT "feat"
11. CRITICAL: If a commit is mostly deletions (>80% deletions), use "refactor" or "chore", NOT "feat"
```

Phase 2 System Prompt:
```
8. CRITICAL: If ALL files in a commit are being DELETED (only deletions in diff), use type "chore" or "refactor", NOT "feat"
9. CRITICAL: If a commit is mostly deletions (>80% of lines are deletions), use "refactor" or "chore", NOT "feat"
```

## Consequences

### Positive

- **Correctness**: Deterministic validation prevents LLM hallucinations for critical rules
- **Semantic accuracy**: Commits with deletions now have semantically correct types
- **Defense in depth**: Prompt rules + post-processing validation (double protection)
- **Preserves LLM intelligence**: Only overrides for specific heuristic cases
- **Low overhead**: Validation runs on already-parsed summaries (no additional I/O)
- **Testable**: Clear rules can be unit tested

### Negative

- **Complexity**: Additional validation layer adds code complexity
- **Override risk**: Post-processing might override intentional LLM decisions in edge cases
- **Maintenance**: Heuristic thresholds (80%) may need tuning over time
- **False positives**: Rare cases where "feat" with deletions is actually correct (e.g., feature deletion)

### Alternatives Considered

**Alternative 1: Prompt Engineering Only**
- Add more explicit rules to system prompts
- **Rejected**: Already tested, LLM still makes mistakes (training bias too strong)

**Alternative 2: Fine-tuned Model**
- Train custom model on correct commit examples
- **Rejected**: Cost prohibitive, requires infrastructure, ongoing maintenance

**Alternative 3: Rule-Based Only (No LLM)**
- Use pure heuristics for all commits
- **Rejected**: Loses LLM intelligence for complex logical grouping

**Alternative 4: Human Review Loop**
- Show plan to user before applying
- **Rejected**: Breaks automation goal, slows workflow

**Why Post-Processing Won:**
- **Best of both worlds**: LLM intelligence + deterministic validation
- **Minimal cost**: Runs locally, no API calls
- **Immediate fix**: Solves problem without infrastructure changes
- **Extensible**: Can add more rules incrementally

## Implementation

**Changes Made:**

1. **`llm-prompt.ts`:**
   - Add `fixCommitType()` function with validation rules
   - Update `parseResponse()` to accept optional `summaries` parameter
   - Apply `fixCommitType()` to each commit after parsing
   - Update Phase 1 and Phase 2 system prompts with explicit rules

2. **`commit-plan.ts`:**
   - Pass `summaries` to `parseResponse()` in Phase 1 (line 110)
   - Pass `summaries` to `parseResponse()` in Phase 2 (line 171)
   - Validation runs automatically for both phases

**Validation Logic:**
```typescript
function fixCommitType(commit, summaries) {
  const commitSummaries = summaries.filter(s => commit.files.includes(s.path));

  // Rule 1: All deleted
  if (commitSummaries.every(s => s.status === 'deleted') && commit.type === 'feat') {
    return { ...commit, type: 'chore', message: fixMessage(commit.message) };
  }

  // Rule 2: Mostly deletions
  const deletionRatio = totalDeletions / totalChanges;
  if (deletionRatio > 0.8 && commit.type === 'feat') {
    return { ...commit, type: 'refactor' };
  }

  return commit;
}
```

**Testing Plan:**
- Unit tests for `fixCommitType()` with mock summaries
- Integration test with real commit from analytics repo
- Verify Phase 1 and Phase 2 both apply validation
- Check that non-deletion commits are unaffected

**Future Enhancements:**
- Add more heuristic rules (e.g., test-only commits → `test`)
- Make thresholds configurable via plugin config
- Log when validation overrides LLM decision (for debugging)
- Collect metrics on override frequency

## References

- Issue: LLM marked 22-file deletion as `feat(analytics-core): add core analytics`
- Related ADR: [0010-anti-hallucination-validation.md](./0010-anti-hallucination-validation.md)
- Related ADR: [0013-llm-prompt-strategy.md](./0013-llm-prompt-strategy.md)

---

**Last Updated:** 2025-12-16
**Next Review:** 2026-01-16 (30 days)
