# @kb-labs/agent-cli

CLI plugin for the KB Labs agent system. Provides the `agent:run` command and REST/WebSocket handlers for agent execution through the KB Labs platform.

## Surfaces

### CLI

```bash
# Execute a task
pnpm kb agent:run --task="Add input validation to the login form"

# Plan mode (analyze without executing)
pnpm kb agent:run --task="Refactor auth module" --mode=plan

# Edit mode (targeted file changes)
pnpm kb agent:run --task="Fix types in auth.ts" --mode=edit --files=src/auth.ts

# Debug mode (replay a trace)
pnpm kb agent:run --mode=debug --trace=./trace.ndjson

# Dry run
pnpm kb agent:run --task="Add tests" --dry-run
```

### REST API

Handlers registered as KB Labs plugin routes under `/api/v1/agents/*`.

### WebSocket

Real-time streaming of agent events (iterations, tool calls, completions) for Studio UI.

## Flags

| Flag | Type | Description |
|------|------|-------------|
| `--task` | string | Task description in natural language |
| `--mode` | enum | `execute` (default), `plan`, `edit`, `debug` |
| `--session-id` | string | Session ID (auto-generated if omitted) |
| `--complexity` | enum | `simple`, `medium`, `complex` |
| `--files` | string[] | Target files (edit mode) |
| `--trace` | string | Trace file path (debug mode) |
| `--dry-run` | boolean | Preview changes without applying |

## Plugin Manifest

Follows KB Labs V3 plugin manifest format. Exported from `src/manifest.ts` — declares commands, REST routes, WebSocket handlers, and permission requirements.

## Dependencies

- `@kb-labs/agent-core` — agent engine
- `@kb-labs/agent-contracts` — shared types
- `@kb-labs/agent-tools` — tool registry
- `@kb-labs/agent-tracing` — trace loading for debug mode
- `@kb-labs/sdk` — platform SDK
