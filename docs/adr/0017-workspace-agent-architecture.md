# ADR-0017: Workspace Agent Architecture

**Date:** 2026-03-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-21
**Tags:** [architecture, workspace-agent, execution, deployment]

## Context

KB Labs должен работать в нескольких deployment-сценариях: код на ноутбуке разработчика (платформа удалённо), код в cloud container (worktree/codespace), всё локально (инди-разработчик), SaaS.

Ключевая проблема: плагины используют npm-пакеты (`simple-git`, `glob`, `chokidar`), которые вызывают `fs.*` / `child_process.*` напрямую. Проксировать произвольные системные вызовы невозможно — npm пакет `glob` делает сотни `readdirSync`, latency × N = неприемлемо. FUSE/monkey-patching — хрупко и platform-specific.

Нужна архитектура, где:
- Плагин всегда работает нативно с файловой системой
- Platform services (LLM, RAG, state) доступны независимо от deployment
- Один и тот же код работает во всех сценариях

## Decision

### Компонентная модель: Brain / Hands / Spine / Face

```
Brain (Platform Core)   — LLM inference, RAG/embeddings, Workflow engine,
                          Session state, Billing, Auth, Mind RAG

Hands (Workspace Agent) — File read/write, Git operations, Shell exec,
                          Build/Test, npm packages, Plugin execution

Spine (Gateway)         — WS routing, Capability discovery, Auth relay,
                          Call dispatch, Buffering

Face (Clients)          — Studio (Web UI), CLI, REST API.
                          НЕ выполняют логику, только отображение.
```

**Ключевое решение:** плагин выполняется на Hands (Workspace Agent) — там же, где файловая система. npm пакеты работают нативно. Platform services проксируются обратно к Brain через Spine (Gateway).

### Инварианты

Истинны **ВСЕГДА**, в любом deployment:

| # | Инвариант |
|---|-----------|
| INV-1 | **Плагин выполняется ТАМ ЖЕ где файлы.** npm пакеты работают без proxy. Никогда не проксируем произвольные fs/child_process. |
| INV-2 | **Platform services доступны через `ctx.*`.** `ctx.llm`, `ctx.cache`, `ctx.mind` — всегда работают. Direct call ИЛИ proxy. Автор плагина не знает и не решает. |
| INV-3 | **Gateway — единственная точка связи Brain ↔ Hands.** Brain не знает IP/порт Hands (и наоборот). Hands инициирует outbound WS (NAT-friendly). |
| INV-4 | **Один REST API, один Studio — разный RoutingBackend.** Клиентский код не знает deployment mode. Разница только в конфиге. |
| INV-5 | **Безопасность в plugin-runtime, не в deployment.** Permissions → governed.ts → shims → harden.ts. Deployment добавляет уровень изоляции, но не заменяет. |
| INV-6 | **Workspace Agent = Brain-less Platform.** Имеет plugin-runtime. НЕ имеет LLM/Qdrant/Workflow/Billing. Получает platform services через reverse proxy. |
| INV-7 | **Workflow step имеет target.** `platform` \| `workspace-agent` \| `environmentId`. Default = routing config. |

### Deployment'ы

```
                  D1 (localhost)   D2 (SaaS+local)   D3 (SaaS+cloud)   D4 (гибрид)
─────────────────────────────────────────────────────────────────────────────────────
Brain             localhost         Cloud              Cloud              Cloud
Hands             localhost         Laptop             Container          Laptop+Container
Gateway           —                 Cloud              Cloud              Cloud
Plugin exec       in-process        WS→Laptop          WS→Container       WS→either
ctx.llm           direct            proxy→Cloud        proxy→Cloud        proxy→Cloud
ctx.fs            native            native             native             native
```

**D1 (всё локально):** Brain + Hands + Spine + Face = один процесс. Gateway не нужен. Уже работает.

**D2 (SaaS + код локально):** Brain в cloud, Hands на ноутбуке. Gateway соединяет. Плагин на ноутбуке, `ctx.llm` проксируется к Brain.

**D3 (SaaS + код в cloud):** Brain и Hands оба в cloud, но в разных контейнерах. Workspace Agent внутри контейнера — тот же код что на ноутбуке.

**D4 (гибрид):** Два Workspace Agent'а — на ноутбуке (интерактивные команды) и в cloud (тяжёлые задачи). Routing config определяет кто получает какой execution.

### Что одинаково во всех deployment'ах

**Одинаковый код:** REST API, Studio, Plugin handlers, Workflow definitions, plugin-runtime, RoutingBackend, Workspace Agent daemon.

**Разный конфиг:** execution-routing (default target), Gateway URL, LLM keys location.

### Для автора плагина

Автор пишет **один handler** — работает в любом deployment:

```typescript
export async function execute(ctx: PluginContext, input: Input) {
  const status = await simpleGit(input.repoPath).status(); // нативно, fs рядом
  const result = await ctx.llm.complete(prompt);            // direct ИЛИ proxy
  fs.writeFileSync('output.json', JSON.stringify(result));  // нативно
}
```

Автор не знает и не решает где выполняется плагин. `ctx.*` работает одинаково.

## Consequences

### Positive

- Один handler для всех deployment'ов — нет fragmentation.
- npm пакеты работают нативно без ограничений.
- Существующий Host Agent переиспользуется на 80%.
- REST API и Studio не меняются.
- Безопасность не зависит от deployment (plugin-runtime enforces permissions).

### Negative

- Workspace Agent на машине юзера = attack surface (митигируется plugin-runtime permissions + sandbox).
- Gateway = single point of failure для SaaS (митигируется горизонтальным масштабированием).
- Дополнительный HTTP hop для adapter:call (~1-5ms, незаметно на фоне LLM).

### Alternatives Considered

- **Плагин на сервере + proxy fs** — отвергнуто: npm пакеты делают сотни fs вызовов, latency неприемлем.
- **Два класса плагинов (local/cloud)** — отвергнуто: плохой DX, fragmentation, двойная поддержка.
- **FUSE / LD_PRELOAD** — отвергнуто: хрупко, platform-specific, неполное покрытие.
- **Workspace sync (clone в cloud)** — не отвергнуто, а отложено: подходит для D3, но не для интерактивных D2.

## Implementation

Реализация разбита на 6 фаз:

| Phase | Что |
|-------|-----|
| 0 | Contract Hardening + Documentation (ADRs, архитектурная карта, Zod schemas) |
| 1 | Bidirectional WS Protocol (adapter:call/response/error, GatewayTransport) |
| 2 | ExecutionHandler + Plugin Resolution (plugin execution на Workspace Agent) |
| 3 | Agent Tools — Cursor-модель (IWorkspaceProvider, search/git/shell handlers) |
| 4 | Subprocess execution mode (sandboxed execution) |
| 5 | Rename + Polish (CLI commands, workspace config) |

Детали реализации — во внутренних ADR:
- [ADR-0051: Bidirectional Gateway Protocol](../../platform/kb-labs-core/docs/adr/0051-bidirectional-gateway-protocol.md)
- [ADR-0052: Execution Routing & Fallback](../../platform/kb-labs-core/docs/adr/0052-execution-routing-and-fallback.md)
- [ADR-0053: Delivery Semantics](../../platform/kb-labs-core/docs/adr/0053-delivery-semantics.md)
- [ADR-0054: Workspace Identity Model](../../platform/kb-labs-core/docs/adr/0054-workspace-identity-model.md)

## References

- [Architecture Map: Workspace Agent](../architecture/workspace-agent.md)
- [Gateway ADR-0010: Unified Execution Contour](../../infra/kb-labs-gateway/docs/adr/0010-unified-execution-contour.md)
- [ADR-0016: Layered Ecosystem Model](./0016-layered-ecosystem-model.md)

---

**Last Updated:** 2026-03-21
