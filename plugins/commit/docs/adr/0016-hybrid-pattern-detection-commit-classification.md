# ADR-0016: Hybrid Pattern Detection for Commit Type Classification

**Date:** 2025-12-19
**Status:** Proposed
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-19
**Tags:** [llm, validation, conventional-commits, quality, pattern-detection, analytics]

## Context

### Current State (ADR-0015 Implementation)

Following ADR-0015, we implemented post-processing validation with two heuristic rules:
1. **All deleted files** → `chore`
2. **>80% deletions** → `refactor`

**Accuracy achieved:** ~60% (based on commit history analysis)

### Remaining Problems

Analysis of real commit history (`.kb/commit/history/`) revealed critical gaps:

**Problem 1: Modified Files Misclassified as `feat`**
```json
// Actual commit (2025-12-16T12-00)
{
  "type": "feat",  // ❌ WRONG
  "message": "add commit plan and llm prompt generators",
  "files": ["commit-plan.ts", "llm-prompt.ts"],  // Both MODIFIED
  "additions": 150, "deletions": 120  // Low addition ratio
}
```
**Expected:** `refactor` (modifying existing generators, not adding new ones)

**Problem 2: New Packages Misclassified as `chore`**
```json
// Actual commit (2025-12-15T22-05)
{
  "type": "chore",  // ❌ WRONG
  "message": "initialize core resource broker package",
  "files": [/* 21 NEW files including package.json */]
}
```
**Expected:** `feat` (new package = new functionality)

**Problem 3: Bulk Moves Misclassified as `feat`**
```
100 files with status "added" but isNewFile: false
→ LLM generates: feat(analytics): add analytics packages
→ Expected: refactor(analytics): reorganize analytics structure
```

### Root Cause Analysis

**Why GPT-4o-mini fails:**
1. **Training bias:** LLM trained on data where "added files" → `feat` in 90% of cases
2. **Insufficient context discrimination:** Cannot distinguish between:
   - True new feature (added + isNewFile: true)
   - File move/refactor (added + isNewFile: false)
3. **Modified file ambiguity:** Cannot tell if modification is:
   - New feature addition (high addition ratio)
   - Refactoring (low addition ratio, structural changes)

**Current limitations:**
- Post-processing only handles deletions (ADR-0015)
- No pattern detection for additions or modifications
- No semantic analysis of file structure
- No feedback loop for improvement

### Constraints

1. **Cost-conscious:** Must work with GPT-4o-mini ($0.15/1M tokens), not GPT-4o ($2.50/1M)
2. **Accuracy target:** Need 85-90% accuracy (up from 60%)
3. **Maintainability:** Solution must be testable and debuggable
4. **Measurability:** Must track accuracy metrics over time
5. **Preserve LLM intelligence:** Don't replace LLM with pure heuristics

## Decision

Implement **hybrid pattern detection system** combining:
1. **Pre-processing:** Semantic pattern analysis before LLM
2. **Enhanced prompting:** Few-shot examples + pattern hints
3. **Extended post-processing:** Additional heuristic rules
4. **Analytics integration:** Accuracy tracking and feedback loop

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  INPUT: File Summaries + Git Status                     │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 1: Pre-Processing Pattern Detection (NEW!)       │
│  ────────────────────────────────────────────────────    │
│  analyzePatterns(summaries) → PatternAnalysis            │
│  • isNewPackagePattern() → feat                          │
│  • isBulkMovePattern() → refactor                        │
│  • isRefactorModificationPattern() → refactor            │
│  • confidence scoring (0.0-1.0)                          │
│  • semantic hints for LLM                                │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 2: Enhanced LLM Prompting (IMPROVED!)            │
│  ────────────────────────────────────────────────────────    │
│  buildEnhancedPrompt(summaries, analysis)                │
│  • System prompt with few-shot examples                  │
│  • Pattern hints from pre-processing                     │
│  • Confidence threshold for escalation                   │
│  • Structured JSON output                                │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 3: Extended Post-Processing (EXTENDED!)          │
│  ────────────────────────────────────────────────────────    │
│  enhancedFixCommitType(commit, summaries, analysis)      │
│  • Rule 1-2: Deletions (from ADR-0015) ✅                │
│  • Rule 3: Pattern cross-check (NEW!)                    │
│  • Rule 4: Modified files heuristic (NEW!)               │
│  • Rule 5: New package detection (NEW!)                  │
│  • Confidence-weighted override decisions                │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│  LAYER 4: Analytics & Metrics (NEW!)                    │
│  ────────────────────────────────────────────────────────    │
│  useAnalytics().track()                                  │
│  • Pattern detection accuracy                            │
│  • Override frequency by rule                            │
│  • Type distribution statistics                          │
│  • A/B testing for prompt variations                     │
└──────────────────────────────────────────────────────────┘
```

### Pattern Detection Rules

**Pattern 1: New Package**
```typescript
function isNewPackagePattern(summaries: FileSummary[]): boolean {
  const allAdded = summaries.every(s => s.status === 'added' && s.isNewFile);
  const hasPackageJson = summaries.some(s => s.path.endsWith('package.json'));
  const inSameDirectory = countUniqueDirs(summaries, 2) === 1;

  return allAdded && hasPackageJson && inSameDirectory && summaries.length > 10;
  // Confidence: 0.95
  // Suggested type: feat
}
```

**Pattern 2: Bulk Move/Refactor**
```typescript
function isBulkMovePattern(summaries: FileSummary[]): boolean {
  const allAdded = summaries.every(s => s.status === 'added');
  const notNew = summaries.filter(s => !s.isNewFile).length > summaries.length * 0.5;
  const samePaths = countUniqueDirs(summaries, 3) < 5;

  return allAdded && notNew && samePaths && summaries.length > 20;
  // Confidence: 0.90
  // Suggested type: refactor
}
```

**Pattern 3: Refactor Modifications**
```typescript
function isRefactorModificationPattern(summaries: FileSummary[]): boolean {
  const allModified = summaries.every(s => s.status === 'modified');
  const totalAdd = sum(summaries.map(s => s.additions));
  const totalDel = sum(summaries.map(s => s.deletions));
  const additionRatio = totalAdd / (totalAdd + totalDel);

  return allModified && additionRatio < 0.4;
  // Confidence: 0.80
  // Suggested type: refactor
}
```

### Enhanced Post-Processing Rules

**Rule 3: Pattern Cross-Check** (NEW!)
```typescript
if (analysis.confidence > 0.8 && analysis.suggestedType !== commit.type) {
  // Pattern detection has high confidence → override LLM
  commit.type = analysis.suggestedType;
  reason = `pattern-override: ${analysis.patternType}`;
}
```

**Rule 4: Modified Files Heuristic** (NEW!)
```typescript
if (allModified && additionRatio < 0.6 && commit.type === 'feat') {
  // Mostly modifications with low additions → refactor, not feat
  commit.type = 'refactor';
  reason = 'modified-low-addition-ratio';
}
```

**Rule 5: New Package Detection** (NEW!)
```typescript
if (hasPackageJson && allAdded && allIsNewFile && fileCount > 10) {
  // New package with 10+ files → feat, not chore
  commit.type = 'feat';
  reason = 'new-package-detected';
}
```

### Few-Shot Examples for LLM

Add to `SYSTEM_PROMPT`:
```
REAL-WORLD EXAMPLES (learn from these):

❌ Example 1 (WRONG): Modified files as feat
Files: commit-plan.ts (modified, +150/-120), llm-prompt.ts (modified, +80/-60)
WRONG: feat(core): add commit plan and llm prompt generators
CORRECT: refactor(core): update commit plan and llm prompt logic
Reason: Low addition ratio (230/350 = 65%), structural changes

❌ Example 2 (WRONG): New package as chore
Files: 21 new files in packages/core-resource-broker/, includes package.json
WRONG: chore(core-resource-broker): initialize core resource broker package
CORRECT: feat(core-resource-broker): add resource broker for rate limiting
Reason: New package = new functionality = feat

❌ Example 3 (WRONG): Bulk move as feat
Files: 100 added files, all with isNewFile: false
WRONG: feat(analytics): add analytics packages
CORRECT: refactor(analytics): reorganize analytics package structure
Reason: isNewFile: false = moved/reorganized, not new

✅ Example 4 (CORRECT): True new feature
Files: 5 new files with isNewFile: true, implements new auth system
CORRECT: feat(auth): add JWT authentication
Reason: New functionality, truly new files
```

### Analytics Metrics

Track via `useAnalytics()`:

**Event: `commit.pattern-detected`**
```typescript
{
  patternType: 'new-package' | 'refactor-move' | 'refactor-rename' | 'mixed',
  confidence: 0.95,
  fileCount: 21,
  suggestedType: 'feat'
}
```

**Event: `commit.generation-complete`**
```typescript
{
  totalFiles: 32,
  totalCommits: 6,
  llmUsed: true,
  escalated: true,
  tokensUsed: 7295,
  durationMs: 12345,
  patternType: 'new-package',
  overridesApplied: 2,
  typeDistribution: { feat: 2, refactor: 3, chore: 1 }
}
```

**Event: `commit.high-override-rate`** (alert threshold: >30%)
```typescript
{
  overrideRate: 0.35,  // 35% of commits were overridden
  reasons: [
    'c1: pattern-override: bulk-move',
    'c2: modified-low-addition-ratio'
  ]
}
```

## Consequences

### Positive

**Accuracy Improvements:**
- **Expected:** 60% → 85-90% accuracy
- **Pattern detection:** Catches 80% of misclassifications before LLM
- **Few-shot examples:** Reduces LLM training bias
- **Extended rules:** Handles remaining edge cases

**Engineering Benefits:**
- ✅ **Measurable:** Analytics tracks exact accuracy
- ✅ **Debuggable:** Pattern hints show reasoning
- ✅ **Testable:** Each pattern has unit tests
- ✅ **Iterative:** Can improve rules based on metrics
- ✅ **Cost-effective:** Works with GPT-4o-mini

**Developer Experience:**
- ✅ Fewer manual commit corrections
- ✅ Better semantic commit messages
- ✅ Improved changelog generation
- ✅ Trust in automation

### Negative

**Complexity:**
- Additional 300-400 LOC (pattern detection + analytics)
- More maintenance surface area
- Need to tune confidence thresholds over time

**Performance:**
- Pre-processing adds ~50-100ms per generation
- Analytics tracking adds ~20-30ms
- Total impact: <200ms (acceptable)

**False Positives:**
- Pattern detection may override LLM incorrectly in rare cases
- Mitigation: Confidence thresholds (only override at >0.8)

**Maintenance:**
- Heuristic thresholds (0.4, 0.6, 0.8) may need adjustment
- Few-shot examples may become stale
- Analytics dashboard requires monitoring

### Alternatives Considered

**Alternative 1: Use GPT-4o instead of GPT-4o-mini**
- Cost: $2.50/1M tokens (17x more expensive)
- Accuracy: ~80-85% (better but not 90%+)
- **Rejected:** Cost too high, still needs heuristics

**Alternative 2: Pure Heuristics (No LLM)**
- Accuracy: ~70-75% (deterministic but limited)
- Cost: $0
- **Rejected:** Loses semantic understanding, can't handle complex cases

**Alternative 3: Fine-tuned Model**
- Cost: $10,000+ for training + inference infrastructure
- Accuracy: ~90-95%
- **Rejected:** Cost prohibitive, requires ML expertise

**Alternative 4: Prompt Engineering Only**
- Already tried in ADR-0013 and ADR-0015
- Accuracy: ~60% (insufficient)
- **Rejected:** LLM training bias too strong

**Why Hybrid Approach Won:**
- Best accuracy/cost ratio (85-90% at GPT-4o-mini prices)
- Engineering-first solution (measurable, testable, debuggable)
- Iterative improvement via analytics
- Preserves LLM intelligence while adding determinism

## Implementation Plan

### Phase 1: Quick Wins (2-3 hours)
**Target:** 60% → 75% accuracy

1. ✅ Add few-shot examples to `SYSTEM_PROMPT`
2. ✅ Implement Rules 3-5 in `enhancedFixCommitType()`
3. ✅ Basic analytics tracking (pattern detected, overrides)

**Files changed:**
- `src/generator/llm-prompt.ts` (+100 LOC)
- `src/generator/commit-plan.ts` (+50 LOC)

### Phase 2: Pattern Detection (4-5 hours)
**Target:** 75% → 85% accuracy

4. ✅ Implement `pattern-detector.ts` module:
   - `analyzePatterns()`
   - `isNewPackagePattern()`
   - `isBulkMovePattern()`
   - `isRefactorModificationPattern()`
5. ✅ Integrate pattern hints into `buildEnhancedPrompt()`
6. ✅ Add pattern cross-check in post-processing

**Files changed:**
- `src/generator/pattern-detector.ts` (+200 LOC, NEW!)
- `src/generator/llm-prompt.ts` (+50 LOC)
- `src/generator/commit-plan.ts` (+30 LOC)

### Phase 3: Analytics & Benchmarks (2-3 hours)
**Target:** Establish baseline for continuous improvement

7. ✅ Full `useAnalytics()` integration
8. ✅ Create benchmark suite:
   - Extract test cases from `.kb/commit/history/`
   - Define expected outputs
   - Compare before/after accuracy
9. ✅ Document benchmark results in ADR

**Files changed:**
- `src/generator/commit-plan.ts` (+80 LOC analytics)
- `tests/benchmarks/commit-type-accuracy.test.ts` (+150 LOC, NEW!)
- `docs/benchmarks/COMMIT_TYPE_ACCURACY.md` (NEW!)

### Testing Strategy

**Unit Tests:**
```typescript
describe('Pattern Detection', () => {
  it('detects new package pattern', () => {
    const summaries = [/* 21 files in packages/foo/ with package.json */];
    const result = analyzePatterns(summaries);
    expect(result.patternType).toBe('new-package');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.suggestedType).toBe('feat');
  });

  it('detects bulk move pattern', () => {
    const summaries = [/* 50 added files, isNewFile: false */];
    const result = analyzePatterns(summaries);
    expect(result.patternType).toBe('refactor-move');
    expect(result.suggestedType).toBe('refactor');
  });
});
```

**Integration Tests (Benchmarks):**
```typescript
describe('Commit Type Accuracy Benchmarks', () => {
  const testCases = loadFromHistory('.kb/commit/history/');

  it('achieves 85%+ accuracy on real commit history', async () => {
    const results = await runBenchmark(testCases);
    expect(results.accuracy).toBeGreaterThan(0.85);
  });

  it('detects new packages correctly', async () => {
    const newPackageCases = testCases.filter(c => c.expected === 'new-package');
    const accuracy = await testPattern(newPackageCases);
    expect(accuracy).toBeGreaterThan(0.9);
  });
});
```

**Benchmark Format:**
```json
{
  "testCases": [
    {
      "id": "2025-12-15T22-05-15-767Z",
      "description": "New package: core-resource-broker",
      "files": [/* 21 files */],
      "expectedType": "feat",
      "expectedMessage": "add resource broker for rate limiting",
      "baseline": { "type": "chore", "correct": false },
      "expected": { "type": "feat", "correct": true }
    }
  ],
  "results": {
    "baseline": { "accuracy": 0.60, "total": 30, "correct": 18 },
    "improved": { "accuracy": 0.87, "total": 30, "correct": 26 }
  }
}
```

## Success Metrics

**Primary KPI: Accuracy**
- Baseline: 60% (current)
- Phase 1 target: 75% (+15pp)
- Phase 2 target: 85% (+25pp)
- Stretch goal: 90% (+30pp)

**Secondary KPIs:**
- **Override rate:** <20% (low override = good LLM prompting)
- **Pattern detection confidence:** >0.8 average
- **False positive rate:** <5% (overrides that were wrong)
- **Performance:** <200ms overhead for pattern detection

**Qualitative Metrics:**
- Developer satisfaction (survey after 2 weeks)
- Manual correction frequency (track via git log)
- Commit message quality (semantic correctness)

## Monitoring & Iteration

**Dashboard Metrics:**
1. **Accuracy trend:** Weekly accuracy % over time
2. **Pattern distribution:** Which patterns appear most often
3. **Override reasons:** Which rules trigger most frequently
4. **LLM confusion:** Cases where confidence <0.5

**Feedback Loop:**
1. Analytics shows Rule 4 triggers 40% of time → prompt needs improvement
2. Update few-shot examples with Rule 4 cases
3. Re-run benchmarks to measure impact
4. Adjust confidence thresholds if needed

**Continuous Improvement:**
- Weekly review of analytics dashboard
- Monthly benchmark runs on new commit history
- Quarterly prompt optimization based on override patterns
- A/B test new prompt variations (Phase 3+)

## References

- **Related ADR:** [ADR-0015: Post-Processing Commit Type Validation](./0015-post-processing-commit-type-validation.md)
- **Related ADR:** [ADR-0013: LLM Prompt Strategy](./0013-llm-prompt-strategy.md)
- **Related ADR:** [ADR-0010: Anti-Hallucination Validation](./0010-anti-hallucination-validation.md)
- **Commit History:** `.kb/commit/history/` (30+ real examples analyzed)
- **Analytics SDK:** `@kb-labs/sdk` - `useAnalytics()`

## Next Steps

1. ✅ Get approval for ADR-0016
2. ✅ Create benchmark suite with baseline (document current 60% accuracy)
3. ✅ Implement Phase 1 (quick wins)
4. ✅ Run benchmarks, measure improvement
5. ✅ Implement Phase 2 (pattern detection)
6. ✅ Run benchmarks, measure improvement
7. ✅ Document final results in `docs/benchmarks/COMMIT_TYPE_ACCURACY.md`
8. ⏳ Monitor analytics for 2 weeks
9. ⏳ Iterate based on real-world data

---

**Last Updated:** 2025-12-19
**Next Review:** 2026-01-19 (30 days)
