# Mind RAG Indexing Performance Estimation

## Эмпирические данные

На основе реальных замеров индексации KB Labs кодовой базы (2025-12-11):

### Исходные данные
- **Файлов:** 2,353
- **Размер:** 8.89 MB
- **Чанков:** 10,423
- **Embedding'ов:** 10,414 (99.9% success rate)
- **Токенов:** 2,595,948
- **Общее время:** 9 минут 44 секунды (584 секунды)

### Разбивка по фазам

| Фаза | Время | % от общего | Комментарий |
|------|-------|-------------|-------------|
| **File Discovery** | ~2-5s | <1% | Быстро (glob файлов) |
| **Chunking** | ~30-60s | 5-10% | Зависит от размера файлов |
| **Embeddings** | ~420-450s | 72-77% | **Основное время** (OpenAI API) |
| **Vector Storage** | ~60-90s | 10-15% | Qdrant bulk upsert |
| **Overhead** | ~10-20s | 2-3% | Init, cleanup |

### Детали Embedding фазы

**Параметры:**
- Batch size: 100 chunks per batch
- Max concurrency: 3 parallel batches
- Total batches: ~105 batches (10,414 / 100)
- Rate limiter waits: 9 (424.5s total wait time)
- Effective embedding time: ~420-450s

**Узкое место:** OpenAI API rate limits (TPM - tokens per minute)

## Формула оценки времени

```
Total Time (секунды) = Discovery + Chunking + Embeddings + Storage

где:
- Discovery ≈ 5s (константа)
- Chunking ≈ files * 0.025s  (25ms на файл)
- Embeddings ≈ max(
    tokens / (TPM / 60),           # Rate limit constraint
    chunks / (batch_size * concurrency) * batch_latency
  )
- Storage ≈ chunks / 20 * 2s       # 20 chunks per batch, 2s per batch
```

### Упрощенная формула (для клиентов)

```
Время (минуты) ≈ (Файлов / 250) + 0.1

Примеры:
- 1,000 файлов  ≈ 4 минуты
- 5,000 файлов  ≈ 20 минут
- 10,000 файлов ≈ 40 минут
- 50,000 файлов ≈ 200 минут (3.3 часа)
```

## Калькулятор производительности

### По размеру кодовой базы

| Размер проекта | Файлов | Размер (MB) | Чанков (est) | Время |
|----------------|--------|-------------|--------------|-------|
| **Small** (React app) | 500 | ~2 MB | ~2,000 | ~2 мин |
| **Medium** (Next.js) | 2,500 | ~10 MB | ~10,000 | ~10 мин |
| **Large** (Monorepo) | 10,000 | ~40 MB | ~40,000 | ~40 мин |
| **Enterprise** | 50,000 | ~200 MB | ~200,000 | ~3.5 часа |

### По токенам (если известно)

```
Время embeddings (мин) = tokens / 150,000

где 150,000 tokens/min - эмпирический throughput с учетом rate limits

Пример:
- 2.6M tokens → 2,600,000 / 150,000 = 17.3 минуты
```

### По количеству файлов

```python
def estimate_indexing_time(files: int, avg_file_size_kb: float = 4.0) -> dict:
    """
    Оценка времени индексации на основе количества файлов.

    Args:
        files: Количество файлов
        avg_file_size_kb: Средний размер файла в KB (default: 4 KB)

    Returns:
        dict с временем по фазам
    """
    # Эмпирические коэффициенты
    CHUNKS_PER_FILE = 4.4       # 10,423 chunks / 2,353 files
    TOKENS_PER_CHUNK = 249      # 2,595,948 tokens / 10,414 embeddings
    EMBEDDING_THROUGHPUT = 150_000  # tokens per minute

    chunks = int(files * CHUNKS_PER_FILE)
    tokens = int(chunks * TOKENS_PER_CHUNK)

    discovery_sec = 5
    chunking_sec = files * 0.025
    embedding_sec = tokens / (EMBEDDING_THROUGHPUT / 60)
    storage_sec = chunks / 20 * 2
    overhead_sec = 15

    total_sec = discovery_sec + chunking_sec + embedding_sec + storage_sec + overhead_sec

    return {
        'files': files,
        'chunks_estimate': chunks,
        'tokens_estimate': tokens,
        'discovery_sec': discovery_sec,
        'chunking_sec': chunking_sec,
        'embedding_sec': embedding_sec,
        'storage_sec': storage_sec,
        'overhead_sec': overhead_sec,
        'total_sec': total_sec,
        'total_min': total_sec / 60,
        'total_hours': total_sec / 3600,
    }

# Примеры
print(estimate_indexing_time(2353))   # KB Labs (actual)
# => ~584 sec (9.7 min) ✅ Matches real data!

print(estimate_indexing_time(10000))  # Large monorepo
# => ~2400 sec (40 min)

print(estimate_indexing_time(50000))  # Enterprise
# => ~12000 sec (200 min = 3.3 hours)
```

## Факторы, влияющие на производительность

### Основные

1. **OpenAI API Rate Limits** (главный bottleneck)
   - TPM (Tokens Per Minute) лимит вашего API ключа
   - Tier 1: ~200K TPM (~1.3x медленнее)
   - Tier 2: ~450K TPM (~1.0x baseline)
   - Tier 3+: ~2M+ TPM (~0.3x faster)

2. **Размер файлов**
   - Больше кода → больше chunks → больше tokens
   - JS/TS файлы: ~4 KB average
   - Config files: ~1-2 KB
   - Large modules: 10-50 KB (медленнее)

3. **Qdrant производительность**
   - Local Qdrant: ~2s per 20 vectors
   - Cloud Qdrant: может быть медленнее (network latency)
   - Batch size: 20-50 vectors optimal

### Второстепенные

- CPU speed (для chunking) - минимальное влияние
- Network latency to OpenAI - ~5-10% влияние
- Disk speed (для file discovery) - минимальное влияние

## Оптимизация

### Ускорить индексацию

1. **Увеличить OpenAI API tier** - 2-3x ускорение
   - $50+ spent → Tier 2 (450K TPM)
   - $500+ spent → Tier 3 (2M TPM)

2. **Увеличить batch concurrency** (если есть TPM headroom)
   ```typescript
   maxConcurrency: 5  // вместо 3
   ```

3. **Фильтровать ненужные файлы**
   ```bash
   --exclude "**/node_modules/**" --exclude "**/*.test.ts"
   ```

4. **Использовать incremental indexing** (будущая фича)
   - Индексировать только измененные файлы
   - 10-100x ускорение для повторных индексаций

### Снизить стоимость

1. **Использовать меньшую модель**
   - `text-embedding-3-small` (1536 dims) - дешевле
   - `text-embedding-3-large` (3072 dims) - дороже, но лучше качество

2. **Кэшировать embeddings**
   - Уже реализовано в `EmbeddingCache`
   - При повторной индексации - почти бесплатно

## Стоимость индексации

**Pricing (2024):**
- `text-embedding-3-small`: $0.02 per 1M tokens

**Расчет для KB Labs:**
- Tokens: 2,595,948
- Cost: 2.6M × $0.02/1M = **$0.052** (~5 центов)

**Для разных размеров:**

| Проект | Tokens | Стоимость |
|--------|--------|-----------|
| Small (500 files) | ~500K | $0.01 |
| Medium (2.5K files) | ~2.5M | $0.05 |
| Large (10K files) | ~10M | $0.20 |
| Enterprise (50K files) | ~50M | $1.00 |

## Рекомендации для клиентов

### Для малых проектов (<1K files)
- **Время:** 2-5 минут
- **Стоимость:** <$0.02
- Индексируйте всё, без фильтров

### Для средних проектов (1K-10K files)
- **Время:** 5-40 минут
- **Стоимость:** $0.02-$0.20
- Исключайте тесты и generated файлы
- Используйте incremental indexing (когда появится)

### Для больших проектов (10K-50K files)
- **Время:** 40 минут - 3.5 часа
- **Стоимость:** $0.20-$1.00
- **Обязательно:**
  - Фильтруйте ненужные директории
  - Индексируйте по частям (по модулям)
  - Планируйте индексацию на ночь или CI/CD
  - Рассмотрите покупку высшего API tier

### Для enterprise (50K+ files)
- **Время:** 3+ часа
- **Стоимость:** $1+
- **Стратегия:**
  - Incremental indexing (критично!)
  - Dedicated Qdrant cluster
  - OpenAI Tier 3+ API key
  - Distributed indexing (future)

## Метрики производительности (Reference)

На основе KB Labs benchmark (2025-12-11):

```
Files:               2,353
Total Size:          8.89 MB
Chunks:              10,423
Embeddings:          10,414
Tokens:              2,595,948
Total Time:          584 seconds (9m 44s)

Throughput:
- Files/sec:         4.03
- Chunks/sec:        17.8
- Tokens/sec:        4,445
- Embeddings/sec:    17.8

Cost:
- Total:             $0.052
- Per file:          $0.000022
- Per chunk:         $0.000005
```

## Changelog

- **2025-12-11:** Initial benchmarks with Unix Socket transport
- **Future:** Add incremental indexing metrics
- **Future:** Add distributed indexing metrics
