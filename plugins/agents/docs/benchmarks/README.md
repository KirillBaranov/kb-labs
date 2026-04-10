# Agent Benchmarks

Тест-кейсы и метрики для оценки качества агентной системы.

## Метрики

| Метрика | Описание | Как измеряется |
|---------|----------|----------------|
| **tokens_total** | Общий расход токенов | `llm:end` → `tokensUsed` (сумма) |
| **duration_ms** | Время выполнения | `agent:end` → `durationMs` |
| **iterations** | Кол-во итераций агента | `agent:end` → `iterations` |
| **tool_calls** | Кол-во вызовов инструментов | Подсчёт `tool:end` событий |
| **success** | Успешность | `agent:end` → `success` |
| **confidence** | Уверенность (для research) | `verification:complete` → `confidence` |
| **cost_usd** | Примерная стоимость | tokens × $0.003/1K (Claude Sonnet) |

---

## Тест-кейсы

### Suite 1: Simple Tasks (Baseline)

Простые задачи для проверки базовой функциональности.

| ID | Задача | Ожидания | Критерий успеха |
|----|--------|----------|-----------------|
| S1 | "What is 2+2?" | <5s, <500 tokens | Ответ содержит "4" |
| S2 | "Create hello.ts with console.log('Hello')" | <30s, <2000 tokens | Файл создан, содержит код |
| S3 | "Read greeting.ts and tell me what it does" | <20s, <1500 tokens | Описывает функцию greet |

### Suite 2: Code Generation

Генерация и модификация кода.

| ID | Задача | Ожидания | Критерий успеха |
|----|--------|----------|-----------------|
| G1 | "Create a function add(a, b) that returns a+b in math.ts" | <30s, <2000 tokens | Файл создан, функция работает |
| G2 | "Add input validation to the add function" | <45s, <3000 tokens | Валидация добавлена |
| G3 | "Create a Calculator class with add, subtract, multiply, divide" | <60s, <5000 tokens | Класс создан, все методы |

### Suite 3: Code Understanding

Понимание существующего кода.

| ID | Задача | Ожидания | Критерий успеха |
|----|--------|----------|-----------------|
| U1 | "Explain what FileMemory class does" | <60s, <5000 tokens | confidence >0.7 |
| U2 | "Find where agent events are defined" | <45s, <4000 tokens | Находит events.ts |
| U3 | "How does the orchestrator handle complex tasks?" | <90s, <8000 tokens | confidence >0.6 |

### Suite 4: Multi-Step Tasks

Многошаговые задачи с несколькими subtasks.

| ID | Задача | Ожидания | Критерий успеха |
|----|--------|----------|-----------------|
| M1 | "Create a Todo module with add, remove, list methods" | <120s, <10000 tokens | 3+ subtasks completed |
| M2 | "Refactor greeting.ts to use a class instead of function" | <90s, <8000 tokens | Файл изменён, класс работает |

### Suite 5: Memory & Context

Проверка памяти между запросами (в рамках одной сессии).

| ID | Задача | Ожидания | Критерий успеха |
|----|--------|----------|-----------------|
| C1 | Task1: "Create user.ts with User class" | - | Файл создан |
| C1.1 | Task2: "Show me the code you just created" | <15s | Показывает код user.ts |
| C2 | Task1: "Add name field to User" | - | Поле добавлено |
| C2.1 | Task2: "Now add age field too" | <30s | Помнит контекст, добавляет age |

---

## Результаты

### Baseline (дата: ______)

```
┌─────────────────────────────────────────────────────────────────┐
│                    BENCHMARK RESULTS                            │
├─────────────────────────────────────────────────────────────────┤
│ Suite          │ Pass │ Fail │ Tokens Avg │ Duration Avg │ Cost │
├────────────────┼──────┼──────┼────────────┼──────────────┼──────┤
│ Simple (S1-S3) │  /3  │  /3  │            │              │ $    │
│ CodeGen (G1-G3)│  /3  │  /3  │            │              │ $    │
│ Understanding  │  /3  │  /3  │            │              │ $    │
│ Multi-Step     │  /2  │  /2  │            │              │ $    │
│ Memory (C1-C2) │  /4  │  /4  │            │              │ $    │
├────────────────┼──────┼──────┼────────────┼──────────────┼──────┤
│ TOTAL          │  /15 │  /15 │            │              │ $    │
└─────────────────────────────────────────────────────────────────┘
```

---

## История прогонов

| Дата | Commit | Pass Rate | Tokens Total | Cost | Регрессии |
|------|--------|-----------|--------------|------|-----------|
| - | - | - | - | - | - |

---

## Как запускать

### Ручной прогон (пока нет автоматизации)

```bash
# 1. Подготовка sandbox
mkdir -p /tmp/agent-sandbox
cd /tmp/agent-sandbox

# 2. Запуск теста через REST API
curl -X POST http://localhost:5050/api/v1/plugins/agents/run \
  -H "Content-Type: application/json" \
  -d '{
    "task": "What is 2+2?",
    "workingDir": "/tmp/agent-sandbox"
  }'

# 3. Получение результата
curl http://localhost:5050/api/v1/plugins/agents/run/{runId}

# 4. Проверка событий для метрик
cat /tmp/agent-sandbox/.kb/agents/sessions/{sessionId}/events.ndjson | \
  jq -s '[.[] | select(.type == "llm:end")] | map(.data.tokensUsed) | add'
```

### Сбор метрик из событий

```bash
# Токены
cat events.ndjson | jq -s '[.[] | select(.type == "llm:end").data.tokensUsed] | add'

# Длительность
cat events.ndjson | jq -s '.[] | select(.type == "agent:end").data.durationMs'

# Tool calls
cat events.ndjson | jq -s '[.[] | select(.type == "tool:end")] | length'

# Confidence (для research tasks)
cat events.ndjson | jq -s '.[] | select(.type == "verification:complete").data.confidence'
```

---

## Критерии регрессии

Алерт если по сравнению с baseline:

| Метрика | Порог регрессии |
|---------|-----------------|
| tokens_total | +30% |
| duration_ms | +50% |
| success_rate | -10% |
| confidence_avg | -0.1 |

---

## TODO

- [ ] Автоматизировать прогон всех тестов
- [ ] CLI команда `pnpm kb agent:benchmark`
- [ ] Сохранение результатов в JSON
- [ ] Сравнение с baseline
- [ ] CI интеграция
