# Mind Engine Search Quality Benchmarks

## Benchmark Suite v4.1

Основной benchmark для v4 итераций: golden-set + hit@1/hit@5 + latency/confidence.

### Запуск бенчмарков

```bash
# Всегда из корня kb-labs
cd /Users/kirillbaranov/Desktop/kb-labs

# Очистить кеш (опционально)
pnpm kb plugins clear-cache

# Актуализировать индекс
pnpm kb mind rag-index

# Быстрый прогон (thinking)
node ./kb-labs-mind/packages/mind-engine/scripts/run-quality-eval.mjs

# Сравнение по режимам
node ./kb-labs-mind/packages/mind-engine/scripts/run-quality-eval.mjs \
  --modes instant,auto,thinking --runs 1

# Повторяемый release-прогон
node ./kb-labs-mind/packages/mind-engine/scripts/run-quality-eval.mjs \
  --modes thinking --runs 5 --results /tmp/mind-quality-eval-runs5.csv
```

Артефакты:
- Golden set: `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/benchmarks/golden-set.v4.json`
- Results CSV (default): `/tmp/mind-quality-eval.csv`

---

## Golden Set

Golden set хранится в JSON и включает:
- `exact_code`
- `concept`
- `freshness`
- `conflict`
- `reliability`

Для каждого кейса задаются:
- query
- expectedAnyOf (пути файлов-источников)
- optional modes override

---

## Metrics

Основные метрики:
- `hit@1`: top source совпал с expectedAnyOf
- `hit@5`: хотя бы один из top-5 sources совпал с expectedAnyOf
- `avgConfidence`
- `avgTimingMs`
- breakdown по `mode` и `group`

## Historical Results

### 2026-02-14 (v4 harness smoke)

Пример контрольного прогона:
- thinking control set hit-rate: ~75%
- median latency: ~13.9s
- main issue: нерелевантный top-1 в части code-centric запросов

Используется как baseline для v4.1+ итераций.

### 2026-02-14 (legacy script, runs=3)

| Query | Type | Avg Confidence | Avg Time | Mode | Pass Rate | Status |
|-------|------|----------------|----------|------|-----------|--------|
| VectorStore interface | EASY | **0.0171** | 21.5s | auto | 0/3 | ❌ FAIL |
| Hybrid search | MEDIUM | **0.6066** | 25.6s | auto | 2/3 | ⚠️ UNSTABLE |
| Anti-hallucination | HARD | **0.0191** | 29.9s | thinking | 0/3 | ❌ FAIL |

**Средний confidence:** 0.2142 (2.1/10)  
**Pass rate:** 2/9  
**Raw CSV:** `/tmp/mind-benchmark-results.csv`

#### Что важно:
- Скрипт `run-benchmarks.sh` исправлен: теперь всегда запускается из `/Users/kirillbaranov/Desktop/kb-labs`.
- Парсинг результата переведён на JSON через `jq` (без ложных FAIL из-за логов).
- Поиск остаётся нестабильным: MEDIUM частично проходит, EASY/HARD стабильно проваливаются.

### 2025-11-26 (После улучшений)

| Query | Type | Confidence | Time | Mode | Status |
|-------|------|------------|------|------|--------|
| VectorStore interface | EASY | **0.63** | 38s | auto | ✅ PASS |
| Hybrid search | MEDIUM | **0.78** | 63s | auto | ✅ PASS |
| Anti-hallucination | HARD | **0.70** | 62s | thinking | ✅ PASS |

**Средний confidence:** 0.70 (7.0/10)

#### Изменения в этой версии:
- Подключён `classifyQuery` в instant mode для адаптивных весов
- Улучшен query-classifier для "What is X" паттернов
- Добавлен auto-fallback при низком confidence (instant → auto)
- Смягчена source verification (partial credit)
- Смягчён field-checker (мягкие пенальти)

### 2025-11-26 (До улучшений)

| Query | Type | Confidence | Time | Mode | Status |
|-------|------|------------|------|------|--------|
| VectorStore interface | EASY | **0.017** | ~30s | instant | ❌ FAIL |
| Hybrid search | MEDIUM | **0.50** | ~60s | auto | ⚠️ OK |
| Anti-hallucination | HARD | **0.90** | ~60s | thinking | ✅ PASS |

**Средний confidence:** 0.47 (4.7/10)

---

## Quality Targets (v4)

| Metric | Target |
|--------|--------|
| exact/code hit@1 | ≥90% |
| overall hit@1 | ≥85% |
| freshness conflict correctness | ≥95% |
| thinking p95 latency | ≤20s |

---

## Metrics Explained

### Confidence Score (0-1)
- **0.0-0.3:** Poor - answer likely incomplete or hallucinated
- **0.3-0.5:** Low - some relevant info but gaps
- **0.5-0.7:** Medium - reasonable answer with caveats
- **0.7-0.9:** Good - solid answer with verified sources
- **0.9-1.0:** Excellent - comprehensive, fully verified

### Factors Affecting Confidence
1. **Source Verification** - файлы найдены в чанках
2. **Snippet Matching** - сниппеты совпадают с кодом
3. **Field Verification** - упомянутые поля существуют
4. **LLM Assessment** - оценка полноты ответа

---

## Adding New Benchmark Cases

При добавлении новых кейсов:

1. Добавить объект в `benchmarks/golden-set.v4.json`
2. Указать `group` и `expectedAnyOf`
3. Прогнать `run-quality-eval.mjs`
4. Зафиксировать baseline метрики по mode/group

Legacy script `scripts/run-benchmarks.sh` оставлен для обратной проверки historical confidence-only сценариев.
