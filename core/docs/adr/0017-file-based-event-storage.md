# ADR-0017: File-Based Event Storage as Primary Sink

**Date:** 2025-11-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-25
**Tags:** [observability, storage, reliability]

## Context

We need reliable event storage that:
1. **Survives any crash** - including OOM, segfaults, SIGKILL
2. **Works in any environment** - no network, no database required
3. **Post-mortem friendly** - can analyze after process death
4. **Zero external dependencies** - built-in Node.js APIs only
5. **Fast and non-blocking** - doesn't slow down execution

### Alternatives Considered

**Option A: In-memory only**
- Fast, zero overhead
- **Rejected**: Lost on crash (defeats the purpose)

**Option B: SQLite database**
- Queryable, structured
- **Rejected**: Can corrupt on crash, requires native module, slower writes

**Option C: IPC to parent process**
- Parent collects and stores
- **Rejected**: IPC can fail, buffers can overflow, parent may not store reliably

**Option D: Network (Sentry/Datadog/etc)**
- Centralized, dashboards
- **Rejected**: Requires network, adds latency, privacy concerns, may fail

**Option E: File-based append-only log (CHOSEN)**
- Survives crash, local, simple, reliable

## Decision

**Use append-only file storage in JSONL format as the primary event sink.**

### Design Details

**File Format: JSONL (JSON Lines)**
```
{"type":"file-header","version":"1.0","pid":12345,...}
{"id":"uuid","timestamp":1234567890,"type":"log",...}
{"id":"uuid","timestamp":1234567891","type":"memory",...}
```

**File Location:** `/tmp/kb-{pid}-{timestamp}.log`
- `/tmp` is standard across Unix/Linux/macOS
- `{pid}` allows multiple processes
- `{timestamp}` prevents collisions

**Write Strategy:**
- Buffer size: 1 event (immediate flush for crashes)
- Flush interval: 100ms (frequent for reliability)
- Write mode: append-only (`flags: 'a'`)
- Encoding: UTF-8

**Rotation:**
- Max file size: 100MB
- Rotate to new file when exceeded
- Old files preserved for analysis

**Cleanup:**
- Synchronous flush on process exit
- Flush on SIGINT/SIGTERM
- Final flush in uncaughtException handler

## Consequences

### Positive

1. **Reliability**: Files survive ANY crash scenario
2. **Simplicity**: No dependencies, just fs.createWriteStream
3. **Post-Mortem**: Can always analyze what happened
4. **Performance**: Async writes, non-blocking, buffered
5. **Standard Format**: JSONL is parseable by any tool
6. **Portable**: Works on all platforms
7. **Privacy**: Data stays local

### Negative

1. **Disk Space**: Files accumulate in /tmp (mitigated by rotation + cleanup)
2. **No Queries**: Can't query without parsing (future: add SQLite sink)
3. **Manual Cleanup**: Need to delete old files (future: add auto-cleanup)

### Alternatives Rejected

- **SQLite**: Can corrupt on crash, not append-only safe
- **IPC**: Can fail, buffers overflow, not reliable enough
- **Network**: Requires connectivity, adds latency

## Implementation

### Phase 1: Core (Done)
- [x] FileLogger class with buffered writes
- [x] JSONL format (one event per line)
- [x] Append-only mode
- [x] Automatic rotation at 100MB
- [x] Synchronous flush on exit

### Phase 2: Enhancements (Future)
- [ ] Auto-cleanup of old files (>7 days)
- [ ] Compression for old files (gzip)
- [ ] File size monitoring
- [ ] Disk space checks

## References

- Implementation: `kb-labs-core/packages/sandbox/src/observability/outputs/file-logger.ts`
- Related ADRs:
  - ADR-0016: Unified Observability Event System
  - ADR-0018: Chrome Tracing Format

---

**Last Updated:** 2025-11-25
**Next Review:** 2026-01-25
