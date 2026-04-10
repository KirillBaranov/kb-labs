# ADR-0016: Progress Rendering (Pinned Loader Line)

**Date:** 2025-10-12
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [ui/ux, tooling]

## Context

In early versions of `devlink apply`, logging occurred line-by-line: each operation (`yalc add`, `pnpm add`, `remove`, etc.) printed its result to the console, creating noise and obscuring the current status.

This complicated process analysis when dealing with many packages (10+), especially during CI runs and manual dry-run checks.

We needed a compact, interactive, and stable way to display progress that:
- Doesn't "scroll away" with large amounts of logs
- Shows the current target and operation
- Remains visible regardless of previous output

## Decision

Implemented a **pinned progress renderer** that fixes a single status line at the bottom of the console and updates it "in place" using ANSI escape codes.

Key functions:
- `renderProgress(line: string)` — updates the current line, erasing the previous one (`\x1b[2K\r`)
- `clearProgress()` — clears the line and adds a newline after operation completion
- Progress works only in interactive TTY (checks `process.stdout.isTTY`)
- In non-interactive environments (CI / redirect) — fallback to regular `console.log`

Each target (`[#X/Y] @scope/pkg`) displays a brief summary:

```
yalc rm:3 add:2 | ws p:1 d:0 pr:0 | npm p:2 d:1 pr:0
```

## Consequences

### Positive

- Progress is always "pinned" to the bottom of the console — visible in real-time
- Logs remain clean — even with hundreds of dependencies, the interface stays tidy
- Improved UX for manual runs (`kb devlink:apply`)
- Suitable for CI integration with TTY disable option

### Negative

- Doesn't preserve history of intermediate lines (only final results)
- Possible artifacts in older terminals without ANSI support
- TTY behavior requires additional checks when redirecting output to file

### Alternatives Considered

- Use external libraries (`ora`, `cli-progress`) — rejected due to dependency overhead and loss of control over render logic
- Keep "silent" mode without visual status — rejected as UX significantly degraded during long apply sessions

## Implementation

- Added `renderProgress` and `clearProgress` functions
- Inside the main loop `for (const target of targets)`, now calls:
  - `renderProgress(...)` — at the start of package processing
  - `clearProgress()` — on completion (success/error)
- Progress replaces old `console.log` calls for the current step

Future expansion may include multi-line status with percentage and ETA display.

## References

- [ADR-0015: Batching of Dependency Operations](./0015-batching-of-dependency-operations.md)
- [ADR-0018: Prefiltering of Already-Satisfied Dependencies](./0018-prefiltering-of-already-satisfied-dependencies.md)

