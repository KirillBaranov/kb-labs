# ADR-0051: Bidirectional Gateway Protocol

**Date:** 2026-03-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-21
**Tags:** [gateway, protocol, workspace-agent, reverse-proxy]

## Context

Workspace Agent (Hands) выполняет плагины рядом с файлами, но плагинам нужны platform services (LLM, cache, vectorStore, embeddings, storage, state), которые живут на Brain (Platform Core).

Существующий WS протокол между Gateway и Host Agent — **однонаправленный для capability calls**: Gateway → Host (`call` message), Host отвечает (`chunk`/`result`/`error`). Host → Gateway использует HTTP (`executeTunnel`).

Нужен **reverse direction**: Host (Workspace Agent) отправляет adapter calls обратно к Platform через тот же WS.

### Альтернативы

- **HTTP для каждого adapter call** — отвергнуто: дополнительный TCP handshake на каждый вызов, нет connection reuse, сложнее timeout management.
- **Отдельный WS канал** — отвергнуто: два WS = двойная сложность reconnect, auth, heartbeat. Один WS уже bidirectional на transport level.
- **Gateway инициализирует platform** — отвергнуто: нарушает INV-6 (Gateway = stateless Spine). Дублирует REST API.

## Decision

### Новые message types

Протокол вводится **по фазам** для снижения риска.

**Phase 1 (MVP):** request/response — достаточно для non-streaming adapter calls.

```
Host → Gateway:   adapter:call       Вызов platform adapter
Gateway → Host:   adapter:response   Успешный ответ
Gateway → Host:   adapter:error      Ошибка
```

**Phase 2+:** streaming + cancellation — для LLM streaming и abort.

```
Gateway → Host:   adapter:chunk      Streaming data (LLM tokens)
Host → Gateway:   adapter:cancel     Abort in-flight call
```

### Message schemas

```typescript
// Phase 1

export const AdapterCallMessageSchema = z.object({
  type: z.literal('adapter:call'),
  requestId: z.string(),
  adapter: z.string(),            // 'llm' | 'cache' | 'vectorStore' | ...
  method: z.string(),             // 'complete' | 'get' | 'search' | ...
  args: z.array(z.unknown()),
  timeout: z.number().optional(),
  context: z.object({
    namespaceId: z.string(),
    hostId: z.string(),
    workspaceId: z.string().optional(),
    environmentId: z.string().optional(),
    executionRequestId: z.string().optional(),
  }),
});

export const AdapterResponseMessageSchema = z.object({
  type: z.literal('adapter:response'),
  requestId: z.string(),
  result: z.unknown(),
});

export const AdapterErrorMessageSchema = z.object({
  type: z.literal('adapter:error'),
  requestId: z.string(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.unknown().optional(),
  }),
});

// Phase 2+

export const AdapterChunkMessageSchema = z.object({
  type: z.literal('adapter:chunk'),
  requestId: z.string(),
  data: z.unknown(),
  index: z.number().int().nonnegative(),
});

export const AdapterCancelMessageSchema = z.object({
  type: z.literal('adapter:cancel'),
  requestId: z.string(),
});
```

### Adapter allowlist

`adapter:call` — **НЕ generic RPC**. Это reverse transport только для явно экспортированных platform services.

| Adapter | Allowed methods |
|---------|----------------|
| `llm` | `complete`, `stream` |
| `cache` | `get`, `set`, `delete`, `clear` |
| `vectorStore` | `search`, `upsert`, `delete` |
| `embeddings` | `embed` |
| `storage` | `read`, `write`, `delete`, `list` |
| `state` | `get`, `set`, `delete` |

Всё вне allowlist → reject с `ADAPTER_CALL_REJECTED`. Никакого reflective dispatch.

Каждый method имеет `inputSchema` и `outputSchema` (Zod). Validation на вход и выход.

### Routing: Gateway → REST API

Gateway остаётся stateless. При получении `adapter:call` от Host:

```
Host → WS: {type: 'adapter:call', adapter: 'llm', method: 'complete', ...}
  → Gateway ws-handler: case 'adapter:call'
  → HTTP POST /api/v1/internal/adapter-call (к REST API)
    Headers: x-internal-secret
    Body: { requestId, adapter, method, args, context }
  → REST API: AdapterRegistry.get(adapter, method)
    → inputSchema.parse(args)
    → execute(parsedArgs, context)
    → outputSchema.parse(result)
  → HTTP Response: { ok: true, result } | { ok: false, error }
  → Gateway
  → WS: {type: 'adapter:response', requestId, result}
```

Это тот же паттерн что `/internal/dispatch` (Gateway → HTTP → host). Только в обратном направлении: host → Gateway → HTTP → REST API.

### AdapterRegistry

Новый модуль в REST API. Явный registry экспортированных methods:

```typescript
const registry = new AdapterRegistry();

registry.register('llm', 'complete', {
  inputSchema: z.tuple([LLMCompletionRequestSchema]),
  outputSchema: LLMCompletionResponseSchema,
  execute: (args, ctx) => platform.llm.complete(...args),
});

// ... per method
```

Endpoint `/api/v1/internal/adapter-call`:
```typescript
const entry = registry.get(body.adapter, body.method);
if (!entry) throw new ForbiddenError(`Not allowed: ${body.adapter}.${body.method}`);

const parsedArgs = entry.inputSchema.parse(body.args);
const result = await entry.execute(parsedArgs, body.context);
return { ok: true, result: entry.outputSchema.parse(result) };
```

### Audit logging

Каждый `adapter:call` логируется:
- `requestId`, `adapter`, `method`
- `hostId`, `namespaceId`, `workspaceId`
- `latencyMs`, `outcome` (success/error/timeout)
- `executionRequestId` (для корреляции с execution)

### GatewayTransport (ITransport implementation)

На стороне Workspace Agent — `GatewayTransport` реализует существующий `ITransport` interface:

```typescript
class GatewayTransport implements ITransport {
  constructor(private readonly client: GatewayClient) {}

  async send(call: AdapterCall): Promise<AdapterResponse> {
    return this.client.sendAdapterCall(call);
  }
  async close(): Promise<void> { /* ... */ }
  isClosed(): boolean { /* ... */ }
}
```

Используется через `createProxyPlatform({ transport: gatewayTransport })` — все proxy adapters (LLMProxy, CacheProxy, etc.) автоматически работают через WS.

### GatewayClient changes

Расширения в `GatewayClient`:

1. `pendingAdapterCalls: Map<string, PendingRequest>` — pending reverse calls
2. `sendAdapterCall(call): Promise<AdapterResponse>` — отправляет `adapter:call`, ждёт `adapter:response`/`adapter:error`
3. `onMessage()` — новые cases: `adapter:response` → resolve, `adapter:error` → reject
4. `onClose()` — `rejectAllPending()` с `TransportError`

## Consequences

### Positive

- Один WS канал для обоих направлений — нет дополнительных соединений.
- `ITransport` interface уже существует — `GatewayTransport` = тонкий wrapper.
- `createProxyPlatform()` работает без изменений — все proxy adapters готовы.
- Gateway остаётся stateless — только форвардит к REST API.
- Allowlist + Zod schemas = жёсткий trust boundary.
- Audit log = полная трассировка adapter calls.

### Negative

- Дополнительный HTTP hop Gateway → REST API (~1-5ms). Приемлемо на фоне LLM latency.
- Phase 1 не поддерживает streaming — LLM `stream()` будет работать как batch `complete()`. Streaming в Phase 2.
- Concurrent adapter calls на одном WS — нужен корректный requestId matching (уже proven pattern в `HostCallDispatcher`).

### Alternatives Considered

- **Gateway с platform instance** — отвергнуто: дублирует REST API, нарушает stateless.
- **HTTP вместо WS для adapter calls** — отвергнуто: дополнительный TCP handshake, нет connection reuse.
- **Generic `platform[adapter][method]()` dispatch** — отвергнуто (Codex review): слишком широкий trust boundary.

## Implementation

### Файлы

| Файл | Что |
|------|-----|
| `gateway-contracts/src/protocol.ts` | +5 message schemas |
| `host-agent-core/src/ws/gateway-client.ts` | +sendAdapterCall, +adapter:response/error handling |
| `host-agent-core/src/transport/gateway-transport.ts` | NEW: ITransport impl |
| `gateway-app/src/hosts/ws-handler.ts` | +adapter:call case |
| `gateway-app/src/hosts/adapter-call-handler.ts` | NEW: Gateway → REST API forwarder |
| `rest-api/.../routes/internal/adapter-call.ts` | NEW: endpoint + AdapterRegistry |
| `rest-api/.../adapter-registry.ts` | NEW: method allowlist + schemas |

### Переиспользуемое (без изменений)

| Файл | Что |
|------|-----|
| `core-runtime/src/transport/transport.ts` | `ITransport`, `PendingRequest`, `TransportError` |
| `core-runtime/src/proxy/create-proxy-platform.ts` | `createProxyPlatform({ transport })` |
| `core-runtime/src/proxy/remote-adapter.ts` | `RemoteAdapter` base class |

## References

- [ADR-0017: Workspace Agent Architecture](../../../public/kb-labs/docs/adr/0017-workspace-agent-architecture.md)
- [Gateway ADR-0010: Unified Execution Contour](../../../infra/kb-labs-gateway/docs/adr/0010-unified-execution-contour.md)
- [ADR-0038: IPC Serialization Protocol](./0038-ipc-serialization-protocol.md)
- [ADR-0039: Cross-Process Adapter Architecture](./0039-cross-process-adapter-architecture.md)

---

**Last Updated:** 2026-03-21
