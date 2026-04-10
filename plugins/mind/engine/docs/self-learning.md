# Self-Learning System

Mind v2 включает систему самообучения, которая улучшает качество поиска на основе использования.

## Возможности

### 1. Query History (История запросов)
- Сохраняет все запросы и их результаты
- Используется для pattern learning и adaptive weights
- Хранится в Qdrant или памяти

### 2. Feedback Collection (Сбор обратной связи)

#### Неявный Feedback (Implicit Feedback)
Автоматически собирается на основе использования результатов агентом:
- Если chunk используется в ответе → положительный feedback (score: 0.8)
- Если chunk не используется → отрицательный feedback (score: 0.2)

**Использование агентом:**
```typescript
const result = await knowledgeService.query(query, context);

// После использования результатов в ответе:
if (result._learning?.feedbackStore) {
  const usedChunkIds = result.chunks
    .filter(chunk => /* chunk был использован в ответе */)
    .map(chunk => chunk.id);
  
  await result._learning.feedbackStore.recordUsage(usedChunkIds, true);
}
```

#### Self-Feedback (Самооценка)
Агент автоматически оценивает релевантность топ-5 результатов используя LLM:
- Генерирует score (0-1) для каждого chunk
- Сохраняет reasoning и confidence
- Работает асинхронно, не блокирует ответ

### 3. Popularity Boost (Повышение популярности)
- Часто используемые chunks получают boost в ранжировании
- Логарифмическое масштабирование предотвращает пере-буст
- Минимум 3 использования для получения boost

### 4. Query Pattern Learning (Обучение паттернам запросов)
- Находит похожие запросы по векторной близости
- Использует успешные результаты из истории
- Boost'ит chunks, которые были успешны для похожих запросов

### 5. Adaptive Weights (Адаптивные веса)
- Автоматически настраивает веса hybrid search
- Анализирует успешность vector vs keyword поиска
- Требует больше данных для эффективной работы

## Конфигурация

```json
{
  "knowledge": {
    "engines": [
      {
        "id": "mind-auto",
        "type": "mind",
        "options": {
          "learning": {
            "enabled": true,
            "queryHistory": true,
            "feedback": true,
            "popularityBoost": true,
            "queryPatterns": true,
            "adaptiveWeights": false,  // Требует больше данных
            "storage": "auto"  // "auto" | "qdrant" | "memory"
          }
        }
      }
    ]
  }
}
```

## Как это работает для агента

1. **При запросе:**
   - Система сохраняет query history
   - Применяет popularity boost
   - Использует query patterns для boost'а результатов
   - Генерирует self-feedback для топ результатов

2. **После использования результатов:**
   - Агент вызывает `recordUsage()` для chunks, которые использовал
   - Система сохраняет implicit feedback
   - При следующем запросе эти chunks получат boost

3. **Со временем:**
   - Система учится, какие chunks релевантны для каких запросов
   - Популярные chunks поднимаются выше
   - Похожие запросы получают проверенные результаты

## Ожидаемое улучшение

- **Первые дни:** 5-10% улучшение (self-feedback, popularity boost)
- **Через неделю:** 15-25% улучшение (query patterns, накопленный feedback)
- **Через месяц:** 30-50% улучшение (adaptive weights, полное обучение)

## Хранение данных

- **Qdrant (рекомендуется):** Постоянное хранение, масштабируемость
- **Memory:** Быстрое, но данные теряются при перезапуске
- **Auto:** Автоматически выбирает Qdrant если доступен

## Ограничения

- Self-feedback требует OpenAI API key
- Adaptive weights требуют много данных (100+ запросов)
- Memory storage ограничен размером (10k запросов, 50k feedback entries)

