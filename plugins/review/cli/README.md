# @kb-labs/review-cli

CLI commands for AI Review plugin.

## Commands

### `review:run`

Run code review analysis.

```bash
# Heuristic mode (CI, fast, no LLM)
kb review run

# Full mode (heuristic + LLM)
kb review run --mode=full

# LLM-only mode (deep analysis)
kb review run --mode=llm

# Scope options
kb review run --scope=all       # Entire codebase
kb review run --scope=changed   # Changed files vs main (default)
kb review run --scope=staged    # Staged files only

# Use preset
kb review run --preset=typescript-strict

# Custom file patterns
kb review run --files="src/**/*.ts" --files="src/**/*.tsx"

# JSON output
kb review run --json
```

## Review Modes

### heuristic (CI Mode)

Fast, deterministic analysis using only heuristic engines:
- ESLint (TypeScript/JavaScript)
- Ruff (Python) - coming soon
- golangci-lint (Go) - coming soon
- Clippy (Rust) - coming soon

**Use cases:**
- CI/CD pipelines
- Pre-commit hooks
- Quick local checks

**Exit code:**
- 0: No blocker or high severity issues
- 1: Has blocker or high severity issues

### full (Local Mode)

Comprehensive analysis with heuristic + LLM:
- All heuristic engines
- LLM analyzers for complex issues
- Cached LLM results

**Use cases:**
- Local development
- Pre-PR review
- Weekly codebase audits

**Exit code:**
- 0: No blocker issues
- 1: Has blocker issues

### llm (Deep Analysis Mode)

LLM-only analysis for semantic issues:
- Naming conventions
- Architecture patterns
- Logic bugs
- Code smells

**Use cases:**
- Architecture reviews
- Complex refactoring
- Semantic bug detection

**Exit code:**
- 0: No blocker issues
- 1: Has blocker issues

## Scope Options

### all

Analyze entire codebase:
```bash
kb review run --scope=all
```

### changed

Analyze files changed vs main branch (git diff):
```bash
kb review run --scope=changed  # default
```

### staged

Analyze only staged files (git diff --staged):
```bash
kb review run --scope=staged
```

## Presets

Use predefined rule sets:

```bash
# TypeScript strict preset
kb review run --preset=typescript-strict

# Python production preset
kb review run --preset=python-production

# Security-focused preset
kb review run --preset=security-all
```

## Output Formats

### Text (default)

Human-readable output with colors:
```
Running heuristic analysis...
✔ Found 3 issue(s)

┌─ Code Review ─────────────────┐
│ Summary                       │
│ Files: 5                      │
│ Findings: 3                   │
│ High: 1                       │
│ Medium: 2                     │
│ Engines: eslint               │
│                               │
│ Findings                      │
│ [HIGH] src/index.ts:10 - ...  │
│ [MEDIUM] src/utils.ts:5 - ... │
│ [MEDIUM] src/api.ts:20 - ...  │
└───────────────────────────────┘
```

### JSON

Machine-readable output:
```bash
kb review run --json
```

```json
{
  "findings": [
    {
      "id": "eslint:src/index.ts:no-unused-vars:10:5",
      "ruleId": "no-unused-vars",
      "type": "code-quality",
      "severity": "medium",
      "confidence": "certain",
      "file": "src/index.ts",
      "line": 10,
      "message": "'foo' is defined but never used.",
      "engine": "eslint",
      "source": "heuristic"
    }
  ],
  "metadata": {
    "mode": "heuristic",
    "scope": "changed",
    "analyzedFiles": 5,
    "duration": 1234,
    "engines": ["eslint"],
    "timestamp": "2025-01-21T12:00:00Z"
  }
}
```

## Examples

### CI Pipeline

```yaml
# .github/workflows/review.yml
- name: Code Review
  run: |
    kb review run --mode=heuristic --scope=changed --json > review.json

    # Fail if issues found
    if [ $? -ne 0 ]; then
      echo "Code review failed"
      exit 1
    fi
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

kb review run --mode=heuristic --scope=staged

if [ $? -ne 0 ]; then
  echo "Fix issues before committing"
  exit 1
fi
```

### Local Development

```bash
# Quick check
kb review run

# Comprehensive review before PR
kb review run --mode=full --scope=all

# Deep analysis for refactoring
kb review run --mode=llm --files="src/core/**/*.ts"
```

## Configuration

Configure via `.kb/kb.config.json`:

```json
{
  "plugins": {
    "@kb-labs/review": {
      "eslintConfig": ".eslintrc.json",
      "defaultMode": "heuristic",
      "defaultScope": "changed"
    }
  }
}
```

## Platform Integration

The CLI uses KB Labs platform composables:

```typescript
import { useLLM, useCache, useAnalytics, useLoader, useConfig } from '@kb-labs/sdk';

// Access LLM (if configured)
const llm = useLLM({ tier: 'medium' });

// Access cache
const cache = useCache();

// Show progress
const loader = useLoader('Analyzing...');
loader.start();
```

## Exit Codes

- **0**: Success (no critical issues)
- **1**: Issues found (blockers or high severity in heuristic mode)
- **1**: Error during execution

## Architecture

```
review:run
│
├─ ReviewOrchestrator
│   ├─ runHeuristicAnalysis()
│   │   ├─ ESLint adapter
│   │   ├─ Ruff adapter (TODO)
│   │   └─ deduplicateFindings()
│   │
│   ├─ runFullAnalysis()
│   │   ├─ heuristic + LLM
│   │   └─ deduplicateFindings()
│   │
│   └─ runLLMAnalysis()
│       └─ LLM-only (TODO)
│
└─ Output (text/json)
```

## Related Packages

- **@kb-labs/review-contracts** - Type definitions
- **@kb-labs/review-heuristic** - Heuristic engines (ESLint, etc.)
- **@kb-labs/review-core** - Orchestration logic
