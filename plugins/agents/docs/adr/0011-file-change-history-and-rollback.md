# ADR-0011: File Change History and Rollback System

**Status:** Proposed
**Date:** 2026-02-16
**Deciders:** Assistant, User
**Technical Story:** [File Change History & Rollback UX Plan](../../../docs/plans/2026-02-16-file-change-history-ux.md)

---

## Context

When agents modify files through `fs_write` and `fs_patch` tools, there is currently no way to:
1. **Track what changed** - Which agent modified which file and when
2. **Review changes** - See diffs before/after agent modifications
3. **Rollback mistakes** - Undo unwanted changes without manual git operations

This creates a poor developer experience compared to modern AI coding assistants like Cursor, which provide rich file change history and easy rollback capabilities.

**User pain points:**
- "Agent broke my code, now I have to restore from git manually"
- "I don't remember which files the agent touched"
- "I want to undo just this one file change, not all of them"

**Similar systems:**
- Cursor IDE: Shows all AI edits with diff and one-click rollback
- GitHub Copilot: Workspace edits are tracked and can be undone
- VS Code: Undo stack for all edits

---

## Decision

We will implement a **FileChangeTracker** system that:

1. **Captures snapshots** of files before/after every `fs_write` and `fs_patch` operation
2. **Stores metadata** about each change (agent ID, timestamp, operation type, line stats)
3. **Provides rollback API** at multiple granularities (single file, by agent, by time)
4. **Integrates with Studio** for Cursor-like UX (real-time change list, diff viewer, rollback buttons)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Agent Execution                         │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ Tool Call (fs_write / fs_patch)
                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      FileChangeTracker                          │
│                                                                 │
│  1. Read current file content (before)                         │
│  2. Create snapshot with before/after                          │
│  3. Persist to .kb/agents/sessions/{sessionId}/snapshots/      │
│  4. Emit file:changed event → Studio                           │
└───────────────┬─────────────────────────────────────────────────┘
                │
                ↓
┌─────────────────────────────────────────────────────────────────┐
│                       SnapshotStorage                           │
│                                                                 │
│  Storage:  .kb/agents/sessions/{sessionId}/snapshots/          │
│  Format:   {changeId}.json (full before/after content)         │
│  Index:    index.json (fast queries without loading all)       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. FileChangeTracker
```typescript
interface FileChange {
  id: string;                // UUID
  sessionId: string;
  agentId: string;
  filePath: string;          // Relative to workingDir
  operation: 'write' | 'patch' | 'delete';
  timestamp: string;

  before?: {                 // null for new files
    content: string;
    hash: string;
    size: number;
  };
  after: {
    content: string;
    hash: string;
    size: number;
  };

  metadata?: {
    startLine?: number;      // fs_patch specific
    endLine?: number;
    linesAdded?: number;
    linesRemoved?: number;
    isOverwrite?: boolean;   // fs_write specific
  };
}

class FileChangeTracker {
  async captureChange(
    filePath: string,
    operation: 'write' | 'patch',
    beforeContent: string | null,
    afterContent: string,
    metadata?: Record<string, unknown>
  ): Promise<FileChange>;

  async rollbackFile(changeId: string): Promise<void>;
  async rollbackAgent(agentId: string): Promise<void>;
  async rollbackAfter(timestamp: string): Promise<void>;
}
```

#### 2. SnapshotStorage
```typescript
interface SnapshotStorage {
  async saveSnapshot(change: FileChange): Promise<void>;
  async loadSnapshot(changeId: string): Promise<FileChange | null>;
  async listSnapshots(sessionId: string): Promise<FileChange[]>;
  async deleteSnapshots(sessionId: string): Promise<void>;
}

// Storage structure:
// .kb/agents/sessions/{sessionId}/
//   snapshots/
//     {changeId}.json       ← Full snapshot
//   index.json              ← Fast metadata lookup
```

#### 3. Studio UI Components
- **FileChangesPanel** - List all changes with stats
- **FileChangeItem** - Single change with expand/collapse diff
- **FileDiffViewer** - React-based diff renderer
- **RollbackButton** - One-click rollback action

### Integration Points

**1. Tool Executor (filesystem.ts):**
```typescript
// Before write
if (context.fileChangeTracker) {
  const beforeContent = fs.existsSync(fullPath)
    ? fs.readFileSync(fullPath, 'utf-8')
    : null;

  await context.fileChangeTracker.captureChange(
    filePath,
    'write',
    beforeContent,
    content,
    { isOverwrite }
  );
}

// Actual write
fs.writeFileSync(fullPath, content, 'utf-8');
```

**2. Agent Core (agent.ts):**
```typescript
constructor(config: AgentConfig, toolRegistry: ToolRegistry) {
  if (config.trackFileChanges !== false) {
    const sessionId = config.sessionId || generateSessionId();
    const storage = new SnapshotStorage(config.workingDir);

    this.fileChangeTracker = new FileChangeTracker(
      sessionId,
      this.agentId,
      config.workingDir,
      storage
    );

    // Inject into ToolContext
    toolRegistry.getContext().fileChangeTracker = this.fileChangeTracker;
  }
}
```

**3. Event Emission:**
```typescript
// After successful file operation
if (toolName.startsWith('fs_') && result.success) {
  const changes = this.fileChangeTracker?.getChanges() || [];
  if (changes.length > 0) {
    this.emit({
      type: 'file:changed',
      timestamp: new Date().toISOString(),
      iteration: this.iteration,
      change: changes[changes.length - 1],
    });
  }
}
```

---

## Consequences

### Positive ✅

1. **Better UX:** Cursor-like experience for reviewing and rolling back changes
2. **Non-blocking:** Snapshot happens async, doesn't slow down agent
3. **Granular control:** Rollback single file, by agent, or by time
4. **Real-time feedback:** Studio shows changes as they happen
5. **Backward compatible:** Works with/without tracking (opt-in via config)

### Negative ❌

1. **Storage overhead:** O(files_modified) × O(file_size) disk usage
2. **Performance impact:** ~10-50ms per file write for snapshot
3. **Complexity:** New component to maintain and test
4. **Not a git replacement:** Simple snapshot, no branching or merge resolution

### Mitigation Strategies

**Storage bloat:**
- Limit snapshot to 1MB per file (larger files rejected)
- Compress snapshots with gzip (50-70% reduction for text)
- Auto-cleanup old sessions (default: keep last 30)
- Configurable retention policy

**Performance:**
- Async snapshot (non-blocking)
- Use Promise.allSettled for batch rollback
- Cache index.json in memory

**Complexity:**
- Comprehensive unit tests (90%+ coverage)
- Integration tests for rollback scenarios
- Clear error messages for failures

---

## Alternatives Considered

### 1. Git-based Versioning
**Approach:** Use git add/commit on every file change

**Pros:**
- Industry-standard versioning
- Full history with diffs
- Merge conflict resolution

**Cons:**
- ❌ Heavy overhead (git operations are slow)
- ❌ Pollutes git history with "agent edit" commits
- ❌ Requires user to manage git state
- ❌ Overkill for temporary rollback use case

**Decision:** Rejected - too heavy and intrusive

---

### 2. Incremental Diff Storage
**Approach:** Store only diffs (like git patches)

**Pros:**
- Smaller storage footprint
- Efficient for large files with small changes

**Cons:**
- ❌ Complex implementation (need patch/unpatch logic)
- ❌ Rollback requires replaying all patches in order
- ❌ Harder to debug (can't just open snapshot file)
- ❌ No benefit for small files (most agent edits)

**Decision:** Rejected - complexity not worth it

---

### 3. Single Undo Stack (VS Code Style)
**Approach:** Global undo/redo stack for all changes

**Pros:**
- Simple mental model
- Easy to implement

**Cons:**
- ❌ Doesn't scale to multi-agent (who owns undo stack?)
- ❌ Can't rollback specific agent's changes
- ❌ Loses history when agent terminates

**Decision:** Rejected - doesn't support multi-agent workflows

---

### 4. External Versioning Service
**Approach:** Send snapshots to external API (e.g., S3, database)

**Pros:**
- Centralized storage
- Better for multi-machine setups

**Cons:**
- ❌ Requires network dependency
- ❌ Slower than local filesystem
- ❌ Privacy concerns (code leaves machine)
- ❌ Breaks offline usage

**Decision:** Rejected - local-first approach is better

---

## Implementation Notes

### Storage Format

**Snapshot file (`{changeId}.json`):**
```json
{
  "id": "change-abc123",
  "sessionId": "session-xyz789",
  "agentId": "researcher-001",
  "filePath": "src/index.ts",
  "operation": "patch",
  "timestamp": "2026-02-16T10:15:32.123Z",

  "before": {
    "content": "const port = 3000;\n",
    "hash": "sha256-...",
    "size": 18
  },

  "after": {
    "content": "const port = 5050;\n",
    "hash": "sha256-...",
    "size": 18
  },

  "metadata": {
    "startLine": 1,
    "endLine": 1,
    "linesAdded": 1,
    "linesRemoved": 1
  }
}
```

**Index file (`index.json`):**
```json
{
  "sessionId": "session-xyz789",
  "createdAt": "2026-02-16T10:00:00.000Z",
  "changes": [
    {
      "id": "change-abc123",
      "filePath": "src/index.ts",
      "operation": "patch",
      "timestamp": "2026-02-16T10:15:32.123Z",
      "agentId": "researcher-001",
      "stats": {
        "linesAdded": 1,
        "linesRemoved": 1,
        "sizeBefore": 18,
        "sizeAfter": 18
      }
    }
  ]
}
```

### Rollback Algorithm

**Single file rollback:**
```
1. Load snapshot by changeId
2. Read snapshot.before.content
3. Write to file (overwrite current)
4. Update file hash in context
5. Emit rollback event to Studio
```

**Agent rollback:**
```
1. Load all snapshots for session
2. Filter by agentId
3. Sort by timestamp (newest first)
4. For each change:
   - Restore file to before state
   - Skip if file modified by another agent after this change
5. Emit batch rollback event
```

**Time-based rollback:**
```
1. Load all snapshots for session
2. Filter by timestamp > targetTime
3. Group by file (keep earliest change per file)
4. For each file:
   - Restore to before state of earliest change
5. Emit batch rollback event
```

### Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Capture snapshot (small file <10KB) | 10-20ms | Read + serialize + write |
| Capture snapshot (large file 1MB) | 100-200ms | Limit enforced at 1MB |
| Rollback single file | 20-50ms | Read snapshot + write file |
| Rollback by agent (10 files) | 200-500ms | Parallel rollback |
| Load index.json (100 changes) | 10-20ms | Cached in memory |

### CLI Examples

```bash
# View history
pnpm kb agent:history:list --session-id=session-xyz789
pnpm kb agent:history:list --file=src/index.ts

# Show diff
pnpm kb agent:history:diff --change-id=change-abc123

# Rollback operations
pnpm kb agent:history:rollback --change-id=change-abc123
pnpm kb agent:history:rollback --agent-id=researcher-001
pnpm kb agent:history:rollback --after="2026-02-16T10:00:00Z"
pnpm kb agent:history:rollback --file=src/index.ts

# Dry run (preview without applying)
pnpm kb agent:history:rollback --agent-id=researcher-001 --dry-run
```

---

## References

- **Implementation Plan:** [docs/plans/2026-02-16-file-change-history-ux.md](../../../docs/plans/2026-02-16-file-change-history-ux.md)
- **Related ADRs:**
  - [ADR-0001: Incremental Agent Tracing](./0001-incremental-agent-tracing.md) - NDJSON tracing system
  - [ADR-0010: Adaptive Context Optimization](./0010-adaptive-context-optimization.md) - Context management
- **External References:**
  - Cursor IDE file change UX
  - VS Code undo/redo architecture
  - GitHub Copilot workspace edits

---

**Decision Outcome:** Approved for implementation pending user review

**Next Steps:**
1. Review plan with user
2. Start Phase 1: FileChangeTracker backend
3. Write comprehensive tests
4. Integrate with Studio UI
5. Document usage in README

**Timeline:** 3-5 days (4 phases as outlined in plan)
