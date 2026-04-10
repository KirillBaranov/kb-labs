# Implementation Plan: Enhanced Commit Type Classification

**Status:** Ready to implement
**Target Completion:** 3-4 days
**Expected Accuracy:** 60% → 87%

## Overview

Implementation of ADR-0016 (Hybrid Pattern Detection) and ADR-0017 (Benchmark Suite) to improve commit type classification accuracy from 60% to 85-90%.

## Timeline

### Day 1: Phase 1 - Quick Wins (3-4 hours)
**Target:** 60% → 75% accuracy

- [ ] **Task 1.1:** Add few-shot examples to SYSTEM_PROMPT (1 hour)
  - File: `packages/commit-core/src/generator/llm-prompt.ts`
  - Add 5 real-world examples to lines 89-150
  - Test with existing commit generation

- [ ] **Task 1.2:** Extend fixCommitType() with Rules 3-5 (2 hours)
  - File: `packages/commit-core/src/generator/llm-prompt.ts`
  - Rule 3: Pattern cross-check (placeholder for Phase 2)
  - Rule 4: Modified files heuristic
  - Rule 5: New package detection
  - Unit tests for each rule

- [ ] **Task 1.3:** Basic analytics integration (1 hour)
  - File: `packages/commit-core/src/generator/commit-plan.ts`
  - Track: pattern detected, overrides applied
  - Event: `commit.generation-complete`

**Deliverables:**
- ✅ Updated llm-prompt.ts with examples + extended validation
- ✅ Basic analytics tracking
- ✅ Unit tests passing
- ✅ Manual smoke test shows improvement

**Success Criteria:**
- No regressions in existing tests
- Manual testing shows ~75% accuracy on sample commits

---

### Day 2: Phase 2 - Pattern Detection (4-5 hours)
**Target:** 75% → 85% accuracy

- [ ] **Task 2.1:** Implement pattern-detector.ts (3 hours)
  - File: `packages/commit-core/src/generator/pattern-detector.ts` (NEW!)
  - Functions:
    - `analyzePatterns()` - main orchestrator
    - `isNewPackagePattern()` - detect new packages
    - `isBulkMovePattern()` - detect bulk moves
    - `isRefactorModificationPattern()` - detect refactors
    - Helper: `countUniqueDirs()`, `calculateAdditionRatio()`
  - Unit tests for each pattern detector

- [ ] **Task 2.2:** Integrate pattern hints into prompts (1 hour)
  - File: `packages/commit-core/src/generator/llm-prompt.ts`
  - Create `buildEnhancedPrompt()` function
  - Add pattern hints to user message
  - Update `buildPromptWithDiff()` similarly

- [ ] **Task 2.3:** Wire up pattern detection in commit-plan.ts (1 hour)
  - File: `packages/commit-core/src/generator/commit-plan.ts`
  - Call `analyzePatterns()` before LLM
  - Pass pattern analysis to buildEnhancedPrompt()
  - Pass pattern analysis to enhancedFixCommitType()
  - Update Rule 3 to use actual pattern data

**Deliverables:**
- ✅ pattern-detector.ts with full implementation
- ✅ Integration in commit-plan.ts
- ✅ Unit tests for pattern detection (90%+ coverage)
- ✅ Integration test with real file summaries

**Success Criteria:**
- Pattern detection has 90%+ accuracy on known cases
- LLM prompts include pattern hints
- Post-processing uses pattern cross-check
- Manual testing shows ~85% accuracy

---

### Day 3: Phase 3 - Benchmark Suite (4-5 hours)
**Target:** Establish baseline and validation

- [ ] **Task 3.1:** Extract and label test cases (2 hours)
  - Script: `scripts/extract-benchmark-cases.ts`
  - Extract from `.kb/commit/history/`
  - Manually label 30-40 cases:
    - 12 new package cases
    - 10 bulk move cases
    - 10 modification cases
    - 8 deletion cases
  - Save to `tests/benchmarks/test-cases/*.json`

- [ ] **Task 3.2:** Implement benchmark runner (2 hours)
  - File: `tests/benchmarks/commit-type-accuracy.test.ts`
  - Utils:
    - `accuracy-calculator.ts` - compute metrics
    - `test-case-loader.ts` - load JSON cases
    - `results-formatter.ts` - markdown output
  - Test structure:
    - Overall accuracy test (85%+ target)
    - Pattern-specific tests
    - Difficulty-level tests
    - Regression detection test

- [ ] **Task 3.3:** Run baseline benchmarks (30 min)
  - Checkout code BEFORE ADR-0016 changes
  - Run: `pnpm test:benchmarks`
  - Document results in `docs/benchmarks/COMMIT_TYPE_ACCURACY.md`
  - Expected: ~60% accuracy

- [ ] **Task 3.4:** Run improved benchmarks (30 min)
  - Checkout code WITH ADR-0016 changes
  - Run: `pnpm test:benchmarks`
  - Document results in `docs/benchmarks/COMMIT_TYPE_ACCURACY.md`
  - Expected: ~85-90% accuracy

**Deliverables:**
- ✅ 30-40 labeled test cases in version control
- ✅ Benchmark suite running in <120 seconds
- ✅ Baseline results documented (~60%)
- ✅ Improved results documented (~85-90%)
- ✅ COMMIT_TYPE_ACCURACY.md dashboard

**Success Criteria:**
- Benchmark suite is reproducible
- Accuracy improvement is measurable and documented
- CI integration ready (optional for Phase 3)

---

### Day 4: Polish & Documentation (2-3 hours)

- [ ] **Task 4.1:** Full analytics integration (1 hour)
  - Events:
    - `commit.pattern-detected`
    - `commit.generation-complete`
    - `commit.high-override-rate` (if >30%)
  - Track:
    - Pattern type distribution
    - Override reasons
    - Type distribution
    - Cost metrics (tokens used)

- [ ] **Task 4.2:** Update documentation (1 hour)
  - README.md: Add benchmark results
  - BENCHMARKS.md: How to run, interpret
  - ADR-0016: Update with actual results
  - ADR-0017: Update with actual results

- [ ] **Task 4.3:** CI integration (optional, 1 hour)
  - Add `.github/workflows/benchmarks.yml`
  - Run on PR to commit-core
  - Fail if regression detected
  - Comment benchmark results on PR

**Deliverables:**
- ✅ Full analytics tracking
- ✅ Updated documentation
- ✅ CI integration (optional)

**Success Criteria:**
- Analytics dashboard shows metrics
- Documentation is clear and up-to-date
- Team can run benchmarks independently

---

## File Structure After Implementation

```
kb-labs-commit-plugin/
├── docs/
│   ├── adr/
│   │   ├── 0016-hybrid-pattern-detection-commit-classification.md  ✅
│   │   └── 0017-benchmark-suite-commit-type-accuracy.md            ✅
│   └── benchmarks/
│       ├── COMMIT_TYPE_ACCURACY.md                                 🆕
│       └── BENCHMARKS.md                                            🆕
├── packages/commit-core/src/
│   └── generator/
│       ├── commit-plan.ts                                           📝 MODIFIED
│       ├── llm-prompt.ts                                            📝 MODIFIED
│       └── pattern-detector.ts                                      🆕 NEW!
├── tests/benchmarks/
│   ├── commit-type-accuracy.test.ts                                 🆕 NEW!
│   ├── test-cases/
│   │   ├── pattern-new-package.json                                 🆕 NEW!
│   │   ├── pattern-refactor-move.json                               🆕 NEW!
│   │   ├── pattern-refactor-modify.json                             🆕 NEW!
│   │   └── pattern-deletions.json                                   🆕 NEW!
│   └── utils/
│       ├── accuracy-calculator.ts                                   🆕 NEW!
│       ├── test-case-loader.ts                                      🆕 NEW!
│       └── results-formatter.ts                                     🆕 NEW!
├── scripts/
│   └── extract-benchmark-cases.ts                                   🆕 NEW!
└── .github/workflows/
    └── benchmarks.yml                                               🆕 NEW! (optional)
```

## Code Changes Summary

### 1. llm-prompt.ts (~200 LOC added)

**New exports:**
```typescript
export const SYSTEM_PROMPT_EXAMPLES = `...`; // Few-shot examples

export interface PatternAnalysis {
  patternType: 'new-package' | 'refactor-move' | 'refactor-modify' | 'deletions' | 'mixed';
  confidence: number;
  hints: string[];
  suggestedType: ConventionalType | null;
}

export function buildEnhancedPrompt(
  summaries: FileSummary[],
  analysis: PatternAnalysis,
  recentCommits: string[]
): string;

export function enhancedFixCommitType(
  commit: CommitGroup & { confidence: number },
  summaries: FileSummary[],
  analysis: PatternAnalysis
): CommitGroup & { confidence: number };
```

**Modified:**
- `SYSTEM_PROMPT`: Add few-shot examples section
- `fixCommitType()`: Extend with Rules 3-5

### 2. pattern-detector.ts (~200 LOC, NEW!)

```typescript
export function analyzePatterns(summaries: FileSummary[]): PatternAnalysis;

export function isNewPackagePattern(summaries: FileSummary[]): boolean;
export function isBulkMovePattern(summaries: FileSummary[]): boolean;
export function isRefactorModificationPattern(summaries: FileSummary[]): boolean;

// Helpers
function countUniqueDirs(summaries: FileSummary[], depth: number): number;
function calculateAdditionRatio(summaries: FileSummary[]): number;
```

### 3. commit-plan.ts (~100 LOC added)

**Modified:**
```typescript
import { analyzePatterns } from './pattern-detector';
import { buildEnhancedPrompt, enhancedFixCommitType } from './llm-prompt';

// In generateCommitPlan():
const analysis = analyzePatterns(summaries);

await analytics.track('commit.pattern-detected', {
  patternType: analysis.patternType,
  confidence: analysis.confidence,
  // ...
});

// Use enhanced prompt
const prompt = buildEnhancedPrompt(summaries, analysis, recentCommits);

// Use enhanced post-processing
const fixedCommits = commits.map(c =>
  enhancedFixCommitType(c, summaries, analysis)
);

await analytics.track('commit.generation-complete', {
  // ... full metrics
});
```

### 4. Benchmark Files (~500 LOC total, NEW!)

- `commit-type-accuracy.test.ts`: Test runner (~200 LOC)
- `accuracy-calculator.ts`: Metrics computation (~100 LOC)
- `test-case-loader.ts`: JSON loading (~50 LOC)
- `results-formatter.ts`: Markdown output (~100 LOC)
- `extract-benchmark-cases.ts`: Extraction script (~50 LOC)

---

## Testing Strategy

### Unit Tests

```typescript
// pattern-detector.test.ts
describe('Pattern Detection', () => {
  describe('isNewPackagePattern', () => {
    it('detects new package with 20+ files and package.json', () => {
      const summaries = createMockSummaries({
        count: 21,
        status: 'added',
        isNewFile: true,
        includePackageJson: true,
        sameDirectory: true,
      });

      expect(isNewPackagePattern(summaries)).toBe(true);
    });

    it('rejects package with <10 files', () => {
      const summaries = createMockSummaries({ count: 5, /* ... */ });
      expect(isNewPackagePattern(summaries)).toBe(false);
    });
  });

  // Similar for isBulkMovePattern, isRefactorModificationPattern
});

// llm-prompt.test.ts
describe('enhancedFixCommitType', () => {
  it('overrides feat → refactor when pattern suggests refactor', () => {
    const commit = { type: 'feat', /* ... */ };
    const analysis = { suggestedType: 'refactor', confidence: 0.9, /* ... */ };

    const result = enhancedFixCommitType(commit, summaries, analysis);

    expect(result.type).toBe('refactor');
  });

  it('does not override when confidence <0.8', () => {
    const commit = { type: 'feat', /* ... */ };
    const analysis = { suggestedType: 'refactor', confidence: 0.7, /* ... */ };

    const result = enhancedFixCommitType(commit, summaries, analysis);

    expect(result.type).toBe('feat'); // No override
  });
});
```

### Integration Tests (Benchmarks)

```typescript
// commit-type-accuracy.test.ts
describe('Commit Type Accuracy Benchmarks', () => {
  it('achieves 85%+ accuracy on all test cases', async () => {
    const testCases = await loadBenchmarkCases();
    const results = await runBenchmark(testCases);

    expect(results.accuracy).toBeGreaterThan(0.85);

    // Save results for dashboard
    await saveResults('docs/benchmarks/results.json', results);
  });
});
```

### Manual Testing

```bash
# Test on real commit
cd kb-labs-commit-plugin
pnpm kb commit commit --scope="packages/commit-core" --dry-run

# Should show pattern detection:
# [DEBUG] Pattern detected: refactor-modify (confidence: 0.85)
# [DEBUG] Override: c1 feat → refactor (modified-low-addition-ratio)
```

---

## Risk Mitigation

### Risk 1: Pattern detection false positives

**Mitigation:**
- Confidence thresholds (only override at 0.8+)
- Unit tests for edge cases
- Benchmark suite catches regressions

### Risk 2: LLM API costs

**Mitigation:**
- Benchmarks use cached responses (20 test cases)
- Total cost: ~$0.02 per run
- Acceptable for value provided

### Risk 3: Accuracy target not met

**Mitigation:**
- Phase 1 should get to 75% (safe target)
- Phase 2 should get to 85% (conservative)
- If needed, can tune thresholds or add more examples

### Risk 4: Implementation complexity

**Mitigation:**
- Well-documented ADRs
- Small, incremental phases
- Each phase independently valuable
- Rollback plan: disable pattern detection via feature flag

---

## Success Metrics

### Phase 1 Success Criteria
- ✅ No test regressions
- ✅ Few-shot examples in prompt
- ✅ Rules 4-5 implemented and tested
- ✅ Manual testing shows ~75% accuracy

### Phase 2 Success Criteria
- ✅ Pattern detection functions work correctly
- ✅ Integration in commit-plan.ts complete
- ✅ Manual testing shows ~85% accuracy
- ✅ Unit test coverage >90%

### Phase 3 Success Criteria
- ✅ 30+ test cases labeled
- ✅ Benchmark suite runs in <120s
- ✅ Baseline documented (~60%)
- ✅ Improved accuracy documented (~85-90%)

### Overall Success
- ✅ **Accuracy:** 60% → 85-90%
- ✅ **Cost:** <$0.02 per benchmark run
- ✅ **Speed:** <200ms overhead per generation
- ✅ **Quality:** Reproducible, testable, documented

---

## Next Steps

1. ✅ Review and approve ADR-0016 and ADR-0017
2. 🚀 Start Day 1: Phase 1 implementation
3. ⏳ Daily standups to track progress
4. ⏳ Demo improvements to team after each phase
5. ⏳ Deploy to production after Phase 3 complete

---

**Last Updated:** 2025-12-19
**Estimated Completion:** 2025-12-23
