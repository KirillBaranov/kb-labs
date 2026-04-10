# Commit Plugin Architecture

AI-powered commit message generator using hybrid pattern detection and LLM validation.

> **📌 Important:** Before diving into architecture, familiarize yourself with the [Naming Convention](./naming-convention.md) - the mandatory "Pyramid Rule" that all KB Labs packages must follow.

## Overview

**Philosophy:** Modular pipeline with clear separation between analysis, generation, and application stages.

**Key Features:**
- **Hybrid Pattern Detection**: Pre-processing heuristics + LLM generation + post-processing validation
- **Two-Phase LLM**: Escalates to diff analysis when confidence is low
- **Secrets Detection**: Blocks commits containing API keys, tokens, credentials
- **Scope Support**: Works with monorepos, nested repos, and package scopes
- **Analytics Tracking**: Measures accuracy and performance over time

## Package Structure

```
packages/
├── commit-cli/           # CLI surface - commands & flags
│   ├── commands/
│   │   └── commit.ts     # Main commit command
│   └── manifest.v2.ts    # CLI manifest
│
├── commit-core/          # Core business logic (300KB+)
│   ├── analyzer/         # Git analysis (status, diffs, summaries)
│   │   ├── git-status.ts
│   │   ├── file-summary.ts
│   │   ├── recent-commits.ts
│   │   ├── scope-resolver.ts
│   │   └── secrets-detector.ts
│   │
│   ├── generator/        # Commit plan generation (MAIN LOGIC)
│   │   ├── commit-plan.ts        # Orchestrates entire pipeline
│   │   ├── llm-prompt.ts         # LLM prompts + validation
│   │   ├── pattern-detector.ts   # Pre-processing heuristics ⭐
│   │   └── heuristics.ts         # Fallback when LLM unavailable
│   │
│   ├── applier/          # Git commit execution
│   │   └── git-applier.ts
│   │
│   ├── storage/          # Plan persistence
│   │   └── plan-storage.ts
│   │
│   ├── tests/benchmarks/ # Accuracy benchmarks ⭐
│   │   ├── commit-type-accuracy.test.ts
│   │   ├── test-cases/   # 8 test cases (4 categories)
│   │   └── utils/        # Metrics calculation
│   │
│   └── docs/benchmarks/  # Benchmark results
│       ├── README.md
│       └── latest-results.json
│
├── commit-contracts/     # Shared types & schemas
│   ├── schemas/
│   │   ├── commit-plan.ts     # Zod schemas
│   │   └── file-summary.ts
│   └── types/
│       ├── commit-plan.ts     # TypeScript types
│       └── conventional.ts
│
└── commit-plugin/        # Plugin manifest (entry point)
    └── manifest.v2.ts
```

## Commit Generation Pipeline

### High-Level Flow

```
User runs: pnpm kb commit commit --scope="@kb-labs/core"
                    ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. Git Analysis (analyzer/)                                │
│ ─────────────────────────────────────────────────────────── │
│ • getGitStatus() → staged, unstaged, untracked files       │
│ • getFileSummaries() → FileSummary[]                       │
│   - path, status, additions, deletions, isNewFile          │
│ • getRecentCommits() → style reference (last 10)           │
│ • detectSecretFiles() → ABORT if secrets found 🔒          │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Pattern Detection (PRE-LLM) ⭐ NEW                      │
│ ─────────────────────────────────────────────────────────── │
│ analyzePatterns(summaries) → PatternAnalysis                │
│                                                              │
│ Detects 4 pattern types:                                    │
│ • new-package: 10+ files + package.json + isNewFile=true    │
│   → confidence: 0.95, suggests: feat                        │
│                                                              │
│ • refactor-move: 20+ files + isNewFile=false                │
│   → confidence: 0.90, suggests: refactor                    │
│                                                              │
│ • refactor-modify: all modified + addition ratio < 0.4      │
│   → confidence: 0.85, suggests: refactor                    │
│                                                              │
│ • deletions: all deleted OR >80% deletions                  │
│   → confidence: 0.95-0.98, suggests: chore/refactor         │
│                                                              │
│ Output: PatternAnalysis {                                   │
│   patternType, confidence, hints[], suggestedType           │
│ }                                                            │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Enhanced Prompting ⭐ NEW                                │
│ ─────────────────────────────────────────────────────────── │
│ buildEnhancedPrompt(summaries, patternAnalysis, commits)    │
│                                                              │
│ Adds to prompt:                                             │
│ • Few-shot examples (5 examples):                           │
│   - Modified files → refactor, NOT feat                     │
│   - New package → feat, NOT chore                           │
│   - Deletions → chore, NOT feat                             │
│   - Bulk moves → refactor, NOT feat                         │
│                                                              │
│ • Pattern hints (if confidence > 0.7):                      │
│   🎯 PATTERN DETECTED (confidence: 95%):                    │
│   Pattern type: new-package                                 │
│   Suggested commit type: feat                               │
│   Hints:                                                    │
│     • 21 new files including package.json                   │
│     • All files are truly new (isNewFile: true)             │
│     • This is a new feature (feat), not chore               │
│                                                              │
│ • Recent commit style examples                              │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. LLM Generation (GPT-4o-mini, temp: 0.3)                 │
│ ─────────────────────────────────────────────────────────── │
│ Phase 1: Generate with file summaries + pattern hints       │
│ • maxTokens: 2000                                           │
│ • Returns: CommitGroup[] + confidence                       │
│                                                              │
│ If confidence < 0.7 OR needsMoreContext:                    │
│   Phase 2: Re-generate with full diffs                      │
│   • getFileDiffs() → Map<path, diff>                        │
│   • detectSecretsInDiffs() → ABORT if found 🔒              │
│   • maxTokens: 3000-6000 (scales with file count)           │
│   • buildPromptWithDiff() → richer context                  │
│   • Re-analyze with diff → higher confidence                │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Post-Processing Validation ⭐ UPDATED                    │
│ ─────────────────────────────────────────────────────────── │
│ fixCommitType(commit, summaries, patternAnalysis)           │
│                                                              │
│ Applies 5 rules in order:                                   │
│                                                              │
│ Rule 1: All deleted files → chore                           │
│ Rule 2: >80% deletions → refactor                           │
│                                                              │
│ Rule 3: Pattern Override ⭐ NEW                             │
│   IF patternAnalysis.confidence > 0.8                       │
│   AND LLM type ≠ pattern suggestedType                      │
│   THEN override LLM → use pattern type                      │
│                                                              │
│   Example:                                                  │
│   • LLM says: chore (wrong, training bias)                  │
│   • Pattern says: feat (95% confidence, new package)        │
│   • Result: Override to feat ✅                             │
│                                                              │
│ Rule 4: Modified files + low addition ratio → refactor      │
│   • All files modified AND ratio < 0.4 → refactor           │
│   • All files modified AND ratio < 0.6 → refactor           │
│                                                              │
│ Rule 5: New package detection → feat                        │
│   • 10+ files + package.json + all new → feat               │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Anti-Hallucination Validation                           │
│ ─────────────────────────────────────────────────────────── │
│ validateAndFixCommits(commits, summaries)                   │
│ • Remove hallucinated files (LLM invented non-existent)     │
│ • Remove duplicate files (same file in multiple commits)    │
│ • Add missing files (LLM forgot some files)                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Plan Storage & Display                                  │
│ ─────────────────────────────────────────────────────────── │
│ savePlan() → .kb/commit/history/{timestamp}/plan.json       │
│ Display preview → user reviews commits                      │
│                                                              │
│ If user approves (--yes or interactive):                    │
│   → applyCommits(plan)                                      │
│   → git add + git commit for each CommitGroup               │
│   → Save results.json                                       │
│                                                              │
│ If --with-push:                                             │
│   → git push origin HEAD                                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Improvements (ADR-0016)

**Before (60% accuracy):**
- ❌ LLM training bias: "added files" → always `feat`
- ❌ No semantic analysis: can't tell new vs moved files
- ❌ Minimal validation: only Rules 1-2 (deletions)

**After (85-90% target, 100% on synthetic benchmarks):**
- ✅ Pattern detection (pre-LLM): catches 80% of errors before LLM
- ✅ Enhanced prompting: few-shot examples + pattern hints guide LLM
- ✅ Extended validation (post-LLM): Rules 3-5 fix remaining errors
- ✅ Analytics tracking: measure accuracy improvements

### Pattern Detection Logic

```typescript
// pattern-detector.ts
export function analyzePatterns(summaries: FileSummary[]): PatternAnalysis {
  // Priority order: highest confidence first

  if (isNewPackagePattern(summaries)) {
    // 10+ files, package.json, all isNewFile=true
    return {
      patternType: 'new-package',
      confidence: 0.95,
      suggestedType: 'feat',
      hints: ['New package detected', 'All files truly new', 'This is feat, not chore']
    };
  }

  if (isBulkMovePattern(summaries)) {
    // 20+ files, all added, >50% have isNewFile=false
    return {
      patternType: 'refactor-move',
      confidence: 0.90,
      suggestedType: 'refactor',
      hints: ['Bulk move pattern', 'Files existed before', 'This is refactoring']
    };
  }

  if (isRefactorModificationPattern(summaries)) {
    // All modified, addition ratio < 0.4
    return {
      patternType: 'refactor-modify',
      confidence: 0.85,
      suggestedType: 'refactor',
      hints: ['All files modified', 'Low addition ratio', 'This is refactoring']
    };
  }

  // ... deletions, mixed patterns
}
```

## Module Dependencies

```
┌──────────────┐
│  commit-cli  │ ← CLI commands (thin adapter)
└──────┬───────┘
       │ imports
       ↓
┌──────────────┐
│ commit-core  │ ← Core business logic
│ ────────────│
│ • analyzer/  │ → Git analysis (status, diffs, secrets)
│ • generator/ │ → Plan generation (pattern detection, LLM, validation)
│ • applier/   │ → Git commit execution
│ • storage/   │ → Plan persistence
└──────┬───────┘
       │ imports
       ↓
┌──────────────────┐
│ commit-contracts │ ← Shared types & schemas (leaf)
└──────────────────┘
```

**Key Principles:**
- **commit-cli**: Thin adapter - parses flags, calls commit-core, displays results
- **commit-core**: All business logic - pure functions, testable, no CLI dependencies
- **commit-contracts**: Type definitions only - no runtime dependencies

## Testing Strategy

### Unit Tests (Core Logic)
```bash
cd packages/commit-core
pnpm test
```

Located in `src/**/*.test.ts`:
- **pattern-detector.test.ts** - Pattern detection logic
- **llm-prompt.test.ts** - Prompt building and validation
- **git-status.test.ts** - Git status parsing
- **file-summary.test.ts** - File summary analysis
- **secrets-detector.test.ts** - Secrets detection

### Benchmark Tests (Accuracy)
```bash
cd packages/commit-core
pnpm test:benchmarks
```

Located in `tests/benchmarks/`:
- **commit-type-accuracy.test.ts** - Main benchmark runner
- **test-cases/** - 8 synthetic test cases (4 categories)
- **utils/** - Metrics calculation (accuracy, precision, recall, F1)

**Output:**
```
📦 Loaded 8 test cases
✅ 8/8 passed (100% accuracy)
📊 By category: all 100%
🎯 By type: feat/refactor/chore all F1=100%
💾 Results saved to: docs/benchmarks/latest-results.json
```

### Integration Tests (End-to-End)
```bash
# Manual test with real LLM
pnpm kb commit commit --scope="@kb-labs/core"
```

Tests full pipeline:
1. Git analysis
2. Pattern detection
3. LLM generation
4. Validation
5. Commit application

### Adding New Test Cases

See [Benchmark README](../packages/commit-core/docs/benchmarks/README.md) for instructions on adding new test cases.

## Performance Characteristics

- **Pattern Detection**: ~50-100ms (no LLM)
- **LLM Phase 1**: ~1-2s (file summaries only)
- **LLM Phase 2**: ~2-4s (with diffs, if escalated)
- **Total (typical)**: ~2-3s per commit plan
- **Phase 2 Escalation Rate**: Target <30%

## Configuration

### LLM Settings
```typescript
// packages/commit-core/src/generator/commit-plan.ts
const CONFIDENCE_THRESHOLD = 0.7; // Escalate to Phase 2 below this
const MAX_LLM_RETRIES = 2;        // Retry on parse errors

// Phase 1
temperature: 0.3
maxTokens: 2000

// Phase 2
temperature: 0.3
maxTokens: 3000-6000 (scales with file count)
```

### Pattern Detection Thresholds
```typescript
// packages/commit-core/src/generator/pattern-detector.ts
new-package:     10+ files, package.json, confidence 0.95
bulk-move:       20+ files, >50% not new, confidence 0.90
refactor-modify: all modified, <40% additions, confidence 0.85
deletions:       all deleted or >80%, confidence 0.95-0.98
```

### Validation Rules
```typescript
// packages/commit-core/src/generator/llm-prompt.ts
Rule 3: Pattern override when confidence > 0.8
Rule 4: Modified files, addition ratio < 0.4 → refactor
Rule 5: New package (10+ files + package.json) → feat
```

## Related Documentation

- [ADR-0015: Post-Processing Validation](./adr/0015-post-processing-validation.md) - Initial validation rules (Rules 1-2)
- [ADR-0016: Hybrid Pattern Detection](./adr/0016-hybrid-pattern-detection-commit-classification.md) - Full pipeline architecture
- [ADR-0017: Benchmark Suite](./adr/0017-benchmark-suite-commit-type-accuracy.md) - Testing strategy
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - What was built and why
- [Benchmark README](../packages/commit-core/docs/benchmarks/README.md) - How to run and interpret benchmarks

---

**Last Updated:** 2025-12-19
**Accuracy:** 100% on synthetic benchmarks (target: 85-90% real-world)
**LLM Cost:** ~$0.0012-0.0015 per commit (GPT-4o-mini)
