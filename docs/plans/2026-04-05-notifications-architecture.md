---
plan_id: "2026-04-05-notifications-architecture"
created_at: "2026-04-05"
status: "concept"
priority: "high"
tags: ["notifications", "adapters", "gateway", "ядро"]
---

# INotification — Концептуальная архитектура

> Концепт обсуждён, реализация позже. Одна из двух оставшихся фундаментальных абстракций ядра (вторая — IPermissions).

## Философия

Плагин — тупой отправитель. Он знает только **что** произошло и **насколько важно**. Куда доставить — не его забота:

```typescript
ctx.notify({
  event: 'deal.closed',
  priority: 'critical' | 'high' | 'normal' | 'low',
  ttl: '24h',  // опционально, платформа clamping по максимуму
  data: { ... }
})
```

Платформа резолвит канал из конфига тенанта/юзера — по той же логике что LLM резолвит модель по capability.

## Два уровня нотификаций

**1. Ambient notifications** — плагин дёргает `ctx.notify(priority, event)`, платформа роутит по правилам тенанта автоматически.

**2. Explicit notifications** — workflow явно указывает канал, получателя, шаблон:
```typescript
// Workflow step
{
  type: 'approval',
  notify: {
    to: 'manager@company.com',
    channel: 'slack',
    template: 'approval-request'
  }
}
```

Оба через `INotificationAdapter`, но с разной логикой выбора адаптера.

## INotificationAdapter

```typescript
interface INotificationAdapter {
  send(notification: Notification): Promise<void>
  isAvailable(): Promise<boolean>
}
```

Адаптеры: Slack, Telegram, Email, WebhookAdapter, InternalCRM, Studio (internal).

## Routing & Fallback chain

Дефолтные правила тенанта (переопределяемые):

```
critical → PagerDuty → Telegram → Email → Studio
high     → Slack → Studio
normal   → Studio
low      → лог
```

**Studio — всегда последний fallback.** Пока Studio жива — событие куда-то доедет.

## Persistent queue когда всё офлайн

Если все адаптеры недоступны — события батчатся и ждут. Платформа периодически пингует каналы:

```
critical → ping каждые 10с, batch size 1
high     → ping каждую минуту, batch size 5
normal   → ping каждые 5 минут, batch size 20
low      → при следующем коннекте, всё накопленное
```

## TTL с cap по priority

Плагин может указать TTL. Платформа clamp'ает до максимума — молча, без ошибки:

```
critical → max 7 дней
high     → max 24 часа
normal   → max 1 час
low      → до следующего коннекта, потом дроп
```

Истёк TTL → дроп с записью в лог. Studio показывает "X событий истекло пока вы были офлайн".

## Стресс-тест (пройден)

| Атака | Решение |
|-------|---------|
| Notification storm (1000 событий) | ResourceBroker throttling |
| Silent failure (все адаптеры упали) | Fallback chain → Studio last resort |
| Studio офлайн | Persistent queue + priority-based retry |
| Бесконечная очередь (офлайн 3 дня) | TTL с cap по priority |
| Priority abuse (всё critical) | Не предотвращаем — даём observability в Studio |
| Circular notifications (A→B→A) | Correlation ID для явных петель |

### Known limitations

- **Circular notifications через разные correlation ID** — не детектируется. Разработчик плагина несёт ответственность за подписки.
- **Priority abuse** — платформа не может знать семантику бизнес-логики. Только observability.

## Экосистема

**Из коробки (KB Labs):**
- `DefaultNotificationAdapter` — Slack + Email + Studio
- Плагин для настройки правил роутинга в Studio

**Enterprise:**
- Пишут свой адаптер — internal CRM, корпоративный мессенджер, legacy система
- Регистрируют свой хендлер, свои плагины шлют туда напрямую
- Платформа не знает и не должна знать

## Связь с остальной платформой

- **ResourceBroker** — throttling и rate limiting
- **Gateway** — единая точка входа, correlation ID
- **Тенант конфиг** — правила роутинга, TTL caps, разрешённые каналы
- **Studio** — last resort + observability (статистика, истёкшие события)
