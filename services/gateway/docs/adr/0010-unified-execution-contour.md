# ADR-0010: Unified Execution Contour (CC2–CC5)

**Date:** 2026-03-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-05
**Tags:** [gateway, execution, streaming, cancellation]

## Context

The Gateway needs a way for clients to invoke handlers on connected hosts and stream results back in real time. Several interacting concerns had to be addressed together:

- **CC2 — Cancellation**: An in-flight execution must be cancellable by the client or automatically cancelled on disconnect.
- **CC3 — Retry**: Transient failures (network glitch, host timeout) should be retried transparently with backoff.
- **CC4 — Streaming**: Results are not a single JSON blob; they are a stream of typed events (chunks, errors, done).
- **CC5 — Multi-client pub/sub**: Secondary clients (e.g., Studio UI) must be able to observe an execution started by a primary client.

These concerns interact: cancellation must stop the retry loop; disconnect detection must be careful not to fire during normal streaming; the event stream must be written to both the initiating HTTP client and any WS observers atomically.

## Decision

### `POST /api/v1/execute` — ndjson streaming

The execute endpoint hijacks the Fastify reply into a raw HTTP chunked response (`Transfer-Encoding: chunked`, `Content-Type: application/x-ndjson`). Each typed event is written as a single JSON line followed by `\n`. The final event is always `execution:done` with an `exitCode`.

**Headers flushed immediately.** After `writeHead(200)`, `reply.raw.flushHeaders()` is called unconditionally. This ensures the `X-Execution-Id` header reaches the client before the first event is written. Without this, clients using pipelining (e.g., Node.js `undici`) block the response read loop until the first `write()`, making the execution ID unavailable for early cancellation.

**Disconnect detection via `reply.raw`.** The `close` event is listened on `reply.raw` (the response socket), not `request.raw` (the request socket). `request.raw.close` fires when the request body is fully consumed — for a POST that means immediately, before any response events are sent. `reply.raw.close` fires when the response connection is torn down. The `writableFinished` guard distinguishes a normal end-of-stream from a mid-stream client drop:

```typescript
reply.raw.on('close', () => {
  if (!reply.raw.writableFinished && !signal.aborted) {
    executionRegistry.cancel(executionId, 'disconnect');
  }
});
```

### ExecutionRegistry (CC2)

An in-memory `Map<executionId, ActiveExecution>` tracks every in-flight execution. Each entry holds an `AbortController`; the `AbortSignal` is threaded into the dispatch call. Cancellation from any source (client request, disconnect, host going offline) calls `controller.abort(reason)`.

The registry is process-scoped (singleton). This is acceptable for the current single-instance Gateway. A distributed cancellation bus (e.g., Redis pub/sub) can replace it when horizontal scaling is needed.

### Retry Executor (CC3)

`executeWithRetry` wraps the dispatch call in an exponential-backoff loop. It races each attempt against the `AbortSignal` via `raceAbort(signal, attempt())`. If the signal fires, `CancelledError` is thrown immediately, aborting any pending backoff delay. Only errors marked `retryable` trigger a retry; all others surface immediately.

### SubscriptionRegistry (CC5) — Observer Clients

`GET /clients/connect` upgrades to a WebSocket. Clients send a `subscribe` message with an `executionId`. The `SubscriptionRegistry` maintains a dual index:

- `byExecution: Map<executionId, Set<connectionId>>` — for broadcasting a new event to all observers
- `byConnection: Map<connectionId, Set<executionId>>` — for cleaning up when a WS client disconnects

Every `writeEvent()` call in the execute handler calls `subscriptionRegistry.broadcast(executionId, event)` after writing to the HTTP response. Observers therefore receive the same event stream as the initiating client, with at most one event of latency.

## Consequences

### Positive

- Single `writeEvent()` call atomically delivers to HTTP initiator and all WS observers — no risk of split-brain event streams.
- `AbortSignal` threading means cancellation is honoured at every `await` point in the dispatch chain without polling.
- `flushHeaders()` guarantees the client sees `X-Execution-Id` before any events, enabling immediate cancellation if the handler is too slow.
- `reply.raw` + `writableFinished` disconnect detection correctly handles normal completion without false cancellations.
- Retry loop integrates cleanly with cancellation: a cancelled execution never retries.

### Negative

- The ExecutionRegistry is in-memory: if the Gateway process restarts, all in-flight executions are lost without notification to clients (clients will see a broken stream).
- No persistence of event streams: late-joining WS subscribers miss events emitted before they subscribed.
- Single-instance only: horizontal Gateway scaling requires a distributed cancellation mechanism (Redis pub/sub or similar).

### Alternatives Considered

- **SSE instead of ndjson** — rejected: SSE requires text encoding and a specific event format; ndjson is simpler, binary-friendly for future attachment events, and easier to parse with a streaming JSON library.
- **WebSocket for the primary execute channel** — rejected: HTTP POST + chunked response maps naturally to the request/response model and works with standard HTTP clients without a WS library. WS is reserved for long-lived observer connections.
- **Polling instead of streaming** — rejected: adds latency proportional to poll interval; requires server-side event buffering.
- **`request.raw.on('close')` for disconnect** — rejected (was initially implemented this way): fires when POST body is consumed, not when client disconnects from the response, causing immediate false cancellation.

## Implementation

### Key source files

| File | Role |
|------|------|
| `apps/gateway-app/src/execute/routes.ts` | `POST /execute` and `POST /execute/:id/cancel` handlers |
| `apps/gateway-app/src/execute/execution-registry.ts` | In-memory AbortController registry |
| `apps/gateway-app/src/execute/retry-executor.ts` | Exponential backoff + abort race |
| `apps/gateway-app/src/execute/errors.ts` | `CancelledError` with reason field |
| `apps/gateway-app/src/clients/routes.ts` | `GET /clients/connect` WS upgrade |
| `apps/gateway-app/src/clients/subscription-registry.ts` | Dual-index observer pub/sub |

### Bugs fixed during implementation

1. **`HostRegistry.register()` missing namespace index** (`hosts/registry.ts`): The `list()` method reads host IDs from `host:index:{namespaceId}` and then fetches each descriptor. `register()` stored the descriptor and machine token but never updated the index, so `GET /hosts` always returned an empty array. Fixed by adding the same index-update logic that `ensureRegistered()` already had.

2. **False disconnect cancellation** (`execute/routes.ts`): The initial implementation used `request.raw.on('close', ...)`. Because Fastify/Node.js emits `close` on the request socket as soon as the request body is fully consumed (not when the client closes the TCP connection), every execution was cancelled immediately after the POST body was read. Fixed by switching to `reply.raw.on('close', ...)` with the `writableFinished` guard.

3. **Headers not flushed** (`execute/routes.ts`): `reply.raw.writeHead(200, {...})` queues headers in Node.js's internal buffer; they are only sent when the first `write()` or `end()` call is made. Without `flushHeaders()`, `fetch()` (undici) never resolved the response promise until the first event was written. If the host handler blocked (e.g., waiting for LLM), the client could not see `X-Execution-Id` to issue a cancel. Fixed by calling `reply.raw.flushHeaders()` immediately after `writeHead()`.

### Test isolation

Live e2e tests (`live-gateway.e2e.test.ts`) use `describe.sequential(...)` for every describe block. Without this, Vitest runs describe blocks concurrently, which causes WS connection races against the shared Gateway process. Vitest's default `--pool=threads` shares module state within a file but not across files; `describe.sequential` serialises execution within a file.

## References

- [Gateway Architecture](../../../kb-labs/docs/architecture/GATEWAY.md)
- [ADR-0009: E2E Encryption Deferred](./0009-e2e-encryption-deferred.md)

---

**Last Updated:** 2026-03-05
