# ADR-0032: Central Index with Local Overlay

**Date:** 2025-11-26
**Status:** Proposed
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-26
**Tags:** indexing, performance, distributed, ci-cd, scalability

## Context

### Problem

Current `kb mind rag-index` performs **full reindexing** every time:
- 2213 files → ~4 min chunking
- 5416 chunks → ~5-10 min embeddings
- **Total: ~10-15 minutes per index**

This creates significant problems at scale:

1. **100 developers** on different branches cannot wait 10-15 min each
2. **CI/CD pipelines** blocked by indexing
3. **Local changes** not reflected until full reindex
4. **Wasted compute**: Most files unchanged between runs

### Industry Research

How large companies solve this:

| Company | Approach | Scale |
|---------|----------|-------|
| Google (Kythe) | Distributed build-time indexing | Billions of lines |
| Meta (Glean) | Central index + real-time updates | Millions of files |
| GitHub (Copilot) | Per-repo central index + streaming | 100M+ repos |
| Sourcegraph | Central + incremental zoekt | Enterprise scale |

**Common pattern**: Central pre-built index + local overlay for uncommitted changes.

### Constraints

- Must work offline (after initial pull)
- Must not require complex infrastructure for small teams
- Must support cloud storage (S3/GCS) for enterprise
- Must preserve existing API compatibility
- Should minimize indexing time for developers

## Decision

Implement **Central Index + Local Overlay** architecture:

```
┌─────────────────────────────────────────────────────────┐
│  CI/CD: Centralized Index (main branch)                 │
│  - Built on push to main                                │
│  - Uploaded to S3/GCS                                   │
│  - ~5000 chunks, stable baseline                        │
└─────────────────────────────────────────────────────────┘
              ↓ kb mind pull (30 sec download)
┌─────────────────────────────────────────────────────────┐
│  Developer Machine                                      │
│  ┌─────────────────┐  ┌──────────────────┐              │
│  │ Central Index   │ +│ Local Overlay    │              │
│  │ (read-only,     │  │ (git diff HEAD,  │              │
│  │  from S3)       │  │  10-50 chunks)   │              │
│  └─────────────────┘  └──────────────────┘              │
│           ↓ merge at query time                         │
│  ┌─────────────────────────────────────┐                │
│  │ Unified Search Results              │                │
│  └─────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. Index Manifest

Every index includes a manifest for versioning and validation:

```typescript
// mind-engine/src/index/manifest.ts
interface IndexManifest {
  version: string;           // Manifest format version (semver)
  createdAt: string;         // ISO timestamp
  gitRevision: string;       // Commit hash at index time
  branch: string;            // Branch name (main, develop, etc.)
  scopeId: string;

  stats: {
    totalChunks: number;
    totalFiles: number;
    totalTokens: number;
    embeddingModel: string;
    embeddingDimension: number;
  };

  storage: {
    type: 'local' | 's3' | 'gcs' | 'azure';
    location: string;        // Path or URL
    checksum: string;        // SHA256 of index archive
    sizeBytes: number;
  };
}
```

#### 2. Remote Index Storage

Abstraction for index upload/download:

```typescript
// mind-engine/src/index/remote-storage.ts
interface RemoteIndexStorage {
  // Upload index to remote
  upload(
    scopeId: string,
    indexPath: string,
    manifest: IndexManifest
  ): Promise<string>;  // Returns remote URL

  // Download index from remote
  download(
    scopeId: string,
    targetPath: string
  ): Promise<IndexManifest>;

  // Check for updates
  checkForUpdates(
    scopeId: string,
    localManifest: IndexManifest
  ): Promise<UpdateInfo>;

  // List available indexes
  listIndexes(prefix?: string): Promise<IndexManifest[]>;
}

// Implementations
class S3IndexStorage implements RemoteIndexStorage { ... }
class GCSIndexStorage implements RemoteIndexStorage { ... }
class LocalFileStorage implements RemoteIndexStorage { ... }  // For testing
```

#### 3. Git Diff Detector

Identifies files changed since base index revision:

```typescript
// mind-engine/src/index/git-diff.ts
interface GitDiffDetector {
  // Get files changed since revision
  getChangedFiles(since: string): Promise<ChangedFile[]>;

  // Get current HEAD revision
  getCurrentRevision(): Promise<string>;

  // Check if file is tracked by git
  isTracked(path: string): Promise<boolean>;

  // Get merge base between two revisions
  getMergeBase(rev1: string, rev2: string): Promise<string>;
}

interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;  // For renames
}

// Implementation uses git diff
async function getChangedFiles(since: string): Promise<ChangedFile[]> {
  const { stdout } = await exec(`git diff --name-status ${since}...HEAD`);
  return parseGitDiffOutput(stdout);
}
```

#### 4. Merged Vector Store

Combines base index with overlay at query time:

```typescript
// mind-engine/src/index/merged-store.ts
class MergedVectorStore implements VectorStore {
  constructor(
    private base: VectorStore,           // Central index (read-only)
    private overlay: VectorStore,        // Local changes
    private deletedPaths: Set<string>    // Files removed since base
  ) {}

  async search(embedding: number[], k: number): Promise<VectorSearchMatch[]> {
    // Search both stores in parallel
    const [baseResults, overlayResults] = await Promise.all([
      this.base.search(embedding, k * 2),   // Over-fetch from base
      this.overlay.search(embedding, k)
    ]);

    // Filter out deleted files from base results
    const filteredBase = baseResults.filter(
      r => !this.deletedPaths.has(r.chunk.path)
    );

    // Overlay results override base for same paths
    const overlayPaths = new Set(overlayResults.map(r => r.chunk.path));
    const dedupedBase = filteredBase.filter(
      r => !overlayPaths.has(r.chunk.path)
    );

    // Merge and re-rank by score
    return [...overlayResults, ...dedupedBase]
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  // Other VectorStore methods delegate appropriately
  async getAllChunks(): Promise<StoredMindChunk[]> {
    const [baseChunks, overlayChunks] = await Promise.all([
      this.base.getAllChunks(),
      this.overlay.getAllChunks()
    ]);

    const overlayPaths = new Set(overlayChunks.map(c => c.path));
    const filteredBase = baseChunks.filter(
      c => !this.deletedPaths.has(c.path) && !overlayPaths.has(c.path)
    );

    return [...filteredBase, ...overlayChunks];
  }
}
```

#### 5. Incremental Index Builder

Builds overlay for changed files only:

```typescript
// mind-engine/src/index/incremental-builder.ts
interface IncrementalIndexBuilder {
  buildOverlay(
    changedFiles: ChangedFile[],
    options: OverlayOptions
  ): Promise<OverlayBuildResult>;
}

interface OverlayOptions {
  scopeId: string;
  maxFiles: number;          // Safety limit (default: 100)
  embeddingProvider: EmbeddingProvider;
  chunkingConfig: ChunkingConfig;
}

interface OverlayBuildResult {
  overlay: VectorStore;
  deletedPaths: string[];
  stats: {
    filesProcessed: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    timeMs: number;
  };
}

// Implementation
async function buildOverlay(
  changedFiles: ChangedFile[],
  options: OverlayOptions
): Promise<OverlayBuildResult> {
  const startTime = Date.now();
  const deletedPaths: string[] = [];
  const filesToIndex: string[] = [];

  for (const file of changedFiles) {
    if (file.status === 'deleted') {
      deletedPaths.push(file.path);
    } else if (shouldIndex(file.path)) {
      filesToIndex.push(file.path);
    }
  }

  // Only process changed files (typically 10-50)
  const chunks = await chunkFiles(filesToIndex, options.chunkingConfig);
  const embeddings = await options.embeddingProvider.embed(
    chunks.map(c => c.text)
  );

  // Store in memory overlay
  const overlay = new InMemoryVectorStore();
  await overlay.addChunks(chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i]
  })));

  return {
    overlay,
    deletedPaths,
    stats: {
      filesProcessed: filesToIndex.length,
      chunksCreated: chunks.length,
      embeddingsGenerated: embeddings.length,
      timeMs: Date.now() - startTime
    }
  };
}
```

### CLI Commands

```bash
# === CI/CD Commands ===

# Build and upload index
kb mind rag-index --upload s3://company-bucket/mind-index/main
kb mind rag-index --upload gcs://company-bucket/mind-index/main

# Build for specific branch
kb mind rag-index --upload s3://bucket/indexes/feature-auth --branch feature-auth

# === Developer Commands ===

# Pull central index (one-time or periodic)
kb mind pull                          # Pull default scope from configured remote
kb mind pull --branch main            # Pull specific branch
kb mind pull --force                  # Force re-download

# Query with auto-overlay
kb mind rag-query "how does auth work" --overlay
# Auto-detects git diff, builds overlay for changed files

# Manual overlay control
kb mind rag-index --overlay-only      # Build overlay without full reindex
kb mind rag-index --overlay-clear     # Clear local overlay

# Status and diagnostics
kb mind index-status                  # Show base version, overlay stats
```

**Output of `kb mind index-status`:**
```
Index Status for scope 'default':

Base Index:
  Source: s3://kb-mind-index/main/latest
  Git Revision: abc123f (main)
  Created: 2025-11-26 10:30:00 UTC
  Chunks: 5416
  Files: 2213

Local Overlay:
  Changed files: 12 (since abc123f)
  Overlay chunks: 45
  Last built: 2 minutes ago
  Status: FRESH

Effective Index:
  Total chunks: 5449 (base: 5416, overlay: +45, deleted: -12)
```

### Configuration

```yaml
# .kb/kb-labs.config.yaml
mind:
  index:
    # Remote storage configuration
    remote:
      type: s3                    # s3 | gcs | azure | local
      bucket: kb-mind-index
      region: us-east-1
      prefix: indexes/
      # Credentials from environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

    # Overlay behavior
    overlay:
      enabled: true               # Auto-build overlay on query
      maxFiles: 100               # Max files to process (safety limit)
      ttlMinutes: 60              # Rebuild overlay after N minutes
      autoOnQuery: true           # Build overlay automatically during query

    # Auto-update settings
    autoUpdate:
      enabled: true               # Auto-pull on CLI startup
      intervalMinutes: 30         # Check for updates every N minutes
      notifyOnly: false           # If true, notify but don't auto-pull
```

### CI/CD Integration

```yaml
# .github/workflows/mind-index.yml
name: Mind Index

on:
  push:
    branches: [main, develop]
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours

jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: pnpm install

      - name: Build mind packages
        run: pnpm run build --filter "@kb-labs/mind-*"

      - name: Build index
        run: pnpm kb mind rag-index --scope default
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Upload to S3
        run: |
          pnpm kb mind index-upload \
            --remote s3://kb-mind-index/${{ github.ref_name }}/latest
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Notify Slack (optional)
        if: success()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"Mind index updated for ${{ github.ref_name }}"}'
```

### Query Flow with Overlay

```typescript
async function ragQueryWithOverlay(
  query: string,
  options: QueryOptions
): Promise<AgentResponse> {
  // 1. Load base index
  const baseIndex = await loadBaseIndex(options.scopeId);
  const manifest = baseIndex.manifest;

  // 2. Check if overlay needed
  if (options.overlay !== false) {
    const changedFiles = await gitDiff.getChangedFiles(manifest.gitRevision);

    if (changedFiles.length > 0) {
      if (changedFiles.length > config.overlay.maxFiles) {
        // Too many changes - suggest full reindex
        log.warn(`${changedFiles.length} files changed. Consider full reindex.`);
      }

      // 3. Build overlay (cached if recent)
      const overlayResult = await getOrBuildOverlay(changedFiles, options);

      // 4. Create merged store
      const mergedStore = new MergedVectorStore(
        baseIndex.vectorStore,
        overlayResult.overlay,
        new Set(overlayResult.deletedPaths)
      );

      // 5. Search merged index
      return await executeQuery(mergedStore, query, options);
    }
  }

  // No changes - use base index directly
  return await executeQuery(baseIndex.vectorStore, query, options);
}
```

## Consequences

### Positive

- **10-15 min → 30 sec** for developers (pull once, overlay on-demand)
- **CI/CD handles heavy lifting**: Full index built once per push
- **Fresh results**: Local changes immediately searchable
- **Offline capable**: Works without network after initial pull
- **Scalable**: 100+ developers share one central index
- **Cost efficient**: Embedding costs centralized in CI/CD

### Negative

- **Infrastructure dependency**: Requires S3/GCS for enterprise use
- **Initial setup**: CI/CD pipeline configuration needed
- **Stale risk**: Developers may forget to pull updates
- **Merge conflicts**: Large divergence from main = large overlay
- **Storage costs**: Cloud storage for index files (~50-100MB per index)

### Trade-offs

| Scenario | Behavior |
|----------|----------|
| Small team, simple projects | Can skip central, use local index only |
| Large team, monorepo | Central index essential, overlay for branches |
| Disconnected work | Pull once, work offline, overlay handles changes |
| Feature branch with 500 files changed | Falls back to full reindex, warns user |

### Alternatives Considered

1. **Distributed P2P index sharing**
   - Rejected: Complex, hard to ensure consistency

2. **Database-backed index (PostgreSQL/pgvector)**
   - Rejected: Adds infrastructure dependency, latency

3. **Full incremental without central**
   - Rejected: Every developer still builds full index initially

4. **Git LFS for index files**
   - Rejected: Poor querying UX, no partial updates

5. **Embedding service with shared cache**
   - Considered: Good complement, doesn't solve index distribution

## Implementation

### New Files

| File | Description |
|------|-------------|
| `mind-engine/src/index/manifest.ts` | Index manifest types and utilities |
| `mind-engine/src/index/remote-storage.ts` | Remote storage abstraction |
| `mind-engine/src/index/s3-storage.ts` | S3 implementation |
| `mind-engine/src/index/gcs-storage.ts` | GCS implementation |
| `mind-engine/src/index/git-diff.ts` | Git diff detection |
| `mind-engine/src/index/merged-store.ts` | Merged vector store |
| `mind-engine/src/index/incremental-builder.ts` | Overlay builder |
| `mind-cli/src/commands/pull.ts` | `kb mind pull` command |
| `mind-cli/src/commands/index-status.ts` | `kb mind index-status` command |
| `mind-cli/src/commands/index-upload.ts` | `kb mind index-upload` command |

### Implementation Phases

**Phase 1: Index Manifest & Local Storage**
- IndexManifest types and serialization
- Local file storage adapter
- Basic save/load for testing

**Phase 2: Git Diff Integration**
- Git diff detector
- Changed files parser
- Incremental builder (local overlay)

**Phase 3: Merged Query Flow**
- MergedVectorStore implementation
- Auto-overlay on query
- `--overlay` flag in CLI

**Phase 4: Remote Storage (S3)**
- S3 adapter with multipart upload
- Download with progress
- Checksum validation

**Phase 5: CLI Commands**
- `kb mind pull` command
- `kb mind index-status` command
- `kb mind index-upload` command

**Phase 6: CI/CD Integration**
- GitHub Actions workflow template
- Auto-upload on push
- Branch-specific indexes

**Phase 7: Auto-Sync & Plugin Setup**
- Plugin setup integration (`.kb/mind/` config)
- Auto-sync on query (lazy pull)
- Multi-branch index support

**Phase 8: Polish & Documentation**
- Stale index warnings
- Documentation and examples
- Migration guide

### Auto-Sync Strategy

**Important**: Plugin setup cannot modify `.git/` (restricted). Instead, auto-sync happens:
1. **On query** — lazy check if index is stale
2. **After merge** — user runs `kb mind pull` manually or via husky (user's choice)

#### Merge-Base Aware Indexing

Key insight: when on feature branch, you may not have latest main changes locally.

```
main:     A --- B --- C --- D (index built at D)
              \
feature:       E --- F --- G (your branch, based on B)
```

If you pull index from D, it contains files you don't have locally (C, D changes).

**Solution**: Index is pulled based on **merge-base**, not latest main:

```typescript
// When pulling index on feature branch:
const mergeBase = await git.mergeBase('HEAD', 'origin/main');  // Returns B
const availableIndexes = await remote.listIndexes('main');

// Find closest index that's ancestor of merge-base
const bestIndex = findClosestAncestor(availableIndexes, mergeBase);

// Overlay covers: merge-base...HEAD (your changes E, F, G)
const changedFiles = await git.diff(`${bestIndex.revision}...HEAD`);
```

#### Plugin Setup Configuration

Setup via `kb mind setup` scaffolds config in `.kb/`:

```yaml
# .kb/kb-labs.config.yaml (added by plugin setup)
mind:
  index:
    autoSync:
      enabled: true              # Enable auto-sync checks
      onQuery: true              # Check freshness on each query
      maxStalenessMinutes: 60    # Warn if index older than N minutes
      autoOverlay: true          # Auto-build overlay for local changes

    remote:
      type: s3                   # s3 | gcs | local
      bucket: kb-mind-index
      region: us-east-1

    branches:
      indexed: [main, develop, 'rc/*', 'release/*']
      default: main
      fallback: [develop, main]
```

#### Lazy Sync on Query

```typescript
// Inside kb mind rag-query
async function ensureFreshIndex(scopeId: string): Promise<void> {
  const config = await loadConfig();
  if (!config.mind?.index?.autoSync?.enabled) return;

  const local = await loadLocalManifest(scopeId);
  if (!local) {
    // No index - prompt user
    console.warn('No index found. Run: kb mind pull');
    return;
  }

  // Check staleness
  const mergeBase = await git.mergeBase('HEAD', 'origin/main');
  const isAncestor = await git.isAncestor(local.gitRevision, mergeBase);

  if (!isAncestor) {
    // Index is from a commit not in our history (main moved forward, we didn't merge)
    // This is OK - just build overlay for our changes
    console.info('Index from main, building overlay for local changes...');
  }

  // Build overlay if needed
  if (config.mind.index.autoSync.autoOverlay) {
    const changedFiles = await git.diff(`${local.gitRevision}...HEAD`);
    if (changedFiles.length > 0) {
      await buildOverlay(changedFiles, scopeId);
    }
  }
}
```

### Multi-Branch Index Strategy

Support for multiple long-lived branches:

```
Remote Storage Structure:
s3://kb-mind-index/
├── main/
│   ├── latest.json            # Pointer to latest version
│   ├── abc123/                # By commit hash
│   │   ├── manifest.json
│   │   └── index.bin
│   └── def456/
├── develop/
│   └── latest.json
├── rc/
│   └── 1.0/
└── release/
    ├── v1.0/
    └── v2.0/
```

**CI/CD builds index on push to indexed branches:**
```yaml
# .github/workflows/mind-index.yml
on:
  push:
    branches: [main, develop, 'rc/*', 'release/*']

jobs:
  index:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and upload index
        run: |
          COMMIT=$(git rev-parse --short HEAD)
          BRANCH=$(echo "${GITHUB_REF#refs/heads/}" | sed 's/\//-/g')

          pnpm kb mind rag-index --scope default
          pnpm kb mind index-upload \
            --remote "s3://kb-mind-index/${BRANCH}/${COMMIT}"

          # Update latest pointer
          echo '{"revision":"'$COMMIT'"}' | \
            aws s3 cp - "s3://kb-mind-index/${BRANCH}/latest.json"
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

### Developer Workflow

```bash
# 1. First time setup (once per repo)
kb mind setup                   # Scaffolds .kb/mind/ config

# 2. Pull base index (after clone or when needed)
kb mind pull                    # Pulls index for current branch context

# 3. Daily work - auto overlay on query
kb mind rag-query "how does X work"
# → Checks index freshness
# → Builds overlay for local changes (if any)
# → Searches merged index

# 4. After merging main
git merge origin/main
kb mind pull --clear-overlay    # Fresh base + clear stale overlay

# 5. Check status
kb mind index-status
# Index Status for scope 'default':
#   Base: main@abc123 (2 hours ago)
#   Overlay: 45 chunks from 12 changed files
#   Merge-base: abc123 ✓ (index matches your branch point)
```

### Optional: Husky Integration (User's Choice)

Users who want git-hook-based sync can add to their husky config:

```bash
# .husky/post-merge (user adds this themselves)
#!/bin/bash
kb mind pull --clear-overlay --quiet 2>/dev/null || true
```

This is **not** installed by plugin setup (`.git/` is restricted), but documented as an option.

### Performance Targets

| Scenario | Current | Target |
|----------|---------|--------|
| Full reindex | 10-15 min | 10-15 min (CI only) |
| Pull central index | N/A | 30 sec |
| Build overlay (50 files) | N/A | 5-10 sec |
| Query with overlay | N/A | +1-2 sec latency |
| Developer daily workflow | 10-15 min | 35 sec total |

## References

- [ADR-0021: Incremental Indexing](./0021-incremental-indexing.md) (foundational concepts)
- [ADR-0016: Vector Store Abstraction](./0016-vector-store-abstraction.md)
- [Google Kythe](https://kythe.io/) - Distributed code indexing
- [Sourcegraph Architecture](https://docs.sourcegraph.com/dev/background-information/architecture)

---

**Last Updated:** 2025-11-26
