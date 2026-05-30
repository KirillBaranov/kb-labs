# TD-13 — Full-Platform Cloud Deploy: Gap Audit + k8s-readiness

> **Status:** Draft for review (no code)
> **Date:** 2026-05-29
> **Task:** [TD-13] Platform deploy (ADR-0014)
> **Epic:** https://app.clickup.com/t/869dc8d20
> **ADR:** `docs/adr/0014-declarative-delivery-and-fleet-distribution.md`

## Цель

Зафиксировать **реальный остаток** для «вся платформа раскатывается в облако
автоматически», по целевой модели: `kb-deploy apply` (флот) → `kb-create
install-service` на каждом хосте (один хост = один инсталлятор). Плюс явная ось
**k8s-readiness** — не разваливается ли структура при будущем переходе на
N гетерогенных реплик.

**Всё проверено по коду на 2026-05-29, не по памяти.**

---

## Часть 1. Что уже построено (ADR-0014 MVP)

Вопреки прежней оценке «блокирующий примитив отсутствует» — **движок собран
целиком**. Проверено:

| Слой | Артефакт | Статус |
|------|----------|--------|
| Инсталлятор (1 хост) | `kb-create create` (использует слепок/manifest) | ✅ |
| | `kb-create install-service <pkg>@<ver> --adapters --plugins` | ✅ |
| | `swap` / `rollback` / `releases` / `status` / `uninstall` | ✅ |
| | Атомарные релизы: `releases/<id>/` + symlink swap | ✅ |
| | `marketplace.lock` + `devservices.yaml` генерируются из скана | ✅ |
| Слепок | `internal/manifest` Manifest + Load (Remote→Local→embedded) | ✅ |
| Флот | `kb-deploy apply` — декларативный rollout (ADR-0014) | ✅ |
| | Config schema `kb.deploy/1`: platform/services/hosts/rollout/bootstrap/secretBackend | ✅ |
| | Planner: drift-detection, install/swap/restart/skip, waves | ✅ |
| | Executor: волны + parallelism + healthGate + autoRollback | ✅ |
| | Remote: `host.InstallService/Swap/Rollback` через SSH → дёргают kb-create | ✅ |
| | Lock-режимы: artifact (default) / autoCommit | ✅ |
| | Secret backend: env (готов), vault/aws-sm/gcp-sm (тип заявлен) | ⚠️ env-only |

**Вывод:** «kb-create --from слепок» как вижн реализован, но не одной флагой.
Он распался на два корректных артефакта:
- **WHAT** = `deploy.yaml › services:` (pkg + version + adapters + plugins + config) — это и есть слепок per-service;
- **WHERE/HOW** = `deploy.yaml › hosts:/targets:/rollout:` (хосты, волны, health, секреты).

Это ровно то разделение, которое ты просил («деплой это деплой, kb-create это
create»): kb-deploy решает WHERE/HOW и **вызывает** kb-create, который решает
WHAT/install на конкретном хосте. Конфиги не смешаны — они в одном файле, но в
ортогональных блоках, и движки разные.

---

## Часть 2. Реальный остаток до «вся платформа на автомате»

### 2.1. deploy.yaml ещё не переведён на декларативный блок — ГЛАВНОЕ

`.kb/deploy.yaml` сейчас **legacy-императивный**: `registry` + `infrastructure`
+ `targets` (Docker-образы: gateway, marketplace-registry, web, docs). Это
драйвит старый `kb-deploy run` (docker build + compose по SSH), НЕ `apply`.

Декларативный блок (`platform:`/`services:`/`hosts:`/`rollout:`) в живом файле
**пустой**. Движок `apply` есть — кормить его нечем.

→ **Задача:** написать `services:` для полной платформы:
`@kb-labs/gateway-app`, `@kb-labs/rest-api-app`, `@kb-labs/workflow-daemon`,
`@kb-labs/core-state-daemon`, (+ studio отдельно, см. ниже). Все они —
**npm-пакеты** (проверено), значит путь `install-service` для них валиден
**без Dockerfile**. Отсутствие Dockerfile у rest-api/workflow/state —
не блокер: модель kb-create = npm install + symlink, Docker тут не нужен.

### 2.2. Stateful-инфра остаётся вне kb-create (by design)

redis/qdrant/minio — через `infrastructure:` блок (docker-image, strategy:
manual). ADR-0014 это и предписывает. Остаётся как есть. ✅

### 2.3. Studio — cloud-only, статика, не install-service

По D-2 Studio в команде живёт только в облаке. Это SPA-сборка за nginx, не
демон. Путь доставки = build + выкладка статики (ближе к web/docs targets),
**не** `install-service`. → нужен отдельный target или mini-pipeline, не
сервис в `services:`.

### 2.4. Secret backend — только env

Тип `vault/aws-sm/gcp-sm` объявлен в схеме, реализован только `env_backend.go`.
Для соло/single-tenant облака env через CI-секреты достаточно. Vault — defer.

### 2.5. Что в инфра-репо уже готово (Phase 3, проверено ранее)

wildcard nginx + DNS-01 wildcard SSL (Timeweb-совместимо) + proxy headers
(X-Forwarded-* для trust-proxy). ~90% закоммичено. Открытое противоречие:
`wildcard-ssl-setup.sh` (certbot-dns-timeweb) vs `runbook.md` (acme.sh) —
не блокер деплоя, но надо унифицировать.

---

## Часть 3. k8s-readiness — три точки нагрузки

Вопрос: «10 подов gateway, 5 workflow, 1 studio, разные порты/конфиги — не
развалится ли структура?» Проверено по planner/executor/config.

### Точка A — Selection policy (`firstHostWithCapability`)

- **Что есть:** настоящий `HostRegistry` + persistent store + liveness-cache
  (проверено, и в TD-1 аудите). Это НЕ заглушка.
- **Что заглушка:** `dispatcher.firstHostWithCapability(ns, cap)` —
  выбирает ПЕРВЫЙ живой хост с capability. Для N реплик это «всегда первый» =
  нет балансировки/affinity.
- **k8s:** в k8s выбором реплики занимается Service/kube-proxy, не наш
  dispatcher. То есть на k8s эта функция просто **не используется** (трафик
  балансит кластер). На SSH-флоте — нужна замена на политику (round-robin/
  least-loaded) ТОЛЬКО если хотим несколько gateway на bare-metal до k8s.
- **Вердикт:** **defer.** Не закладывать сейчас. Это не ломает структуру —
  на k8s обходится, на соло/single-host не нужно.

### Точка B — DeployBackend seam (символьная модель vs immutable image)

- **Что есть:** `executor.Execute()` напрямую зовёт
  `host.InstallService/Swap/Rollback` — **SSH-native**, жёстко зашито на
  модель «~/kb-platform + symlink swap».
- **Проблема для k8s:** k8s не делает SSH, не делает symlink swap. Там
  immutable image + `kubectl set image` / rolling Deployment + replicas:N.
  Symlink-swap-модель туда **не переносится**.
- **Закладка (cheap, lay-now):** ввести интерфейс `DeployBackend` между
  планом и исполнением — `Install/Swap/Rollback/Health`. Текущий SSH-executor
  становится одной реализацией (`ssh-native`). Позже добавляются `compose`,
  `k8s` без переписывания planner/drift/waves.
- **Вердикт:** **lay-now (только seam, без k8s-реализации).** Это дёшево
  (рефактор-обёртка над уже существующим executor) и снимает главный риск
  «структура развалится». Planner/Plan/waves/healthGate — backend-agnostic,
  их трогать не нужно.

### Точка C — Statelessness (реплики делят состояние, не держат в процессе)

- **Канарейка:** OAuth shared-KV warning — если состояние one-shot OAuth
  лежит in-process, 2 реплики gateway его не видят. Сейчас state — KV-backed
  (shared), warning сигналит про конфиг, а не про in-process хранение.
- **Что проверить (lay-now, аудит без кода):** пройтись по gateway/rest-api/
  workflow — нет ли in-process: rate-limit счётчиков, session/state, host
  registry в памяти. Всё stateful должно сидеть на shared-адаптерах
  (Redis/doc-db). HostRegistry уже persistent (✅).
- **Per-replica config/port — РЕАЛЬНЫЙ ГЭП:** в `config.Service` поле
  `Targets.Hosts []string` = список реплик, но **один спек на всех** (version/
  adapters/plugins/config/env общие). Нет per-host/per-replica override
  порта или конфига. «10 gateway с разными портами/конфигами» текущая схема
  выразить НЕ может.
  - На k8s это решается само (один Deployment, replicas:N, один порт внутри
    пода, Service фронтит) — разные порты НЕ нужны, это bare-metal-артефакт.
  - **Вердикт:** **defer** для разных портов (k8s-артефакт исчезает). Но если
    до k8s нужны несколько gateway на одной VM — нужен per-target port-override.
    Заложить поле сейчас НЕ обязательно (схема `kb.deploy/1` расширяема через
    omitempty, добавится без брейка).

---

## Итоговая таблица решений

| # | Пункт | Решение |
|---|-------|---------|
| 2.1 | deploy.yaml → декларативный `services:` для всей платформы | **сделать сейчас** (это и есть «остаток») |
| 2.3 | Studio как статик-target (cloud-only) | сделать сейчас (отдельно от services) |
| B | DeployBackend interface seam | **lay-now** (дёшево, снимает k8s-риск) |
| C | Statelessness аудит (in-process state) | lay-now (аудит, без кода) |
| A | Replica selection policy | **defer** (k8s балансит сам) |
| C-port | per-replica config/port override | **defer** (k8s-артефакт; схема расширяема) |
| 2.4 | vault/cloud secret backends | defer (env достаточно) |
| Phase 3 | wildcard SSL certbot vs acme.sh unify | defer (не блокер) |

## Главный вывод

Структура **не разваливается** на пути к k8s — при одном условии: ввести
`DeployBackend` seam (точка B) до того, как захардкодим больше SSH-логики.
Planner/drift/waves/health уже backend-agnostic. Всё остальное k8s-специфичное
(selection, per-replica порты) либо растворяется в k8s, либо добавляется
расширением схемы без брейка. Реальный «остаток на автомат» = перевести живой
deploy.yaml на декларативный блок + Studio-target. Движок ждать не надо — он есть.
