# ADR-0052: Execution Routing & Fallback

**Date:** 2026-03-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-21
**Tags:** [execution, routing, fallback, workspace-agent]

## Context

С введением Workspace Agent (ADR-0017) execution request может быть направлен в несколько мест: in-process на платформе, на Workspace Agent (ноутбук юзера), в provisioned container, на конкретный host.

Текущий `RoutingBackend` в `plugin-execution-factory` проверяет только `target.environmentId`. Этого недостаточно для новых сценариев.

Нужно решить:
1. **Кто решает куда отправить execution?** — автор плагина, platform, routing config?
2. **Что делать если target недоступен?** — fallback, error, retry?
3. **Как workflow steps указывают target?**

### Альтернативы

- **Автор плагина размечает host/server** — отвергнуто: плохой DX, автор не должен думать о deployment.
- **Platform автоматически по capabilities из manifest** — отвергнуто: слишком магично, непредсказуемо, сложно дебажить.
- **Конфиг на уровне deployment** — принято: прозрачно, настраивается один раз, явно.

## Decision

### Routing = конфигурация на уровне deployment

Routing определяется конфигом платформы, а не плагином или runtime-эвристикой.

```json
{
  "routing": {
    "default": "local",
    "fallbackPolicy": "platform-safe-only",
    "rules": [
      {
        "match": { "pluginClass": "workspace-mutation" },
        "target": "workspace-agent",
        "fallback": "error"
      },
      {
        "match": { "pluginClass": "analysis-only" },
        "target": "workspace-agent",
        "fallback": "local"
      },
      {
        "match": { "pluginId": "@kb-labs/mind-*" },
        "target": "local"
      }
    ]
  }
}
```

**Для localhost/dev:** `default: "local"` — всё in-process (как сейчас).
**Для SaaS:** `default: "workspace-agent"` — всё на подключённый Workspace Agent.

Rules проверяются сверху вниз, первый match побеждает. Если ни один rule не сматчился — используется `default`.

### ExecutionTarget type

```typescript
type ExecutionTarget =
  | { type: 'platform' }
  | {
      type: 'workspace-agent';
      workspaceId?: string;
      hostId?: string;
      hostSelection?: 'pinned' | 'any-matching' | 'prefer-local' | 'prefer-cloud';
      repoFingerprint?: string;
    }
  | { type: 'environment'; environmentId: string };
```

### Fallback Policy

Когда target недоступен (Workspace Agent offline, container не provisioned), routing engine проверяет fallback policy.

```
fallbackPolicy: 'forbid' | 'platform-safe-only' | 'allow'
```

| Policy | Поведение |
|--------|-----------|
| `forbid` | Target недоступен → error. **Default для mutating plugins.** |
| `platform-safe-only` | Только read-only / analysis plugins могут fallback на `local`. Mutating → error. |
| `allow` | Любой plugin может выполниться на платформе. Только для dev. |

**Почему `forbid` по умолчанию для mutating:**

`commit-plugin` делает `git commit` в repo юзера. Если Workspace Agent offline и platform выполнит его локально — это бессмысленно: platform не видит тот же repo. Молчаливый fallback маскирует проблему и может привести к потере данных.

### Plugin Target Compatibility

| Plugin class | Platform | Workspace Agent | Fallback |
|---|---|---|---|
| `mind/rag` | yes | no | n/a |
| `review` (LLM-only) | yes | optional | yes |
| `commit/git` | no | yes | **forbid** |
| `agent workspace-mutation` | no | yes | **forbid** |
| `analysis-only` | yes | yes | yes |
| `devkit/qa` | no | yes | **forbid** |

Plugin class определяется из manifest:
```json
{
  "pluginClass": "workspace-mutation",
  "capabilities": { "requires": ["fs", "git", "shell"] }
}
```

### Workflow step target

Workflow step может явно указать target:

```yaml
steps:
  - id: analyze
    uses: mind-plugin/rag-query
    target: platform

  - id: implement
    uses: agent-plugin/execute
    target: workspace-agent

  - id: commit
    uses: commit-plugin/commit
    target: workspace-agent

  - id: review
    uses: review-plugin/review
    target: platform
```

Если `target` не указан — используется routing config.

### RoutingBackend: изменения

Текущий `RoutingBackend` в `isolated-backend.ts` проверяет `target.environmentId`. Добавляется `target.type`:

```typescript
async execute(request: ExecutionRequest): Promise<ExecutionResult> {
  const target = this.resolveTarget(request);

  switch (target.type) {
    case 'workspace-agent': {
      const hostId = this.findWorkspaceAgent(request, target);
      if (!hostId) {
        return this.handleFallback(request, target, 'WORKSPACE_AGENT_OFFLINE');
      }
      return this.remoteBackend.execute(request, hostId);
    }

    case 'platform':
      return this.localBackend.execute(request);

    case 'environment':
      return this.remoteBackend.execute(request, target.environmentId);
  }
}

private resolveTarget(request: ExecutionRequest): ExecutionTarget {
  // 1. Explicit target in request → use it
  if (request.target?.type) return request.target;

  // 2. Check routing rules
  for (const rule of this.routingConfig.rules) {
    if (this.matchesRule(request, rule)) {
      return { type: rule.target, ...rule.targetOptions };
    }
  }

  // 3. Default
  return { type: this.routingConfig.default };
}

private handleFallback(
  request: ExecutionRequest,
  target: ExecutionTarget,
  reason: string,
): ExecutionResult {
  const policy = this.routingConfig.fallbackPolicy;
  const pluginClass = request.descriptor.pluginClass;

  if (policy === 'forbid') {
    return { ok: false, error: new WorkspaceAgentOfflineError(reason) };
  }

  if (policy === 'platform-safe-only' && pluginClass === 'workspace-mutation') {
    return { ok: false, error: new WorkspaceAgentOfflineError(reason) };
  }

  // Fallback to local
  return this.localBackend.execute(request);
}
```

### Phase 1-2: упрощённый routing

Phase 1-2 допускают `firstHostWithCapability(namespaceId, 'execution')` **ТОЛЬКО** при инварианте:
- Один активный Workspace Agent на `namespaceId`
- Один logical workspace на пользователя
- Отсутствует hybrid routing между local/cloud hosts

Если в namespace зарегистрировано >1 execution-capable host, RoutingBackend **ОБЯЗАН** использовать расширенный `ExecutionTarget` (`workspaceId`, `hostId`, `hostSelection`, `repoFingerprint`).

Phase 3+: full multi-host routing с host selection strategy.

### REST API — один код, разный конфиг

REST API вызывает `backend.execute(request)`. RoutingBackend решает куда на основе конфига.

```
Localhost:  RoutingBackend(default: 'local')           → InProcessBackend
SaaS:       RoutingBackend(default: 'workspace-agent') → Gateway → Workspace Agent
```

Один и тот же REST API, одни и те же endpoints. Разница — конфиг.

## Consequences

### Positive

- Routing прозрачный и предсказуемый — конфиг, не магия.
- Fallback policy защищает от бессмысленного выполнения mutating plugins на платформе.
- Workflow steps могут явно указать target — полный контроль.
- REST API не знает о deployment mode — чистая абстракция.
- Phase 1-2 shortcut позволяет начать с простого routing.

### Negative

- Routing config нужно поддерживать при добавлении новых плагинов.
- `pluginClass` нужно добавить в manifest schema (новое поле).
- Phase 1-2 shortcut = tech debt который нужно заменить в Phase 3.

### Alternatives Considered

- **Automatic routing по capabilities** — отвергнуто: непредсказуемо, сложно дебажить.
- **Per-plugin routing в manifest** — отвергнуто: автор плагина не должен знать о deployment.
- **Always fallback** — отвергнуто: маскирует проблемы для mutating plugins.

## Implementation

### Файлы

| Файл | Что |
|------|-----|
| `plugin-execution-factory/src/isolated-backend.ts` | Расширить RoutingBackend: `target.type` routing |
| `plugin-execution-factory/src/types.ts` | `ExecutionTarget` type |
| `plugin-execution-factory/src/errors.ts` | `WorkspaceAgentOfflineError` |
| `plugin-contracts/src/manifest.ts` | +`pluginClass` field |
| REST API config или `kb.config.json` | routing config schema |
| `workflow-runtime/src/runners/sandbox-runner.ts` | Прокидывать `target` из workflow step |

## References

- [ADR-0017: Workspace Agent Architecture](../../../public/kb-labs/docs/adr/0017-workspace-agent-architecture.md)
- [ADR-0051: Bidirectional Gateway Protocol](./0051-bidirectional-gateway-protocol.md)
- [ADR-0053: Delivery Semantics](./0053-delivery-semantics.md)
- [ADR-0054: Workspace Identity Model](./0054-workspace-identity-model.md)

---

**Last Updated:** 2026-03-21
