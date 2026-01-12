# KB Labs Project Context

## ⚠️ CRITICAL: Protect Configuration Files

**NEVER DELETE OR MODIFY** these files without explicit user permission:
- `.kb/kb.config.json` - Main platform configuration (adapters, knowledge, profiles)
- `.kb/mind/` - Mind RAG index data
- `.kb/cache/` - Platform cache data

**If `.kb/kb.config.json` is missing or corrupted:**
1. **STOP IMMEDIATELY** - Do not proceed with any tasks
2. **ALERT THE USER** - This file was likely deleted by mistake
3. **DO NOT attempt to recreate** - User needs to restore from backup

**Backup recommendation for user:**
```bash
# Create backup before major changes
cp .kb/kb.config.json .kb/kb.config.json.backup
# Or use git (if .kb is tracked in a monorepo)
git add .kb/kb.config.json && git commit -m "backup: kb.config.json"
```

## Project Overview

KB Labs is a comprehensive development platform consisting of multiple monorepos:

- **kb-labs-mind** - AI-powered code search and RAG system
- **kb-labs-knowledge** - Knowledge management contracts and runtime
- **kb-labs-cli** - Command-line interface and tooling
- **kb-labs-workflow** - Workflow engine and orchestration
- **kb-labs-analytics** - Analytics and telemetry
- **kb-labs-plugin** - Plugin system and adapters
- **kb-labs-core** - Core utilities, profiles, and state management

### Important Architectural Notes

**Circular Dependency Elimination (2025-01-03):**

The plugin system previously had a circular dependency:
```
core-runtime → plugin-execution → plugin-runtime → core-runtime ❌
```

**Solution:** Extracted `@kb-labs/plugin-execution-factory` and used dynamic imports:

```
plugin-runtime (#45) → plugin-execution-factory (#47) → core-runtime (#48) ✅
```

**Key changes:**
- Created `@kb-labs/plugin-execution-factory` - Factory for execution backends (in-process, subprocess, worker-pool)
- `plugin-runtime/bootstrap.ts` uses **dynamic import** for `core-runtime`:
  ```typescript
  // Lazy-load to break circular dependency at compile-time
  const { initPlatform } = await import('@kb-labs/core-runtime');
  ```
- `@kb-labs/plugin-execution` re-exports from factory for backward compatibility

**Build order verified:** `npx kb-devkit-build-order` shows 0 circular dependencies.

## Critical: Use Mind RAG for Code Search

**⚠️ MANDATORY: Always use Mind RAG when searching for code, understanding architecture, or finding implementations.**

### Why Use Mind RAG?

Mind RAG provides:
- **Semantic search** across the entire codebase
- **High-quality results** (7.0/10 confidence average)
- **Adaptive search weights** for different query types
- **Anti-hallucination verification** to prevent false information
- **Context-aware results** with source verification

### When to Use Mind RAG

Use Mind RAG for:
- ✅ Finding specific classes, functions, or interfaces (lookup queries)
- ✅ Understanding how features work (concept queries)
- ✅ Learning architecture patterns (architecture queries)
- ✅ Discovering implementation details
- ✅ Code review and analysis

**Do NOT use basic grep/find** for complex searches - Mind RAG understands semantic meaning.

### When NOT to Use Mind RAG

Use traditional tools instead when:
- ❌ **Finding exact string matches** → Use Grep: `"TODO:"`, `"FIXME:"`, `"console.log"`
- ❌ **Finding files by pattern** → Use Glob: `"**/*.test.ts"`, `"src/**/*.tsx"`
- ❌ **Reading specific known files** → Use Read: `"src/index.ts"`
- ❌ **Counting occurrences** → Use Grep with count mode
- ❌ **Simple file listing** → Use Bash: `ls`, `find`

**Rule of thumb:** If you need to understand "what/how/where" semantically → Mind RAG. If you need exact string/pattern matching → traditional tools.

### How to Use Mind RAG

#### Quick Search
```bash
# From kb-labs root directory
pnpm kb mind rag-query --text "your question here" --agent
```

#### Examples

**Lookup Query** (finding specific code):
```bash
pnpm kb mind rag-query --text "What is VectorStore interface and what methods does it have?" --agent
```

**Concept Query** (understanding how things work):
```bash
pnpm kb mind rag-query --text "How does hybrid search work in mind-engine?" --agent
```

**Architecture Query** (understanding design):
```bash
pnpm kb mind rag-query --text "Explain the anti-hallucination architecture" --agent
```

### Reindexing the Project

If you make significant changes to the codebase, reindex Mind:

```bash
# Clear cache
rm -rf .kb/cache/*

# Full reindex (all packages)
pnpm kb mind rag-index --scope default

# Index specific package (faster)
pnpm kb mind rag-index --scope default --include "kb-labs-mind/packages/mind-engine/**/*.ts"
```

**When to reindex:**
- After adding new features
- After refactoring significant code
- After merging PRs with architectural changes
- Before running benchmarks

### Mind RAG Modes

Mind supports 3 query modes:

1. **instant** (default) - Fast, no LLM decomposition
   ```bash
   pnpm kb mind rag-query --text "question" --mode instant --agent
   ```

2. **auto** - Balanced, automatic complexity detection
   ```bash
   pnpm kb mind rag-query --text "question" --mode auto --agent
   ```

3. **thinking** - Deep analysis, multi-step reasoning
   ```bash
   pnpm kb mind rag-query --text "question" --mode thinking --agent
   ```

**Recommendation:** Use `--agent` flag without `--mode` - system will auto-select optimal mode.

## Project Structure

### Monorepo Layout
```
kb-labs/
├── kb-labs-mind/          # AI-powered code search
│   ├── packages/
│   │   ├── mind-engine/   # Search engine core
│   │   ├── mind-orchestrator/  # Query orchestration
│   │   ├── mind-cli/      # CLI commands
│   │   └── mind-*/        # Other mind packages
│   └── docs/adr/          # Architecture decisions
├── kb-labs-knowledge/     # Knowledge contracts
├── kb-labs-cli/           # Main CLI
├── kb-labs-workflow/      # Workflow engine
├── kb-labs-analytics/     # Analytics SDK
├── kb-labs-plugin/        # Plugin system
└── kb-labs-core/          # Core utilities
```

### Key Directories

- **docs/adr/** - Architecture Decision Records (ADRs)
- **packages/*/src/** - Source code
- **packages/*/dist/** - Built output (gitignored)
- **.kb/mind/** - Mind RAG index data

## Development Workflow

### 1. Setup
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Or build specific package
pnpm --filter @kb-labs/mind-engine run build
```

### 2. Before Making Changes

**Always search Mind RAG first:**
```bash
# Understand the feature
pnpm kb mind rag-query --text "how does [feature] work?" --agent

# Find related code
pnpm kb mind rag-query --text "where is [component] implemented?" --agent

# Check architecture
pnpm kb mind rag-query --text "what is the architecture of [system]?" --agent
```

### 3. Making Changes

1. **Search** - Use Mind RAG to find relevant code
2. **Read ADRs** - Check `docs/adr/` for architectural context
3. **Implement** - Make your changes
4. **Build** - Test compilation: `pnpm --filter <package> run build`
5. **Reindex** - Update Mind index if significant changes
6. **Test** - Run benchmarks if search-related changes

### 4. Quality Checks

For Mind RAG changes:
```bash
# Run search quality benchmarks
./kb-labs-mind/packages/mind-engine/scripts/run-benchmarks.sh
```

Expected results:
- EASY queries: confidence ≥0.6
- MEDIUM queries: confidence ≥0.7
- HARD queries: confidence ≥0.7
- Average: ≥0.7 (7.0/10)

## State Daemon for Persistent Cache

KB Labs includes a state daemon for persistent cross-invocation caching, enabling fast in-memory state management.

### When to Use State Daemon

**Use state daemon for:**
- ✅ Query caching (Mind RAG queries, dependency queries)
- ✅ Session management across CLI invocations
- ✅ Temporary configuration storage
- ✅ Cross-plugin data sharing (with permissions)

**Benefits:**
- **10-50x faster** than file-based cache (~1ms vs ~10-50ms)
- **Automatic TTL cleanup** (expired entries removed every 30s)
- **Namespace isolation** (permission-based access control)
- **Graceful degradation** (falls back if daemon unavailable)

### Starting the Daemon

```bash
# Default (localhost:7777)
kb-state-daemon

# Custom port
KB_STATE_DAEMON_PORT=8888 kb-state-daemon

# Check health
curl http://localhost:7777/health
```

### Using in Code

```typescript
// Automatic in plugin handlers (runtime.state)
await runtime.state.set('query-123', result, 60 * 1000); // TTL 60s
const cached = await runtime.state.get('query-123');

// Manual usage with HTTP client
import { HTTPStateBroker } from '@kb-labs/state-broker';

const broker = new HTTPStateBroker('http://localhost:7777');
await broker.set('key', value, 60000);
const value = await broker.get('key');
```

### Architecture

```
CLI Command → Plugin Handler → StateBroker (HTTP) → State Daemon (localhost:7777)
                                      ↓ (if daemon down)
                                InMemoryBroker (fallback)
```

**Key features:**
- **Namespace isolation**: `mind:query-123`, `workflow:job-456`
- **Permission checks**: Plugins declare state access in manifest
- **Quotas**: maxEntries, maxSizeBytes, operationsPerMinute
- **Statistics**: Per-namespace stats (hits, misses, evictions)

### Related Documentation

- [State Broker README](kb-labs-core/packages/state-broker/README.md)
- [State Daemon README](kb-labs-core/packages/state-daemon/README.md)
- [ADR-0037: State Broker for Persistent Cache](kb-labs-mind/docs/adr/0037-state-broker-persistent-cache.md)

## DevKit Tools for Monorepo Management

KB Labs DevKit provides a comprehensive suite of **18 tools** for managing a monorepo with ~80 packages across 18 repositories.

### Quick Health Check

**⚡ NEW: Comprehensive Health Check (recommended)**
```bash
# Full health check - catches missing deps, build failures, type errors
npx kb-devkit-health

# Quick check (skips slow build/type checks)
npx kb-devkit-health --quick

# JSON output for AI agents
npx kb-devkit-health --json
```

**What it checks:**
- ✅ Missing runtime dependencies (imports not in package.json) - **prevents the pain you just experienced!**
- ✅ Cross-repo workspace vs link inconsistencies
- ✅ Build failures across all packages
- ✅ TypeScript type errors
- ✅ Health score (A-F grade)

**Standard CI checks:**
```bash
# From kb-labs root directory
npx kb-devkit-ci
```

This runs all 7 core checks:
1. ✅ Naming convention validation
2. ✅ Import analysis (broken imports, unused deps, circular deps)
3. ✅ Export analysis (unused exports, dead code)
4. ✅ Duplicate dependencies
5. ✅ Package structure validation
6. ✅ Path validation (workspace deps, exports, bin)
7. ✅ TypeScript types (dts generation, types field)

### Analysis Tools (8)

**1. Import Checker** - Find broken imports, unused dependencies, circular dependencies
```bash
npx kb-devkit-check-imports
npx kb-devkit-check-imports --package core-cli
npx kb-devkit-check-imports --verbose
```

**2. Export Checker** - Find unused exports and dead code
```bash
npx kb-devkit-check-exports
npx kb-devkit-check-exports --strict  # Include internal exports
```

**3. Duplicate Checker** - Find duplicate dependencies
```bash
npx kb-devkit-check-duplicates
npx kb-devkit-check-duplicates --code  # Include code duplication
```

**4. Structure Checker** - Validate package structure
```bash
npx kb-devkit-check-structure
npx kb-devkit-check-structure --strict  # Include recommendations
```

**5. Naming Validator** - Enforce Pyramid Rule naming convention
```bash
npx kb-devkit-validate-naming
```

**6. Visualizer** - Generate dependency graphs
```bash
npx kb-devkit-visualize
npx kb-devkit-visualize --stats
npx kb-devkit-visualize --tree --package cli-core
```

**7. Path Validator** - Find broken paths and references
```bash
npx kb-devkit-check-paths                    # Check all paths
npx kb-devkit-check-paths --package=cli-core # Specific package
npx kb-devkit-check-paths --json             # JSON output
```
- Validates: workspace deps, link: refs, exports, bin, entry points, tsconfig
- Finds: missing packages, broken links, non-existent files
- Separates errors (critical) from warnings (needs build)

**8. TypeScript Types Audit** - Deep type safety analysis for entire monorepo
```bash
npx kb-devkit-types-audit                        # Audit all packages
npx kb-devkit-types-audit --errors-only          # Show only critical issues
npx kb-devkit-types-audit --coverage             # Show detailed coverage report
npx kb-devkit-types-audit --package=cli-core     # Audit specific package
npx kb-devkit-types-audit --json                 # JSON output
```

**What it does:**
- ✅ Uses **TypeScript Compiler API** for semantic analysis (not just regex)
- ✅ Finds all **type errors** across the entire monorepo (what `tsc` would show)
- ✅ Calculates **type coverage** percentage for each package
- ✅ Detects **type safety issues**: `any` usage, `@ts-ignore` comments, missing types
- ✅ Shows **impact analysis**: which packages break if package X has type errors
- ✅ Finds **type inheritance chains**: `extends`, `implements`, generic constraints
- ✅ Provides **centralized report** instead of running `tsc` in each package

**Why this is powerful:**

Instead of running `tsc` in each package separately, you get:
- **Single centralized report** for entire monorepo (~80 packages)
- **Impact analysis**: See which packages break if type X has errors
- **Type coverage metrics**: Track type safety over time (e.g., 91.1% average)
- **Dependency chains**: Understand type inheritance relationships
- **Safety hotspots**: Find packages with heavy `any` usage or `@ts-ignore`

**Example output:**
```
📊 TypeScript Type Safety Audit Report

Analyzed 91 package(s)

❌ Critical Issues (64 packages with type errors):
   @kb-labs/workflow-runtime
      12 error(s) - impacts 5 package(s)
   @kb-labs/plugin-runtime
      8 error(s) - impacts 3 package(s)

🔍 Type Safety Issues:
   12297 usage(s) of 'any' type
   26 @ts-ignore comment(s)

📈 Type Coverage:
   ✅ Excellent (≥90%): 67 packages
   ⚠️  Good (70-90%):   19 packages
   ❌ Poor (<70%):      5 packages

📊 Summary:
   Total packages:     91
   ❌ Type errors:     3012
   📈 Avg coverage:    91.1%
```

**When to use:**
- Before major refactoring to understand type health
- To find packages with poor type safety (`any` usage hotspots)
- To understand impact before changing core types
- To track type safety improvements over time
- To enforce type coverage standards in CI

### Automation Tools (7)

**1. Quick Statistics** - Get health scores and metrics
```bash
npx kb-devkit-stats              # Overview
npx kb-devkit-stats --health     # Health score with grade A-F
npx kb-devkit-stats --json       # JSON output
npx kb-devkit-stats --md         # Markdown table
```

**Example output:**
```
📊 KB Labs Monorepo Statistics

📦 Overview:
   Packages:      90
   Repositories:  18
   Lines of Code: 226,514
   Total Size:    6.22 MB

💚 Health Score:
   Score: 68/100 (Grade D)

   Issues:
   🔴 30 duplicate dependencies (-20)
   🟡 12 packages missing README (-12)
```

**2. Dependency Auto-Fixer** - Auto-fix dependency issues
```bash
# Show dependency statistics
npx kb-devkit-fix-deps --stats

# ALWAYS use --dry-run first!
npx kb-devkit-fix-deps --remove-unused --dry-run
npx kb-devkit-fix-deps --remove-unused

npx kb-devkit-fix-deps --add-missing       # Add missing workspace deps
npx kb-devkit-fix-deps --align-versions    # Align duplicate versions
npx kb-devkit-fix-deps --all               # Apply all fixes

# Debug mode: see why deps were kept
npx kb-devkit-fix-deps --remove-unused --dry-run --verbose
```

**What it does:**
- ✅ `--stats` - Shows dependency statistics (total deps, top 10 most used)
- ✅ Removes unused dependencies with deep scanning:
  - Scans `src/`, `test/`, `tests/`, `__tests__/`, `scripts/`
  - Checks config files (`tsup.config.ts`, `vitest.config.ts`, etc.)
  - Respects peer dependencies
- ✅ Adds missing workspace dependencies
- ✅ Aligns duplicate dependency versions to most common

**Protected from removal:**
- Build tools: `typescript`, `tsup`, `esbuild`, `vite`, `rollup`, `rimraf`
- Testing: `vitest`, `jest`, `playwright`, `@vitest/*`, `@testing-library/*`
- Linting: `eslint-*`, `@eslint/*`, `@typescript-eslint/*`, `prettier-plugin-*`
- Types: `@types/*`
- Peer dependencies listed in package.json

**Orphan packages detection:**
```bash
# Find packages no other package depends on
npx kb-devkit-fix-deps --orphans

# JSON output for CI
npx kb-devkit-fix-deps --orphans --json
```
- Categorizes orphans: CLI entry points, plugins, external libs, internal (review needed)
- Exits with code 1 if internal orphans found (potential dead code)

**3. CI Combo Tool** - Run all checks in one command
```bash
npx kb-devkit-ci                          # All checks
npx kb-devkit-ci --only=naming,imports    # Specific checks only
npx kb-devkit-ci --skip=exports           # Skip specific checks
npx kb-devkit-ci --json                   # JSON output for CI
```

**4. Build Order Calculator** - Determine correct build order
```bash
npx kb-devkit-build-order                        # Sequential order
npx kb-devkit-build-order --layers               # Parallel build layers
npx kb-devkit-build-order --package=cli-core     # For specific package
npx kb-devkit-build-order --script > build.sh    # Generate build script
```

**What it does:**
- ✅ Builds dependency graph using topological sort (Kahn's algorithm)
- ✅ Shows which packages need to build first
- ✅ Detects circular dependencies
- ✅ Generates parallel build layers (packages in same layer can build together)
- ✅ Creates executable build scripts

**Example output:**
```
📦 Build order for @kb-labs/workflow-runtime:

  1. @kb-labs/cli-contracts
  2. @kb-labs/shared-cli-ui
  3. @kb-labs/core-sys
  ...
 16. @kb-labs/workflow-runtime ⬅ target
```

**5. Command Health Checker** - Verify all CLI commands work
```bash
npx kb-devkit-check-commands              # Check all commands
npx kb-devkit-check-commands --fast       # Quick check
npx kb-devkit-check-commands --timeout=10 # Custom timeout
npx kb-devkit-check-commands --json       # JSON output
```

**What it checks:**
- ✅ Discovers all commands from plugin manifests
- ✅ Tests each command with `--help`
- ✅ Verifies exit codes and output
- ✅ Detects timeouts and broken commands
- ✅ Provides detailed error messages

**6. TypeScript Types Checker** - Ensure all packages generate types
```bash
npx kb-devkit-check-types                 # Check all packages
npx kb-devkit-check-types --fix           # Auto-fix dts: false
npx kb-devkit-check-types --package=cli   # Check specific package
npx kb-devkit-check-types --graph         # Show types dependency graph
```

**What it checks:**
- ✅ Detects `dts: false` in tsup configs (technical debt!)
- ✅ Validates package.json has "types" field
- ✅ Checks if .d.ts files exist in dist/
- ✅ Auto-fixes `dts: false` → `dts: true` with --fix
- ✅ Prevents broken types dependency chains

**Why this matters:**

In a monorepo, TypeScript types form a dependency chain:
```
Project A uses type G from Package B
Package B uses type L from Package M
...
```

If any package in the chain has `dts: false` or missing types, TypeScript compilation breaks for all downstream packages. This tool identifies and fixes those broken chains automatically.

**7. Types Order Calculator** - Calculate correct types generation order
```bash
npx kb-devkit-types-order                        # Sequential types order
npx kb-devkit-types-order --layers               # Parallel generation layers
npx kb-devkit-types-order --package=cli-core     # For specific package
npx kb-devkit-types-order --broken               # Show only broken chains
```

**What it does:**
- ✅ Analyzes which packages import **types** from which other packages
- ✅ Detects broken type chains (imports from packages with `dts: false`)
- ✅ Finds circular type dependencies
- ✅ Determines correct order for .d.ts file generation
- ✅ Shows parallel generation layers

**Difference from build-order:**
- `build-order`: Tracks **runtime** dependencies (what needs to be built first for execution)
- `types-order`: Tracks **type** dependencies (what types are imported for TypeScript compilation)

**Example:**
```
📘 Types generation order for @kb-labs/workflow-runtime:

  1. ✅ @kb-labs/plugin-manifest
  2. ✅ @kb-labs/shared-cli-ui
  3. ✅ @kb-labs/core-types
  ...
 18. ✅ @kb-labs/workflow-runtime ⬅ target
```

### Infrastructure Tools (3)

**1. Repository Sync** - Sync DevKit assets across projects
```bash
npx kb-devkit-sync
npx kb-devkit-sync --check   # Check for drift
npx kb-devkit-sync --force   # Force overwrite
```

**2. Path Aliases Generator** - Generate workspace path aliases
```bash
npx kb-devkit-paths
```

**3. Tsup External Generator** - Generate external dependencies list
```bash
npx kb-devkit-tsup-external --generate
```

### Daily Workflow with DevKit

**Before starting work:**
```bash
# Quick status check
npx kb-devkit-stats

# Check specific package you'll work on
npx kb-devkit-visualize --package cli-core --tree
```

**After making changes:**
```bash
# Validate changes
npx kb-devkit-check-imports --package your-package
npx kb-devkit-check-structure --package your-package
```

**Before committing:**
```bash
# Run all checks
npx kb-devkit-ci

# Or just essentials
npx kb-devkit-ci --only=naming,imports
```

**Weekly cleanup:**
```bash
# 1. View current health
npx kb-devkit-stats --health

# 2. Fix what's safe to fix
npx kb-devkit-fix-deps --remove-unused --dry-run
npx kb-devkit-fix-deps --remove-unused

# 3. Align versions
npx kb-devkit-fix-deps --align-versions

# 4. Run install
pnpm install

# 5. Verify
npx kb-devkit-ci
```

### Best Practices

**DO ✅:**
- **Run `npx kb-devkit-ci` before every commit**
- **Use `--dry-run` before auto-fixing**
- **Check health score weekly**
- **Fix issues incrementally** (don't try to fix everything at once)

**DON'T ❌:**
- **Skip `--dry-run` on `fix-deps`** (might break things!)
- **Ignore circular dependencies** (will cause runtime issues)
- **Run `--align-versions` without review** (might downgrade critical deps)

### Detailed Documentation

For comprehensive usage examples, real-world use cases, CI/CD integration, and troubleshooting:
- **[DevKit README](kb-labs-devkit/README.md)** - Complete tool reference
- **[DevKit Usage Guide](kb-labs-devkit/USAGE_GUIDE.md)** - 7 real-world use cases with examples

## Common Tasks

### Finding Code
```bash
# Find interface definition
pnpm kb mind rag-query --text "What is [InterfaceName]?" --agent

# Find implementation
pnpm kb mind rag-query --text "Where is [feature] implemented?" --agent

# Find usage examples
pnpm kb mind rag-query --text "How to use [component]?" --agent
```

### Understanding Architecture
```bash
# System overview
pnpm kb mind rag-query --text "Explain [system] architecture" --agent

# Design decisions
cat docs/adr/*.md | grep "your topic"

# Or use Mind
pnpm kb mind rag-query --text "What ADRs relate to [topic]?" --agent
```

### Debugging
```bash
# Find error handling
pnpm kb mind rag-query --text "How are [ErrorType] handled?" --agent

# Trace execution flow
pnpm kb mind rag-query --text "What is the flow of [operation]?" --agent
```

## Mind RAG Configuration

### Config File
Location: `.kb/kb.config.json`

```json
{
  "scopes": [
    {
      "id": "default",
      "include": ["**/*.ts", "**/*.tsx", "**/*.md"],
      "exclude": ["**/node_modules/**", "**/dist/**"]
    }
  ]
}
```

### Environment Variables
```bash
# OpenAI API key for embeddings (optional - falls back to deterministic)
export OPENAI_API_KEY=sk-...

# Qdrant URL for remote vector store (optional - uses local by default)
export QDRANT_URL=http://localhost:6333
```

## Architecture Decision Records (ADRs)

Always check ADRs before major changes:

### Recent Important ADRs
- **ADR-0033** - Adaptive Search Weights (2025-11-26)
- **ADR-0032** - Central Index with Local Overlay (2025-11-26)
- **ADR-0031** - Anti-Hallucination System (2025-11-26)
- **ADR-0029** - Agent Query Orchestration (2025-11-26)
- **ADR-0018** - Hybrid Search RRF (earlier)

View all: `ls kb-labs-mind/docs/adr/`

## Mind RAG Performance

### Search Quality Benchmarks (2025-11-26)

| Query Type | Confidence | Status |
|------------|------------|--------|
| EASY (lookup) | 0.63 | ✅ PASS |
| MEDIUM (concept) | 0.78 | ✅ PASS |
| HARD (architecture) | 0.70 | ✅ PASS |
| **Average** | **0.70** | **7.0/10** |

### Search Modes Performance

- **instant**: ~30-40s, 1-2 LLM calls, 500-1000 tokens
- **auto**: ~60s, 3-4 LLM calls, 3000-4000 tokens
- **thinking**: ~60-90s, 4-5 LLM calls, 4000-5000 tokens

## Standard Workflow

Follow this workflow when working with the codebase:

### 1. Discovery Phase
```bash
# Step 1: Use Mind RAG to understand high-level architecture
pnpm kb mind rag-query --text "Explain [feature] architecture" --agent

# Step 2: Get specific file paths and components
pnpm kb mind rag-query --text "Where is [component] implemented?" --agent
```

### 2. Investigation Phase
```bash
# Step 3: Read exact implementation
# Use Read tool with paths from Mind RAG results

# Step 4: Check related ADRs if architectural context needed
cat kb-labs-mind/docs/adr/ADR-00XX-*.md
```

### 3. Implementation Phase
```bash
# Step 5: Make your changes
# Use Edit/Write tools

# Step 6: Build and verify
pnpm --filter @kb-labs/<package> run build
```

### 4. Verification Phase
```bash
# Step 7: Reindex if significant changes
pnpm kb mind rag-index --scope default

# Step 8: Verify changes are discoverable
pnpm kb mind rag-query --text "Where is [new-feature] implemented?" --agent
```

## Best Practices

### DO ✅
- **Use Mind RAG first** - before grep/find for semantic searches
- **Run DevKit CI before every commit** - `npx kb-devkit-ci`
- **Check health score weekly** - `npx kb-devkit-stats --health`
- **Run types audit before refactoring** - `npx kb-devkit-types-audit` to understand type health and impact
- **Use `--dry-run` before auto-fixing** - always preview changes first
- **Check ADRs** before architectural changes
- **Reindex Mind** after significant code changes
- **Run benchmarks** after search improvements
- **Write ADRs** for major decisions
- **Update benchmarks** when adding features
- **Follow the Standard Workflow** - Discovery → Investigation → Implementation → Verification
- **Fix issues incrementally** - don't try to fix everything at once
- **Track type safety metrics** - monitor coverage % and `any` usage trends over time

### DON'T ❌
- **Use grep/find** for semantic searches like "where is X", "how does Y work"
- **Skip Mind RAG** - always search before coding
- **Skip DevKit CI** - always run checks before committing
- **Skip `--dry-run` on `fix-deps`** - might break things!
- **Ignore circular dependencies** - will cause runtime issues
- **Run `--align-versions` without review** - might downgrade critical deps
- **Skip reindexing** after large changes
- **Modify search without benchmarks**
- **Change verification without testing**
- **Commit without building**

## Anti-Patterns

### ❌ Common Mistakes to Avoid

#### 1. Using Grep for Semantic Searches
**Wrong:**
```bash
# DON'T: Use grep to understand code
grep -r "authentication" src/
```

**Right:**
```bash
# DO: Use Mind RAG for semantic understanding
pnpm kb mind rag-query --text "How does authentication work?" --agent
```

#### 2. Skipping Mind RAG Discovery
**Wrong:**
```bash
# DON'T: Jump straight to reading random files
read src/auth.ts
read src/login.ts
read src/user.ts
```

**Right:**
```bash
# DO: Use Mind RAG to find the right entry point
pnpm kb mind rag-query --text "Where is authentication implemented?" --agent
# Then read the specific files it suggests
```

#### 3. Bad Mind RAG Queries
**Wrong queries:**
```bash
# Too vague - will get generic results
pnpm kb mind rag-query --text "function" --agent
pnpm kb mind rag-query --text "class" --agent

# Too specific - use Grep instead
pnpm kb mind rag-query --text "find all TODO comments" --agent
```

**Good queries:**
```bash
# Specific semantic questions
pnpm kb mind rag-query --text "What is the VectorStore interface?" --agent
pnpm kb mind rag-query --text "How does hybrid search combine BM25 and vector results?" --agent
pnpm kb mind rag-query --text "Explain the verification module architecture" --agent
```

#### 4. Forgetting to Reindex
**Wrong:**
```bash
# Make major changes
edit src/new-feature.ts
# Commit and forget to reindex
git commit -m "Add new feature"
# Mind RAG won't find your new code!
```

**Right:**
```bash
# Make changes
edit src/new-feature.ts
# Reindex so Mind RAG knows about it
pnpm kb mind rag-index --scope default
# Now Mind RAG can find your new code
git commit -m "Add new feature"
```

#### 5. Mixing Tools Incorrectly
**Wrong:**
```bash
# Using Mind RAG for exact string matching
pnpm kb mind rag-query --text "find all files with 'TODO:' comment" --agent
```

**Right:**
```bash
# Use Grep for exact strings
grep -r "TODO:" src/
```

### Decision Flowchart

```
Need to find code?
│
├─ Know exact file path? → Use Read
│
├─ Know exact string/pattern? → Use Grep/Glob
│   ├─ "TODO:", "FIXME:", "console.log"
│   ├─ "*.test.ts", "**/*.tsx"
│   └─ Exact error messages
│
└─ Need to understand what/how/where? → Use Mind RAG
    ├─ "Where is [feature] implemented?"
    ├─ "How does [system] work?"
    ├─ "What is [interface/class]?"
    └─ "Explain [architecture]"
```

## Troubleshooting

### Mind RAG Not Finding Results
```bash
# 1. Clear cache
rm -rf .kb/cache/*

# 2. Reindex
pnpm kb mind rag-index --scope default

# 3. Try different query phrasing
# Instead of: "function X"
# Try: "What does X do?" or "Where is X implemented?"
```

### Low Confidence Results
- Use **--mode thinking** for complex queries
- Try **rephrasing** the question as a natural question
- Check if files are **indexed** (look in `.kb/mind/index/`)
- Ensure **OpenAI API key** is set for better embeddings

### Build Errors
```bash
# Clean and rebuild
pnpm --filter <package> run clean
pnpm --filter <package> run build

# Or rebuild all
pnpm run build
```

## Getting Help

### Quick Reference
```bash
# Mind RAG help
pnpm kb mind --help
pnpm kb mind rag-query --help
pnpm kb mind rag-index --help

# View benchmarks
cat kb-labs-mind/packages/mind-engine/BENCHMARKS.md

# View ADRs
ls -la kb-labs-mind/docs/adr/
```

### Learn More
- Mind Engine README: `kb-labs-mind/packages/mind-engine/README.md`
- Orchestrator README: `kb-labs-mind/packages/mind-orchestrator/README.md`
- Benchmarks: `kb-labs-mind/packages/mind-engine/BENCHMARKS.md`
- ADRs: `kb-labs-mind/docs/adr/`

## Important Notes

1. **Always use Mind RAG** - it's the primary way to understand this codebase
2. **Reindex frequently** - keeps search results fresh
3. **Trust the confidence score** - <0.5 means uncertain, ≥0.7 means reliable
4. **Use --agent flag** - provides clean JSON output
5. **Check ADRs** - understand why decisions were made

---

## Mode Selection Guide

Choose the right Mind RAG mode based on your query complexity:

### instant (default)
**When to use:**
- Simple lookup queries: "What is [ClassName]?"
- Finding specific files: "Where is [feature] located?"
- Quick reference checks

**Characteristics:**
- ~30-40s execution
- 1-2 LLM calls
- 500-1000 tokens
- Best for straightforward questions

### auto
**When to use:**
- Medium complexity questions
- Let the system decide the complexity
- Default recommended mode with `--agent`

**Characteristics:**
- ~60s execution
- 3-4 LLM calls
- 3000-4000 tokens
- Balanced performance/quality

### thinking
**When to use:**
- Complex architectural questions
- Multi-step reasoning needed
- Deep analysis: "Explain how [system] works end-to-end"
- Comparing multiple implementations

**Characteristics:**
- ~60-90s execution
- 4-5 LLM calls
- 4000-5000 tokens
- Most thorough analysis

**Recommendation:** Use `--agent` flag without `--mode` - the system will auto-select the optimal mode.

---

## 🤖 CLI Commands for AI Agents

### CLI Command Discovery

**MANDATORY for AI Agents**: Before searching for implementations or guessing commands, ALWAYS check what commands are available.

#### 1. Check Available Commands

```bash
# View all product groups and system commands
pnpm kb --help

# View commands for a specific product/group
pnpm kb <product> --help          # Example: pnpm kb plugins --help
pnpm kb <group> --help             # Example: pnpm kb workflow --help

# View all plugin commands with full syntax
pnpm kb plugins commands

# View detailed help for specific command
pnpm kb <product>:<command> --help
```

#### 2. Use CLI Reference Documentation

The complete CLI reference is maintained in [CLI-REFERENCE.md](./CLI-REFERENCE.md):

```bash
# View CLI reference
cat CLI-REFERENCE.md

# Search for specific commands
grep -i "workflow" CLI-REFERENCE.md

# Use Mind RAG for semantic search
pnpm kb mind rag-query --text "What workflow commands are available?" --agent
```

#### 3. Regenerate CLI Reference (After Changes)

If commands have been added/modified, regenerate the reference:

```bash
pnpm kb docs generate-cli-reference
git add CLI-REFERENCE.md
git commit -m "docs: update CLI reference"
```

### Rules for AI Agents

**DO ✅**:
- **Always run `pnpm kb --help`** before assuming command structure
- **Check `pnpm kb <group> --help`** to see available commands in a group
- **Read CLI-REFERENCE.md** for complete command documentation
- **Use Mind RAG** for semantic search: "What commands exist for X?"
- **Verify flags** with `--help` before using them in examples

**DON'T ❌**:
- **Guess command names** without checking `--help`
- **Assume flags exist** without verification
- **Skip discovery** and jump straight to implementation
- **Use outdated command syntax** from memory

### Example Workflow for Agents

```bash
# Step 1: Discover available commands
pnpm kb --help
# Output: Shows all product groups (ai-docs, plugins, workflow, etc.)

# Step 2: Check specific group
pnpm kb workflow --help
# Output: Shows 16 workflow commands with descriptions

# Step 3: Get detailed help for a command
pnpm kb workflow:run --help
# Output: Shows flags, examples, usage

# Step 4: Use the command correctly
pnpm kb workflow:run --workflow-id my-flow
```

### CLI Reference Integration

The CLI reference is:
- **Auto-generated** from command registry
- **Version controlled** in git (CLI-REFERENCE.md)
- **Searchable** via Mind RAG after reindexing
- **Always up-to-date** when regenerated

**When to regenerate**:
- After adding new commands
- After modifying command flags or descriptions
- Before creating documentation
- After merging command-related PRs

---

## Multi-Tenancy Support

KB Labs now includes built-in multi-tenancy primitives for scaling from single indie developer to enterprise SaaS deployments.

### Overview

**Package:** `@kb-labs/tenant`

**Features:**
- ✅ Tenant types & quotas (free/pro/enterprise)
- ✅ Rate limiting using State Broker (no Redis required)
- ✅ Tenant-aware logging and metrics
- ✅ Backward compatible (defaults to "default" tenant)
- ✅ Scalable to distributed backends

### Quick Start

```typescript
import { TenantRateLimiter, getQuotasForTier } from '@kb-labs/tenant';
import { createStateBroker } from '@kb-labs/state-broker';

// Create rate limiter
const broker = createStateBroker();
const limiter = new TenantRateLimiter(broker);

// Check rate limit
const result = await limiter.checkLimit('acme-corp', 'api');
if (!result.allowed) {
  throw new Error(`Rate limited. Retry after ${result.retryAfterMs}ms`);
}

// Get quotas for tier
const quotas = getQuotasForTier('pro');
console.log(quotas.apiRequestsPerMinute); // 1000
```

### Environment Variables

```bash
KB_TENANT_ID=my-company           # Default tenant (default: "default")
KB_TENANT_DEFAULT_TIER=pro        # Default tier (default: "free")
```

### Key Features

**1. State Broker Tenant Support**
- Key pattern: `tenant:acme:namespace:key`
- Backward compatible: `mind:key` → `tenant:default:mind:key`
- Per-tenant statistics in `broker.getStats()`

**2. Workflow Tenant Tracking**
- `tenantId` field in WorkflowRun and JobRun schemas (optional)
- Passed through ExecutionContext
- Isolated by tenant in state storage

**3. REST API Integration**
- Extract tenant from `X-Tenant-ID` header or env var
- Rate limiting middleware returns HTTP 429 with `Retry-After`
- Prometheus metrics with tenant labels

**4. Observability**
- Logging: `setTenantContext(tenantId, tier)` adds tenant to all logs
- Metrics: `kb_tenant_request_total{tenant="acme"}`, `kb_tenant_request_errors_total{tenant="acme"}`

### Default Quotas

| Tier | API RPM | Workflows/Day | Concurrent | Storage | Retention |
|------|---------|---------------|------------|---------|-----------|
| **free** | 100 | 50 | 2 | 100 MB | 7 days |
| **pro** | 1,000 | 1,000 | 10 | 10 GB | 30 days |
| **enterprise** | 100,000 | 100,000 | 1,000 | 1 TB | 365 days |

### Scalability Path

**Current (Phase 1):**
- InMemory/HTTP State Broker (~1K RPS)
- Single instance deployments
- Perfect for MVP and small teams

**Future (Phase 2+):**
- Redis State Broker backend (100K+ RPS)
- Distributed quota enforcement
- Multi-region support
- Dedicated Redis per enterprise tenant

### Documentation

- **ADR:** [ADR-0015: Multi-Tenancy Primitives](kb-labs-workflow/docs/adr/0015-multi-tenancy-primitives.md)
- **README:** [packages/tenant/README.md](kb-labs-core/packages/tenant/README.md)
- **State Broker:** [packages/state-broker/README.md](kb-labs-core/packages/state-broker/README.md)

### Example: REST API Rate Limiting

```typescript
// middleware/rate-limit.ts
export async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.headers['x-tenant-id'] ?? process.env.KB_TENANT_ID ?? 'default';

  const result = await limiter.checkLimit(tenantId, 'api');

  if (!result.allowed) {
    reply.code(429).header('Retry-After', String(result.retryAfterMs! / 1000));
    return { error: 'Rate limit exceeded' };
  }
}
```

### Example: Workflow Quota Check

```typescript
// workflow-runtime/src/executor.ts
export async function executeWorkflow(run: WorkflowRun) {
  const tenantId = run.tenantId ?? 'default';

  const result = await limiter.checkLimit(tenantId, 'workflow');
  if (!result.allowed) {
    throw new QuotaExceededError(`Tenant ${tenantId} exceeded workflow quota`);
  }

  // Execute workflow...
}
```

---

## Commit Plugin - AI-Powered Commit Generation

KB Labs includes a commit plugin that generates conventional commits using LLM analysis.

### Usage

```bash
# Generate and apply commits (default flow)
pnpm kb commit commit --scope="@kb-labs/package-name"

# Dry run - preview commits without applying
pnpm kb commit commit --scope="@kb-labs/package-name" --dry-run

# Generate and push in one command
pnpm kb commit commit --scope="@kb-labs/package-name" --with-push
```

### Scoping

Always use `--scope` to limit commits to a specific package or path:

```bash
# Scope to specific package
--scope="@kb-labs/mind-engine"

# Scope to path pattern
--scope="packages/core/**"

# Scope to monorepo
--scope="kb-labs-commit-plugin"
```

### How It Works

1. **Phase 1**: Analyzes file changes (additions/deletions/modifications) using LLM
2. **Phase 2**: If confidence is low (<70%), re-analyzes with full diff context
3. **Post-processing**: Validates commit types (e.g., prevents `feat` for deletion-only commits)
4. **Apply**: Creates separate git commits for each logical change group

### Features

- **Conventional Commits**: Generates `feat`, `fix`, `refactor`, `chore`, `docs`, etc.
- **Two-Phase LLM**: Escalates to full diff analysis when needed
- **Secrets Detection**: Blocks commits containing secrets (API keys, tokens, etc.)
- **Scope Support**: Limits changes to specific packages or paths
- **Anti-Hallucination**: Validates LLM output against actual git status

### Example Output

```
Applied commits:
  [ae96418] feat(cli): add chalk dependency to commit-cli
  [cbd2ed6] fix(cli): fix color reference in run command

┌─ Done ─────────────────────────┐
│ Summary                        │
│ Commits:  2                    │
│ Pushed:   No                   │
│ LLM:      Phase 2              │
│ Tokens:   2628                 │
└────────────────────────────────┘
```

### Important Notes

- **Don't use for agent commits**: The commit plugin is for YOUR changes, not for AI agent commits
- **Always use --scope**: Prevents accidentally committing unrelated changes
- **Review before push**: Use `--dry-run` first to preview commits

---

**Last Updated:** 2025-12-16
**Mind RAG Version:** 0.1.0
**Quality Score:** 7.0/10
**DevKit Tools:** 18 (Analysis: 8, Automation: 7, Infrastructure: 3)
**Monorepo Health:** 68/100 (Grade D)
**Type Safety:** 91.1% average coverage, 3,012 type errors across 91 packages
**CLI Reference:** CLI-REFERENCE.md
