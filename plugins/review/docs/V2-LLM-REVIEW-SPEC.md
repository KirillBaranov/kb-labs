# AI Review v2 - LLM Review Architecture Specification

## Overview

This document describes the v2 architecture for LLM-based code review in `@kb-labs/ai-review`. The new architecture solves critical performance and cost issues found in v1.

### Problem Statement (v1)

The current v1 LLM review has fundamental scalability issues:

| Issue | v1 Behavior | Impact |
|-------|-------------|--------|
| N×M calls | 30 files × 3 categories = 90 LLM calls | 10+ min runtime |
| Full file context | Sends entire file content (~500 lines) | High token cost |
| No verification | LLM findings taken as-is | High hallucination rate |
| No batching | Each file analyzed separately | Redundant context |

**Real-world test** (30 files in kb-labs-ai-review):
- Time: 10+ minutes (didn't complete)
- Cost: $0.20+ (incomplete)
- Calls: ~90 LLM calls attempted

### Solution (v2)

A tiered architecture with batch tools, diff-based context, and anti-hallucination verification.

**Target metrics:**
- Time: 30-60 seconds
- Cost: $0.02-0.05
- Calls: 2-3 LLM calls
- Hallucination rate: Tracked and filtered

---

## Tiered Review Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         REVIEW TIERS                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TIER 1: HEURISTIC (default)                                            │
│  ════════════════════════════                                           │
│  • ESLint + built-in rules                                              │
│  • Zero LLM cost                                                        │
│  • Instant (~5-10 sec)                                                  │
│  • Coverage: ~70-80% of common issues                                   │
│  • Use case: CI/CD, pre-commit hooks                                    │
│                                                                          │
│  Command: pnpm kb review:run --mode=heuristic                           │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TIER 2: LLM-LITE (new smart mode)                                      │
│  ═══════════════════════════════════                                    │
│  • Diff-based context (not full files)                                  │
│  • Batch tool calling (not per-file)                                    │
│  • Single-pass LLM analysis                                             │
│  • Anti-hallucination verification                                      │
│  • Cost: $0.02-0.05                                                     │
│  • Time: 30-60 sec                                                      │
│  • Use case: Local development, PR review                               │
│                                                                          │
│  Command: pnpm kb review:run --mode=llm                                 │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TIER 3: LLM-DEEP (rare, manual)                                        │
│  ═══════════════════════════════                                        │
│  • Full file context with batching                                      │
│  • Multi-pass analysis for complex issues                               │
│  • Cross-file dependency analysis                                       │
│  • Cost: $0.10-0.50                                                     │
│  • Time: 2-5 min                                                        │
│  • Use case: Security audit, architecture review                        │
│                                                                          │
│  Command: pnpm kb review:run --mode=deep                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tier Selection Guide

| Scenario | Recommended Tier | Reason |
|----------|-----------------|--------|
| CI pipeline | Tier 1 (heuristic) | Fast, free, catches most issues |
| Pre-commit hook | Tier 1 (heuristic) | Instant feedback |
| PR review | Tier 2 (llm) | Smart analysis, reasonable cost |
| Local development | Tier 2 (llm) | Good balance of depth vs speed |
| Security audit | Tier 3 (deep) | Thorough analysis needed |
| Architecture review | Tier 3 (deep) | Cross-file understanding |

---

## Tier 2: LLM-Lite Architecture (Primary Focus)

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM-LITE REVIEW FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  INPUT                                                                   │
│  ─────                                                                   │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Changed files (from git):                                          │ │
│  │                                                                    │ │
│  │ - packages/review-cli/src/commands/run.ts (+45/-12, modified)     │ │
│  │ - packages/review-core/src/orchestrator.ts (+23/-8, modified)     │ │
│  │ - packages/review-llm/src/analyzer.ts (+120/-0, new file)         │ │
│  │ - packages/review-llm/src/tools.ts (+85/-0, new file)             │ │
│  │ ... (26 more files)                                                │ │
│  │                                                                    │ │
│  │ Task context: "Adding LLM review with tool-based context"          │ │
│  │ Repos: kb-labs-ai-review                                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  LLM + BATCH TOOLS                                                       │
│  ─────────────────                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  Turn 1: LLM receives file list, selects suspicious files          │ │
│  │          → Calls get_diffs(["run.ts", "orchestrator.ts", ...])    │ │
│  │                                                                    │ │
│  │  Turn 2: LLM analyzes diffs, optionally requests more context      │ │
│  │          → Calls get_file_chunks([...]) if needed                 │ │
│  │                                                                    │ │
│  │  Turn 3: LLM reports all findings                                  │ │
│  │          → Calls report_findings([...])                           │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  ANTI-HALLUCINATION VERIFICATION                                         │
│  ───────────────────────────────                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  For each finding:                                                 │ │
│  │  • Verify file exists in changed files                             │ │
│  │  • Verify line number is in bounds                                 │ │
│  │  • Verify line is in diff (actually changed)                       │ │
│  │  • Fuzzy-match code snippet against actual code                    │ │
│  │  • Validate context coherence                                      │ │
│  │                                                                    │ │
│  │  Score 0.0-1.0 → KEEP / DOWNGRADE / DISCARD                       │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  OUTPUT                                                                  │
│  ──────                                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Verified findings:                                                 │ │
│  │                                                                    │ │
│  │ ✅ run.ts:42 - Missing input validation (score: 0.92)             │ │
│  │ ✅ orchestrator.ts:78 - Unhandled promise rejection (score: 0.85) │ │
│  │ ⚠️  analyzer.ts:15 - Potential memory leak (score: 0.55)          │ │
│  │    → Downgraded: high → medium                                     │ │
│  │                                                                    │ │
│  │ Discarded (hallucinations): 2                                      │ │
│  │ Hallucination rate: 15%                                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Batch Tools Definition

The key innovation is **batch tools** that process multiple files per call:

```typescript
/**
 * Tools for LLM-Lite review mode
 */
export const llmLiteTools = [
  {
    name: 'get_diffs',
    description: `Get git diffs for multiple files at once.
Use this to see what changed in files that look suspicious.
Select files based on: file names, change size (+lines/-lines), whether new/modified.
Prefer files most likely to have issues (security-sensitive, complex logic, etc).`,
    parameters: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 15,
          description: 'File paths from the list (max 15 per call)'
        }
      },
      required: ['files']
    }
  },

  {
    name: 'get_file_chunks',
    description: `Get specific portions of files when diff alone isn't enough.
Use when you need to see:
- Code around a suspicious change (function context)
- Definition that a change references
- Import statements to understand dependencies
Use sparingly - prefer analyzing diffs first.`,
    parameters: {
      type: 'object',
      properties: {
        requests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              startLine: { type: 'integer', description: 'Start line (1-indexed)' },
              endLine: { type: 'integer', description: 'End line (max startLine + 100)' }
            },
            required: ['file']
          },
          maxItems: 5,
          description: 'Chunk requests (max 5 total across all calls)'
        }
      },
      required: ['requests']
    }
  },

  {
    name: 'report_findings',
    description: `Report all code review findings. Call once when done analyzing.
Only report actual issues found in the code you reviewed - not hypotheticals.
Include specific line numbers from the diffs you analyzed.
Provide code snippets to help with verification.`,
    parameters: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string', description: 'File path' },
              line: { type: 'integer', description: 'Line number (from diff)' },
              endLine: { type: 'integer', description: 'End line for ranges (optional)' },
              severity: {
                type: 'string',
                enum: ['blocker', 'high', 'medium', 'low', 'info']  // Fixed - standard severities
              },
              category: {
                type: 'string',
                // DYNAMIC - populated from .kb/ai-review/rules/ directory
                // enum: discoveredCategories  // e.g., ['security', 'naming', 'architecture', ...]
                description: 'Category from project rules (see list in system prompt)'
              },
              message: { type: 'string', description: 'Clear description of the issue' },
              suggestion: { type: 'string', description: 'How to fix (optional)' },
              codeSnippet: { type: 'string', description: 'Problematic code from diff' }
            },
            required: ['file', 'line', 'severity', 'category', 'message']
          }
        },
        summary: {
          type: 'string',
          description: 'Brief summary of review findings'
        }
      },
      required: ['findings']
    }
  }
];

/**
 * Build tools with dynamic category enum
 */
function buildReportFindingsTool(validCategories: string[]): ToolDefinition {
  return {
    name: 'report_findings',
    description: `Report all code review findings...`,
    parameters: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              // ... other fields ...
              category: {
                type: 'string',
                enum: validCategories,  // Dynamic from rules directory!
                description: `Category must be one of: ${validCategories.join(', ')}`
              },
            }
          }
        }
      }
    }
  };
}
```

### Tool Limits & Budgets

To prevent runaway costs and infinite loops:

| Limit | Value | Reason |
|-------|-------|--------|
| `get_diffs` max files | 15 per call | Context window management |
| `get_diffs` max calls | 2 total | Prevent over-fetching |
| `get_file_chunks` max chunks | 5 total | Full files are expensive |
| `get_file_chunks` max lines | 100 per chunk | Limit context per request |
| Max turns | 5 | Prevent infinite loops |
| Total context budget | 100K tokens | Stay within model limits |
| Diff truncation | 500 lines per file | Very large diffs are rarely useful |

---

## Anti-Hallucination Verification

### Why Verification is Critical

LLMs can hallucinate findings:
- Reference files that don't exist
- Cite line numbers outside file bounds
- Describe code that isn't there
- Invent issues based on file names alone
- **Use invalid enum values** (e.g., `severity: "critical"` instead of `"blocker"`)
- **Invent categories** (e.g., `category: "bug"` instead of `"correctness"`)

### Verification Checks

```typescript
interface VerificationChecks {
  // Schema validation
  severityValid: boolean;   // Is severity in allowed enum?
  categoryValid: boolean;   // Is category in allowed enum?

  // Content validation
  fileExists: boolean;      // Is file in our changed files list?
  lineInBounds: boolean;    // Is line within file length?
  lineInDiff: boolean;      // Is line actually in the changed code?
  snippetMatch: number;     // 0.0-1.0 fuzzy match score
  contextValid: boolean;    // Does issue make sense for this file?
}
```

### Enum Validation (Pre-Scoring)

Before scoring, validate and normalize enum values:

```typescript
// Severities are fixed (standard across all projects)
const VALID_SEVERITIES = ['blocker', 'high', 'medium', 'low', 'info'] as const;

const SEVERITY_ALIASES: Record<string, typeof VALID_SEVERITIES[number]> = {
  'critical': 'blocker',
  'error': 'high',
  'warning': 'medium',
  'warn': 'medium',
  'minor': 'low',
  'trivial': 'info',
  'suggestion': 'info',
  'hint': 'info',
};

// Categories are DYNAMIC - discovered from config, not hardcoded
//
// Source of truth: .kb/kb.config.json
// ```json
// {
//   "adapters": {
//     "ai-review": {
//       "review": {
//         "presetsDir": "ai-review/presets",
//         "rulesDir": "ai-review/rules"    // ← Categories come from here
//       }
//     }
//   }
// }
// ```
//
// Each subdirectory in rulesDir = valid category

/**
 * Discover valid categories from config-defined rules directory
 *
 * Uses useConfig() from @kb-labs/sdk to get config values
 *
 * @example
 * // In command handler:
 * const config = await useConfig<ReviewConfig>();
 * const categories = await discoverCategories(ctx.cwd, config);
 *
 * .kb/ai-review/rules/
 *   ├── security/        → "security"
 *   ├── naming/          → "naming"
 *   ├── architecture/    → "architecture"
 *   ├── consistency/     → "consistency"
 *   ├── performance/     → "performance"
 *   └── testing/         → "testing"
 *
 * Result: ['security', 'naming', 'architecture', 'consistency', 'performance', 'testing']
 */
import { useConfig } from '@kb-labs/sdk';

interface ReviewConfig {
  rulesDir?: string;      // Default: 'ai-review/rules'
  presetsDir?: string;    // Default: 'ai-review/presets'
  defaultPreset?: string;
}

async function discoverCategories(cwd: string): Promise<string[]> {
  // Use SDK's useConfig to get review config from kb.config.json
  const config = await useConfig<ReviewConfig>();

  // Get rulesDir from config (with fallback)
  const rulesDir = config?.rulesDir ?? 'ai-review/rules';
  const kbDir = path.join(cwd, '.kb');
  const fullPath = path.join(kbDir, rulesDir);

  // Check if rules directory exists
  if (!await fs.access(fullPath).then(() => true).catch(() => false)) {
    console.warn(`[CategoryValidator] Rules directory not found: ${fullPath}`);
    return [];
  }

  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name);
}

// Category aliases map common LLM outputs to actual category names
// Built dynamically based on discovered categories
function buildCategoryAliases(validCategories: string[]): Record<string, string> {
  const aliases: Record<string, string> = {};

  // Common patterns that map to standard categories (if they exist)
  const commonMappings: Record<string, string[]> = {
    'security': ['sec', 'vulnerability', 'injection', 'auth', 'authentication', 'authorization'],
    'performance': ['perf', 'speed', 'memory', 'optimization'],
    'architecture': ['design', 'structure', 'pattern', 'patterns'],
    'naming': ['names', 'conventions', 'identifiers'],
    'consistency': ['style', 'formatting', 'code-style'],
    'testing': ['test', 'tests', 'coverage'],
    'correctness': ['bug', 'bugs', 'logic', 'error', 'errors'],
    'maintainability': ['readability', 'complexity', 'code-quality'],
  };

  for (const category of validCategories) {
    // Add the category itself (lowercase normalization)
    aliases[category.toLowerCase()] = category;

    // Add common aliases if this category exists
    const categoryAliases = commonMappings[category.toLowerCase()];
    if (categoryAliases) {
      for (const alias of categoryAliases) {
        aliases[alias] = category;
      }
    }
  }

  return aliases;
}

function normalizeEnum<T extends string>(
  value: string,
  validValues: readonly T[],
  aliases: Record<string, T>
): { valid: boolean; normalized: T | null } {
  const lower = value.toLowerCase().trim();

  // Direct match
  if (validValues.includes(lower as T)) {
    return { valid: true, normalized: lower as T };
  }

  // Alias match
  if (aliases[lower]) {
    return { valid: true, normalized: aliases[lower] };
  }

  // Invalid - LLM hallucinated
  return { valid: false, normalized: null };
}

/**
 * CategoryValidator - initialized once per review session
 *
 * Reads categories from .kb/ai-review/rules/ directory structure
 * No hardcoded categories - fully dynamic per project
 *
 * Uses useConfig() internally to get rulesDir from kb.config.json
 */
class CategoryValidator {
  private validCategories: string[] = [];
  private categoryAliases: Record<string, string> = {};
  private defaultCategory: string = 'other';  // Fallback if no categories found

  /**
   * Initialize validator - discovers categories from config-defined rules directory
   *
   * @param cwd - Project root directory (ctx.cwd from command handler)
   */
  async init(cwd: string): Promise<void> {
    this.validCategories = await discoverCategories(cwd);

    if (this.validCategories.length === 0) {
      // No rules directory - allow anything but track it
      console.warn('[CategoryValidator] No categories found in rules directory');
      return;
    }

    this.categoryAliases = buildCategoryAliases(this.validCategories);
    this.defaultCategory = this.validCategories[0];  // Use first category as default
  }

  validate(category: string): { valid: boolean; normalized: string } {
    if (this.validCategories.length === 0) {
      // No validation possible - accept but mark as unvalidated
      return { valid: false, normalized: category };
    }

    const lower = category.toLowerCase().trim();

    // Direct match against discovered categories
    if (this.validCategories.includes(lower)) {
      return { valid: true, normalized: lower };
    }

    // Check aliases
    if (this.categoryAliases[lower]) {
      return { valid: true, normalized: this.categoryAliases[lower] };
    }

    // Invalid category - LLM hallucinated
    return { valid: false, normalized: this.defaultCategory };
  }

  getValidCategories(): string[] {
    return [...this.validCategories];
  }
}

/**
 * Usage example in command handler:
 *
 * ```typescript
 * import { defineCommand, useConfig, type PluginContextV3 } from '@kb-labs/sdk';
 *
 * export default defineCommand({
 *   id: 'review:run',
 *   handler: {
 *     async execute(ctx: PluginContextV3, input) {
 *       // Initialize category validator (reads config via useConfig internally)
 *       const categoryValidator = new CategoryValidator();
 *       await categoryValidator.init(ctx.cwd);
 *
 *       // Get valid categories for LLM prompt
 *       const validCategories = categoryValidator.getValidCategories();
 *       // → ['security', 'naming', 'architecture', 'consistency', ...]
 *
 *       // Build tools with dynamic category enum
 *       const tools = buildReportFindingsTool(validCategories);
 *
 *       // ... LLM review logic ...
 *
 *       // Validate each finding from LLM
 *       for (const rawFinding of llmFindings) {
 *         const validated = validateFinding(rawFinding, categoryValidator);
 *         if (validated) {
 *           verifiedFindings.push(validated);
 *         }
 *       }
 *     }
 *   }
 * });
 * ```
 */

// Usage in validateFinding:
function validateFinding(
  finding: RawFinding,
  categoryValidator: CategoryValidator
): ValidatedFinding | null {
  const severityResult = normalizeEnum(finding.severity, VALID_SEVERITIES, SEVERITY_ALIASES);
  const categoryResult = categoryValidator.validate(finding.category);

  // If both enums are invalid, discard immediately (don't even score)
  if (!severityResult.valid && !categoryResult.valid) {
    return null;  // Complete hallucination
  }

  return {
    ...finding,
    severity: severityResult.normalized ?? 'medium',
    category: categoryResult.normalized,
    _enumsNormalized: {
      severityOriginal: finding.severity,
      severityValid: severityResult.valid,
      categoryOriginal: finding.category,
      categoryValid: categoryResult.valid,
    }
  };
}
```

### Dynamic Categories - Key Points

1. **No hardcoded categories** - Categories come from `.kb/ai-review/rules/` subdirectories
2. **Per-project customization** - Each project can have different categories
3. **Alias system** - Common LLM outputs map to actual categories (if they exist)
4. **Graceful fallback** - If category doesn't exist, use first available or `other`

**Example: Custom company categories**

```
.kb/ai-review/rules/
  ├── compliance/         # GDPR, SOC2, HIPAA rules
  ├── internal-api/       # Company API conventions
  ├── mobile/             # Mobile-specific rules
  ├── accessibility/      # A11y rules
  └── observability/      # Logging, metrics, tracing
```

LLM prompt includes valid categories:

```
Categories you MUST use (from project rules):
- compliance
- internal-api
- mobile
- accessibility
- observability

Do NOT invent other categories.
```

### Scoring System

```typescript
function calculateVerificationScore(checks: VerificationChecks): number {
  let score = 0;

  // Schema validation (0.15 total)
  if (checks.severityValid) score += 0.075;
  if (checks.categoryValid) score += 0.075;

  // Content validation (0.85 total)
  if (checks.fileExists) score += 0.2;
  if (checks.lineInBounds) score += 0.15;
  if (checks.lineInDiff) score += 0.2;
  score += checks.snippetMatch * 0.2;  // 0.0-0.2
  if (checks.contextValid) score += 0.1;

  return score;  // 0.0-1.0
}
```

**Score breakdown:**
| Check | Weight | Description |
|-------|--------|-------------|
| `severityValid` | 0.075 | Severity is valid enum or known alias |
| `categoryValid` | 0.075 | Category is valid enum or known alias |
| `fileExists` | 0.2 | File is in our changed files list |
| `lineInBounds` | 0.15 | Line number within file length |
| `lineInDiff` | 0.2 | Line is in actual changed code |
| `snippetMatch` | 0.0-0.2 | Fuzzy match of code snippet |
| `contextValid` | 0.1 | Issue makes sense for file type |

### Action Thresholds

| Score | Action | Description |
|-------|--------|-------------|
| ≥ 0.7 | **KEEP** | High confidence, finding is valid |
| 0.4-0.7 | **DOWNGRADE** | Uncertain, reduce severity by one level |
| < 0.4 | **DISCARD** | Likely hallucination, remove from results |

### Snippet Matching Algorithm

```typescript
/**
 * Fuzzy match snippet against file content around target line.
 *
 * IMPORTANT: Don't normalize whitespace inside strings/regex!
 * Use multi-strategy matching instead.
 */
function fuzzyMatchSnippet(
  snippet: string | undefined,
  fileContent: string,
  targetLine: number
): number {
  if (!snippet) return 0.5;  // No snippet = neutral score

  const lines = fileContent.split('\n');
  const windowSize = 5;  // Check ±5 lines around target

  const start = Math.max(0, targetLine - windowSize - 1);
  const end = Math.min(lines.length, targetLine + windowSize);
  const window = lines.slice(start, end).join('\n');

  // Strategy 1: Exact substring match (preserves strings/regex)
  if (window.includes(snippet)) {
    return 1.0;
  }

  // Strategy 2: Line-trimmed match (handles indentation differences)
  const trimmedSnippet = snippet.split('\n').map(l => l.trim()).join('\n');
  const trimmedWindow = window.split('\n').map(l => l.trim()).join('\n');
  if (trimmedWindow.includes(trimmedSnippet)) {
    return 0.95;
  }

  // Strategy 3: Single-line collapsed (only for single-line snippets)
  if (!snippet.includes('\n')) {
    const normalizedSnippet = normalizeCodeLine(snippet);
    for (const line of lines.slice(start, end)) {
      if (normalizeCodeLine(line).includes(normalizedSnippet)) {
        return 0.9;
      }
    }
  }

  // Strategy 4: Token-based partial match (fallback)
  const snippetTokens = extractIdentifiers(snippet);
  const windowTokens = new Set(extractIdentifiers(window));
  const matchedTokens = snippetTokens.filter(t => windowTokens.has(t));

  const tokenScore = matchedTokens.length / Math.max(snippetTokens.length, 1);
  return tokenScore * 0.8;  // Max 0.8 for token-only match
}

/**
 * Normalize a single line of code for comparison.
 * Only collapses whitespace OUTSIDE of strings.
 */
function normalizeCodeLine(line: string): string {
  // Simple approach: collapse whitespace but preserve string content
  // by replacing strings with placeholders first
  const strings: string[] = [];
  let normalized = line.replace(
    /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g,  // Match strings
    (match) => {
      strings.push(match);
      return `__STR${strings.length - 1}__`;
    }
  );

  // Collapse whitespace outside strings
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Restore strings
  strings.forEach((str, i) => {
    normalized = normalized.replace(`__STR${i}__`, str);
  });

  return normalized;
}

/**
 * Extract identifiers from code for token matching.
 */
function extractIdentifiers(code: string): string[] {
  // Match variable names, function names, etc.
  // Excludes keywords, numbers, operators
  const matches = code.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];

  // Filter out common keywords
  const keywords = new Set([
    'const', 'let', 'var', 'function', 'class', 'if', 'else', 'for', 'while',
    'return', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
    'throw', 'new', 'this', 'true', 'false', 'null', 'undefined', 'typeof',
  ]);

  return matches.filter(m => !keywords.has(m) && m.length > 1);
}
```

**Match strategies (in order of confidence):**

| Strategy | Score | Use case |
|----------|-------|----------|
| Exact substring | 1.0 | Perfect match including whitespace |
| Line-trimmed | 0.95 | Indentation differences only |
| Single-line normalized | 0.9 | Single line with minor formatting |
| Token-based | 0.0-0.8 | Fallback - identifier overlap |

### Context Validation Examples

```typescript
function validateContext(finding: Finding, file: FileContext): boolean {
  // SQL injection in a file with no DB imports?
  if (finding.category === 'security' &&
      finding.message.toLowerCase().includes('sql') &&
      !file.imports.some(i => i.includes('sql') || i.includes('database'))) {
    return false;
  }

  // XSS in a backend-only file?
  if (finding.message.toLowerCase().includes('xss') &&
      !file.path.includes('component') &&
      !file.path.includes('page') &&
      !file.imports.some(i => i.includes('react') || i.includes('vue'))) {
    return false;
  }

  return true;
}
```

---

## System Prompt Design

### Initial Context Template

```typescript
function buildInitialPrompt(
  files: FileSummary[],
  taskContext?: string,
  repoScope?: string[]
): string {
  const fileList = files.map(f => {
    const stats = `+${f.additions}/-${f.deletions}`;
    const status = f.isNewFile ? 'new file' : 'modified';
    return `- ${f.path} (${stats}, ${status})`;
  }).join('\n');

  return `You are a code reviewer analyzing changes in a codebase.

## Files Changed (${files.length} files)

${fileList}

${taskContext ? `## Task Context\n${taskContext}\n` : ''}
${repoScope?.length ? `## Repository Scope\n${repoScope.join(', ')}\n` : ''}

## Instructions

1. Review the file list and identify files most likely to have issues:
   - Security-sensitive files (auth, crypto, input handling)
   - Files with large changes (+50 lines)
   - New files (need thorough review)
   - Core business logic

2. Use get_diffs() to fetch diffs for suspicious files (max 15 per call)

3. Analyze the diffs for:
   - Security vulnerabilities (injection, auth bypass, etc.)
   - Logic errors and edge cases
   - Performance issues
   - Code quality problems

4. If you need more context around a change, use get_file_chunks()

5. Report all findings using report_findings()

Focus on ACTUAL issues in the changed code, not hypothetical problems.
Include specific line numbers and code snippets from the diffs you reviewed.`;
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Diff Provider** (`packages/review-core/src/diff-provider.ts`)
   - Get git diff for specific files
   - Parse diff to extract changed line numbers
   - Support both staged and unstaged changes

2. **Tool Executor** (`packages/review-llm/src/tool-executor.ts`)
   - Execute batch tools (get_diffs, get_file_chunks)
   - Enforce limits and budgets
   - Track token usage

3. **Verification Engine** (`packages/review-llm/src/verification.ts`)
   - Implement all verification checks
   - Scoring system
   - Action determination (keep/downgrade/discard)

### Phase 2: LLM Integration

4. **LLM-Lite Analyzer** (`packages/review-llm/src/llm-lite-analyzer.ts`)
   - Build initial prompt with file list
   - Handle tool calling loop
   - Collect and verify findings

5. **Orchestrator Update** (`packages/review-core/src/orchestrator.ts`)
   - Add `llm` mode support
   - Route to LLM-Lite analyzer
   - Merge with heuristic findings

### Phase 3: CLI & Testing

6. **CLI Updates** (`packages/review-cli/src/commands/run.ts`)
   - Update mode choices: `heuristic`, `llm`, `deep`
   - Add `--budget` flag for cost limits
   - Show verification stats in output

7. **Testing & Benchmarks**
   - Unit tests for verification logic
   - Integration tests with mock LLM
   - Benchmark against v1 (time, cost, accuracy)

---

## Metrics & Observability

### Output Metadata

```typescript
interface ReviewMetadata {
  // Existing
  analyzedFiles: number;
  engines: string[];

  // New for v2
  llmCalls: number;
  toolCalls: {
    get_diffs: number;
    get_file_chunks: number;
    report_findings: number;
  };
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  estimatedCost: number;  // USD
  verification: {
    rawFindings: number;
    verified: number;
    downgraded: number;
    discarded: number;
    hallucinationRate: number;  // 0.0-1.0
  };
  timing: {
    total: number;      // ms
    llmTime: number;    // ms
    verifyTime: number; // ms
  };
}
```

### Example Output

```
┌── Code Review ───────────────────────────────────────────┐
│                                                          │
│ Summary                                                  │
│ Files: 30                                                │
│ Findings: 5                                              │
│ Task: Adding LLM review with tool-based context          │
│ Repos: kb-labs-ai-review                                 │
│ High: 2                                                  │
│ Medium: 2                                                │
│ Low: 1                                                   │
│ Engines: eslint, llm-lite                                │
│                                                          │
│ LLM Stats                                                │
│ Calls: 3                                                 │
│ Tokens: 4,521 (in: 3,200, out: 1,321)                   │
│ Cost: $0.03                                              │
│                                                          │
│ Verification                                             │
│ Raw findings: 7                                          │
│ Verified: 4 (57%)                                        │
│ Downgraded: 1 (14%)                                      │
│ Discarded: 2 (29%) ← hallucination rate                 │
│                                                          │
│ Findings                                                 │
│ [HIGH] run.ts:42 - Missing input validation              │
│ [HIGH] orchestrator.ts:78 - Unhandled promise rejection  │
│ [MEDIUM] analyzer.ts:15 - Potential memory leak          │
│ [MEDIUM] tools.ts:33 - Unused variable                   │
│ [LOW] utils.ts:8 - Consider using const                  │
│                                                          │
└────────────────────────────────────────────────────────┘
                                                    45.2s
```

---

## Comparison: v1 vs v2

| Metric | v1 (current) | v2 (llm-lite) | Improvement |
|--------|--------------|---------------|-------------|
| LLM calls | 90 (30×3) | 2-3 | **30-45x fewer** |
| Tool calls | 0 | 3-5 | N/A |
| Time | 10+ min | 30-60 sec | **10-20x faster** |
| Cost | $0.20+ | $0.02-0.05 | **4-10x cheaper** |
| Context | Full files | Diffs only | **10x smaller** |
| Hallucination tracking | None | Full verification | **New capability** |
| False positives | High (unverified) | Low (filtered) | **Significant** |

---

## Future Enhancements

### Tier 3: LLM-Deep

- Full file context with intelligent batching
- Cross-file analysis (call graphs, data flow)
- Multi-pass review (security → architecture → performance)
- Caching of file analysis for incremental reviews

### Caching & Incremental Review

- Cache diff analysis results
- Only re-analyze changed hunks
- Reuse verification for unchanged findings

### Custom Rules Integration

- User-defined review rules in config
- Project-specific patterns to check
- Integration with `.kb/ai-review/rules/`

---

## References

- [commit-plugin lazy loading pattern](../../../kb-labs-commit-plugin/packages/commit-core/src/generator/llm-prompt.ts)
- [Mind RAG anti-hallucination](../../../kb-labs-mind/docs/adr/0031-anti-hallucination-system.md)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
