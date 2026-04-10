# ADR-0009: Fail-Open Philosophy for Robust Context Indexing

**Date:** 2025-10-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, process]

## Context

KB Labs Mind is a headless context layer that indexes codebases for AI-powered development workflows. The system must be robust and never crash the user's development process, even when encountering:

- Parse errors in TypeScript/JavaScript files
- Missing or corrupted files
- Git repository issues
- Time budget overruns
- Large files that exceed processing limits

The system should provide maximum value even with partial data, rather than failing completely.

## Decision

We will implement a **fail-open philosophy** throughout the KB Labs Mind system:

1. **Parse Errors**: Log warnings but continue processing other files
2. **Missing Files**: Skip gracefully, keep existing data if available
3. **Git Issues**: Continue without git data, don't crash the process
4. **Time Budgets**: Return partial results with `partial: true` flag
5. **Large Files**: Skip with warning, continue with other files
6. **Bundle Integration**: Fail-open with timeout, don't crash pack generation

## Rationale

### Why Fail-Open?

- **Developer Experience**: Never interrupt the user's workflow
- **Partial Value**: Better to have some context than no context
- **Resilience**: System continues working even with problematic files
- **Observability**: Structured logging provides visibility into issues
- **Graceful Degradation**: System provides maximum possible value

### Implementation Strategy

```typescript
// Example: API Indexer with fail-open
try {
  const exports = extractor.extract(filePath, content);
  newApiIndex.files[posixPath] = { exports, size, sha256 };
} catch (error) {
  log({ 
    level: 'warn', 
    code: 'MIND_PARSE_ERROR', 
    msg: `Failed to parse ${filePath}: ${error.message}`,
    file: posixPath 
  });
  // Keep old data if available, or skip
  if (currentApiIndex.files[posixPath]) {
    newApiIndex.files[posixPath] = currentApiIndex.files[posixPath];
  }
}
```

### Time Budget Handling

```typescript
// Orchestrator tracks time usage
if (isTimeBudgetExceeded(ctx)) {
  log({ 
    level: 'warn', 
    code: 'MIND_TIME_BUDGET', 
    msg: 'Time budget exceeded, returning partial results' 
  });
  report.partial = true;
  // Continue with what we have
}
```

## Consequences

### Positive

- **Robustness**: System never crashes on bad input
- **Partial Results**: Users get maximum possible value
- **Observability**: Clear logging of what failed and why
- **Developer Experience**: Seamless integration with existing workflows
- **Graceful Degradation**: System adapts to project constraints

### Negative

- **Silent Failures**: Some issues might not be immediately obvious
- **Partial Data**: Users might not realize some files weren't processed
- **Debugging**: Need to check logs to understand what was skipped

### Mitigation Strategies

- **Structured Logging**: All failures are logged with context
- **Partial Flags**: `partial: true` in reports indicates incomplete results
- **Budget Tracking**: Time usage is tracked and reported
- **Warning Levels**: Different log levels for different severity issues

## Implementation Details

### Error Codes

```typescript
// Standardized error codes for different failure modes
const ERROR_CODES = {
  MIND_PARSE_ERROR: 'Parse error in source file',
  MIND_TIME_BUDGET: 'Time budget exceeded',
  MIND_NO_GIT: 'Not in a git repository',
  MIND_FILE_TOO_LARGE: 'File exceeds size limit',
  MIND_FS_ERROR: 'File system operation failed'
};
```

### Logging Strategy

```typescript
// Structured logging with context
log({
  level: 'warn',
  code: 'MIND_PARSE_ERROR',
  msg: 'Failed to parse TypeScript file',
  file: 'src/problematic.ts',
  meta: { error: error.message, line: 42 }
});
```

### Partial Results

```typescript
// DeltaReport includes partial flag and budget tracking
interface DeltaReport {
  api: { added: number; updated: number; removed: number };
  budget: { limitMs: number; usedMs: number };
  partial?: boolean; // Indicates incomplete results
  durationMs: number;
}
```

## Alternatives Considered

### Fail-Fast Approach
- **Pros**: Immediate feedback on issues
- **Cons**: Crashes user workflow, no partial value
- **Decision**: Rejected - too disruptive for daily use

### Silent Failures
- **Pros**: No interruption to user
- **Cons**: No visibility into what failed
- **Decision**: Rejected - need observability

### User-Configurable Behavior
- **Pros**: Flexibility for different use cases
- **Cons**: Complexity, harder to reason about
- **Decision**: Rejected - fail-open is the right default

## References

- [ADR-0001: Architecture and Repository Layout](./0001-architecture-and-repository-layout.md)
- [ADR-0003: Package and Module Boundaries](./0003-package-and-module-boundaries.md)
- [KB Labs Mind MVP Plan](../kb-labs-mind-mvp.plan.md)
