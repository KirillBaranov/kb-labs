---
plan_id: "2026-04-05-permissions-architecture"
created_at: "2026-04-05"
status: "concept"
priority: "high"
tags: ["permissions", "rbac", "abac", "gateway", "adapters", "ядро"]
---

# IPermissions — Концептуальная архитектура

> Концепт обсуждён, реализация позже. Одна из двух оставшихся фундаментальных абстракций ядра (вторая — INotification).

## Философия

- **Платформа без привилегий** — системные плагины KB Labs не имеют приоритета над плагинами сторонних разработчиков
- **Ядро даёт примитивы** — как объявить scopes, как передать контекст, как хранить маппинги
- **Политика — это плагин** — KB Labs поставляет дефолтный, enterprise пишут свой
- **Расширяемость через адаптеры** — новый провайдер прав = новый адаптер, ядро не трогается

## Модель прав

**RBAC + ABAC hybrid:**
- RBAC — грубая структура: роли, группы, наследование
- ABAC — fine-grained условия внутри роли (атрибуты юзера, ресурса, окружения)
- Enterprise любят максимальную гранулярность — каждая команда, каждый ресурс, каждая группа

**Иерархия субъектов:**
```
Organization → Group → User
     ↕              ↕        ↕
  inherit      inherit   override
```
Права наследуются вниз, переопределяются на любом уровне.

**Plugin-defined scopes:**
Плагин объявляет свои scopes в манифесте — платформа их opaque хранит и передаёт, не знает семантику:
```json
{
  "permissions": {
    "scopes": [
      { "id": "crm:read", "description": "Read CRM data" },
      { "id": "crm:write", "description": "Write CRM data" },
      { "id": "crm:admin", "description": "Manage CRM settings" }
    ]
  }
}
```

**Resource types (опционально для enterprise):**
```json
{
  "resourceTypes": [
    { "id": "workflow", "description": "Specific workflow" },
    { "id": "workflow-tag", "description": "Workflows by tag" }
  ]
}
```

## Enforcement на Gateway

Gateway — единственная точка enforcement. Плагин физически не может обойти.

**Поток:**
```
Client → Gateway
           ↓
    [Auth middleware]        — кто это?
           ↓
    [Permission check]       — может ли вызвать эту команду?
           ↓ (если denied → 403, разворачивает на полпути)
    [Claim injection]        — инжектим resolved scopes в ctx
           ↓
    Plugin execution         — плагин видит ctx.permissions, фильтрует сам
```

**Разделение ответственности:**
- Gateway = hard gate на уровне команд (coarse-grained)
- Плагин = soft gate на уровне данных (fine-grained)

**Преимущества:**
- Single point of enforcement — централизованный audit log
- Плагин остаётся тупым — пишет бизнес-логику, не думает о security boilerplate
- Hot reload прав — обновил политику, сразу работает для всех плагинов

## IPermissionAdapter

```typescript
interface IPermissionAdapter {
  resolvePermissions(user, command, resource): PermissionContext
  checkAccess(ctx, scope): boolean
}
```

Gateway вызывает интерфейс — не знает что за адаптер стоит.

**Что платформа предоставляет:**
- Storage — хранить маппинг user/group → scopes
- Resolution — резолвить права в момент выполнения, инжектить в ctx
- Extension point — `ctx.permissions.require('crm:write')` throws если нет права

**Что платформа НЕ делает:**
- Не понимает семантику прав плагина
- Не имеет хардкода для конкретных плагинов
- Не принудительно проверяет fine-grained права плагина (это дело плагина)

## Экосистема

**Из коробки (KB Labs):**
- `DefaultPermissionAdapter` — простой RBAC, покрывает 90% кейсов
- Плагин для удобного редактирования прав в Studio

**Enterprise:**
- Пишут свой адаптер — LDAP, SAP, legacy система из 2003 года, внешний API
- Пишут свой плагин — свой RBAC/ABAC/PBAC, свой UI, свой audit
- Деплоят on-premise, платформа не знает разницы

**Аналогия:** Linux PAM — ядро не знает как аутентифицировать, вызывает модули в нужный момент.

## Монетизация

- OSS ядро + extension points — затягивает разработчиков
- Hosted версия, поддержка, enterprise плагины — платная экосистема
- Enterprise платит за то что может написать адаптер под свой безумный стек сам, без vendor lock-in
