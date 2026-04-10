# Baseline Quality Gate Workflow

## Концепция

**Baseline Quality Gate** - это подход к управлению техническим долгом, который позволяет:
- ✅ Оставить существующие ошибки без блокировки разработки
- ❌ Запретить добавление новых ошибок
- 🎯 Постепенно улучшать кодовую базу (ratcheting)

### Правило: "Don't Make It Worse"

Каждый PR проходит проверку на соответствие baseline:
- **PASS**: если ошибок не больше, чем в baseline (можно меньше!)
- **FAIL**: если появились новые ошибки или сломались новые пакеты

## Текущий Baseline

Состояние зафиксировано в `.baseline/`:

```
.baseline/
├── README.md              # Документация и текущее состояние
├── metrics.json           # Общие метрики (build, types, lint, tests)
├── type-errors.json       # Детальные ошибки типов по пакетам
└── build-failures.json    # Список пакетов, которые не собираются
```

**Текущие метрики** (см. [.baseline/README.md](.baseline/README.md)):
- Build: 101/101 пакетов собираются (100%)
- Type errors: 2,408 ошибок в 69 пакетах
- Type coverage: 93.8% в среднем
- `any` usage: 4,120 использований

## Workflow для разработчика

### 1. Перед началом работы

Убедитесь, что baseline актуален:

```bash
# Проверить текущий baseline
cat .baseline/README.md

# Если нужно обновить (после merge main)
node scripts/update-baseline.cjs --type=all
```

### 2. Во время разработки

Работайте как обычно. Baseline не блокирует вас.

### 3. Перед коммитом

Проверьте, что не добавили новые ошибки:

```bash
# Полная проверка
pnpm kb workflow:run --workflow-id=baseline-check

# Или вручную:
# 1. Проверка типов
npx kb-devkit-types-audit --json > /tmp/current-types.json
node scripts/check-baseline.cjs --type=types --current=/tmp/current-types.json

# 2. Проверка сборки
pnpm run build 2>&1 | tee /tmp/build.log
node scripts/check-baseline.cjs --type=build --current=/tmp/build.log

# 3. DevKit checks
npx kb-devkit-ci
```

### 4. Если проверка прошла

✅ **PASS** - можно коммитить:

```bash
git add .
git commit -m "feat: your feature"
```

### 5. Если проверка не прошла

❌ **FAIL** - исправьте новые ошибки:

```bash
# Пример вывода:
❌ FAILED: Added 5 new type errors

🔍 New errors by package:
   @kb-labs/your-package: +5 errors (0 → 5)
```

Варианты:
1. **Исправить ошибки** - лучший вариант!
2. **Отменить изменения**, которые добавили ошибки
3. **Попросить review**, если ошибки неизбежны (редко)

### 6. Если вы УЛУЧШИЛИ код

🎉 **IMPROVED** - обновите baseline:

```bash
# Пример вывода:
🎉 IMPROVED: Fixed 50 type errors!

💡 Tip: Update baseline with:
   node scripts/update-baseline.cjs --type=types
   git add .baseline/type-errors.json
   git commit -m "chore: update baseline (fixed 50 type errors)"
```

Следуйте инструкциям:

```bash
node scripts/update-baseline.cjs --type=types
git add .baseline/
git commit -m "chore: update baseline (fixed 50 type errors)"
```

## Этапы проверки (Quality Gates)

### Stage 1: Build
```bash
pnpm run build
```
- ✅ PASS: все пакеты, которые собирались в baseline, собрались
- ❌ FAIL: новый пакет перестал собираться

### Stage 2: Type Check
```bash
npx kb-devkit-types-audit
```
- ✅ PASS: ошибок типов ≤ baseline (улучшение разрешено!)
- ❌ FAIL: ошибок типов > baseline

### Stage 3: DevKit CI
```bash
npx kb-devkit-ci
```
Проверяет:
- Naming conventions
- Import/export analysis
- Circular dependencies
- Duplicate dependencies
- Package structure
- Path validation

### Stage 4: Lint (TODO)
```bash
pnpm eslint .
```
- ✅ PASS: lint ошибок ≤ baseline
- ❌ FAIL: новые lint ошибки

### Stage 5: Tests (TODO)
```bash
pnpm test
```
- ✅ PASS: тесты, которые проходили, проходят
- ❌ FAIL: новые тесты падают

### Stage 6: AI Review
```bash
pnpm kb review:run --repos="changed-monorepo" --mode=full --agent
```
- ✅ PASS: `passed: true` (только info-level замечания)
- ❌ FAIL: `passed: false` (есть actionable issues)

## Автоматизация (CI/CD)

### Локально (pre-commit hook)

Создайте `.git/hooks/pre-commit`:

```bash
#!/bin/bash
echo "🔍 Running baseline checks..."

# Quick type check on changed packages only
npx kb-devkit-types-audit --json > /tmp/current-types.json
node scripts/check-baseline.cjs --type=types --current=/tmp/current-types.json

if [ $? -ne 0 ]; then
  echo "❌ Baseline check failed. Fix errors or bypass with: git commit --no-verify"
  exit 1
fi

echo "✅ Baseline check passed"
```

### В CI (GitHub Actions, GitLab CI, etc.)

Запускайте workflow на каждый PR:

```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate
on: [pull_request]

jobs:
  baseline-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3

      - run: pnpm install
      - run: pnpm kb workflow:run --workflow-id=baseline-check
```

Или с помощью KB Labs workflow engine:

```bash
# В CI/CD
pnpm kb workflow:run --workflow-id=baseline-check
```

## Ratcheting (постепенное улучшение)

### Что такое ratcheting?

**Ratcheting** - это механизм, который:
1. Фиксирует текущее состояние (baseline)
2. Запрещает ухудшение
3. **Автоматически понижает планку при улучшении**

Пример:
```
Baseline: 100 type errors
Your PR: 95 type errors → ✅ PASS + update baseline to 95
Next PR: 96 type errors → ❌ FAIL (was 95, now 96)
Next PR: 90 type errors → ✅ PASS + update baseline to 90
```

### Как обновить baseline

**После улучшения:**

```bash
# Полное обновление (build + types + metrics)
node scripts/update-baseline.cjs --type=all

# Только типы
node scripts/update-baseline.cjs --type=types

# Только сборка
node scripts/update-baseline.cjs --type=build
```

**Коммит:**

```bash
git add .baseline/
git commit -m "chore: update baseline (fixed 50 type errors)"
```

### Стратегия улучшения

**Еженедельно** (техдолг спринт):
1. Выбрать 1-2 пакета с большим количеством ошибок
2. Исправить часть ошибок
3. Обновить baseline
4. Repeat

**Или "boy scout rule"**:
- Исправляешь файл? Пофиксь 1-2 type error в нем
- Маленькие улучшения каждый день

## Метрики прогресса

### Текущие метрики

Смотрите `.baseline/metrics.json` или README:

```bash
cat .baseline/README.md
```

### Трекинг прогресса

Можно создать дашборд:

```bash
# Извлечь метрики из git истории
git log --all --grep="chore: update baseline" --oneline

# Построить график улучшения
# TODO: скрипт для визуализации
```

### Цели

**Краткосрочные (1 месяц):**
- ✅ Build: 100% (уже достигнуто!)
- 🎯 Type errors: < 2,000 (-408 ошибок)
- 🎯 `any` usage: < 3,500 (-620 использований)

**Среднесрочные (3 месяца):**
- 🎯 Type errors: < 1,000
- 🎯 Type coverage: > 95%
- 🎯 `any` usage: < 2,000

**Долгосрочные (6 месяцев):**
- 🎯 Type errors: < 500
- 🎯 Type coverage: > 97%
- 🎯 `any` usage: < 1,000

## FAQ

### Q: Что делать, если baseline устарел?

Обновите его:
```bash
node scripts/update-baseline.cjs --type=all
git add .baseline/
git commit -m "chore: update baseline"
```

### Q: Можно ли временно обойти проверку?

Локально - да (git commit --no-verify), но в CI всё равно упадёт.

**Лучше:** исправьте ошибки ИЛИ обсудите с командой, почему baseline нужно изменить.

### Q: Что делать с legacy пакетами, которые не собираются?

Добавьте их в `.baseline/build-failures.json`. Они не блокируют разработку, но и не улучшаются.

**План:**
1. Зафиксировать в baseline
2. Создать issues для их исправления
3. Исправлять постепенно

### Q: Как понять, какие ошибки типов самые важные?

Используйте DevKit:
```bash
# Показать пакеты с наибольшим количеством ошибок
npx kb-devkit-types-audit --package=workflow-engine

# Показать impact (какие пакеты зависят от этого)
npx kb-devkit-types-audit | grep "impacts"
```

Приоритет:
1. Core пакеты (platform, runtime, contracts)
2. Пакеты с high impact (много зависимостей)
3. Пакеты с наибольшим количеством ошибок

## Дополнительно

### Скрипты

- `scripts/check-baseline.cjs` - проверка на регрессию
- `scripts/update-baseline.cjs` - обновление baseline

### Workflows

- `.kb/workflows/baseline-check.yml` - полная проверка quality gate

### Документация

- `.baseline/README.md` - текущее состояние baseline
- `docs/BASELINE-WORKFLOW.md` - этот файл

---

**Последнее обновление:** 2026-01-25
