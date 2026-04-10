# @kb-labs/agent-history

File change tracking, snapshots, and conflict resolution for KB Labs agents. Enables rollback of agent modifications and safe retry of failed tasks.

## Components

### FileChangeTracker

Tracks all file operations (create, modify, delete) performed by an agent.

```typescript
import { FileChangeTracker } from '@kb-labs/agent-history';

const tracker = new FileChangeTracker();

tracker.recordChange({
  path: 'src/auth.ts',
  type: 'modify',
  before: originalContent,
  after: newContent,
});

const changes = tracker.getChanges();
```

### SnapshotStorage

Persists file snapshots for recovery. Stores original content before modifications.

```typescript
import { SnapshotStorage } from '@kb-labs/agent-history';

const storage = new SnapshotStorage({ baseDir: '.kb/snapshots' });

await storage.save(sessionId, changes);
const snapshot = await storage.load(sessionId);
```

### ConflictDetector

Detects conflicts when agent modifications overlap with external changes (concurrent edits by user or another agent).

```typescript
import { ConflictDetector } from '@kb-labs/agent-history';

const detector = new ConflictDetector();
const conflicts = detector.detect(agentChanges, currentFileState);
```

### ConflictResolver

Resolves detected conflicts with configurable strategies (keep-agent, keep-external, merge).

```typescript
import { ConflictResolver } from '@kb-labs/agent-history';

const resolver = new ConflictResolver();
const result = resolver.resolve(conflict, strategy);
```

## Types

```typescript
import type {
  FileChange,
  RollbackResult,
  ConflictInfo,
  StorageConfig,
  DetectedConflict,
  ConflictType,       // 'modified' | 'deleted' | 'created'
  ResolutionResult,
} from '@kb-labs/agent-history';
```

## Dependencies

- `@kb-labs/agent-contracts` — shared types
