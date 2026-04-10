# @kb-labs/review-heuristic

Heuristic analysis engines for AI Review plugin.

## Overview

This package provides adapters for deterministic code analysis tools (linters, compilers, SAST) with unified output format and intelligent deduplication.

## Features

- **Engine Registry** - Maps tools to engine types (compiler/linter/sast/ast)
- **ESLint Adapter** - TypeScript/JavaScript linting with fix templates
- **Fingerprint Deduplication** - sha1(ruleId|file|bucket|snippetHash)
- **Engine Type Priority** - compiler > linter > sast > ast > llm
- **Unified Output** - All engines output ReviewFinding[]

## Engine Registry

The engine registry maps specific tools to engine types for priority-based deduplication:

```typescript
import { ENGINE_REGISTRY, getEngine, getEngineTypePriority } from '@kb-labs/review-heuristic';

// Get engine metadata
const eslint = getEngine('eslint');
console.log(eslint.type); // 'linter'

// Get priority (lower = higher priority)
const priority = getEngineTypePriority('eslint');
console.log(priority); // 2 (linter tier)
```

### Supported Engines

| Engine | Type | Language | Priority |
|--------|------|----------|----------|
| tsc | compiler | TypeScript | 1 |
| eslint | linter | TypeScript/JavaScript | 2 |
| ruff | linter | Python | 2 |
| golangci | linter | Go | 2 |
| clippy | linter | Rust | 2 |
| rubocop | linter | Ruby | 2 |
| semgrep | sast | Multi-language | 3 |
| codeql | sast | Multi-language | 3 |
| bandit | sast | Python | 3 |
| treesitter | ast | Multi-language | 4 |

## ESLint Adapter

Run ESLint analysis and get unified findings:

```typescript
import { analyzeWithESLint } from '@kb-labs/review-heuristic';

// Quick analysis
const findings = await analyzeWithESLint(
  ['src/**/*.ts', 'src/**/*.tsx'],
  '/path/to/project',
  '/path/to/.eslintrc.json'
);

console.log(findings);
// [
//   {
//     id: 'eslint:/path/to/file.ts:no-unused-vars:10:5',
//     ruleId: 'no-unused-vars',
//     type: 'code-quality',
//     severity: 'medium',
//     confidence: 'certain',
//     file: '/path/to/file.ts',
//     line: 10,
//     message: "'foo' is defined but never used.",
//     engine: 'eslint',
//     source: 'heuristic',
//     fix: [{ type: 'replace', ... }],
//     scope: 'local',
//     automated: true
//   }
// ]
```

### Advanced Usage

```typescript
import { ESLintAdapter } from '@kb-labs/review-heuristic';

const adapter = new ESLintAdapter({
  patterns: ['src/**/*.ts'],
  cwd: '/path/to/project',
  configFile: '.eslintrc.json',
  fix: false, // Don't apply fixes
});

const findings = await adapter.analyze();
```

## Deduplication

Deduplicate findings from multiple engines using fingerprints and priority:

```typescript
import { deduplicateFindings } from '@kb-labs/review-heuristic';

// Findings from multiple engines
const eslintFindings = await analyzeWithESLint(...);
const tscFindings = await analyzeWithTSC(...);
const semgrepFindings = await analyzeWithSemgrep(...);

// Combine and deduplicate
const allFindings = [...eslintFindings, ...tscFindings, ...semgrepFindings];
const deduplicated = deduplicateFindings(allFindings);

// Result: Keeps highest priority finding for each collision
// - If tsc and eslint report same issue → keep tsc (compiler > linter)
// - If eslint and semgrep report same issue → keep eslint (linter > sast)
```

### How Deduplication Works

1. **Fingerprint Generation**: `sha1(ruleId|file|bucket|snippetHash)`
   - `ruleId`: Rule identifier (e.g., "no-unused-vars")
   - `file`: File path
   - `bucket`: Line bucket (lines 10-19 → bucket 1)
   - `snippetHash`: Optional hash of code snippet

2. **Collision Detection**: Findings with same fingerprint are collisions

3. **Priority Resolution**:
   - Sort by engine type priority (compiler > linter > sast > ast > llm)
   - If same type, sort by severity (blocker > high > medium > low > info)
   - Keep highest priority finding, discard rest

### Snippet-Based Deduplication

For more precise deduplication, use snippet hashes:

```typescript
import { deduplicateFindingsWithSnippets } from '@kb-labs/review-heuristic';
import { readFile } from 'node:fs/promises';

// Function to extract code snippet
async function getSnippet(finding: ReviewFinding): Promise<string> {
  const content = await readFile(finding.file, 'utf-8');
  const lines = content.split('\n');
  const snippet = lines[finding.line - 1] ?? '';
  return snippet;
}

// Deduplicate with snippets
const deduplicated = await deduplicateFindingsWithSnippets(
  allFindings,
  getSnippet
);
```

## Integration

This package is used by `@kb-labs/review-core` for heuristic analysis:

```typescript
// In review-core
import { analyzeWithESLint, deduplicateFindings } from '@kb-labs/review-heuristic';

export async function runHeuristicAnalysis(request: ReviewRequest): Promise<ReviewResult> {
  const findings: ReviewFinding[] = [];

  // Run ESLint
  const eslintFindings = await analyzeWithESLint(
    request.files,
    request.cwd,
    request.config?.eslintConfig
  );
  findings.push(...eslintFindings);

  // Run other engines...

  // Deduplicate
  const deduplicated = deduplicateFindings(findings);

  return {
    findings: deduplicated,
    metadata: { ... },
  };
}
```

## Architecture

### Engine Type Priority System

Instead of hardcoding priority to specific tools (e.g., "ESLint always wins"), we use **engine type priority**:

- **compiler** (priority 1) - Most authoritative, directly from language compiler
- **linter** (priority 2) - Language-specific best practices and patterns
- **sast** (priority 3) - Security-focused static analysis
- **ast** (priority 4) - Read-only AST pattern matching
- **llm** (priority 5) - LLM-based heuristics (least deterministic)

This means:
- TypeScript compiler (tsc) beats ESLint
- ESLint beats Semgrep
- Semgrep beats tree-sitter
- Any deterministic tool beats LLM

But for different languages:
- `ruff` (Python linter, priority 2) beats `bandit` (Python SAST, priority 3)
- `golangci-lint` (Go linter, priority 2) beats `semgrep` (SAST, priority 3)

### Why This Design?

1. **Language-Agnostic** - Works with any language's tooling
2. **Predictable** - Priority based on engine type, not arbitrary tool ranking
3. **Extensible** - Easy to add new tools without changing deduplication logic
4. **Respects Expertise** - Compilers know best, then linters, then SAST

## Future Extensions

Planned adapters:
- **Ruff** - Python linter (fast Rust-based)
- **golangci-lint** - Go meta-linter
- **Clippy** - Rust linter
- **RuboCop** - Ruby linter
- **Semgrep** - Multi-language SAST
- **CodeQL** - GitHub's SAST engine

All will follow the same pattern:
1. Implement adapter class
2. Register in ENGINE_REGISTRY
3. Convert output to ReviewFinding[]
4. Deduplication handled automatically
