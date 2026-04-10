# ADR-0054: Workspace Identity Model

**Date:** 2026-03-21
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-03-21
**Tags:** [identity, routing, multi-host, workspace-agent]

## Context

В hybrid deployment (D4) у одного юзера может быть несколько Workspace Agent'ов: один на ноутбуке, другой в cloud container. Platform должна надёжно маршрутизировать execution на правильный host.

Текущий `firstHostWithCapability(namespaceId, 'execution')` возвращает первый попавшийся host — это недостаточно для:
- Различения laptop vs cloud container workspace
- Двух worktree одного repo
- Interactive host vs CI-oriented host
- Multi-project сценариев (юзер работает с несколькими repos)

## Decision

### Identity сущности

```
namespaceId       Tenant/org scope. Изолирует данные между организациями.
                  Default: "default". В SaaS — per-tenant.

hostId            Unique identity Workspace Agent instance.
                  Генерируется при `kb workspace register`.
                  Стабильный между restarts (сохранён в ~/.kb/agent.json).
                  Пример: "ws-laptop-a1b2c3", "ws-cloud-d4e5f6"

workspaceId       Logical workspace. Связывает host с проектом.
                  Может быть path-based ("~/projects/my-app") или
                  repo-based ("github.com/user/repo").
                  Один host может обслуживать несколько workspaces.

environmentId     Provisioned container ID. Для cloud containers (D3).
                  Генерируется при provisioning, уникален per container.
                  Workspace Agent внутри контейнера регистрируется с этим ID.

repoFingerprint   Hash(origin URL + root commit SHA).
                  Позволяет определить что два workspace — это один repo.
                  Для dedup и affinity routing.
```

### Host Registration

При `kb workspace register`:

```json
{
  "hostId": "ws-laptop-a1b2c3",
  "namespaceId": "default",
  "workspaces": [
    {
      "workspaceId": "projects-my-app",
      "path": "/Users/me/projects/my-app",
      "repoFingerprint": "sha256:abc123..."
    }
  ],
  "hostType": "local",
  "capabilities": ["filesystem", "execution"]
}
```

При container provisioning:

```json
{
  "hostId": "ws-cloud-d4e5f6",
  "namespaceId": "default",
  "workspaces": [
    {
      "workspaceId": "worktree-feature-x",
      "path": "/workspace",
      "repoFingerprint": "sha256:abc123...",
      "branch": "feature/x"
    }
  ],
  "hostType": "cloud",
  "environmentId": "env-789",
  "capabilities": ["filesystem", "execution"]
}
```

### Hello message extension

Workspace Agent при connect отправляет workspace info:

```typescript
{
  type: 'hello',
  protocolVersion: '1.0',
  agentVersion: '0.2.0',
  hostId: 'ws-laptop-a1b2c3',
  capabilities: ['filesystem', 'execution'],
  hostType: 'local',                           // NEW
  workspaces: [                                 // NEW
    {
      workspaceId: 'projects-my-app',
      repoFingerprint: 'sha256:abc123...',
      branch: 'main',
    }
  ],
  plugins: [                                    // NEW
    { id: '@kb-labs/commit-plugin', version: '1.0.0' },
    { id: '@kb-labs/quality-plugin', version: '0.5.0' },
  ],
}
```

Gateway сохраняет эту информацию в capability index для routing.

### Host Selection Strategy

`ExecutionTarget` включает `hostSelection`:

```typescript
type HostSelection = 'pinned' | 'any-matching' | 'prefer-local' | 'prefer-cloud';
```

| Strategy | Поведение |
|----------|-----------|
| `pinned` | Конкретный `hostId`. Если offline → error. |
| `any-matching` | Любой host с нужной capability + workspace. |
| `prefer-local` | Сначала `hostType: 'local'`, fallback на cloud. |
| `prefer-cloud` | Сначала `hostType: 'cloud'`, fallback на local. |

### Routing resolution

```typescript
findWorkspaceAgent(request: ExecutionRequest, target: WorkspaceAgentTarget): string | undefined {
  const { namespaceId } = request;
  const candidates = this.getHostsWithCapability(namespaceId, 'execution');

  // 1. Filter by workspaceId if specified
  if (target.workspaceId) {
    candidates = candidates.filter(h => h.workspaces.some(w => w.workspaceId === target.workspaceId));
  }

  // 2. Filter by repoFingerprint if specified
  if (target.repoFingerprint) {
    candidates = candidates.filter(h => h.workspaces.some(w => w.repoFingerprint === target.repoFingerprint));
  }

  // 3. Pin to specific host
  if (target.hostId) {
    return candidates.find(h => h.hostId === target.hostId)?.hostId;
  }

  // 4. Apply host selection strategy
  switch (target.hostSelection ?? 'any-matching') {
    case 'prefer-local':
      return candidates.find(h => h.hostType === 'local')?.hostId
          ?? candidates[0]?.hostId;

    case 'prefer-cloud':
      return candidates.find(h => h.hostType === 'cloud')?.hostId
          ?? candidates[0]?.hostId;

    case 'pinned':
      return undefined; // hostId required but not found

    case 'any-matching':
    default:
      return candidates[0]?.hostId;
  }
}
```

### Phase 1-2 vs Phase 3+ routing

**Phase 1-2:** `firstHostWithCapability(namespaceId, 'execution')` допускается **ТОЛЬКО** при:
- Один активный Workspace Agent на `namespaceId`
- Один logical workspace на пользователя
- Отсутствует hybrid routing (нет local + cloud одновременно)

**Guard:** если в namespace >1 execution-capable host, RoutingBackend должен reject с ошибкой `AMBIGUOUS_HOST_SELECTION` вместо молчаливого выбора первого.

**Phase 3+:** полный `findWorkspaceAgent()` с `hostSelection`, `workspaceId`, `repoFingerprint`.

### Gateway Capability Index extension

Текущий index: `Map<namespaceId, Map<capability, Set<hostId>>>`.

Расширяется metadata per host:

```typescript
interface HostMetadata {
  hostId: string;
  hostType: 'local' | 'cloud';
  workspaces: Array<{
    workspaceId: string;
    repoFingerprint?: string;
    branch?: string;
  }>;
  plugins: Array<{
    id: string;
    version: string;
  }>;
  connectedAt: number;
}

// Extended index
Map<namespaceId, Map<hostId, HostMetadata>>
```

`firstHostWithCapability` дополняется `findHostsWithMetadata(namespaceId, filters)`.

## Consequences

### Positive

- Надёжный routing в multi-host сценариях — нет ambiguity.
- `repoFingerprint` позволяет automatic affinity: два workspace одного repo → route к любому.
- `hostType` позволяет `prefer-local` / `prefer-cloud` strategy.
- `plugins` inventory — platform знает что доступно на host до отправки execution.
- Phase 1-2 guard предотвращает молчаливый wrong routing.

### Negative

- Hello message становится тяжелее (workspaces + plugins).
- Capability index нужно расширять metadata — больше памяти на Gateway.
- `repoFingerprint` нужно вычислять при register (git origin + root commit).

### Alternatives Considered

- **Только hostId (pin)** — отвергнуто: не масштабируется, юзер должен знать hostId.
- **Только capability routing** — отвергнуто: недостаточно для multi-host.
- **Workspace sync instead of routing** — отвергнуто: sync добавляет latency, не решает routing.

## Implementation

### Файлы

| Файл | Что |
|------|-----|
| `host-agent-contracts/src/config.ts` | +workspaces, +hostType в AgentConfig |
| `gateway-contracts/src/protocol.ts` | +workspaces, +plugins, +hostType в HelloMessage |
| `gateway-contracts/src/host.ts` | +HostMetadata type |
| `gateway-core/src/dispatcher.ts` | Расширить capability index metadata |
| `gateway-app/src/hosts/ws-handler.ts` | Сохранять metadata при registration |
| `plugin-execution-factory/src/types.ts` | `ExecutionTarget` с full options |
| `plugin-execution-factory/src/isolated-backend.ts` | `findWorkspaceAgent()` с host selection |
| `host-agent-cli/src/commands/register.ts` | Собирать workspace info при register |

## References

- [ADR-0017: Workspace Agent Architecture](../../../public/kb-labs/docs/adr/0017-workspace-agent-architecture.md)
- [ADR-0052: Execution Routing & Fallback](./0052-execution-routing-and-fallback.md)
- [ADR-0053: Delivery Semantics](./0053-delivery-semantics.md)

---

**Last Updated:** 2026-03-21
