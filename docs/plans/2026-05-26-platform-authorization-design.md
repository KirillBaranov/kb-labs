---
plan_id: "2026-05-26-platform-authorization-design"
created_at: "2026-05-26"
status: "design-discussion"
priority: "high"
tags: ["authorization", "pdp", "rbac", "rebac", "permissions", "platform"]
clickup_epic: "869def338"
clickup_url: "https://app.clickup.com/t/869def338"
---

# Platform Authorization Layer — Design Discussion

> Conversation summary. ClickUp эпик 869def338 переосмыслен после обсуждения кейсов. ABAC отброшен, выбран RBAC + ReBAC. Документ — отправная точка для ADR.

## Контекст эпика (как написано в ClickUp)

**Цель:** Платформенный слой авторизации (PDP + RBAC/ABAC), потребляется gateway, plugin-runtime, REST API, workflow, любым плагином с правами. Один источник правды.

**Зависимости:**
- Studio auth plan ([effervescent-hatching-whistle.md](/Users/kirillbaranov/.claude/plans/effervescent-hatching-whistle.md)) — даёт Identity + stub PDP, который этот эпик заменяет.
- TD-8 (Team Deploy fleet RBAC, https://app.clickup.com/t/869dc8dd6) — потребитель, не сам слой.

**Шесть принципов из эпика (попадают в ADR):**
1. Identity vs Policy раздельны.
2. Token не несёт прав.
3. Subject ≠ Identity (резолвится платформой на каждый запрос).
4. PDP — единственный публичный шов: `IPolicyDecisionPoint.check(identity, action, resource?, context?)`.
5. Plugin-extension для предикатов/атрибутов.
6. Permission strings — единый каталог в `core/contracts`.

---

## As-is аудит (что уже есть в коде)

| Компонент | Состояние | Где |
|---|---|---|
| PDP / ABAC | **нет** | — |
| RBAC ядро | есть, изолированно | [core/policy/](core/policy/) — `can(policy, identity, action, resource)`, `BASE_ACTIONS`. Это workspace-policy (release.publish и т.п.), не runtime authz. Не интегрирован с gateway. |
| Permission checks в gateway | **нет** | [middleware.ts:27](plugins/gateway/app/src/auth/middleware.ts:27) — только аутентификация. `AuthContext.permissions` всегда = `['host:connect']` ([service.ts:143](plugins/gateway/auth/src/service.ts:143)). |
| Users/Groups/Memberships store | **нет** | [auth/store.ts](plugins/gateway/auth/src/store.ts) — только `ClientRecord` (machine clients). |
| Identity / JWT | минимум | [jwt.ts:29](plugins/gateway/auth/src/jwt.ts:29): `sub, namespaceId, tier, type, iat, exp`. Без role/scopes — принцип 2 уже соблюдён. |
| Permission strings catalog | частично | `BASE_ACTIONS` в core/policy. В `core/contracts` нет. Magic strings в gateway. |
| Plugin SDK (`platform.policy`) | **нет** | [sdk/sdk/src/platform/index.ts](sdk/sdk/src/platform/index.ts) ничего про policy. |
| REST/Workflow guards | **нет** | Все эндпоинты открыты для аутентифицированных. |
| ADR | **нет** | Ни одного ADR про authorization. |

**Ключевое:** Studio auth plan ещё **не смержен**, stub PDP физически отсутствует. Значит мы делаем **реальный PDP сразу**, без промежуточного stub'а в репе.

---

## Архитектура адаптеров (как PDP туда укладывается)

ADR-0001 (`core/plugin-runtime/docs/adr/ADR-0001-adapter-pipeline.md`) — единый pipeline для платформенных адаптеров.

- **ADAPTER_REGISTRY** (`core/plugin-runtime/src/platform/adapter-registry.ts`): 16 адаптеров (logger, llm, embeddings, vectorStore, cache, storage, analytics, eventBus, config, invoke, sqlDatabase, documentDatabase, logs, notifier, artifacts, snapshotManager).
- **Слоты:** `raw → router → post-router → resource-broker → post-resource-broker → governance`.
- **Phase 1 (`assemblePlatform`):** один раз на старте, применяет router + resource-broker factories.
- **Phase 2 (`applyPluginGovernance`):** per-plugin, применяет middlewares + governance wrap. Проверяет `ctx.permissions.platform[adapterKey]`.
- **IPC strategy** в registry: `'proxy' | 'noop' | 'local' | 'absent'`. Worker'ы получают Proxy-объекты, parent обслуживает через `ChildIPCServer`.

**Существующая авторизация в pipeline — это ось A** (см. ниже).

---

## Две оси авторизации (главное открытие обсуждения)

| Ось | Кто субъект | Что проверяем | Когда резолвится | Источник правды | Где enforced |
|---|---|---|---|---|---|
| **A. Plugin → Platform** *(уже есть)* | Плагин (`pluginId`) | "Можно ли плагину звать `platform.llm`?" | На старте Phase 2 + per-call предикаты | `PermissionSpec` в манифесте плагина | `wrap*` в ADAPTER_REGISTRY |
| **B. User → Action → Resource** *(эпик PDP)* | Identity (`userId`, `tenantId`) | "Может ли alice сделать `workflow:run` на `workflow-42`?" | Per-request | Группы/membership + relations | `policy.check(...)` в хендлерах |

**Они не пересекаются**, кроме одной точки: плагин зовёт PDP → permission `platform.policy` для плагина (ось A) разрешает доступ к адаптеру `policy`, дальше PDP делает свою работу (ось B).

---

## Зафиксированные концептуальные решения

| Решение | Выбор | Обоснование |
|---|---|---|
| PDP в реестре адаптеров | Новый адаптер `policy`, `platform.policy.check(...)` | Симметрия с llm/cache, переиспользует pipeline, governance, IPC infra |
| IPC | Parent + `ipc: 'proxy'` | Один экземпляр в parent, мгновенная инвалидация при изменении membership, централизованный audit |
| Оси A и B | Раздельно | Разные жизненные циклы (статичный манифест vs runtime invite), не унифицируем |
| Пакетирование | `core/contracts` + `core/policy-runtime` (обязательный) + опц. `plugins/policy-admin` | `core/policy` (workspace-policy) не трогаем, не путаем |
| Граница со Studio auth | `IMembershipReader` DI | PDP не знает о gateway, читает через контракт |
| Combine semantics | deny-overrides + closed world (default deny) | Стандарт индустрии (XACML, IAM, OPA) |
| Permission catalog | Double: enum в core/contracts (платформенные) + plugin manifest extension (плагинные) | 10:1 соотношение плагинных к платформенным; плагины владеют своим неймспейсом |

---

## Главный архитектурный поворот: ABAC → ReBAC

### Где жопа в ABAC (что выяснили на кейсах)

1. **Источник правил размазан** — admin БД, файл ресурса, код плагина, манифест плагина. 4 источника.
2. **Атрибуты — это I/O.** Synchronous resolvers = latency-катастрофа. Без bundle-style cache не работает.
3. **Enumerate невозможен.** `/auth/permissions` для UI не может вернуть все actions в ABAC-мире — они зависят от ресурса.
4. **Правила — это код.** DSL, парсер, эвалюатор, безопасный execution, trace. Встроенный язык.
5. **Дебагаемость.** Без trace "почему deny" — невозможно поддерживать в проде.
6. **Cognitive cost.** Netflix (PADME): "ABAC оказался слишком когнитивно дорогим для инженеров".

### Что делают крупные игроки

| Игрок | Подход | Что упростили | Цена |
|---|---|---|---|
| **AWS IAM** | ABAC через tags **внутри IAM** | 0 I/O, нет внешних резолверов | Нельзя интегрироваться с внешними системами |
| **OPA** | Bundle pull (snapshot) | 0 I/O в check | Eventual consistency (минута) |
| **AWS Cedar** | Caller подаёт entities в запрос | PDP — чистая функция, тестируется | Сложность переезжает в caller |
| **Zanzibar / SpiceDB / OpenFGA** | ReBAC (отношения, не атрибуты) | Скорость, enumerate, дебаг | Нет времени/контекста |
| **Keycloak** | Полный ABAC через JS-policies | Ничего | Медленно, дебаг ужасный, все мигрируют прочь |
| **Stripe** | Захардкоженный RBAC + scopes | Простота | Нет централизации |

**Современный консенсус (2024-2025):** Большие игроки уходят от ABAC к ReBAC. ABAC оставляют для узких contextual edge cases (time, IP, MFA recency), и делают локально в сервисах, не централизованно.

### Почему ReBAC решает наши реальные кейсы

| Наш кейс | ABAC бы дал | ReBAC даёт |
|---|---|---|
| TD-8: owner fleet'а | `subject.userId in resource.attributes.owners` (атрибут, I/O) | `(bob, owner, fleet:prod)` (relation, JOIN) |
| Author может удалить свой workflow | `subject.userId == resource.author_id` | `(alice, author, workflow:42)` |
| Member видит prod-workflows своей команды | `subject.teams contains resource.owner_team` | `(alice, member, team:prod) → team:prod, owns, workflow:42 → alice can view` |

Все три — **relations**, не атрибуты. ABAC честно решал, но **неправильным инструментом**.

### Новая модель: RBAC + ReBAC

| Уровень | Что | Когда применять |
|---|---|---|
| **RBAC** (tenant-wide) | `Group → Permission[]` | Глобальные роли в тенанте: admin/team-lead/member |
| **ReBAC** (per-resource) | `(subject, relation, resource)` + `relation → permission` правила | Когда permission зависит от связи юзера с конкретным ресурсом |

**Combine:** `allow = RBAC.check(action) OR ReBAC.check(action, resource)`. OR, не AND, потому что они отвечают на разные вопросы.

**Closed-world:** оба default deny. Если ни RBAC, ни ReBAC не сказали allow — deny.

### Контракт PDP остаётся таким же

```ts
interface IPolicyDecisionPoint {
  check(identity, action, resource?, context?): Promise<PolicyDecision>;
  
  // ReBAC: "какие ресурсы данного типа доступны юзеру для данного action"
  // Решает enumerate для UI
  listResources(identity, action, resourceType): Promise<ResourceRef[]>;
}
```

Снаружи **ничего не меняется** против эпика. Внутри — RBAC + ReBAC вместо RBAC + ABAC.

### Что выпадает из scope эпика

- `IAttributeResolver`
- `IPredicateProvider`
- ABAC engine, DSL/JSON-rules
- Per-attribute TTL/fail-mode/batching
- Combined PDP с deny-overrides между RBAC и ABAC

≈ **половина сложности эпика**.

---

## Кейсы и как они покрываются

### Кейс A — CLI / UI / REST: одна модель, три транспорта

Поток одинаковый: транспорт аутентифицирует → резолвит action → зовёт `policy.check` → allow/deny.

**Где транспорты отличаются:**
- **Identity carrier:** UI — cookie; CLI — `~/.kb/session` cookie или persistent token; REST — `Authorization` header. Унифицируется в gateway middleware (Studio auth plan).
- **Action mapping:** CLI — команда → action (`kb fleet lock → fleet:lock`). UI — компонент → action. REST — декларация на маршруте (`requirePermission('fleet:lock')`). **Action-strings одни и те же.**

**Local CLI mode:** `kb workflow run local-test` офлайн против локального workspace.
- **Решение:** local mode = bypass PDP. Identity = "local user", allow всё.
- **Эскейп-хатч:** флаг `policy.localEnforcement: true` в `kb.config.json` включает local PDP для разработчиков плагинов (тест permissions локально).

### Кейс B — Премиум-плагин с фичами по тарифу

**Решение:** PDP **не участвует**.

Это **monetization / feature-gating**, не security. У них:
- Разный source of truth (security — IAM/groups, billing — Stripe/subscription).
- Разная скорость инвалидации (security — мгновенно, billing — раз в день).
- Разный fail mode (security — closed world, billing — fail-open часто).

Отдельная подсистема: `platform.entitlements.has(tenantId, feature)`. Out of scope эпика. В ADR упомянуть как смежную систему.

Handler делает обе проверки независимо:
```ts
await platform.policy.check(identity, 'crm:bulk-export', resource);  // security
const ok = await platform.entitlements.has(tenantId, 'crm:bulk-export');  // billing
if (!ok) throw new FeatureNotInPlanError();
```

### Кейс C — Плагин делит свою функциональность по ролям

**Это основной кейс плагинного RBAC.** "Тимлид видит расширенную панель, разраб — базовую".

**Принцип:** плагин — **owner своего permission-пространства**. Платформа даёт шов.

**Плагин в манифесте:**
```yaml
permissions:
  declared:
    - id: clickup:view-basic
      description: View own tasks
      scope: global
    - id: clickup:view-team
      description: Team-wide dashboard
      scope: global
    - id: clickup:close-sprint
      description: Close active sprint
      scope: global
  
  default_role_mappings:
    member: [clickup:view-basic]
    team-lead: [clickup:view-basic, clickup:view-team, clickup:close-sprint]
```

**В коде плагина:**
```ts
// Handler
await ctx.platform.policy.check(ctx.identity, 'clickup:view-team');

// React-компонент в Studio
const canTeamView = useCan('clickup:view-team');
return <>{canTeamView && <TeamDashboard/>}</>;
```

Никаких `if (user.role === 'team-lead')` в коде плагина. Только permission-проверки. Плагин **не знает про роли**, знает только про свои permissions.

**Default role mappings — это suggestion**, применяется только при **первом появлении** permission в БД. После — админ управляет через Studio. Не пересоздаётся на каждом старте. Не откатывает админовы изменения.

**Это чистый RBAC, ReBAC не нужен** — нет связи с конкретным ресурсом. Если бы было "тимлид команды X видит dashboard **только** команды X" — это был бы ReBAC: relation `(alice, team-lead, team:X)`.

### Кейс D — Per-resource ownership (ReBAC)

"Только автор задачи может её удалить."

**В манифесте плагина:**
```yaml
permissions:
  declared:
    - id: clickup:task-delete
      scope: resource
      resource_type: clickup-task
  
  relations:
    clickup-task:
      author: USER
      assignee: USER
      permissions:
        clickup:task-delete: author | tenant-admin-via-rbac
```

**В коде:**
```ts
await ctx.platform.policy.check(
  ctx.identity, 
  'clickup:task-delete', 
  { type: 'clickup-task', id: taskId }
);
```

PDP идёт по двум путям:
1. RBAC: есть ли у юзера permission `clickup:task-delete` в группе? → tenant-admin имеет → allow.
2. ReBAC: есть ли relation `(identity.userId, author, clickup-task:taskId)`? → если да → allow.

Если оба false → deny.

### Кейс E — Agent tokens (constrained delegation)

Самый сложный кейс. **Принципиальное расхождение с эпиком.**

Эпик: "Token не несёт прав". Это правильно для **user-токенов**.

**Для agent-токенов это неприменимо.** Юзер выдаёт агенту constrained-токен ("делай только X и Y, только на ресурсе Z, 24 часа"). Constraints — **в токене**, потому что:
- Они зафиксированы при issuance, не меняются в течение TTL.
- Это паттерн AWS STS session policies, OAuth scopes, GitHub fine-grained PATs.

**Структура agent-токена:**
```json
{
  "sub": "agent:claude-deploy-bot",
  "tenantId": "acme",
  "type": "agent",
  "delegated_by": "user:alice",
  "iat": ..., "exp": ...,
  "constraints": {
    "actions": ["workflow:run", "storage:read"],
    "resources": [{"type": "workflow", "id": "deploy-prod"}]
  }
}
```

**PDP логика для агента:**
```
subject.type === 'agent':
  effective = token.constraints.actions ∩ resolveCurrentUserPerms(token.delegated_by)
  return effective.includes(action) && resource matches token.constraints.resources
```

**Важно:** реальный allow = `(agent capabilities) ∩ (CURRENT user permissions)`. Не frozen-snapshot. Если у юзера сняли права — агент тоже теряет. Промышленный консенсус.

**Subject type расширяется:**
```ts
type Subject =
  | { type: 'user', userId, tenantId, memberships, relations }
  | { type: 'agent', userId: <delegated_by>, tenantId, memberships, relations, constraints }
  | { type: 'anonymous' };
```

Агент = юзер с обрезанным набором capabilities. Audit log: `acted_by: agent:X, on_behalf_of: alice`. ReBAC relations агент **наследует от юзера** (он действует as alice).

**Tool discovery для агента:**
`GET /agent/capabilities` возвращает функцию от `(token, current_user_perms)`:
```json
{
  "tools": [
    {"name": "workflow.run", "resources": ["workflow:deploy-prod"]},
    {"name": "storage.read", "resources": ["storage:logs/*"]}
  ]
}
```

**Revocation:** token id в БД с blacklist. Gateway при каждом запросе проверяет. **Обязательно.**

**Где это делать (открытый вопрос):**
- Studio auth plan говорит "constrained delegation for machine tokens — следующий эпик".
- Это **противоречит** тому, что весь продукт KB Labs про агентов.
- Решить: agent-tokens в этом эпике, в Studio auth plan, или отдельным эпиком — **до старта кода**.

### Кейс F — Анонимные запросы

Subject = anonymous (валидный, не отсутствие). Default deny через closed world. Правила могут явно `allow anonymous on <action>`. В ADR зафиксировать: anonymous — это первоклассный Subject type.

### Кейс G — Machine tokens (CI и т.п.)

JWT с `type: 'machine'`. Не пользователь, но и не агент-делегат.

**Решение:** machine = subject через group membership. Создание machine-токена → запись в БД с группой. PDP проверяет идентично user (без constraints intersection).

`/auth/register` (machine clients) переезжает под admin permission (Studio auth plan).

### Кейс H — Per-tenant правила

Структурно поддерживается в схеме: все таблицы (`groups`, `group_permissions`, `memberships`, `relations`) имеют поле `tenant_id`. UI/CLI для per-tenant настройки — после эпика. Но **схема готова с первого дня**.

### Кейс I — Audit

PDP эмитит `policy.decision` events в eventBus:
```ts
{ identity, action, resource, decision, reason, ts, requestId }
```

Sink — отдельный эпик. Сейчас просто event. Allow логировать опционально (флагом), deny — **обязательно**.

### Кейс J — Кеширование и инвалидация

- PDP в parent, single instance. Кеширует **решения** (по `(subject, action, resource)`) + **subject** (по userId, с memberships + relations).
- Инвалидация: изменение membership/relation → eventBus event → PDP cache flush.
- Worker'ы **не кешируют** — RPC через IPC proxy в parent. IPC RPC ~0.1-1ms, приемлемо.
- TTL кеша в parent — короткий (секунды), eventBus инвалидация — primary mechanism.

---

## Permission catalog: как живёт

**Платформенные** (compile-time enum в `core/contracts`):
- `users:write`, `users:read`
- `policy:admin` (управление группами/permissions)
- `gateway:admin`
- `~10 штук всего`

**Плагинные** (runtime registry):
- Декларируются в `plugin.yaml`: `<plugin-id>:<action>` (обязательный prefix).
- На bootstrap загружаются в PDP-registry с пометкой `origin: 'plugin:<id>'`.
- Apply default_role_mappings — **только для новых** permissions, не пересоздаёт существующие.
- Deprecated permissions (удалённая фича) помечаются, не удаляются (audit).

**Endpoint `GET /platform/policy/permissions`:**
```json
{
  "permissions": [
    {"id": "users:write", "origin": "platform", "scope": "global"},
    {"id": "clickup:view-team", "origin": "plugin:clickup", "scope": "global"},
    {"id": "clickup:task-delete", "origin": "plugin:clickup", "scope": "resource", "resource_type": "clickup-task"}
  ]
}
```

**Безопасность плагинного API:**
- Плагин может звать `check` **только** на свои + платформенные permissions. PDP отвергает `plugin:clickup` запрос `check('workflow:run')`.
- Conflict prevention: prefix обязателен (`clickup:view`, не `view`).

---

## Структурный layout эпика

```
core/contracts/
  src/authorization/
    types.ts                  # Identity, Subject, Resource, PolicyContext, PolicyDecision, Permission
    pdp.ts                    # IPolicyDecisionPoint
    membership-reader.ts      # IMembershipReader (DI seam to Studio auth)
    relation-reader.ts        # IRelationReader (DI seam)
    permissions.ts            # Enum платформенных permissions
    manifest-extension.ts     # PluginPermissionDeclaration types

core/policy-runtime/           # NEW package
  src/
    pdp/
      runtime-pdp.ts          # Builtin PDP impl, combines RBAC + ReBAC
    rbac/
      engine.ts               # Group → Permission resolution
    rebac/
      engine.ts               # Relation graph queries
    catalog/
      permission-registry.ts  # Loads platform + plugin permissions
    cache/
      decision-cache.ts       # In-memory cache, invalidation via eventBus
    audit/
      emitter.ts              # policy.decision events

core/plugin-runtime/
  src/platform/
    adapter-registry.ts       # +entry for `policy` adapter, governance, ipc='proxy'

plugins/gateway/
  app/src/auth/
    middleware.ts             # Existing; +requirePermission helper using platform.policy
  app/src/routes/
    policy.ts                 # NEW: GET /platform/policy/permissions, groups CRUD, GET /auth/permissions

plugins/policy-admin/          # OPTIONAL follow-up
  Studio /admin/policy UI

docs/adr/
  ADR-XXXX-platform-authorization.md   # 7 принципов

core/policy/                   # UNCHANGED — workspace-policy остаётся отдельно
```

---

## Открытые вопросы (до старта кода)

1. **Agent tokens — где?** Этот эпик / Studio auth plan / отдельный эпик. Критичный вопрос для продукта.
2. **Granted ReBAC relations — кто их выдаёт?** Когда юзер создаёт ресурс — кто пишет `(creator, owner, resource:X)`? Платформенный хук на creation events или CRUD-обязанность плагина?
3. **`platform.entitlements`** — out of scope, но нужно явно отрисовать smежную систему в ADR, чтобы плагин-авторы понимали, где граница.
4. **Конкретный shape `IMembershipReader` и `IRelationReader`** — что они принимают, что возвращают, кеш-семантика, ошибки.
5. **Migration story:** что делать с существующими `AuthContext.permissions: ['host:connect']`? Удалять поле или legacy-mapping?

---

## Acceptance после переосмысления

Из эпика, скорректировано:

- [ ] ADR `ADR-XXXX-platform-authorization.md` принят (7 принципов: 6 из эпика + поворот RBAC+ReBAC вместо RBAC+ABAC).
- [ ] Контракты `IPolicyDecisionPoint`, `IMembershipReader`, `IRelationReader`, плагинные манифест-расширения — в `core/contracts`.
- [ ] Builtin engine RBAC + ReBAC в `core/policy-runtime`, unit-тесты (allow/deny path-ы, group inheritance, relation graph, combine).
- [ ] PDP в `ADAPTER_REGISTRY` как адаптер `policy` с `ipc: 'proxy'`, governance wrap.
- [ ] Gateway использует `requirePermission` через `platform.policy` (не stub).
- [ ] Studio: `useCan(action)` на основе `GET /auth/permissions`. Permission-aware UI.
- [ ] Плагин может декларировать permissions в манифесте + default role mappings — e2e тест.
- [ ] Плагин может декларировать relations в манифесте + ReBAC проверка работает — e2e тест.
- [ ] TD-8 unblocked: fleet RBAC построен на этом PDP без дублирования.

**Вне scope (явно):**
- ABAC (attribute resolvers, predicates) — отложено до появления реального правила, не выражающегося в ReBAC.
- External PDP (OPA/Cedar) — контракт совместим (PDP — чистая функция), интеграция отдельно.
- Per-tenant PDP UI/CLI — схема готова, UI после.
- Audit sink — отдельный эпик, PDP только эмитит события.
- `platform.entitlements` (monetization) — отдельная подсистема.
- Agent tokens — **открытый вопрос, см. выше**.

---

## Что говорить в ADR (черновик принципов)

1. **Identity vs Policy раздельны.** Identity — кто. Policy — что можно.
2. **User-token identity-only.** Permissions резолвятся из БД на каждый запрос.
3. **Agent-token несёт constraints.** Не противоречит (1) — это другой subject type, constrained delegation pattern.
4. **Subject ≠ Identity.** Subject = `{ user, memberships, relations }`, собирается per-request с кешом.
5. **PDP — единственный шов.** Контракт `check(identity, action, resource?, context?)` + `listResources` для enumerate.
6. **Модель: RBAC + ReBAC.** RBAC для tenant-wide ролей, ReBAC для per-resource relations. Combine OR, default deny.
7. **PDP — чистая функция** (Cedar-style). Caller собирает Subject и Resource через `IMembershipReader`/`IRelationReader`. PDP не делает синхронных I/O в attribute resolvers. ABAC отложен.
8. **Permission strings — double catalog.** Platform enum + plugin manifest extension. Plugin может звать только свои + платформенные permissions.
9. **Plugin владеет своим permission-пространством.** Декларирует permissions + default role mappings. Defaults применяются один раз при первом появлении.
10. **Closed world.** Default deny. Anonymous — первоклассный subject.
11. **Cache + eventBus invalidation.** PDP кеширует в parent, инвалидация через события membership/relation изменений. Worker'ы не кешируют (RPC через IPC proxy).
12. **Audit-ready.** PDP эмитит `policy.decision` events. Sink — отдельный эпик.

---

## Дальше

Следующая сессия — либо:
- Detailed design (схемы таблиц, точные сигнатуры контрактов, миграция AuthContext).
- Или сначала закрыть открытый вопрос про agent tokens — он влияет на дизайн Subject types.
