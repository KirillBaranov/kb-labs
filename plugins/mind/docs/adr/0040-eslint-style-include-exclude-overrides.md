# ADR-0040: ESLint-Style Include/Exclude Overrides for Mind RAG Indexing

**Date:** 2025-12-11
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-12-11
**Tags:** [configuration, testing, developer-experience, indexing]

## Context

Mind RAG indexing uses a **multi-source architecture** for flexibility:

```json
{
  "sources": [
    {
      "id": "codebase",
      "kind": "code",
      "paths": ["kb-labs-*/packages/**/*.ts"],
      "exclude": ["**/node_modules/**", "**/dist/**"]
    },
    {
      "id": "docs",
      "kind": "docs",
      "paths": ["docs/**/*.md"]
    }
  ],
  "scopes": [
    {
      "id": "default",
      "sources": ["codebase", "docs"]
    }
  ]
}
```

This architecture supports diverse indexing scenarios:
- **Code repositories** (TypeScript, JavaScript)
- **Documentation** (Markdown, MDX)
- **External sources** (ClickUp, Jira, Git history) via future adapters

### Problem: Testing and Debugging

During development, full indexing is impractical:
- **2363 files** discovered from default config (~9 MB)
- **30-60 seconds** to index entire codebase
- **Slow feedback loop** when testing changes to chunking, embeddings, or search

Developers need to:
1. Test on **single small file** to verify config changes work
2. Debug indexing pipeline without waiting for full scan
3. Quick iteration on file discovery, chunking, embedding logic

**Prior Art:**
- ESLint uses `--ext .js,.ts` to override file patterns
- Prettier uses `--ignore-path` for custom ignore rules
- TypeScript uses `--include`/`--exclude` flags

We wanted similar **temporary override** capability for Mind indexing.

## Decision

Implement **ESLint-style `--include` and `--exclude` flags** that override `paths` and `exclude` in ALL sources:

### Command Syntax

```bash
# Override paths in all sources to index only one file
pnpm kb mind rag-index --include "/tmp/test-file.md"

# Override paths AND exclude
pnpm kb mind rag-index --include "**/*.ts" --exclude "node_modules,dist,test"

# Normal indexing (no overrides)
pnpm kb mind rag-index
```

### Override Behavior

When `--include` or `--exclude` provided:

1. **Clone config** from `useConfig()` (IPC-loaded config)
2. **Override sources**: Map over ALL sources, replace `paths` and `exclude`:

```typescript
effectiveConfig.sources = effectiveConfig.sources.map((source) => ({
  ...source,
  paths: options.include ? [options.include] : source.paths,
  exclude: options.exclude ? options.exclude.split(',') : source.exclude,
}));
```

3. **Pass modified config** to `createMindKnowledgeRuntime({ config: effectiveConfig })`

**Result:** All sources (codebase, docs, future sources) use the same overridden patterns.

### Example: Before and After

**Original Config:**
```json
{
  "sources": [
    { "id": "codebase", "paths": ["kb-labs-*/packages/**/*.ts"], "exclude": ["**/dist/**"] },
    { "id": "docs", "paths": ["docs/**/*.md"] }
  ]
}
```

**After `--include "/tmp/test.md" --exclude "node_modules":`**
```json
{
  "sources": [
    { "id": "codebase", "paths": ["/tmp/test.md"], "exclude": ["node_modules"] },
    { "id": "docs", "paths": ["/tmp/test.md"], "exclude": ["node_modules"] }
  ]
}
```

**Indexing Result:**
- **2 files found** (same file matched by both sources)
- **6 chunks created** (from single test file)
- **~2 seconds** total time (vs. 30-60s for full index)

## Consequences

### Positive

✅ **Fast testing workflow**: Index single file in 2s instead of 60s (30x faster)
✅ **Familiar UX**: Same pattern as ESLint, Prettier, TypeScript (`--include`/`--exclude`)
✅ **Source-agnostic**: Works with any future source type (ClickUp, Jira, Git)
✅ **Non-destructive**: Does not modify `kb.config.json` on disk, only in-memory
✅ **Flexible**: Can use glob patterns (`**/*.ts`), absolute paths (`/tmp/file.md`), or relative paths
✅ **Debug-friendly**: Verify config modification via logs before actual indexing

### Negative

⚠️ **Not source-specific**: Cannot override only "codebase" source, affects ALL sources
⚠️ **Simple override**: No merge semantics (fully replaces paths/exclude)
⚠️ **Testing-focused**: Not intended for production use, primarily for development

### Alternatives Considered

#### Alternative 1: Temporary Source Creation ❌

Create a temporary `__test__` source:

```typescript
if (options.include) {
  effectiveConfig.sources = [
    { id: '__test__', paths: [options.include], exclude: options.exclude?.split(',') }
  ];
  effectiveConfig.scopes = [{ id: 'test', sources: ['__test__'] }];
}
```

**Rejected:** Would require modifying scopes to reference `__test__` source, breaks existing scope references.

#### Alternative 2: Config File Duplication ❌

Create `.kb/kb.config.test.json` with minimal config:

```bash
pnpm kb mind rag-index --config .kb/kb.config.test.json
```

**Rejected:** Requires maintaining separate config files, harder to keep in sync with main config.

#### Alternative 3: Scope-level Include/Exclude ❌

Add `include`/`exclude` fields to scope definitions:

```json
{
  "scopes": [
    { "id": "default", "sources": ["codebase"], "include": ["**/*.ts"] }
  ]
}
```

**Rejected:**
- Not part of standard scope schema
- Unclear semantics (merge with source paths or replace?)
- Would require schema changes across the board

## Implementation

### Files Modified

**`kb-labs-mind/packages/mind-cli/src/application/rag.ts`** (lines 88-136):

```typescript
// If include/exclude provided, override paths in all sources (ESLint-style)
let effectiveConfig = options.config;
if (options.include || options.exclude) {
  console.log('[runRagIndex] Overriding sources with include/exclude', {
    include: options.include,
    exclude: options.exclude
  });

  // Clone config from useConfig() or load from file
  let knowledgeConfig = effectiveConfig;
  if (!knowledgeConfig) {
    // Fallback: load from file if useConfig() didn't provide config
    const { findNearestConfig, readJsonWithDiagnostics } = await import('@kb-labs/sdk');
    const { path: configPath } = await findNearestConfig({
      startDir: options.cwd,
      filenames: ['.kb/kb.config.json', 'kb.config.json'],
    });
    if (configPath) {
      const result = await readJsonWithDiagnostics(configPath);
      if (result.ok) {
        const rawConfig = result.data as any;
        knowledgeConfig = rawConfig.profiles?.[0]?.products?.mind ?? rawConfig;
      }
    }
  }

  // Override paths/exclude in ALL sources (ESLint-style override)
  if (knowledgeConfig?.sources && Array.isArray(knowledgeConfig.sources)) {
    console.log('[runRagIndex] Original sources count:', knowledgeConfig.sources.length);
    knowledgeConfig = { ...knowledgeConfig };
    knowledgeConfig.sources = knowledgeConfig.sources.map((source: any) => {
      const overriddenSource = { ...source };

      // --include overrides paths
      if (options.include) {
        overriddenSource.paths = [options.include];
      }

      // --exclude overrides exclude
      if (options.exclude) {
        overriddenSource.exclude = options.exclude.split(',').map(s => s.trim());
      }

      return overriddenSource;
    });
    console.log('[runRagIndex] Overridden sources:', JSON.stringify(knowledgeConfig.sources, null, 2));
    effectiveConfig = knowledgeConfig;
  }
}

console.log('[runRagIndex] Passing config to createMindKnowledgeRuntime:',
  effectiveConfig ? 'CUSTOM CONFIG' : 'undefined (will load from file)');

const runtime = await createMindKnowledgeRuntime({
  cwd: options.cwd,
  config: effectiveConfig, // ← Pass modified config
  // ...
});
```

**`kb-labs-mind/packages/mind-cli/src/cli/commands/rag-index.ts`** (lines 60-88):

```typescript
// Get Mind config using useConfig() helper (auto-detects 'mind' from manifest.configSection)
const mindConfig = await useConfig();

// Pass mindConfig to runRagIndex (will be modified if --include/--exclude provided)
const result = await runRagIndex({
  cwd,
  scopeId,
  include,
  exclude,
  config: mindConfig, // ← Pass config from IPC
  platform: undefined  // Don't pass platform - let child use IPC proxies
});
```

### Testing Verification

**Test Case 1: Small File Override**
```bash
$ pnpm kb mind rag-index --include "/tmp/test-mind-small.md"

[runRagIndex] Overriding sources with include/exclude { include: '/tmp/test-mind-small.md' }
[runRagIndex] Original sources count: 2
[runRagIndex] Overridden sources: [
  { "id": "codebase", "paths": ["/tmp/test-mind-small.md"], ... },
  { "id": "docs", "paths": ["/tmp/test-mind-small.md"] }
]
[INFO] File discovery complete {"filesFound":2,"totalSize":"0.00 MB"}
[INFO] Memory-aware parallel chunking complete {"chunksProcessed":6}
```

✅ **Result:** 2 files found (same file matched by 2 sources) instead of 2363 files.

**Test Case 2: Normal Indexing (No Override)**
```bash
$ pnpm kb mind rag-index

[runRagIndex] Passing config to createMindKnowledgeRuntime: CUSTOM CONFIG
[INFO] File discovery complete {"filesFound":2363,"totalSize":"8.95 MB"}
```

✅ **Result:** Full indexing works as before.

### Developer Workflow

**Typical usage during development:**

```bash
# 1. Test config modification on small file
pnpm kb mind rag-index --include "/tmp/test.md"

# 2. Verify file discovery works
# Check logs: "filesFound":2 (instead of 2363)

# 3. Debug chunking/embeddings on small dataset
# Fast iteration: 2s vs 60s

# 4. Once verified, run full index
pnpm kb mind rag-index
```

## References

- Related ADR: [ADR-0039: IPC Config Access](./0039-ipc-config-access-auto-detection.md)
- Prior Art: ESLint `--ext`, Prettier `--ignore-path`, TypeScript `--include`/`--exclude`
- Multi-source architecture: Established in Mind Engine v0.1.0

---

**Last Updated:** 2025-12-11
**Next Review:** 2026-01-11 (after 1 month of developer usage)
