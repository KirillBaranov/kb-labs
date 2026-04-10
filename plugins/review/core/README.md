# @kb-labs/review-core

Core orchestration logic for AI Review plugin.

## Overview

This package contains the main orchestrator that coordinates:
- Heuristic analysis engines (ESLint, Ruff, etc.)
- LLM-based analyzers (naming, architecture, logic bugs)
- Caching via State Broker
- Deduplication with engine type priority
- Analytics tracking

## Usage

```typescript
import { runReview } from '@kb-labs/review-core';

const result = await runReview({
  mode: 'heuristic', // 'heuristic' | 'full' | 'llm'
  scope: 'changed',  // 'all' | 'changed' | 'staged'
  cwd: '/path/to/project',
  files: ['src/**/*.ts'],
  presetId: 'typescript-strict',
  config: {
    eslintConfig: '.eslintrc.json',
  },
});

console.log(`Found ${result.findings.length} issues`);
console.log(`Analyzed ${result.metadata.analyzedFiles} files`);
console.log(`Duration: ${result.metadata.duration}ms`);
```

## Review Modes

### heuristic (CI Mode)

Fast, deterministic analysis using only heuristic engines:
- ✅ ESLint, Ruff, golangci-lint, Clippy
- ✅ No LLM calls (free, fast, predictable)
- ✅ Perfect for CI pipelines
- ❌ Limited to syntactic issues

```typescript
await runReview({
  mode: 'heuristic',
  scope: 'changed',
  cwd: process.cwd(),
});
```

**Use cases:**
- CI/CD pipelines
- Pre-commit hooks
- Quick local checks

### full (Local Mode)

Comprehensive analysis with heuristic + LLM:
- ✅ All heuristic engines
- ✅ LLM analyzers for complex issues
- ✅ Cached LLM results (fast on second run)
- ❌ Costs tokens (configurable budget)

```typescript
await runReview({
  mode: 'full',
  scope: 'all',
  cwd: process.cwd(),
  presetId: 'typescript-strict',
});
```

**Use cases:**
- Local development
- Pre-PR review
- Weekly codebase audits

### llm (Deep Analysis Mode)

LLM-only analysis for semantic issues:
- ❌ No heuristic engines
- ✅ LLM analyzers for naming, architecture, logic bugs
- ✅ Best quality (uses large tier LLM)
- ❌ Most expensive

```typescript
await runReview({
  mode: 'llm',
  scope: 'staged',
  cwd: process.cwd(),
});
```

**Use cases:**
- Architecture reviews
- Complex refactoring
- Semantic bug detection

## Scope Options

Control which files to analyze:

- **`all`** - Analyze entire codebase
- **`changed`** - Analyze files changed vs main branch (git diff)
- **`staged`** - Analyze only staged files (git diff --staged)

```typescript
await runReview({
  mode: 'heuristic',
  scope: 'changed', // Only changed files
  cwd: process.cwd(),
});
```

## Platform Integration

The orchestrator uses KB Labs platform composables:

```typescript
import { useLLM, useCache, useAnalytics } from '@kb-labs/sdk';

// Inside orchestrator
const llm = useLLM({ tier: 'medium' });
const cache = useCache();
const analytics = useAnalytics();

// LLM tier selection
// - 'small': Simple tasks (categorization, quick fixes)
// - 'medium': Standard analysis (most LLM analyzers)
// - 'large': Complex reasoning (architecture, logic bugs)
```

## Caching

Results are cached via State Broker for fast repeat analysis:

```typescript
// First run: ~10s (runs ESLint)
await runReview({ mode: 'heuristic', scope: 'all', cwd: '.' });

// Second run: ~100ms (cached)
await runReview({ mode: 'heuristic', scope: 'all', cwd: '.' });
```

Cache keys include:
- Engine ID (eslint, ruff, etc.)
- Scope (all, changed, staged)
- Preset ID
- File patterns

**Cache invalidation:**
- TTL: 1 hour
- Manual: Clear State Broker cache
- Automatic: File content hash changes (TODO)

## Deduplication

Findings from multiple engines are deduplicated using:

1. **Fingerprint**: `sha1(ruleId|file|bucket|snippetHash)`
2. **Engine Type Priority**: compiler > linter > sast > ast > llm
3. **Severity**: blocker > high > medium > low > info (if same type)

Example:
```typescript
// Input: 3 findings for same issue
// - ESLint: "no-unused-vars" (linter, medium)
// - TSC: "TS6133" (compiler, high)
// - Semgrep: "unused-variable" (sast, low)

// Output: 1 finding (TSC wins: compiler > linter > sast)
{
  id: 'tsc:/path/file.ts:TS6133:10:5',
  engine: 'tsc',
  severity: 'high',
  message: "'foo' is declared but never used.",
}
```

## Analytics

The orchestrator tracks analytics events:

- `review:started` - Review started
- `review:completed` - Review completed successfully
- `review:failed` - Review failed with error

Metrics:
- Mode used
- Findings count
- Duration
- Engines used
- Files analyzed

## Configuration

Pass config via ReviewRequest:

```typescript
await runReview({
  mode: 'full',
  scope: 'all',
  cwd: '/path/to/project',
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  presetId: 'typescript-strict',
  config: {
    eslintConfig: '.eslintrc.json',
    // Add more engine configs here
  },
});
```

## Architecture

```
ReviewOrchestrator
│
├─ runHeuristicAnalysis()
│   ├─ runESLint() → analyzeWithESLint()
│   ├─ runRuff() (TODO)
│   ├─ runGolangci() (TODO)
│   └─ deduplicateFindings()
│
├─ runFullAnalysis()
│   ├─ runHeuristicAnalysis()
│   ├─ runLLMAnalyzers() (TODO)
│   └─ deduplicateFindings()
│
└─ runLLMAnalysis()
    ├─ runLLMAnalyzers() (TODO)
    └─ deduplicateFindings()
```

## Error Handling

The orchestrator catches and tracks errors:

```typescript
try {
  const result = await runReview(request);
  console.log('Success:', result.findings.length);
} catch (error) {
  // Analytics tracked automatically
  console.error('Review failed:', error);
}
```

## Future Enhancements

### Phase 1 (Current)
- ✅ Heuristic mode with ESLint
- ✅ Deduplication with engine type priority
- ✅ Platform integration (useLLM, useCache, useAnalytics)
- ⏳ CLI commands

### Phase 2
- [ ] Full mode with LLM analyzers
- [ ] More heuristic engines (Ruff, golangci, Clippy)
- [ ] Content-hash based caching
- [ ] Preset system

### Phase 3
- [ ] LLM mode for semantic analysis
- [ ] Agent-powered preset generation
- [ ] Interactive review UI
- [ ] Auto-fix support
