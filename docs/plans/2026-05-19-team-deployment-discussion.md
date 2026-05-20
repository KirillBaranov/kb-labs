# Team Deployment — рабочая дискуссия

> **Статус:** активная дискуссия
> **Начато:** 2026-05-19
> **Контекст:** клиент-серверная распределёнка платформы для команд. Соло работает, нужно достроить team-режим.

Этот файл — рабочий журнал решений и открытых вопросов. Не ADR, не план реализации. Сюда приземляем то, до чего договорились, и то, что ещё надо проговорить. Когда узел закрыт — выносим в ADR или в `docs/plans/`.

---

## Опорный контекст

- RFC: [`.claude/plans/whimsical-kindling-crayon.md`](../../.claude/plans/whimsical-kindling-crayon.md) — Workspace Agent (Brain/Hands/Spine/Face, 7 инвариантов, 4 deployment'а).
- Карта в репо: [`docs/architecture/workspace-agent.md`](../architecture/workspace-agent.md).
- Ключевые соседние планы:
  - [`2026-03-21-multi-user-support.md`](./2026-03-21-multi-user-support.md) — identity / multi-user.
  - [`2026-03-21-persistent-host-registry.md`](./2026-03-21-persistent-host-registry.md) — реестр хостов.
  - [`2026-03-21-routing-backend.md`](./2026-03-21-routing-backend.md) — routing.
  - [`2026-03-22-reconnect-resilience.md`](./2026-03-22-reconnect-resilience.md) — реконнект.
  - [`2026-04-05-permissions-architecture.md`](./2026-04-05-permissions-architecture.md) — permissions.
  - [`2026-04-05-notifications-architecture.md`](./2026-04-05-notifications-architecture.md) — нотификации.
- Ключевой ADR: [`0014-declarative-delivery-and-fleet-distribution.md`](../adr/0014-declarative-delivery-and-fleet-distribution.md).

---

## Целевая картина (для команды)

Single-tenant deploy «платформа в облаке + тонкие клиенты». Multi-tenant — следующим шагом, поверх.

- **Облако (один инстанс на команду):** Gateway, REST API, Workflow, State, Brain-адаптеры (LLM, Vector, RAG), Marketplace, Studio, Identity, Telemetry.
- **Клиент юзера (headless):** CLI + Workspace Agent. Никакого web UI на клиенте.
- **Соло (D1) не трогаем** — Brain+Hands+Face в одном процессе, Studio локально.

Полный поток см. в текущем чате / в `workspace-agent.md`.

---

## Решения

### D-1. Форма team-деплоя — single-tenant first, multi-tenant потом

**Дата:** 2026-05-19
**Решение:** сначала self-hosted single-tenant (модель GitLab/Sentry: один инстанс = одна команда). Multi-tenant SaaS — позже, как опция поверх той же кодовой базы.
**Почему:** упрощает identity, изоляцию, биллинг на старте. Не блокирует переход в multi-tenant — те же сущности (team, user) просто получают namespace.
**Последствия:**
- Identity слой минимальный: один tenant подразумевается, нужен только user + auth.
- Биллинг/квоты — на уровне всего инстанса, не per-tenant.
- Deploy artifact: docker-compose / k8s helm на команду.

### D-2. Studio — только в облаке для team-режима

**Дата:** 2026-05-19
**Решение:** в team-деплое Studio живёт только в облаке. Клиент = CLI + Workspace Agent, без локального web UI. Соло-режим (D1) сохраняет локальный Studio как сейчас.
**Почему:** Studio в облаке — единственное место, где имеет смысл делить по тенантам/правам/видимости флота. Локальный Studio в команде создавал бы развилку (что видит локальный vs облачный) и удваивал поддержку RoutingBackend.
**Последствия:**
- Permissions / tenant-слой строим в облаке (Gateway + REST API + Studio). INV-5 остаётся про permissions плагина внутри runtime — это другой уровень.
- Любые UI-сценарии для тимлида (флот, биллинг, аудит) — только в облачной Studio.
- CLI ↔ Workspace Agent общаются локально через unix socket / loopback HTTP. Это внутреннее дело клиента, не публичный API.
- Нужно проверить, что текущий RoutingBackend умеет режим «Studio в облаке, agent на клиенте» без локального Studio как промежуточного звена.

### D-3. Studio = триггер, не исполнитель — Studio в облаке + execution на клиенте является целевой моделью, не разрывом

**Дата:** 2026-05-20
**Решение:** разделить две роли. Studio — это **триггер** (UI, рендерится в браузере юзера, серверная часть в облаке). Workspace Agent юзера — **исполнитель**. Studio шлёт запрос в REST → Gateway → WS → Workspace Agent юзера → плагин исполняется локально → результат стримится обратно тем же путём в Studio. Это идентично потоку CLI, только триггер другой.
**Почему:** при обсуждении возникало интуитивное «как же так, UI в облаке, а исполнение на клиенте — это разрыв». На деле разрыва нет — это уже спроектировано через bidirectional WS (RFC Phase 1). Studio и CLI — два равноправных входа в один и тот же ExecutionHandler.
**Последствия:**
- Идея «уносить код юзера в облако кусочками» (а-ля Codespaces/Gitpod) **отвергнута**. Она решает несуществующую проблему и приносит deal-breaker'ы: скорость sync'а, privacy/compliance, конфликты с локальной dev-средой, стоимость. Парковать на возможный далёкий D5 deployment, не на старт.
- Компромисс «нужен онлайн Workspace Agent чтобы юзер мог через Studio действовать» принимается как фича: Studio показывает статус хостов юзера, юзер понимает.
- Код юзера никогда не уезжает на платформу. Уезжают только данные, которые плагин **сам** решил передать (промпт для LLM) — это контролируется политиками.

### D-4. Workflow steps типизированы по target через INV-7 — heavy steps всегда на платформе

**Дата:** 2026-05-20
**Решение:** workflow — это оркестратор, а не плагин-исполняющийся-где-то. Каждый шаг workflow имеет `target ∈ { platform, workspace-agent, environmentId }`. Workflow engine живёт в облаке, держит state machine / retries / scheduling. Heavy шаги (LLM chain, RAG, embeddings) исполняются с target=platform — никогда не уходят на клиента. Лёгкие шаги (read git diff, write commit, run script) с target=workspace-agent летят по WS клиенту, ждут результата с at-most-once семантикой.
**Почему:** возникало беспокойство «workflows heavy, я не могу исполнять их на стороне юзеров — это вопрос функциональности». На деле архитектура уже отвечает на это через INV-7 — функциональность не страдает.
**Последствия:**
- Workflow author пишет шаги, явно указывая target. Default-эвристики могут смотреть на capability шага (трогает fs → workspace, чисто-облачный API → platform).
- Workflow может частично выполниться: если клиент уходит в офлайн на середине, оркестратор должен уметь resume или явно abort. Это связано с execution journal в TD-11.
- Stateful компоненты workflow (журнал, очередь повторов) — в облаке. Клиент остаётся stateless относительно workflow'а.

---

## Открытые вопросы

> Помечаем `[OPEN]` пока думаем, `[RESOLVED → D-N]` когда закрыли решением выше.

### Q-1. Fleet distribution для клиентов — как раскатывать плагины и пресеты декларативно

**Статус:** [OPEN — отслеживается в [TD-6](https://app.clickup.com/t/869dc8d7n)]
**ВАЖНО — уточнение скоупа:** ADR-0014 решает **другую** задачу — дистрибуцию самой платформы на cloud-хосты (GitOps + kb-deploy apply). Это задача A.
Этот вопрос — про задачу **B**: дистрибуция плагинов/пресетов на клиенты юзеров команды (Workspace Agent'ы), которая физически другая:
- кол-во таргетов: 10–1000+ машин разработчиков (vs 1–10 серверов)
- сетевая модель: outbound WS от клиента, NAT (vs SSH inbound)
- доступность: прерывистая (vs 24/7)
- кто инициирует: клиент при коннекте/pull (vs оператор push)
ADR-0014 даёт примитивы (lock, declarative manifest, atomic swap, kb-create install-service), которые можно переиспользовать, но дизайн самой раскатки на клиенты — отдельная задача.
**Суть:** тимлид в облачной Studio задаёт «у команды установлен @kb-labs/review v1.2.3 с пресетом X». Платформа держит lock как истину. Клиенты при подключении приводят своё состояние к этой истине.
**Под-вопросы:**
- Push (платформа дёргает клиент) или pull (клиент при коннекте/периодически сверяется)?
- Что физически едет на клиент — npm install из публичного реестра, или артефакт из облака?
- Что делать с офлайн-клиентом, у которого устарела версия — блокировать execution или предупреждать?
- Как версионировать сам lock (изменения тимлида — атомарные релизы или инкрементальные)?
- Пресеты — часть того же lock-файла или отдельная сущность?

### Q-2. Identity и аутентификация WS-коннекта

**Статус:** [OPEN]
**Суть:** Workspace Agent открывает outbound WS к Gateway. Gateway должен понять «это Алиса из команды X с хоста alice-laptop-01».
**Под-вопросы:**
- Какой механизм auth для single-tenant: token per user, OAuth/SSO, что-то ещё?
- Где юзер получает токен — через CLI login → облако → сохранение локально?
- Ротация / отзыв токена — как тимлид отключает уволенного юзера.
- hostId — генерится клиентом и регистрируется, или назначается платформой при первом коннекте?

### Q-3. Host registry — замена `firstHostWithCapability`

**Статус:** [OPEN]
**Суть:** у юзера может быть несколько хостов (ноут, CI, dev container). Workflow адресует «userId=alice, capability=review» — куда приземлять?
**Под-вопросы:**
- Persistent registry в облаке (REST API + БД) — какой shape сущности?
- Routing rules: per-user default host, per-workflow override, capability-based.
- Что делать когда все хосты юзера офлайн (fallback policy для team-сценариев).
- Видимость в Studio: тимлид видит флот хостов всех юзеров.

### Q-4. Permissions / visibility в команде

**Статус:** [OPEN]
**Суть:** кто может triggerить execution на чужом хосте, кто видит чужие executions в Studio, кто меняет fleet config.
**Под-вопросы:**
- Роли: owner / admin / member / viewer? Или плоско?
- Видимость executions: только свои, своей команды, всех?
- Может ли member менять marketplace lock или это привилегия admin?
- Аудит изменений fleet config — в каком виде хранится.

### Q-5. Биллинг / квоты на LLM-вызовы

**Статус:** [OPEN]
**Суть:** ключ LLM в облаке, токены тратятся юзерами через `ctx.llm` proxy. Кто-то должен учитывать.
**Под-вопросы:**
- Учёт per-user внутри team-инстанса — да/нет?
- Лимиты — на уровне инстанса, юзера, плагина, workflow?
- Что показывать в Studio (тимлиду + юзеру).
- Дефолтная политика при превышении — soft warn / hard block / degrade.

### Q-6. Telemetry / audit — что и куда

**Статус:** [OPEN]
**Суть:** execution events, errors, latencies — это нужно тимлиду в Studio. Какой объём, какая ретенция, как обращаемся с приватными данными (например, фрагменты кода в LLM-вызовах).

### Q-7. Marketplace — общий реестр или per-team

**Статус:** [OPEN]
**Суть:** ADR-0014 фиксирует delivery, но не источник. Команда тянет плагины из публичного marketplace или может иметь приватные плагины внутри своего инстанса?
**Под-вопросы:**
- Приватный marketplace per-team — отдельный сервис или фича облачного REST API?
- Как загружаются приватные плагины (артефакт, git URL, npm registry с auth)?

### Q-8. Onboarding нового юзера в команду

**Статус:** [OPEN]
**Суть:** human-flow «тимлид приглашает Боба → Боб ставит CLI → коннектится к облаку команды → его клиент подтягивает fleet config».
**Под-вопросы:**
- Invite link / код приглашения?
- Bootstrap клиента — одна команда CLI или нужен GUI-step?

---

## Парковка идей (не вопрос, но запомнить)

- Гибридный D4 (часть хостов в облаке, часть локально) — не приоритет на старте, но архитектура не должна это запрещать.
- Локальный CLI ↔ agent — рассмотреть unix socket vs loopback HTTP. Влияет на multi-user на одной машине (редкий случай, но бывает на CI).
- Reconnect-resilience ([план 03-22](./2026-03-22-reconnect-resilience.md)) в команде острее, чем в соло — at-most-once на mutating становится не теорией.

---

## Связь с реализацией

Дискуссия → реализация: ClickUp эпик [Team Deployment — single-tenant cloud platform + thin clients](https://app.clickup.com/t/869dc8d20) с 14 child-тасками TD-1..TD-14 в Launch/Roadmap.

| TD | Что | Связь с дискуссией |
|---|---|---|
| TD-1 | State audit & contract hardening | вход в реализацию |
| TD-2 | Bidirectional WS protocol — adapter:call reverse proxy | примитив для D-3 |
| TD-3 | ExecutionHandler + LocalPluginResolver | примитив для D-3 |
| TD-4 | Identity & Auth — GitHub OAuth + team tokens | Q-2 |
| TD-5 | Persistent Host Registry | Q-3 |
| TD-6 | Fleet Distribution — архитектура | **Q-1 (главный design узел)** |
| TD-7 | Fleet Distribution — реализация | следствие Q-1 после TD-6 |
| TD-8 | RBAC & visibility | Q-4 |
| TD-9 | Cloud Studio | D-2, D-3 |
| TD-10 | Workflow с mixed targets | D-4 |
| TD-11 | Reconnect & delivery semantics | парковка про reconnect |
| TD-12 | Onboarding flow | Q-8 |
| TD-13 | Platform deploy pipeline (ADR-0014 MVP) | задача A (для деплоя облака команды) |
| TD-14 | Dogfood + первая команда | validation gate |

## Журнал

| Дата | Что произошло |
|---|---|
| 2026-05-19 | Файл создан. Зафиксированы D-1 (single-tenant first) и D-2 (Studio cloud-only). Выписаны Q-1..Q-8. |
| 2026-05-20 | Распакован Q-1: ADR-0014 ≠ распределёнка для клиентов (это задача A vs B). Зафиксированы D-3 (Studio=триггер, идея «кода в облаке кусочками» отвергнута) и D-4 (workflow steps по INV-7, heavy всегда на платформе). Создан ClickUp эпик 869dc8d20 + 14 тасок TD-1..TD-14. |
