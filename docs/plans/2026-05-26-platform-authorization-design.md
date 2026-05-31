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

### Кейс E — Agent tokens (constrained delegation) — МОДЕЛЬ ЗАФИКСИРОВАНА

Юзер выдаёт агенту токен = **сужение своих прав**. Юзер сам "натыкивает" доступные действия для агента. Пример: юзер может `mind:*`, `quality:*` и всё остальное; агенту натыкал только `mind:*` → агент дёргает `quality:run` → deny.

**Главное свойство — токен только сужает, никогда не выдаёт:**
```
effective(agent) = constraints(token) ∩ perms(user, в момент запроса)
```
Floor-гарантия: даже при кривой настройке агент не может больше, чем сам юзер. Пересечение с **текущими** правами юзера, не снепшот — сняли у юзера право, у агента отвалилось.

**Противоречия с принципом "token не несёт прав" НЕТ** (исправлено vs первая версия дока).
Constraints **не лежат в токене**. В токене — только identity + ссылка:
```json
{ "sub": "agent:deploy-bot", "type": "agent", "delegated_by": "user:alice",
  "tenantId": "acme", "jti": "tok_abc", "iat": ..., "exp": ... }
```
Список «что натыкал юзер» хранится **на сервере** по ключу `jti` (GitHub fine-grained PAT модель). Принцип 2 держится единообразно для user/machine/agent — токен везде ссылка на identity, права резолвятся сервером.

**Преимущества server-side constraints:**
- Принцип "token identity-only" единообразен.
- Редактируемость: перенастроить агента без перевыпуска токена (меняется строка в БД).
- Revocation: пометил row revoked → мгновенно.
- Live intersection автоматом (userPerms резолвятся каждый раз).

**PDP логика для агента — двухстадийная:**
```
subject.type === 'agent':
  1. record = lookup(jti); if record.revoked → deny
  2. constraints = record.actions                 // что натыкал юзер
  3. if action ∉ constraints → deny                // дешёвый гейт токена
  4. return userCheck(delegated_by, action, resource)  // обычная проверка как юзера
```
Allow только если оба гейта прошли.

**Гранулярность constraints (зафиксировано): action-level + plugin wildcard.**
- Хранятся действия: `["mind:search", "mind:index"]`.
- Plugin-level — wildcard: `["mind:*"]` = все mind-действия. Покрывает "только mind".
- **Resource-level сужение в токене — отложено.** Агент и так ограничен ресурсами юзера через ReBAC (наследует relations). Доп. сужение по ресурсу — редкий advanced-кейс.

**Subject type:**
```ts
type Subject =
  | { type: 'user', userId, tenantId, memberships, relations }
  | { type: 'agent', userId: <delegated_by>, tenantId, memberships, relations, tokenConstraints }
  | { type: 'machine', clientId, tenantId, memberships }
  | { type: 'anonymous' };
```
Агент = юзер с гейтом токена сверху. ReBAC relations наследует от юзера (действует as alice). Audit: `acted_by: agent:deploy-bot, on_behalf_of: alice`.

**"Натыкать" требует enumerate своих прав:**
`GET /auth/my-actions` → список доступных юзеру действий, сгруппированных по плагину. Юзер тыкает подмножество → `constraints` токена. UI показывает только то, что юзер сам может (нельзя натыкать чего у тебя нет). Для RBAC enumerate тривиален.

**Tool discovery агента:**
`GET /agent/capabilities` (с agent-токеном) → материализованное пересечение `constraints ∩ current_user_perms`:
```json
{ "tools": [{"name": "mind.search"}, {"name": "mind.index"}] }
```
Это тот самый endpoint "ядро решает, что отдать агенту в виде списка тулов".

**Revocation:** `jti` в БД, флаг revoked. Gateway проверяет на каждом запросе (шаг 1 выше). Обязательно.

**Открытый вопрос (остаётся): где делать.**
- Studio auth plan говорит "constrained delegation — следующий эпик".
- Но весь продукт KB Labs про агентов + MCP в проде → откладывать нельзя.
- Решить: agent-tokens в этом эпике / в Studio auth plan / отдельным эпиком — **до старта кода**. Модель готова, вопрос только про размещение работы.

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

## Три слоя: декларация → привязка → резолюция (ядро дизайна)

Главный сформулированный принцип: **плагин поставляет словарь, платформа делает привязку.** Гранулярность наслаивается сверху, не трогая плагин.

| Слой | Кто владеет | Что делает | Пример |
|---|---|---|---|
| **1. Декларация** | Плагин (манифест) | Объявляет *словарь*: действия + типы отношений. НЕ привязки. | `workflow:view`, `workflow:delete`; relation types `owner`, `member` |
| **2. Привязка (binding)** | Платформа + админ | Решает, *кто* получает действие — через роль (RBAC) или отношение (ReBAC) | "группа `viewers` → `workflow:view`"; "owner → `workflow:delete`" |
| **3. Резолюция** | PDP (runtime) | На каждый запрос проходит группы + отношения → allow/deny | `check(alice, workflow:view, wf-42)` |

**Почему сильно:** плагин-код тупой и стабильный. Один и тот же `check(identity, 'workflow:view', resource)` работает, когда админ настроил «вся группа видит всё» (RBAC), «видишь только где ты member» (ReBAC), или enterprise добавил «только в своём регионе». **Плагин не переписывается** — меняется только конфиг привязки на платформе.

### Плагин знает минимум об инфре (зафиксировано)

Плагин в рантайме делает ровно три вещи, все через контракт платформы:

```ts
// 1. Декларация словаря — в манифесте (не код)
//    actions + relation types

// 2. Проверка — одна строка, плагин не знает RBAC это или ReBAC
await ctx.platform.policy.check(identity, 'workflow:view', { type: 'workflow', id });

// 3. Сигнал о жизненном цикле ресурса — нейтральная платформенная утилита
await ctx.platform.resources.track({ type: 'workflow', id, createdBy: identity.userId });
```

**Решение проблемы фактов отношений (открытый вопрос №2 закрыт):**
- Факт "alice создала workflow-42" рождается при создании, знает только плагин → плагин обязан сигнализировать.
- Минимум знания: плагин зовёт нейтральную `platform.resources.track()`, **НЕ** `policy.grant(creator, 'owner', ...)`. Плагин не знает, что owner что-то даёт.
- Семантику `createdBy → owner` даёт **манифест** (декларация).
- Привязку `owner → workflow:delete` даёт **админ** (binding).
- Резолюцию делает **PDP**.
- Плагин в рантайме трогает только `policy.check` + `resources.track`. Про группы/роли/граф — ноль.

**Явный шаринг** ("alice расшарила workflow бобу как viewer") — единственное место, где плагин чуть политически осознан. Идёт через платформенную утилиту (`platform.resources.share` или аналог), не через прямой доступ к графу. Принцип не нарушается.

### Дефолтных привязок НЕТ (zero-trust, зафиксировано)

Плагин **не поставляет** default role mappings, даже seed. Админ выдаёт с нуля ("кому реально нужны права — с нуля, без доступов куда не надо").

**Следствие:** из коробки плагин не работает, пока админ не настроит. Принимается осознанно.

**Bootstrap:** один платформенный super-admin из env (как `bootstrap-admin` в Studio auth plan) с `policy:admin`/wildcard. Единственный seed. Дальше он раздаёт всё. НЕ per-plugin defaults.

**Фрикция настройки** гасится в админке: "плагин объявил действия X, Y — ни одно не привязано" + кнопка "выдать всё группе admin". Zero-default, но настройка в два клика.

> **Отменяет** ранее предложенный `default_role_mappings` в манифесте плагина (см. Кейс C ниже — оставлен для истории, но привязки оттуда убраны).

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

1. **Agent tokens — где делать?** Модель ЗАФИКСИРОВАНА (Кейс E: server-side constraints по `jti`, action-level + plugin wildcard, live intersection). Открыто только **размещение работы**: этот эпик / Studio auth plan / отдельный эпик. MCP в проде давит — откладывать нельзя.
2. ~~**Granted ReBAC relations — кто их выдаёт?**~~ **ЗАКРЫТО:** плагин зовёт нейтральную `platform.resources.track()` при CRUD, манифест декларирует `createdBy → owner`, платформа пишет факт в граф. Плагин не знает про политику.
3. **`platform.entitlements`** — out of scope, но нужно явно отрисовать смежную систему в ADR, чтобы плагин-авторы понимали, где граница.
4. **Конкретный shape `IMembershipReader` и `IRelationReader`** — что они принимают, что возвращают, кеш-семантика, ошибки.
5. **Migration story:** что делать с существующими `AuthContext.permissions: ['host:connect']`? Удалять поле или legacy-mapping?
6. **`platform.resources` контракт** — точный shape `track()` / `untrack()` / `share()`. Новая платформенная утилита, нейтральный фасад над relation-графом. Склоняемся к синхронному вызову (без eventual-consistency гонок на «создал и сразу удалил»).
7. **Bootstrap super-admin** — env-переменные, идемпотентность, wildcard vs `policy:admin`. Единственный seed (дефолтных привязок плагинов нет).

---

## UX-прогон: найденные дыры (19) + линия разреза

Прогнали сквозные сценарии по актёрам (админ / dev / юзер / CLI / агент / система). Дыры разделены на **контракт-замораживающие** (решить в этом эпике) и **deferrable** (backlog за стабильным контрактом).

### Контракт-замораживающие (решить сейчас — ~7)

| # | Дыра | Почему в ядро |
|---|---|---|
| 3 | Чёрная дыра дебага деналей (6 причин → один "denied") | `policy.explain(identity, action, resource)` → reason/trace. Движок обязан рождать с первого дня, болтом не прикрутить. В контракт PDP. Нужен в API/CLI/админке/ответе агенту. |
| 14/13 | Agent token: expiry посреди задачи, runtime-деградация | Шейпит токен-схему, Subject `agent`, refresh-модель, структурный deny (`{denied, reason}`). **Горящее — MCP в проде.** |
| 15/16 | Orphan resource при сбое `track()`; гонка create→delete | Транзакционность `resources.track` (тот же commit, что создание ресурса). Семантика контракта. |
| 8 | RBAC enumerate ≠ ReBAC per-resource (фантомные кнопки) | `useCan(action, resource)` + `listResources` фильтрует списки. Форма SDK-контракта. |
| 17 | Share/re-share privilege escalation | Правило в контракт `resources.share`: нельзя выдать больше своего, ре-шеринг off by default. |
| 4 | Каскад прав на дизейбл юзера | `status: disabled` → PDP резолвит пустой набор (не флаг, который PDP игнорит). Семантическое правило. |
| 18 | Rename/deprecation permission ломает привязки | Поле в манифест-схеме (`deprecated` / `aliases`). Лучше заложить сразу. |

### Deferrable (backlog, не блокирует — ~12)

| # | Дыра | Куда |
|---|---|---|
| 1 | Мёртвая система на старте (zero-trust, 200 привязок) | **Suggested bundles** (поле в манифесте можно сейчас, UI применения потом). Не дефолты (auto-apply), а пресеты, которые админ осознанно применяет. |
| 2 | Нет surface непривязанных действий | Unbound-очередь в админке + нотификация. Derivable из данных. |
| 5 | Local bypass слепит разработчика (deny-пути не тестятся) | `kb-dev --simulate-policy --as-role member`. Dev-тулинг. |
| 6 | Рассинхрон манифест↔код (опечатка → тихий deny) | Build-check / кодген констант из манифеста. |
| 7 | Hide vs disable в UI | Per-action режим в `useCan`. UI-полиш. |
| 9 | Denied — тупик (нет request-access) | Request-access поток (пинг админу с контекстом). Продукт. |
| 10 | Немой 403 в CLI | Actionable error + exit code (EX_NOPERM). Полиш. |
| 11 | Multi-tenant неоднозначность | Tenant-switcher (`kb auth use-tenant`). Модель уже поддерживает (tenantId в токене). |
| 19 | Super-admin single point (утечка/lockout) | Recovery/break-glass, несколько super-admin. Ops. |

> **Линия разреза = главный вывод прогона.** Эпик не решает 19 проблем. Он принимает ~7 контрактных решений так, чтобы остальные 12 делались позже без переписывания. «Огромность» расфасована по таскам.

### Три системных вывода

1. **Zero-trust без bundles нежизнеспособен** (#1) — смягчить до "suggested bundles, admin applies", иначе онбординг = часы ручной работы.
2. **`policy.explain` — ядро, не опция** (#3, #8, #10, #13) — закрытый мир + RBAC+ReBAC+token-constraints даёт нечитаемые денали. В контракт с первого дня.
3. **Agent token lifecycle в проде — самая горящая незакрытая зона** (#14, #13) — expiry-посреди-задачи и runtime-деградация не имеют ответа. Решать раньше красивого RBAC.

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
3. **Все токены identity-only, единообразно** (user/machine/agent). Agent-token несёт `jti` + `delegated_by`, constraints хранятся server-side по `jti`. `effective(agent) = constraints ∩ perms(user сейчас)` — токен только сужает, никогда не выдаёт. Live intersection (не снепшот). Никакого исключения из принципа 2.
4. **Subject ≠ Identity.** Subject = `{ user, memberships, relations }`, собирается per-request с кешом.
5. **PDP — единственный шов.** Контракт `check(identity, action, resource?, context?)` + `listResources` для enumerate.
6. **Модель: RBAC + ReBAC.** RBAC для tenant-wide ролей, ReBAC для per-resource relations. Combine OR, default deny.
7. **PDP — чистая функция** (Cedar-style). Caller собирает Subject и Resource через `IMembershipReader`/`IRelationReader`. PDP не делает синхронных I/O в attribute resolvers. ABAC отложен.
8. **Permission strings — double catalog.** Platform enum + plugin manifest extension. Plugin может звать только свои + платформенные permissions.
9. **Три слоя: декларация → привязка → резолюция.** Плагин декларирует словарь (действия + типы отношений), НЕ привязки. Админ/платформа делает привязку (роль или отношение). PDP резолвит. Гранулярность наслаивается сверху, плагин не переписывается.
9b. **Плагин знает минимум об инфре.** В рантайме плагин трогает только `platform.policy.check` + `platform.resources.track`. Про группы/роли/граф — ноль. Факты отношений плагин сообщает нейтральной утилитой `resources.track()`, не policy-вызовом.
9c. **Zero-trust binding.** Дефолтных привязок плагины не поставляют. Админ выдаёт с нуля. Единственный seed — платформенный bootstrap super-admin из env.
10. **Closed world.** Default deny. Anonymous — первоклассный subject.
11. **Cache + eventBus invalidation.** PDP кеширует в parent, инвалидация через события membership/relation изменений. Worker'ы не кешируют (RPC через IPC proxy).
12. **Audit-ready.** PDP эмитит `policy.decision` events. Sink — отдельный эпик.

---

## Дальше

Следующая сессия — либо:
- Detailed design (схемы таблиц, точные сигнатуры контрактов, миграция AuthContext).
- Или сначала закрыть открытый вопрос про agent tokens — он влияет на дизайн Subject types.
