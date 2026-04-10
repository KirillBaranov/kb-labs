# ADR-0003: Agent-First JSON Protocol

**Date:** 2026-03-30
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-30
**Tags:** [api, agent, protocol, observability]

## Context

AI agents in KB Labs need to manage services programmatically. The current `dev.sh --json` provides basic JSON output, but agents still need multiple calls and string parsing to understand:
- Why a service failed (requires separate `logs` call)
- Whether dependencies are ready (requires parsing the dependency graph)
- What command to run to fix an issue (requires interpreting error messages)

Agents need a protocol where every response is self-contained and actionable.

## Decision

### Unified Response Contract

Every JSON response contains:

| Field | Type | When | Description |
|-------|------|------|-------------|
| `ok` | bool | always | Single check — no exit code parsing |
| `hint` | string | on failure | Exact command to fix (e.g., `kb-dev stop studio --force`) |
| `actions` | array | on mutations | What was done per service |
| `logsTail` | array | on failure | Last 5 log lines — no second call |
| `depsState` | map | in status | `{"redis": "alive", "workflow": "dead"}` — no graph computation |

### Agent-Specific Commands

**`ensure <targets...>`** — Idempotent desired state:
- alive → skip
- dead → start (with deps)
- failed → restart
- Agent says "I need rest alive" — kb-dev handles the rest

**`ready <targets...> --timeout`** — Blocking gate:
- Polls until all targets are alive or timeout
- Agent uses this as: "wait until backend is up, then run tests"

**`watch --json`** — JSONL event streaming:
- One JSON object per line
- Events: `starting`, `alive`, `crashed`, `restarting`, `failed`, `gave_up`
- Each event includes relevant context (latency, exitCode, logsTail)

### Status with depsState

```json
{
  "services": {
    "rest": {
      "state": "dead",
      "deps": ["workflow"],
      "depsState": {"workflow": "dead"}
    }
  }
}
```

Agent sees at a glance: rest is dead because workflow is dead. No graph traversal needed.

### Remote-Ready

The JSON schema is transport-agnostic:

```
Local:   kb-dev status --json      → stdout JSON
Remote:  GET /api/v1/status        → HTTP JSON (same schema)
Watch:   kb-dev watch --json       → stdout JSONL
Remote:  GET /api/v1/events (SSE)  → HTTP SSE (same Event schema)
```

When kb-dev adds an HTTP server mode, the schema stays identical. Studio dashboard and CLI agents use the same data structures.

## Consequences

### Positive

- Agents check one field (`ok`) instead of parsing exit codes and strings
- `hint` gives agents executable commands — no interpretation needed
- `logsTail` eliminates the most common follow-up call
- `depsState` eliminates dependency graph computation on agent side
- `ensure` is the natural agent command — idempotent, handles complexity internally
- Same protocol works locally and remotely

### Negative

- JSON responses are larger than minimal output (hint, logsTail, depsState)
- Human output and JSON output are two separate code paths to maintain

### Alternatives Considered

- **gRPC** — Over-engineered for a local CLI tool. JSON is universal, debuggable, and works with `jq`
- **Minimal JSON (just status codes)** — Agents would need multiple calls and interpretation logic
- **GraphQL** — Interesting for flexible queries but overkill. Fixed schema covers all agent needs

## Implementation

- `internal/manager/events.go` — Result, Action, Event, ServiceStatus types
- `cmd/ensure.go` — Ensure command
- `cmd/ready.go` — Ready command
- `cmd/watch.go` — Watch command with JSONL encoding
- `cmd/output.go` — `JSONOut()` helper for consistent encoding

## References

- [ADR-0001: Go Service Manager Over Bash](./0001-go-service-manager-over-bash.md)

---

**Last Updated:** 2026-03-30
