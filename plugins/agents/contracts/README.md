# @kb-labs/agent-contracts

Shared type definitions and contracts for the KB Labs agent system. Provides TypeScript interfaces, event schemas, API routes, and Zod validation used by all other `agent-*` packages.

## What's Inside

| Export | Description |
|--------|-------------|
| `types.ts` | Core types — `AgentConfig`, `AgentResult`, `SessionInfo`, `TurnInfo`, execution state |
| `events.ts` | Agent event system — `AgentEvent` union type covering full lifecycle |
| `ws-messages.ts` | WebSocket message contracts for real-time streaming |
| `verification.ts` | Quality gate types — `VerificationResult`, `GateConfig` |
| `turn.ts` | Turn-based interaction models |
| `schemas.ts` | Zod validation schemas for runtime input validation |
| `routes.ts` | API route definitions (`/api/v1/agents/*`) |
| `analytics.ts` | Analytics event type constants |
| `config-types.ts` | Configuration types, `DEFAULT_FILE_HISTORY_CONFIG` |
| `detailed-trace-types.ts` | Detailed trace event types for NDJSON tracing |
| `trace-command-response.ts` | Trace CLI command response types |

## Usage

```typescript
import type { AgentConfig, AgentResult } from '@kb-labs/agent-contracts';
import type { AgentEvent } from '@kb-labs/agent-contracts';
import { AgentRunRequestSchema } from '@kb-labs/agent-contracts';
```

This package has **no runtime dependencies** on other agent packages — it's pure types + Zod schemas. Every other `agent-*` package depends on it.

## Dependencies

- `zod` — runtime schema validation
