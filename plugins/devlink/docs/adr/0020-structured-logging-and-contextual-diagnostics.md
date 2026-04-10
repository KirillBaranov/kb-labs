# ADR-0020: Structured Logging and Contextual Diagnostics

**Date:** 2025-10-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [observability, tooling]

## Context

Previously, logging in DevLink was fragmented: some messages went through `console.log`, some through `chalk`, and some were missing entirely.

This complicated:
- Log filtering in CI and analytics
- Determining operation execution times
- Analyzing errors during multiple batch steps (applyPlan, discover, link)

A unified structured logging system was needed that maintains a balance between human readability and machine processing.

## Decision

Adopted a **centralized logger** providing:
- Unified interface: `logger.info()`, `logger.warn()`, `logger.error()`
- Contextual logging in JSON format, including keys (ok, executed, errors, time)
- Built-in integration with console for local sessions
- Clear stream separation: logger for machine events, console for UX output

Example:

```javascript
logger.info("Apply completed", { ok: true, executed: 55, errors: 0, time: 825 });
```

## Consequences

### Positive

- Unified log format across all CLI commands
- Easy to parse output for analytics and CI
- Improved readability: now shows structure (event, data)
- Extensibility potential (future: JSONL sink to analytics)

### Negative

- Information duplication: some data outputs to both UI and logs
- PNPM error messages can be partially "noisy"

### Alternatives Considered

- Use `pino` or `winston` — rejected as excessive for CLI
- Store all logs in files — rejected, no persistence need yet

## Implementation

- Logger implemented in `utils/logger.ts`
- All system events (start, completed, errors) migrated to logger
- Key points (applyPlan, discover, saveState) log duration and outcome
- `console.log` retained only for UX (tables, summaries, warnings)

## References

- [ADR-0019: Execution Journal and Apply State Tracking](./0019-execution-journal-and-apply-state-tracking.md)

