# Agent Mental Model

> Документ для понимания агентского флоу изнутри. Основа для принятия архитектурных решений.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        RUNNER                           │
│  Механический оркестратор. Zero intelligence.           │
│  Status Block, compaction, budget tracking, task mgmt.  │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   PLAN MODE       EXECUTE MODE      REVISION
   research →      code changes →    compact →
   report(plan)    report(summary)   feedback → retry
        │                │                │
        ▼                ▼                ▼
     HUMAN            HUMAN            HUMAN
   approve /        accept /         approve /
   reject+comment   reject+comment   reject+comment
```

### Ключевые компоненты

```
System Prompt          — Identity + Context + Constraints (статичный)
Status Block           — Iteration, budget 🟢🟡🔴, tasks, todos, findings (динамический)
Task Prompt            — User request + plan/feedback (per-run)
Workspace Snapshot     — fs_list + project detection (при старте)

Tools:
  Research             — fs_read, fs_list, glob, grep, rag_query
  Memory               — memory_finding, memory_blocker, memory_get
  Execution            — fs_write, fs_edit, bash_exec
  Tasks                — task_start, task_wait (sub-agents, bash, llm)
  Progress             — todo (plan step tracking)
  Output               — report (финал рана)

Context Management:
  Layer 1: Tool limits  — partial content + structure map (превентивный)
  Layer 2: Compaction   — LLM сжимает старые results в working memory
  Layer 3: Memory tools — агент сам фиксирует важное

Error Recovery:
  Level 0: nothing      — tool errors, модель сама
  Level 1: Status Block — ⚠️ stuck, 🟡🔴 budget
  Level 2: message      — "try different approach"
  Level 3: force stop   — LLM 3x fail, hard limit → partial result

Human-in-the-Loop:
  Plan:    draft → [revision loop] → approve → execute
  Execute: result → [revision loop] → accept → done
  Each revision: compact previous → clean context → feedback as task

LLM Cache (3 уровня):
  Static:  system prompt + workspace + AGENT.md  (весь ран, ~74% экономия)
  Slow:    working memory                        (между compaction-ами)
  Dynamic: Status Block + fresh tool results     (каждую итерацию)
```

### Полный lifecycle

```
INIT → workspace snapshot + load AGENT.md

PLAN MODE → research + report(plan)
  ↓
HUMAN REVIEW → approve / reject+comment → revision loop
  ↓
EXECUTE MODE → code changes + verification + report(summary)
  ↓
HUMAN ACCEPTANCE → accept / reject+comment → revision loop
  ↓
DONE
```

### Sub-agents (Task System)

```
Parent: task_start({type: "agent"/"bash"/"llm"}) → continues working
Parent: task_wait({ids: [...]})                  → blocks until done

Child = чистый лист. Свой prompt, свой budget (≤20% parent).
Tools = пресет (research/execute) ⊆ parent tools. Нет task_start.
Returns: summary через report() → parent видит 500 tokens вместо 50k.
Вложенность: строго 1 уровень.
```

---

## 1. Что агент получает на входе

```
System prompt
├── Роль / контекст ("ты plan writer, read-only tools")
├── Правила поведения (quality gate, delegation hints)
├── Бюджет (N итераций, M токенов)
└── Output requirements (формат плана)

Task prompt
└── Пользовательская задача + опционально existing plan

Tools
├── Что разрешено (PLAN_READ_ONLY_TOOL_NAMES)
└── Что физически доступно (registry)
```

---

## 2. Что агент видит внутри итерации

```
LLM context window (пересобирается каждую итерацию)
├── System prompt (статичный, весь цикл)
├── Conversation history
│   ├── Все предыдущие assistant turns
│   └── Все tool results (сырые)
└── Текущий user turn
```

**Ключевой момент**: агент не "помнит" — он *читает* весь history заново каждую итерацию.
Чем больше tool results накопилось — тем меньше места для новых мыслей.

---

## 3. Как агент принимает решения

```
Каждая итерация:
LLM смотрит на context → решает следующий tool call

Нет явного state machine.
Нет "я на фазе research".
Нет "я прочитал 5 из 12 файлов".

Агент знает только то что видит в context window.
```

---

## 4. Где findings живут

```
Вариант A: в context window (сырые tool results)
└── Проблема: быстро растёт, вытесняет полезное

Вариант B: memory tools (memory_finding/blocker)
└── Структурированно сохраняет → читает позже
└── Проблема: агент тратит итерации на save/load
└── Вывод: нужны — без них хуже (604k vs 346k токенов)

Вариант C: spawn_agent возвращает summary
└── Sub-agent сжимает большой объём → parent получает текст
└── Лучший вариант для большого объёма исследования
```

---

## 5. Бюджет

```
Token budget
├── Soft limit (40%) → nudge в следующий LLM call
└── Hard limit (95%) → stop

Iteration budget
├── simple=8, medium=12, complex=20
└── Проблема: нет сигнала агенту "ты на итерации 8 из 20"
```

---

## 6. Human-in-the-loop флоу

```
Task
  ↓
[Agent: plan mode]
  ↓ research + memory tools + spawn_agent
  ↓ report(markdown plan)
Human: approve / reject+comment
  ↓
[Agent: execute mode]
  ↓ исполнение плана
Human: accept / reject
```

**Два обязательных checkpoint**: согласование плана + приёмка результата.
Всё остальное — автономно.

Эскалация к человеку вне checkpoint только если:
- Неоднозначность требований (2+ принципиально разных подхода)
- Риск необратимого действия
- Застрял (3 попытки, нет прогресса)

---

## 7. Реальные проблемы (диагноз)

### A. Агент слеп к своему прогрессу
Он не знает на какой итерации, сколько файлов прочитал, что уже нашёл.
Всё это есть в context но размыто по истории.

### B. Context window = единственная "память" по умолчанию
Каждый tool result добавляется в историю.
К итерации 15 — история огромная, LLM "видит" всё но фокус размывается.

### C. Нет разницы между "исследую" и "пишу план"
С точки зрения LLM это одна непрерывная задача.
Нет момента когда он явно переключается.

### D. Тяжёлые задачи не влезают в iteration budget
complex=20 итераций — для большого пакета агент не успевает исследовать половину.
spawn_agent частично решает, но агент использует его не всегда.

---

## 8. Глазами агента: пошаговый путь

### Момент 0: Получил задачу

Агент видит:
```
System prompt: "Ты plan writer. Вот тулзы. Вот бюджет. Напиши план."
Task: "Рефакторинг пакета agent-core: вынести middleware в отдельные файлы"
```

**Знает**: задачу, инструменты, формат ответа.

**Не знает**:
- Что такое agent-core? Где он? Сколько файлов?
- Что такое middleware в контексте этого проекта?
- Какие зависимости у пакета?
- Масштаб задачи — 3 файла или 30?

> Он буквально стоит в тёмной комнате с фонариком и запиской "рефакторинг middleware".

### Момент 1-3: Первые итерации — светит фонариком

```
Итерация 1: glob_search("**/agent-core/**") → 47 файлов
Итерация 2: fs_read("agent-core/src/index.ts") → видит экспорты
Итерация 3: fs_read("agent-core/src/agent.ts") → 3914 строк, partial read (200 строк)
```

**Узнал**: есть agent-core, в нём большой файл, есть экспорты.

**Всё ещё не знает**:
- Прочитал 200 строк из 3914 — но не знает что осталось 3714
- Сколько файлов ещё нужно прочитать из 47
- Какие из 47 релевантны middleware
- Есть ли middleware уже вынесенные

После 3 итераций контекст ещё чистый — он помнит всё.

### Момент 4-8: Углубляется

```
Итерация 4: grep_search("middleware") → 23 совпадения в 12 файлах
Итерация 5: fs_read("middleware/pipeline.ts")
Итерация 6: fs_read("middleware/builtin/budget-middleware.ts")
Итерация 7: memory_finding("BudgetMiddleware: order=10, hooks=...")
Итерация 8: fs_read("middleware/builtin/progress-middleware.ts")
```

Context window к итерации 8:
- System prompt ~2k tokens
- Task ~200 tokens
- 8 tool results по ~1-3k = **8-24k tokens сырых данных**

Результат итерации 2 уже далеко наверху. Внимание начинает размываться.

### Момент 9-14: Потеря фокуса

Агент начинает:
- Сохранять finding → потом читать обратно через memory_get
- Перечитывать файлы которые уже видел (другой offset)
- Делать grep по тем же паттернам чуть иначе
- Не знать что уже достаточно для плана

**Почему?** Нет:
1. **Чеклиста** — "нашёл 5 из ~8 middleware, осталось 3"
2. **Саммари** — компактное "что я уже знаю" вместо 24k сырых tool results
3. **Сигнала** — "итерация 12/20, план ещё не начат"

---

## 9. Индустрия: как делают крупные игроки

**Claude Code (Anthropic):**
- Subagents для heavy lifting — parent агент остаётся "чистым" с минимальным контекстом
- Каждый subagent возвращает сжатый summary, не сырые данные
- Нет explicit state machine — модель сама решает
- Модель видит tool results + имеет extended thinking

**Devin (Cognition):**
- Planner + Executor — разные модели/промпты
- Planner видит **structured state**: список файлов, diff, test results
- Не сырые tool outputs а processed summaries

**OpenAI Codex CLI:**
- Sandboxed execution — агент видит результат, не process
- Auto-approval для safe ops, human-in-loop для risky

**Общий паттерн у всех**: никто не кидает сырые tool results в context window бесконечно.
Все так или иначе **сжимают и структурируют** промежуточные результаты.

---

## 10. Чего не хватает нашему агенту

| # | Что | Сейчас | Должно быть |
|---|-----|--------|-------------|
| 1 | **Ориентация** | "Вот task, разбирайся" | "Вот task. Проект: 18 монорепо, 125 пакетов. agent-core: 47 файлов, 12k LOC. Вот его structure." |
| 2 | **Прогресс** | Ничего | "Iteration 8/20. Files read: 5. Findings saved: 3. Plan: not started." |
| 3 | **Сжатый контекст** | Все tool results сырые в history | На итерации N — автоматический summary предыдущих findings вместо сырых results |
| 4 | **Масштаб задачи** | Не знает размер задачи | "В scope задачи ~12 файлов по middleware. Ты прочитал 5." |

Каждый пункт — не инструкция "делай так", а **информация**.
Модель умная — дай ей факты и она сама решит что делать дальше.

---

## 11. Идеальная структура: что агент должен получать

### System Prompt: секции

Сейчас system prompt — одна большая строка с перемешанными инструкциями.
Идеальная структура — чёткие логические блоки:

```
System Prompt
├── 1. Identity (кто ты)
│   └── "Ты автономный агент для работы с кодовыми базами"
│   └── Без привязки к mode — plan/execute это не identity
│
├── 2. Context (где ты)
│   └── Working directory, project type (monorepo/single)
│   └── CLAUDE.md / AGENT.md если есть — правила проекта
│   └── НЕ hardcoded, а собранный динамически при старте
│
├── 3. Task framing (что от тебя хотят)
│   └── "Напиши план" / "Выполни задачу" / "Исследуй и ответь"
│   └── Output format (markdown plan / code changes / report)
│
├── 4. Tools (что ты можешь)
│   └── Описания тулзов — приходит через tool definitions
│   └── Ничего дополнительного не нужно в промпте
│
└── 5. Constraints (ограничения)
    └── Budget: iterations, tokens
    └── Permissions: read-only / full access
    └── НЕ "как работать", а "что нельзя"
```

**Принцип: нет секции "как работать".**
Нет "Use ~7 iterations for research", нет "delegate if 3+ files".
Модель сама решает стратегию на основе фактов.

### Динамический Status Block (на каждой итерации)

Это главное что отсутствует сегодня. Блок обновляется перед каждым LLM call.

Пример того что агент видит на итерации 8:
```
═══ STATUS ═══
Iteration: 8/20 | Tokens: 45k/1M | Time: 2m 34s

Files read (5):
  middleware/pipeline.ts (full, 340 lines)
  middleware/builtin/budget-middleware.ts (full, 101 lines)
  middleware/builtin/progress-middleware.ts (full, 89 lines)
  agent.ts (partial, lines 1-200 of 3914)
  index.ts (full, 45 lines)

Files written (0):

Findings (3):
  #1: "BudgetMiddleware: order=10, beforeIteration checks hard limit..."
  #2: "ProgressMiddleware: order=50, detects stuck loops..."
  #3: "Pipeline: middlewares sorted by order, run sequentially..."

Blockers (0):

Sub-agents spawned (0):
═══════════════
```

**Откуда runner берёт данные** — всё механическое, zero LLM calls:
```
Files read     ← перехватывает fs_read tool calls, трекает path + lines
Files written  ← перехватывает fs_write/fs_edit tool calls
Findings       ← перехватывает memory_finding tool calls, хранит текст
Blockers       ← перехватывает memory_blocker tool calls
Sub-agents     ← перехватывает spawn_agent calls + results
Iteration      ← counter в execution loop
Tokens         ← из LLM response metadata
Time           ← wall clock
```

**Где живёт Status Block** — в конце system prompt. System prompt пересобирается
на каждый LLM call, поэтому Status Block всегда актуальный.
Один block, заменяет предыдущий, фиксированный overhead ~300-800 tokens.

Это **факты**, не инструкции. Агент видит "итерация 8/20, прочитал 5, agent.ts partial"
и **сам** решает — дочитать agent.ts, читать другой файл, или начать писать.

### Task Prompt

```
Task Prompt
├── User request (as-is, без переформулировки)
└── Existing context (если есть)
    └── Previous plan draft (revision)
    └── Session history (continuity)
```

### Workspace Snapshot (собирается автоматически при старте)

Runner перед первой итерацией делает `fs_list` рабочей директории
и собирает карту территории. Никакого парсинга задачи, никакого scope estimate.

Пример:
```
Workspace:
  /Users/kirillbaranov/Desktop/kb-labs/

  kb-labs-agents/          (dir)
  kb-labs-cli/             (dir)
  kb-labs-core/            (dir)
  kb-labs-mind/            (dir)
  kb-labs-workflow/        (dir)
  ... (+13 dirs)

  package.json             (file)
  pnpm-lock.yaml           (file)
  CLAUDE.md                (file)
  AGENT.md                 (file)
  tsconfig.json            (file)

  Detected: monorepo (pnpm workspace), 18 top-level dirs
  Project docs: CLAUDE.md, AGENT.md
```

**Детекция проекта** — чисто механическая, работает для любого стека:
- `pnpm-workspace.yaml` / `package.json` с `workspaces` → monorepo (JS/TS)
- `package.json` без workspaces → single package (JS/TS)
- `pyproject.toml` / `setup.py` → python project
- `go.mod` → go project
- `Cargo.toml` с `[workspace]` → rust workspace
- Иначе → generic directory

**CLAUDE.md / AGENT.md** — если найдены, содержимое инжектится в Context секцию
system prompt. Правила проекта, конвенции, что угодно — агент узнаёт до первого tool call.

**Принцип: snapshot = карта, не GPS.** Runner показывает территорию,
агент сам решает куда копать. Scope estimate не нужен —
агент сделает `fs_list("kb-labs-agents/packages/")` на первой итерации если захочет.

### Tools: идеальный набор

```
Research (read-only)
├── fs_read          — читать файлы
├── fs_list          — листинг директорий
├── glob_search      — поиск по паттерну
├── grep_search      — поиск по содержимому
└── rag_query        — семантический поиск (Mind RAG)

Memory (structured notepad)
├── memory_finding   — сохранить находку
├── memory_blocker   — сохранить проблему/блокер
└── memory_get       — прочитать свои заметки

Delegation
└── spawn_agent      — делегировать research sub-агенту

Output
└── report           — финальный результат
```

### Context Management: три слоя защиты от overflow

Проблема: context window забивается сырыми tool results.
Один `fs_read` на большой файл = 30-50k tokens. К итерации 15 — контекст мёртв.

**Слой 1: Tool output limits (превентивный, без LLM)**

Тулза сама ограничивает output до попадания в context:

```
Файлы > 300 строк → partial content + structure map:
  "agent.ts (3914 lines) — showing lines 1-200, structure map:
    class AgentRunner (line 45)
    method execute() (line 230)
    method buildPrompt() (line 890)
    ..."

Search results > 50 matches → top 20 + "... and 30 more in 8 files"
```

Structure map строится без LLM — regex по `export`, `class`, `function`,
`interface` с номерами строк. Базовый парсер для любого языка.

Агент видит карту файла и решает что дочитать, а не получает 50k tokens сырого кода.

**Слой 2: Compaction (реактивный, LLM call)**

Runner сжимает старые tool results в working memory:

```
Trigger:
  - Каждые N итераций (например 5)
  - ИЛИ суммарный context > threshold tokens (не ждём N итераций)

LLM call (дешёвая модель, Haiku-level):
  Input: сырые tool results итераций 1..K + текущий task
  Output: structured working memory ~500-1k tokens

Prompt:
  "Summarize the following tool results into concise working memory.
   Preserve: file paths, line numbers, key findings, decisions made.
   Discard: raw file contents, duplicate searches, verbose output."
```

После compaction history выглядит:
```
messages[0]: system prompt (с Status Block)
messages[1]: user task
messages[2]: [WORKING MEMORY — iterations 1-5]    ← один compact block
messages[3]: tool call итерации 6 (свежий, полный)
messages[4]: tool result итерации 6
...
```

Пример working memory:
```
Working Memory (iterations 1-5):

Files examined:
- middleware/pipeline.ts (340 lines): ordered middleware execution,
  sort by .order, sequential run of beforeIteration/beforeLLMCall hooks
- middleware/builtin/budget-middleware.ts (101 lines): token budget
  enforcement, soft limit at 40% → nudge, hard limit at 95% → stop
- agent.ts (lines 1-200 of 3914): main agent class, imports pipeline,
  creates middleware stack in constructor

Key observations:
- Middleware pipeline already extracted into separate file
- Budget/Progress/Observability middlewares are in builtin/ directory
- agent.ts is a god object — pipeline wiring is mixed with execution logic

Unresolved:
- agent.ts lines 200-3914 not read
- context-filter-middleware.ts not yet examined
```

Стоимость: ~$0.001-0.003 за call. Для 20-итерационного рана = 3-4 calls = ~$0.01.

**Слой 3: Memory tools (агент решает сам)**

`memory_finding` / `memory_blocker` остаются как structured notepad.
Runner трекает их в Status Block автоматически — агент видит "Findings: 3".

Если агент прочитал 8 файлов но Findings: 0 — Status Block сам это покажет.
Модель достаточно умная чтобы понять "я читаю но не фиксирую".

**Три слоя вместе:**
```
1. Tool limits    → не допускает огромных results (превентивно)
2. Compaction     → сжимает накопленное (реактивно, LLM)
3. Memory tools   → агент фиксирует важное (осознанно)
4. Status Block   → показывает всё вместе (на каждой итерации)
```

### Верификация результата

Агент должен проверять свою работу перед отправкой. Но проверки не должны
быть завязаны на конкретный стек или проект.

**Принцип: runner проверяет структуру, агент проверяет содержание.**

#### Детерминированные проверки (runner, без LLM, project-agnostic)

**Plan mode — file reference check:**
```
1. Извлечь все file paths из плана (regex: путь с / и расширением)
2. Сверить с files_read в Status Block
3. Если есть unverified → вернуть агенту:
   "Your plan references files you didn't read:
    - src/middleware/todo-sync.ts
    - src/core/runner.ts
   Read them or remove references."
```

Не нужно знать стек. Чистая логика: "ты ссылаешься на файл, который не открывал".

**Execute mode — exit code tracking:**
```
Runner трекает bash_exec вызовы:
├── has_writes: boolean     ← Files written > 0
├── checks_run: string[]    ← bash_exec с keywords: build/test/check/lint/pytest/cargo
├── checks_passed: boolean  ← все exit code === 0
└── last_failure: string    ← stderr если exit !== 0
```

Runner не знает что `pnpm build` — build command. Но видит keyword `build` + exit code.

#### Агент сам выбирает проверки (project-adaptive)

Агент знает тип проекта из workspace snapshot и AGENT.md/CLAUDE.md.
Он сам решает какие проверки запустить через `bash_exec`:

```
Monorepo (pnpm):  bash_exec("pnpm --filter @scope/pkg build")
Python:           bash_exec("pytest tests/")
Rust:             bash_exec("cargo check")
Go:               bash_exec("go build ./...")
Generic:          смотрит Makefile, scripts/, CI config
```

**AGENT.md — источник правил верификации.** Если в проекте есть:
```markdown
## Verification
After any code changes, run:
- `pnpm qa` (build + lint + types + tests)
```
Агент увидит это в Context секции system prompt и поймёт какие команды запускать.
Без hardcode в runner, без детекции стека — проект сам говорит что нужно.

#### Status Block как триггер верификации

Status Block показывает состояние верификации:

```
═══ STATUS ═══
Iteration: 18/20 | Tokens: 180k/1M

Files written (4):
  middleware/new-middleware.ts (created)
  middleware/pipeline.ts (modified)
  ...

Verification: not run        ← сильный сигнал при Files written > 0
═══════════════
```

После запуска:
```
Verification: passed (build ok, 12 tests passed)
```
или:
```
Verification: failed
  build: exit 1 — "Cannot find module './new-middleware'"
  tests: not run (build failed)
```

Модели не нужна инструкция "запусти тесты". Она видит `Files written: 4` +
`Verification: not run` и сама понимает что нужно проверить.

#### Итого: verification flow

```
Plan mode:
  Агент пишет план → runner проверяет file references → если ок → report
                   → если нет → агент получает список unverified files

Execute mode:
  Агент пишет код → Status Block: "Verification: not run"
                  → агент запускает проверки (из AGENT.md или по типу проекта)
                  → Status Block: "passed" или "failed + details"
                  → если failed → агент фиксит и перезапускает
                  → если passed → report
```

### Что меняется между mode (plan vs execute)

```
                  Plan mode             Execute mode
Identity          тот же                тот же
Context           тот же                + approved plan
Task framing      "напиши план"         "выполни план"
Tools             read-only + report    full access
Constraints       тот же budget         тот же budget
Status block      тот же                + plan progress (step 3/12)
Verification      file ref check        build/test exit codes
```

**Mode — это не другой агент.** Это тот же агент с другим набором tools
и другим task framing. Минимальная разница.

### Revision Loop (апрув с комментарием)

Сейчас апрув бинарный: да/нет. Нужно: "да, но поправь X".

#### Сценарий

```
Агент: "Вот план (3 фазы, 12 шагов)"
Человек: "Ок, но в фазе 2 ты забыл про миграцию базы,
          и verification слабый — добавь тест на rollback"
```

#### Как это работает: continuity через session

Тот же session, агент видит историю + user feedback как продолжение диалога.
Compaction сжимает предыдущий ран перед revision — контекст чистый.

```
Revision flow:

1. Agent: research → plan draft → report
2. Human: approve / reject + comment
3. If reject + comment:
   a. Runner compacts previous conversation → working memory
   b. Runner инжектит: existing plan + user comment как новый task
   c. Agent revises plan (тот же session, чистый контекст)
   d. → goto 2
4. If approve → execute mode
```

#### Что агент видит на revision итерации

```
System prompt: [identity + context + workspace snapshot]
Status Block: [fresh — new iteration counter, но working memory сохранена]

Working memory (compacted from previous run):
  "Исследовал agent-core/src/middleware/. Нашёл 5 middleware,
   pipeline.ts управляет порядком. agent.ts — god object 3914 строк."

Task:
  "Revise this plan based on user feedback.

   User feedback:
   'В фазе 2 забыл про миграцию базы. В verification добавь тест на rollback.'

   Current plan:
   [полный markdown плана]"
```

#### Почему continuity, а не новый ран

```
Новый ран:
- Тратит токены на повторное исследование
- Может переписать весь план с нуля
- Теряет контекст предыдущего research

Continuity через session:
+ Все findings сохранены в working memory
+ Агент понимает что менять, что оставить
+ Не тратит итерации на research — всё уже найдено
+ Compaction очищает контекст от мусора
```

#### Количество циклов не ограничено

Человек может отправлять план назад сколько угодно.
Каждый revision cycle: compaction предыдущего → чистый контекст → revision.

```
Cycle 1: research (8 iter) + plan (4 iter) = 12 iterations
Cycle 2: revision (2-4 iter) — только правки, без research
Cycle 3: revision (1-2 iter) — мелкие доводки
Approve → execute
```

Каждый следующий цикл дешевле — агент уже знает кодовую базу,
working memory содержит все findings.

---

## 12. Полный флоу агента (собираем всё вместе)

```
INIT
├── Workspace snapshot (fs_list + project detection)
├── Load AGENT.md / CLAUDE.md → Context
└── Build system prompt: Identity + Context + Constraints

PLAN MODE
├── Iteration loop:
│   ├── Status Block инжектится в system prompt
│   ├── LLM call → tool calls
│   ├── Runner трекает: files read, findings, iterations, tokens
│   ├── Tool output limits: partial content + structure map для больших файлов
│   ├── Compaction trigger: каждые N итераций или по threshold
│   └── Repeat
├── Agent calls report(plan)
├── Runner: file reference check (plan refs vs files_read)
│   ├── All verified → save plan, emit to human
│   └── Unverified refs → return to agent, continue loop
└── Plan ready → waiting for human

HUMAN REVIEW
├── Approve → execute mode
├── Reject + comment → revision loop
│   ├── Compact previous conversation → working memory
│   ├── Inject: existing plan + feedback as new task
│   ├── Agent revises (2-4 iterations, no re-research)
│   └── → back to HUMAN REVIEW
└── Reject (no comment) → end

EXECUTE MODE
├── Load approved plan → inject in Context
├── Iteration loop:
│   ├── Status Block: + plan progress (step 3/12) + verification status
│   ├── LLM call → tool calls (full access: read + write + bash)
│   ├── Same tracking + compaction as plan mode
│   └── Repeat
├── Verification:
│   ├── Status Block: "Files written: 4, Verification: not run"
│   ├── Agent runs checks (from AGENT.md or project-adaptive)
│   ├── Status Block: "Verification: passed/failed"
│   ├── If failed → agent fixes and re-runs
│   └── If passed → report
└── Result ready → waiting for human acceptance

HUMAN ACCEPTANCE
├── Accept → done
└── Reject + comment → execute revision loop
    ├── Compact previous execute run → working memory
    ├── Inject: current state + feedback as new task
    ├── Agent fixes (точечные правки, не полный re-execute)
    └── → back to HUMAN ACCEPTANCE
```

---

## 14. Task System — асинхронные задачи и sub-agents

### Идея

`task_start` / `task_wait` — универсальный примитив для запуска чего угодно в фоне.
Не "spawn agent", а "запусти и дай знать когда готово". Sub-agent — частный случай.

### Два tool-а

```
task_start({id, type, ...params})
→ сразу возвращает {status: "running"}
→ агент продолжает работать

task_wait({ids: ["build", "research"]})
→ блокирует итерацию пока task-и не завершатся
→ возвращает результаты
```

### Типы task-ов

```
agent  — sub-agent с своим контекстом, tools, budget
bash   — долгая shell команда (build, test, deploy)
llm    — отдельный LLM call (summarize, review)
```

Один API, один Status Block, одна модель ожидания.

### Паттерны использования

**Fire and wait (нужен результат сейчас):**
```
iter 5: task_start({id: "build", type: "bash", command: "pnpm build"})
iter 6: task_wait({ids: ["build"]})  ← тупо ждёт
iter 7: видит результат, работает дальше
```

**Fire and continue (результат нужен позже):**
```
iter 5: task_start({id: "tests", type: "bash", command: "pnpm vitest"})
iter 6: fs_edit("src/index.ts", ...)  ← продолжает работать
iter 7: fs_edit("src/utils.ts", ...)
iter 8: task_wait({ids: ["tests"]})  ← теперь забирает
```

**Fan-out (параллельно несколько):**
```
iter 5: task_start({id: "a", type: "agent", task: "..."})
        task_start({id: "b", type: "agent", task: "..."})
        task_start({id: "c", type: "agent", task: "..."})
iter 6: task_wait({ids: ["a", "b", "c"]})  ← ждёт все три
```

`task_start` + сразу `task_wait` = синхронный spawn. Но гибче —
модель сама решает когда ждать.

### Sub-agent: что получает, что возвращает

**Что child получает:**
```
- Свой system prompt (identity + context + workspace snapshot)
- Task = subtask от parent (конкретное задание)
- Tools = пресет из parent tools (не шире parent-а)
- Budget = указан parent-ом или дефолт 20% от остатка parent-а
- Свой Status Block (свой iteration counter, свои findings)
```

**Чего child НЕ получает:**
```
- History parent-а
- Findings parent-а
- Parent Status Block
```

Child — чистый лист с конкретным заданием.

**Что child возвращает:**
```
Child вызывает report(summary) → текст возвращается parent-у
как tool_result от task_wait.

Все сырые tool results child-а остаются внутри child-а.
Parent видит только сжатый summary.
```

Это главная ценность: child потратил 8 итераций, прочитал 15 файлов,
50k tokens сырых данных — parent получил 500 tokens summary.

### Tool пресеты

```
research  — read-only: fs_read, fs_list, glob_search, grep_search,
            rag_query, memory_finding, memory_get, report
execute   — full: всё из research + fs_write, fs_edit, bash_exec, report
```

Оба пресета — subset от parent tools. Runner валидирует:
child tools ⊆ parent tools. Ни один пресет не включает `task_start` —
child не может спавнить своих child-ов.

**Вложенность: строго 1 уровень.** Parent → child, без grandchild.
Если child-у нужно делегировать — задача неправильно декомпозирована parent-ом.

### Budget distribution

```
Parent budget: 200k tokens remaining
spawn child:   budget = указан parent-ом ИЛИ дефолт 20% от остатка

Runner валидирует:
  child budget ≤ parent remaining
  parent remaining -= child budget (резервируется)
  если child израсходовал меньше — остаток возвращается parent-у
```

### Status Block: трекинг task-ов

Runner трекает все task-и механически. Агент видит на каждой итерации:

```
═══ STATUS ═══
Iteration: 7/20 | Tokens: 65k/200k

Pending tasks (2):
  #build "pnpm build" — running (bash, started iter 5)
  #research "исследуй middleware/" — running (agent, started iter 5)

Completed tasks (1):
  #tests "pnpm vitest" — done (bash, exit 0, 34s)

Files read (2): ...
Findings (2):
  #1: ...
  #2: from task #tests: "47 tests passed, 0 failed"
═══════════════
```

`Pending tasks` перед глазами каждую итерацию — невозможно забыть
что ждёшь результат. Модель сама решает когда вызвать `task_wait`.

---

## 15. Error Recovery — когда что-то идёт не так

**Принцип: runner = страховочная сетка, не микроменеджер.**
Модель сама разруливает большинство ситуаций. Runner вмешивается
только когда модель не может помочь себе сама.

### Сценарий 1: Tool call вернул ошибку

Runner ничего не делает. Ошибка возвращается агенту как обычный tool_result.

```
tool_call: fs_read("src/not-exists.ts")
tool_result: {error: "File not found: src/not-exists.ts"}
// агент сам: "ок, попробую glob_search"
```

Модель умеет работать с ошибками — retry, другой подход, skip.
Runner следит только за повторами: 3+ одинаковых ошибки подряд → это "застрял".

### Сценарий 2: Агент застрял (крутится на месте)

Два уровня реакции:

**Nudge (мягкий)** — runner добавляет предупреждение в Status Block:

```
═══ STATUS ═══
Iteration: 12/20 | Tokens: 95k/200k

⚠️ Stuck: last 3 tool calls identical (grep_search "middleware")

Files read (8): ...
═══════════════
```

Модель видит предупреждение и меняет подход. Достаточно в 90% случаев.

**Escalate (жёсткий)** — если nudge не помог через 2 итерации,
runner вставляет прямое сообщение в контекст:

```
"You appear stuck. Either try a different approach
 or call report() with partial results."
```

Не force stop — модель всё ещё решает сама. Но сигнал очень громкий.

### Сценарий 3: LLM вернул мусор/отказ

Тут runner обязан вмешаться — модель не может починить свой собственный output:

```
Пустой response         → retry (до 2 раз)
Невалидный tool call    → вернуть как tool error, модель попробует снова
  (wrong name, missing params)
Отказ ("I can't")       → вернуть как tool error, пусть переформулирует
```

Максимум 3 retry на один LLM call. После — force stop с partial result.

### Что значит "partial result"

Если агент остановлен принудительно (budget exhaustion, stuck, LLM failure),
runner собирает partial result из того что есть:

```
Partial result:
  Status: stopped (reason: budget exhausted / stuck / LLM failure)
  Completed: "исследовал 5 из ~12 файлов middleware"
  Findings: [все сохранённые findings]
  Working memory: [если была compaction]
  Last action: "grep_search 'middleware' (repeated 3x)"
```

Partial result лучше чем ничего — человек видит что агент успел сделать
и может либо продолжить в том же session, либо дать новый task.

### Budget в Status Block — явный семантический сигнал

Числа `Tokens: 160k/200k` модель может проигнорировать.
Семантический статус — нет.

```
🟢 normal       (0-60%)   — работай спокойно
🟡 wrapping up  (60-90%)  — завершай research, переходи к output
🔴 critical     (90%+)    — следующая итерация может быть последней, вызывай report()
```

Как это выглядит в Status Block:

```
═══ STATUS ═══
Iteration: 8/20 | Tokens: 45k/200k | Budget: 🟢 normal
...
═══════════════
```

```
═══ STATUS ═══
Iteration: 14/20 | Tokens: 160k/200k | Budget: 🟡 wrapping up
...
═══════════════
```

```
═══ STATUS ═══
Iteration: 19/20 | Tokens: 190k/200k | Budget: 🔴 critical — call report()
...
═══════════════
```

Budget считается по максимуму из двух лимитов:
- Token budget: % потраченных токенов
- Iteration budget: % потраченных итераций

Берётся худший из двух. Если iterations 18/20 но tokens 30k/200k —
всё равно 🔴 critical, потому что итерации кончаются.

### Итого: уровни вмешательства runner-а

```
Уровень 0: ничего       — tool error, модель разруливает сама
Уровень 1: Status Block — семантический budget (🟡/🔴), stuck warning (⚠️)
Уровень 2: сообщение    — прямой текст в контекст ("try different approach")
Уровень 3: force stop   — только при невосстановимой ошибке (LLM 3x fail, hard limit)
```

---

## 16. Plan Progress Tracking в Execute Mode

### Кто трекает прогресс

**Агент сам.** Runner не может определить из `fs_edit("middleware.ts")` что это
шаг 3 или шаг 7. Только агент знает контекст.

Агент сообщает прогресс через `todo` tool — тот же что уже есть.
При старте execute mode runner разбирает план на todo-items автоматически.
Агент отмечает выполнение через `todo({id: "step-3", status: "done"})`.

Runner трекает в Status Block механически:

```
═══ STATUS ═══
Iteration: 12/20 | Tokens: 95k/200k | Budget: 🟡 wrapping up

Plan progress (7 steps):
  ✅ Step 1: Extract BudgetMiddleware — done
  ✅ Step 2: Extract ProgressMiddleware — done
  ✅ Step 3: Update pipeline imports — done
  ⏭️ Step 4: Extract ObservabilityMiddleware — skipped (already exists)
  🔄 Step 5: Update agent.ts constructor — in progress
  ⬜ Step 6: Add unit tests
  ⬜ Step 7: Run verification
═══════════════
```

Никакого нового tool — `todo` уже умеет: create, update status, skip с reason.

### Два уровня строгости

**Plan (гибкий)** — guidelines. Агент может адаптировать на ходу:
- Пропустить шаг (с reason)
- Добавить промежуточный todo
- Изменить порядок
- Runner не блокирует — только трекает

```
todo({id: "step-4", status: "skipped", reason: "file already extracted"})
todo({id: "step-4.5", title: "fix circular import", status: "done"})
```

**Spec (строгий, будущее)** — контракт. Агент обязан выполнить каждый пункт:
- Пропуск = невозможен без escalation к человеку
- Изменение spec = только через revision loop
- Runner валидирует: все todo done или explicitly escalated

```
todo({id: "step-4", status: "blocked", reason: "conflicting requirement"})
→ runner escalates к человеку: "Step 4 blocked, agent needs guidance"
```

### Что агент видит при старте execute mode

```
System prompt: [identity + context + workspace snapshot]
Status Block: [iteration 1/20, plan progress: all ⬜]

Task:
  "Execute the approved plan.

   Plan:
   ## Phase 1: Extract middlewares
   Step 1: Extract BudgetMiddleware to budget-middleware.ts
   Step 2: Extract ProgressMiddleware to progress-middleware.ts
   ...

   Update todo status as you complete each step."
```

Runner при старте execute mode:
1. Парсит approved plan → извлекает шаги
2. Создаёт todo-items автоматически (step-1, step-2, ...)
3. Инжектит plan в task
4. Status Block показывает прогресс через todo state

### Может ли агент менять план?

**Plan mode**: да. Агент — взрослый, он видит реальность на месте.
Если шаг 5 невозможен — skip с reason. Если нужен новый шаг — добавить todo.
Все изменения видны в Status Block, человек увидит при приёмке.

**Spec mode**: нет без escalation. Spec = контракт, отклонение = запрос к человеку.

---

## 17. Report Tool — финал рана

**Report = завершение рана. Один вызов, точка.**

```
report({summary: "markdown текст"})
→ ран завершён
→ результат отдаётся: человеку (top-level) или parent-у (sub-agent)
```

### Формат — всегда markdown

Агент сам решает что писать. Формат не навязывается runner-ом.

- **Plan mode**: markdown план с фазами, шагами, verification strategy
- **Execute mode**: summary что сделано, какие файлы изменены, результат verification
- **Sub-agent**: компактный summary для parent-а (findings, выводы)

### Report ≠ ask_user

Report завершает ран. Если агенту нужно задать вопрос человеку посреди работы —
это отдельный tool (`ask_user`, будущее), не report.

```
ask_user  → пауза, ждёт ответ, продолжает ран
report    → ран завершён, control передан наружу
```

### Когда report вызывается

- Агент явно решил что закончил → `report()`
- Budget 🔴 critical → агент видит сигнал и вызывает `report()` с partial result
- Force stop → runner сам собирает partial result (агент не вызывал report)

---

## 18. Post-Execute Rejection — человек не принял результат

### Симметрично revision loop для плана

Тот же механизм что для plan revision — compact + feedback + continue.

```
Execute revision flow:

1. Agent: выполняет план → report(summary)
2. Human: accept / reject + comment
3. If reject + comment:
   a. Runner compacts previous execute run → working memory
   b. Runner инжектит: текущее состояние кода + user feedback как новый task
   c. Agent продолжает в том же session (чистый контекст, working memory)
   d. → goto 2
4. If accept → done
```

### Что агент видит на revision итерации

```
System prompt: [identity + context + workspace snapshot]
Status Block: [fresh iteration counter, working memory из предыдущего рана]

Working memory (compacted):
  "Выполнил 7 шагов плана. Извлёк 4 middleware в отдельные файлы.
   Обновил imports в pipeline.ts. Тесты зелёные.
   build exit 0, vitest: 12 tests passed."

Task:
  "Fix issues based on user feedback.

   User feedback:
   'BudgetMiddleware потерял дефолтное значение maxTokens при извлечении.
    И не хватает теста на edge case когда budget = 0.'

   Current state: [список изменённых файлов]"
```

### Разница с plan revision

```
Plan revision:   агент переписывает markdown → дёшево (2-4 итерации)
Execute revision: агент правит код → может быть дороже, но обычно точечные фиксы
```

Принцип тот же: compaction сжимает предыдущий ран, контекст чистый,
агент видит feedback и текущее состояние, фиксит конкретные проблемы.

### Количество циклов

Не ограничено, как и для плана. Каждый цикл — compact + revision.
Обычно execute revision быстрее plan revision — человек указывает
конкретные баги, агент фиксит точечно.

---

## 19. LLM Cache Strategy — экономия на повторных input tokens

### Проблема

Каждая итерация = новый LLM call. System prompt + workspace snapshot + AGENT.md
отправляются заново каждый раз. Для 20-итерационного рана: 20 * 10k = 200k tokens
впустую на неизменный контент.

### Три уровня кэширования

```
LLM call на итерации N:

┌─────────────────────────────────────────────────┐
│  STATIC CACHE — не меняется весь ран            │
│                                                 │
│  Identity + Context + Constraints               │
│  Workspace Snapshot                             │
│  AGENT.md / CLAUDE.md content                   │
│  Tool definitions                               │
│                                                 │
│  cache breakpoint ─────────────────────────── ● │
├─────────────────────────────────────────────────┤
│  SLOW CACHE — меняется после compaction         │
│                                                 │
│  Working Memory (compacted results)             │
│  Task prompt (user request)                     │
│                                                 │
│  cache breakpoint ─────────────────────────── ● │
├─────────────────────────────────────────────────┤
│  NO CACHE — меняется каждую итерацию            │
│                                                 │
│  Status Block (iteration, budget, tasks, todos) │
│  Свежие tool results (после compaction)         │
│  Conversation tail (последние N turns)          │
└─────────────────────────────────────────────────┘
```

### Как это работает

**Static cache (breakpoint 1):**
- Устанавливается при первом LLM call рана
- Не инвалидируется до конца рана
- ~5-15k tokens закэшированы, не пересчитываются 20 итераций
- Экономия: (N-1) * static_size tokens

**Slow cache (breakpoint 2):**
- Обновляется после каждой compaction (~раз в 5 итераций)
- Working memory заменяет старую → новый breakpoint
- Между compaction-ами кэш стабилен
- Экономия: ~4 итерации из 5 не пересчитывают working memory

**No cache (dynamic):**
- Status Block, свежие tool results — всегда пересчитываются
- Это малая часть контекста (~1-5k tokens)

### Экономия на реальном примере

```
20-итерационный ран, compaction каждые 5 итераций:

Без кэша:
  20 итераций * 30k avg context = 600k input tokens

С кэшем:
  Static:  10k * 1 (cached) + 10k * 19 (cache read, 90% дешевле) = ~29k effective
  Slow:    5k * 4 compaction points + 5k * 16 cache reads = ~28k effective
  Dynamic: 5k * 20 = 100k (без кэша)
  Total:   ~157k effective tokens

  Экономия: ~74% на input tokens
```

### Что кэшировать для sub-agents

Sub-agent получает тот же static cache что parent — identity, context, workspace snapshot
общие. Runner переиспользует cache prefix если LLM провайдер поддерживает.

```
Parent и child делят static cache:
  [Identity + Context + Workspace] ← общий prefix, один cache entry
  [Parent constraints]             ← parent-specific
  [Child constraints + subtask]    ← child-specific
```

### Платформенная поддержка

Платформа нативно поддерживает:
- Cache breakpoints в LLM adapter API
- Стратегии кэширования (static/slow/none) через конфиг
- Автоматическое определение cache boundaries по структуре prompt
- Метрики cache hit rate в analytics

Runner расставляет breakpoints автоматически по структуре prompt.
Никакой ручной настройки — кэширование прозрачно для агента.

---

## 13. Открытые вопросы

| # | Вопрос | Статус |
|---|--------|--------|
| 1 | Workspace snapshot | решено: тупой snapshot, fs_list + project detection |
| 2 | Status Block | решено: в system prompt, механический, zero LLM |
| 3 | Context management | решено: 3 слоя — tool limits + compaction (LLM) + memory tools |
| 4 | Verification | решено: runner checks structure, agent checks content |
| 5 | Revision loop (plan) | решено: continuity через session + compaction |
| 6 | Task system / sub-agents | решено: task_start/task_wait, пресеты, 1 уровень вложенности |
| 7 | Error recovery | решено: 4 уровня — tool error → Status Block → сообщение → force stop |
| 8 | Budget signaling | решено: 🟢/🟡/🔴 семантический статус в Status Block |
| 9 | Plan progress tracking | решено: через todo tool, два уровня строгости (plan/spec) |
| 10 | Report tool | решено: один вызов = финал рана, markdown |
| 11 | Post-execute rejection | решено: revision loop симметричный плану |
| 12 | LLM cache strategy | решено: 3 уровня — static/slow/dynamic, ~74% экономия |
| 13 | Structure map parser: какие языки, насколько глубокий AST? | open |
| 13 | Compaction trigger: каждые N итераций или по threshold? | open (вероятно оба) |
| 14 | ask_user tool: дизайн, когда агент может спрашивать посреди рана? | open |
| 15 | Spec mode: детальный дизайн strict enforcement | open (будущее) |
| 16 | Session persistence: формат хранения (turns.json, memory/, plan.json) | open (описать) |
