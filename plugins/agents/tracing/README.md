# @kb-labs/agent-tracing

Execution tracing and observability for KB Labs agents. Writes crash-safe NDJSON trace files with privacy redaction and provides tools for loading and analyzing traces.

## Features

- **Crash-safe NDJSON** — append-only writes, no data loss on crash
- **Incremental flushing** — traces available in real-time during execution
- **Privacy redaction** — strips API keys, tokens, personal paths
- **Trace indexing** — fast lookups by event type, tool name, iteration
- **Helper factories** — type-safe builders for all event types

## Components

### IncrementalTraceWriter

Main tracer for production. Writes events to NDJSON file with automatic flushing and indexing.

```typescript
import { IncrementalTraceWriter } from '@kb-labs/agent-tracing';

const writer = new IncrementalTraceWriter({
  outputPath: './traces/run-001.ndjson',
  flushIntervalMs: 1000,
});

writer.write(traceAgentStart({ task, tier, maxIterations, toolCount }));
// ... agent execution ...
writer.write(traceAgentEnd({ success, summary, iterations, tokensUsed, durationMs }));

await writer.close();
```

### FileTracer

In-memory tracer for tests and development.

### TraceLoader

Loads and validates existing NDJSON trace files for CLI analysis commands.

```typescript
import { loadTrace } from '@kb-labs/agent-tracing';

const result = loadTrace('./traces/run-001.ndjson');
if (result.ok) {
  console.log(`${result.events.length} events loaded`);
}
```

### PrivacyRedactor

Redacts sensitive data before persistence:
- API keys and tokens (`sk-...`, `Bearer ...`)
- Personal file paths (`/Users/name/...` → `~/...`)
- Environment variables with secrets

### Trace Helpers

Factory functions for all trace event types:

```typescript
import {
  traceAgentStart,
  traceToolStart,
  traceToolEnd,
  traceLLMEnd,
} from '@kb-labs/agent-tracing';
```

## Trace Format

Each line in an NDJSON file is a JSON object:

```json
{"type":"agent:start","timestamp":"...","data":{"task":"Fix bug","tier":"medium"}}
{"type":"tool:start","timestamp":"...","data":{"toolName":"fs_read","input":{"path":"src/auth.ts"}}}
{"type":"tool:end","timestamp":"...","data":{"toolName":"fs_read","success":true,"durationMs":12}}
```

Default location: `.kb/traces/incremental/`.

## Dependencies

- `@kb-labs/agent-contracts` — event type definitions
- `@kb-labs/sdk` — platform SDK
