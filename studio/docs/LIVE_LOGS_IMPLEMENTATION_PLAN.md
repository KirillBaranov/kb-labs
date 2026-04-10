# Live Logs Implementation Plan (V1) - UPDATED

> **Status:** Planning (Updated 2026-01-01)
> **Owner:** AI Assistant
> **Created:** 2026-01-01
> **Updated:** 2026-01-01 (Platform DI + Pino architecture)
> **Target:** kb-labs-studio Observability module

---

## 📋 Executive Summary

**Goal:** Добавить в kb-labs-studio раздел "Live Logs" в Observability с real-time потоком логов, фильтрацией, навигацией и экспортом.

**Business Value:**
- **Demo wow-factor**: "Живая" лента логов без внешних инструментов
- **Operational visibility**: Мгновенная локализация проблем по time/level/component/execution/tenant
- **AI-ready foundation**: Подготовка инфраструктуры для будущего AI-анализа (V2+)

**Scope V1:** Live stream + фильтры + детали + экспорт + базовая производительность
**Out of Scope V1:** AI summarization, alerting, distributed tracing UI, RBAC

---

## 🎯 Success Criteria (Acceptance)

✅ **MUST HAVE (V1):**
1. Страница `/observability/logs` с live stream логов (SSE)
2. Фильтры: time range, level, pluginId, executionId, tenantId, text search
3. Detail panel с полным JSON лога + кнопки Copy/Copy JSON
4. "Show surrounding logs" (±N секунд от выбранного лога)
5. Экспорт текущего вида в JSONL/JSON без краша UI
6. Виртуализация списка + batch updates (UI не лагает при потоке)
7. Минимум 3 пресета ("Errors last 15m", "This execution", "This plugin")
8. Pino логи автоматически льются в REST API через HTTP transport

✅ **SHOULD HAVE (V1):**
- Follow mode (auto-scroll) с паузой при скролле вверх
- Ring buffer (max 10k-20k событий в памяти)
- Redaction слой для секретов (через Pino redaction)

⚠️ **WON'T HAVE (V1):**
- AI summary / RCA / "suggest fix"
- Alerting, rules engine
- Full distributed tracing UI (Jaeger-like)
- Deep storage retention policies
- Advanced RBAC (если уже нет базовой tenant фильтрации)

---

## 🏗️ Architecture Analysis (UPDATED)

### **CRITICAL DISCOVERY: Platform DI + Pino Architecture**

❌ **Unified Logging System (core-sys/logging) НЕ используется!**
- Была спроектирована (ADR-0011), но **не внедрена** в продакшн
- Существует в коде, но не подключена к `platform.logger`

✅ **Реально используется Platform DI + Pino:**

```typescript
// ILogger interface (kb-labs-core/packages/core-platform)
interface ILogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  trace(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): ILogger;
}

// Реализация через Pino
class PinoLoggerAdapter implements ILogger {
  // @kb-labs/adapters-pino
}

// Использование в коде
ctx.platform.logger.info('message', { meta });
platform.logger.error('error', err, { context });
```

**Конфигурация (.kb/kb.config.json):**

```json
{
  "platform": {
    "adapters": {
      "logger": "@kb-labs/adapters-pino"  // ← Это и используется!
    }
  }
}
```

### Existing Infrastructure

**1. Platform DI + Pino Logger**
- ✅ `ILogger` interface в `@kb-labs/core-platform`
- ✅ `PinoLoggerAdapter` в `@kb-labs/adapters-pino`
- ✅ Используется везде: `ctx.platform.logger`, `runtime.logger`
- ✅ Pino поддерживает **multiple transports** (stdout, file, custom HTTP)
- ✅ Structured logging с метаданными

**2. Studio Architecture (kb-labs-studio/)**
- ✅ React + React Router + TanStack Query
- ✅ Data Client (`@kb-labs/studio-data-client`) для HTTP
- ✅ SSE support: `useSystemEvents`, `useJobEvents` hooks (уже работает!)
- ✅ Ant Design 5.x UI компоненты
- ✅ Observability module существует: `/observability/system-events`, `/observability/state-broker`
- 💡 **Паттерн готов:** просто добавить `/observability/logs` по аналогии

**3. REST API (kb-labs-rest-api/)**
- ✅ SSE endpoints уже есть: `/events/registry`, `/jobs/:id/events`
- ✅ Security headers, CORS profiles, rate limiting
- ✅ Health checks, metrics endpoint (`/metrics`)
- ⚠️ **NO `/logs` endpoint yet** - нужно добавить

### Data Flow (Target Architecture - UPDATED)

```
┌─────────────────────────────────────────────────────┐
│ Product (CLI, REST API, Workflow, Plugin)           │
│                                                     │
│ ctx.platform.logger.info('msg', { meta })           │
│ runtime.logger.error('err', err, { context })       │
└──────────────┬──────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────┐
│ PinoLoggerAdapter (@kb-labs/adapters-pino)           │
│                                                      │
│ Pino instance with multiple transports:              │
│   • pino/file → .kb/logs/app.log                     │
│   • pino-pretty → stdout (dev mode)                  │
│   • [NEW] pino-http-transport → REST API             │ ← MILESTONE A
└──────────────┬───────────────────────────────────────┘
               │
               ↓ (HTTP POST batched)
┌──────────────────────────────────────────────────────┐
│ Pino HTTP Transport (@kb-labs/adapters-pino-http)    │
│                                                      │
│ - Batch logs (50-100 records or 3-5s interval)       │
│ - POST to REST API /logs/ingest                      │
│ - Retry on failure (3 attempts, exponential backoff) │
│ - Non-blocking (async worker)                        │
└──────────────┬───────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────┐
│ REST API (/logs endpoint) - NEW                      │
│                                                      │
│ POST /api/v1/logs/ingest (from Pino transport)       │
│   → Validate Pino log format                         │
│   → Transform to LogRecord                           │
│   → Store in ring buffer (10k-20k records)           │
│   → Emit event for SSE subscribers                   │
│                                                      │
│ GET /api/v1/logs?filters... (historical)             │
│   → Filter ring buffer                               │
│   → Return { logs: LogRecord[], cursor?: string }    │
│                                                      │
│ GET /api/v1/logs/stream (SSE)                        │
│   → Subscribe to log events                          │
│   → Stream: data: {JSON}\n\n                         │
└──────────────┬───────────────────────────────────────┘
               │
               ↓ (SSE)
┌──────────────────────────────────────────────────────┐
│ Studio UI (/observability/logs) - NEW                │
│                                                      │
│ useLogStream(filters) → SSE connection               │
│   → Ring buffer в React state (max 10k)              │
│   → Virtualized list (react-window/react-virtuoso)   │
│   → Batch updates (debounced setState)               │
│                                                      │
│ Filters: time, level, plugin, exec, tenant, text     │
│ Detail panel: JSON, "Copy", "Surrounding logs"       │
│ Export: JSONL, JSON, CSV                             │
│ Presets: "Errors", "This execution", "This plugin"   │
└──────────────────────────────────────────────────────┘
```

---

## 📦 Log Event Contract

### Pino Log Format (Source)

**Pino outputs JSON logs:**

```json
{
  "level": 30,           // Pino numeric level (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal)
  "time": 1735777200000, // Unix timestamp (ms)
  "pid": 12345,
  "hostname": "localhost",
  "msg": "Request received",
  // Custom bindings from child()
  "plugin": "mind",
  "executionId": "exec-123",
  "tenantId": "acme-corp",
  // Custom metadata from info(msg, meta)
  "userId": "user-456",
  "duration": 150
}
```

### LogRecord Format (Studio UI)

**Transform Pino → LogRecord для унификации:**

```typescript
interface LogRecord {
  // Core fields (REQUIRED)
  time: string;                // ISO timestamp (from Pino time)
  level: LogLevel;             // 'trace' | 'debug' | 'info' | 'warn' | 'error'
  msg: string;                 // Message

  // Correlation fields (from Pino bindings/meta)
  plugin?: string;
  executionId?: string;
  tenantId?: string;
  traceId?: string;
  spanId?: string;

  // Error details (if level=error)
  err?: {
    type?: string;
    message?: string;
    stack?: string;
  };

  // Raw metadata (everything else from Pino)
  meta?: Record<string, unknown>;  // pid, hostname, userId, duration, etc.
}

// Level mapping
const PINO_LEVEL_MAP = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'error', // fatal → error
};
```

**Transform function (REST API):**

```typescript
function pinoToLogRecord(pinoLog: any): LogRecord {
  const { level, time, msg, pid, hostname, err, ...rest } = pinoLog;

  return {
    time: new Date(time).toISOString(),
    level: PINO_LEVEL_MAP[level] || 'info',
    msg: msg || '',

    // Extract known correlation fields
    plugin: rest.plugin,
    executionId: rest.executionId,
    tenantId: rest.tenantId,
    traceId: rest.traceId,
    spanId: rest.spanId,

    // Error details
    err: err ? {
      type: err.type,
      message: err.message,
      stack: err.stack,
    } : undefined,

    // Everything else → meta
    meta: {
      pid,
      hostname,
      ...rest,
    },
  };
}
```

---

## 🛠️ Implementation Milestones (UPDATED)

### **Milestone A: MVP "Live Logs" (Backend + Pino Transport)**

**Goal:** Базовый live stream работает, Pino логи льются в UI.

#### A1: Backend - Logs Ingest & Stream Endpoint

**Location:** `kb-labs-rest-api/packages/rest-api-server/src/routes/logs/`

**Tasks:**
1. **Create `/logs/ingest` endpoint (POST)** - принимает Pino logs JSON array
   - Валидация: проверить что это массив объектов с `level`, `time`, `msg`
   - Transform: `pinoToLogRecord()` для каждого лога
   - Store: ring buffer (10k-20k records, FIFO)
   - Emit: event для SSE subscribers
   - Return: `201 Created` or `400 Bad Request`

2. **Create `/logs/stream` endpoint (GET, SSE)** - live stream
   - SSE setup (Content-Type: text/event-stream)
   - Listen to EventEmitter для новых логов
   - Format: `data: ${JSON.stringify(logRecord)}\n\n`
   - Heartbeat: `:\n\n` каждые 30s
   - Support `?level=error` filter in query params (optional)

3. **Create `/logs` endpoint (GET)** - historical query
   - Query params: `level`, `plugin`, `executionId`, `tenantId`, `search`, `from`, `to`, `limit`, `cursor`
   - Filter ring buffer
   - Return `{ logs: LogRecord[], cursor?: string, total: number }`

4. **Ring buffer implementation**
   - In-memory circular array (10k default, configurable via env)
   - Thread-safe enqueue/dequeue (Node.js async safe)
   - Auto-evict oldest when full
   - Index by time for fast range queries

**Files:**
- `kb-labs-rest-api/packages/rest-api-server/src/routes/logs/ingest.ts`
- `kb-labs-rest-api/packages/rest-api-server/src/routes/logs/stream.ts`
- `kb-labs-rest-api/packages/rest-api-server/src/routes/logs/query.ts`
- `kb-labs-rest-api/packages/rest-api-server/src/services/log-buffer.ts`
- `kb-labs-rest-api/packages/rest-api-server/src/utils/pino-transform.ts`

**Acceptance:**
- `curl -X POST http://localhost:5050/api/v1/logs/ingest -d '[{"level":30,"time":1735777200000,"msg":"test"}]'` → 201
- `curl -N http://localhost:5050/api/v1/logs/stream` → SSE stream works
- `curl http://localhost:5050/api/v1/logs?level=error` → returns filtered logs

#### A2: Pino HTTP Transport Package

**Location:** `kb-labs-adapters/packages/adapters-pino-http/`

**Tasks:**
1. **Create new package** `@kb-labs/adapters-pino-http`
   - Package structure: `src/index.ts`, `package.json`, `tsconfig.json`
   - Dependency: `pino` (peer dependency)

2. **Implement Pino transport** (async generator pattern)
   - Accept logs from Pino stream (async iterable)
   - Batch logs (default: 50 records or 3s interval, whichever first)
   - POST to configured URL with retry logic (3 attempts, exponential backoff)
   - Non-blocking: use async queue, don't block Pino
   - Graceful shutdown: flush pending logs on process exit

3. **Configuration options**
   ```typescript
   interface HTTPTransportOptions {
     url: string;                  // Required: POST endpoint
     batchSize?: number;           // Default: 50
     flushIntervalMs?: number;     // Default: 3000
     retryAttempts?: number;       // Default: 3
     retryDelayMs?: number;        // Default: 1000 (exponential backoff)
     headers?: Record<string, string>; // Optional auth headers
   }
   ```

**Files:**
- `kb-labs-adapters/packages/adapters-pino-http/src/index.ts`
- `kb-labs-adapters/packages/adapters-pino-http/package.json`
- `kb-labs-adapters/packages/adapters-pino-http/README.md`

**Example Implementation:**

```typescript
// kb-labs-adapters/packages/adapters-pino-http/src/index.ts

import type { TransportTargetOptions } from 'pino';

export interface HTTPTransportOptions {
  url: string;
  batchSize?: number;
  flushIntervalMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

export default async function (opts: HTTPTransportOptions) {
  const batch: any[] = [];
  let flushTimer: NodeJS.Timeout | null = null;

  const flush = async () => {
    if (batch.length === 0) return;

    const logs = [...batch];
    batch.length = 0;

    for (let attempt = 0; attempt < (opts.retryAttempts || 3); attempt++) {
      try {
        const response = await fetch(opts.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...opts.headers,
          },
          body: JSON.stringify(logs),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return; // Success
      } catch (error) {
        if (attempt === (opts.retryAttempts || 3) - 1) {
          // Final attempt failed - log to stderr but don't crash
          console.error('[PinoHTTP] Failed to send logs after retries:', error);
          return;
        }

        // Exponential backoff
        const delay = (opts.retryDelayMs || 1000) * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, opts.flushIntervalMs || 3000);
  };

  // Graceful shutdown
  process.on('SIGTERM', () => {
    if (flushTimer) clearTimeout(flushTimer);
    flush();
  });

  // Process Pino stream
  return async function (source: AsyncIterable<any>) {
    for await (const log of source) {
      batch.push(log);

      if (batch.length >= (opts.batchSize || 50)) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        await flush();
      } else {
        scheduleFlush();
      }
    }

    // Final flush when stream ends
    if (flushTimer) clearTimeout(flushTimer);
    await flush();
  };
}
```

**Acceptance:**
- Package builds without errors
- Transport can be imported: `import pinoHTTP from '@kb-labs/adapters-pino-http'`
- Batching works (collects 50 logs or 3s, whichever first)
- Retry works (3 attempts with exponential backoff)

#### A3: Configure Pino with HTTP Transport

**Location:** `.kb/kb.config.json`

**Tasks:**
1. Update kb.config.json to enable HTTP transport
2. Keep existing file transport (multi-transport)
3. Configure batching and retry parameters

**Configuration:**

```json
{
  "platform": {
    "adapters": {
      "logger": "@kb-labs/adapters-pino"
    },
    "adapterOptions": {
      "logger": {
        "level": "info",
        "pretty": false,
        "options": {
          "transport": {
            "targets": [
              {
                "target": "pino/file",
                "level": "info",
                "options": {
                  "destination": ".kb/logs/app.log",
                  "mkdir": true
                }
              },
              {
                "target": "@kb-labs/adapters-pino-http",
                "level": "info",
                "options": {
                  "url": "http://localhost:5050/api/v1/logs/ingest",
                  "batchSize": 50,
                  "flushIntervalMs": 3000,
                  "retryAttempts": 3,
                  "retryDelayMs": 1000
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

**Acceptance:**
- Pino logs go to both file AND REST API
- REST API receives batched logs every 3s or 50 records
- Logs appear in `/logs/stream` SSE endpoint

#### A4: Studio - Logs Page Skeleton

**Location:** `kb-labs-studio/apps/studio/src/modules/observability/pages/logs-page.tsx`

**Tasks:**
1. Create `LogsPage` component (copy structure from `system-events-page.tsx`)
2. Add route in `router.tsx`: `{ path: '/observability/logs', element: <LogsPage /> }`
3. Add menu item in sidebar: `{ key: 'logs', label: 'Logs', path: '/observability/logs', icon: FileTextOutlined }`
4. Basic UI:
   - Connection status alert (connecting/connected/error)
   - Live list (placeholder: simple `<div>` per log)
   - Follow toggle (functional later)

**Files:**
- `kb-labs-studio/apps/studio/src/modules/observability/pages/logs-page.tsx`
- `kb-labs-studio/apps/studio/src/router.tsx` (update lines 25-28, 200-206, 418-422)

**Router updates:**

```typescript
// Add import (line ~28)
import { LogsPage } from './modules/observability/pages/logs-page';

// Add to observability menu (line ~200-206)
{
  key: 'observability',
  label: 'Observability',
  icon: renderPluginIcon('LineChartOutlined'),
  children: [
    {
      key: 'logs',                        // ← NEW
      label: 'Logs',
      path: '/observability/logs',
      icon: renderPluginIcon('FileTextOutlined'),
    },
    {
      key: 'state-broker',
      label: 'State Broker',
      // ... existing
    },
    // ... rest
  ]
}

// Add route (line ~418-422)
{
  path: '/observability/logs',
  element: <LogsPage />,
  errorElement: <ErrorBoundary />,
},
```

**Acceptance:**
- Navigate to `/observability/logs` → page renders
- Sidebar shows "Logs" menu item in Observability section

#### A5: Data Client - useLogStream Hook

**Location:** `kb-labs-studio/packages/studio-data-client/src/hooks/use-log-stream.ts`

**Tasks:**
1. Create `useLogStream(dataSource, filters?)` hook (copy pattern from `use-system-events.ts`)
2. SSE connection to `/logs/stream`
3. Maintain ring buffer in React state (max 10k records)
4. Auto-reconnect on disconnect (exponential backoff: 1s, 2s, 4s, max 30s)
5. Apply client-side filters (optional optimization)
6. Return `{ logs: LogRecord[], isConnected, error, reconnecting }`

**Files:**
- `kb-labs-studio/packages/studio-data-client/src/hooks/use-log-stream.ts`
- `kb-labs-studio/packages/studio-data-client/src/index.ts` (export)

**Example Implementation:**

```typescript
// kb-labs-studio/packages/studio-data-client/src/hooks/use-log-stream.ts

import { useState, useEffect, useRef } from 'react';
import type { DataSource } from '../types';

export interface LogRecord {
  time: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  plugin?: string;
  executionId?: string;
  tenantId?: string;
  err?: { type?: string; message?: string; stack?: string };
  meta?: Record<string, unknown>;
}

export interface UseLogStreamResult {
  logs: LogRecord[];
  isConnected: boolean;
  error: Error | null;
  reconnecting: boolean;
}

const MAX_LOGS = 10000; // Ring buffer size

export function useLogStream(dataSource: DataSource): UseLogStreamResult {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelayRef = useRef(1000); // Start with 1s

  useEffect(() => {
    let mounted = true;

    const connect = () => {
      if (!mounted) return;

      const url = `${dataSource.baseUrl}/logs/stream`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!mounted) return;
        setIsConnected(true);
        setError(null);
        setReconnecting(false);
        reconnectDelayRef.current = 1000; // Reset delay
      };

      es.onmessage = (event) => {
        if (!mounted) return;
        try {
          const log: LogRecord = JSON.parse(event.data);
          setLogs((prev) => {
            const next = [log, ...prev];
            return next.slice(0, MAX_LOGS); // Keep last 10k
          });
        } catch (err) {
          console.error('[useLogStream] Failed to parse log:', err);
        }
      };

      es.onerror = () => {
        if (!mounted) return;
        setIsConnected(false);
        es.close();

        // Auto-reconnect with exponential backoff
        setReconnecting(true);
        const delay = Math.min(reconnectDelayRef.current, 30000); // Max 30s
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current *= 2; // Exponential backoff
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [dataSource.baseUrl]);

  return { logs, isConnected, error, reconnecting };
}
```

**Acceptance:**
- `const { logs } = useLogStream(source)` → returns live logs
- Logs update in real-time when backend emits
- Auto-reconnect works after SSE disconnect

#### A6: Studio - Render Live List

**Tasks:**
1. Integrate `useLogStream` in `LogsPage`
2. Render logs in simple list (no virtualization yet - Milestone C)
3. Display: `timestamp`, `level` badge (colored), `msg`, `plugin`
4. Show loading/error/empty states

**Example LogsPage:**

```tsx
import { Alert, List, Tag, Typography } from 'antd';
import { KBPageContainer, KBPageHeader } from '@kb-labs/studio-ui-react';
import { useLogStream } from '@kb-labs/studio-data-client';
import { useDataSources } from '../../../providers/data-sources-provider';

const LEVEL_COLORS = {
  trace: 'default',
  debug: 'blue',
  info: 'green',
  warn: 'orange',
  error: 'red',
};

export function LogsPage() {
  const sources = useDataSources();
  const { logs, isConnected, error, reconnecting } = useLogStream(sources.observability);

  return (
    <KBPageContainer>
      <KBPageHeader
        title="Live Logs"
        description="Real-time log stream from all services"
      />

      {/* Connection Status */}
      {!isConnected && !error && (
        <Alert
          message={reconnecting ? 'Reconnecting...' : 'Connecting to log stream...'}
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {error && (
        <Alert
          message="Connection failed"
          description={error.message}
          type="error"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {isConnected && (
        <Alert
          message="Connected to log stream"
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Logs List */}
      <List
        dataSource={logs}
        renderItem={(log) => (
          <List.Item>
            <div style={{ width: '100%' }}>
              <div style={{ marginBottom: 4 }}>
                <Tag color={LEVEL_COLORS[log.level]}>{log.level.toUpperCase()}</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(log.time).toLocaleString()}
                </Typography.Text>
                {log.plugin && (
                  <Tag style={{ marginLeft: 8 }}>{log.plugin}</Tag>
                )}
              </div>
              <Typography.Text>{log.msg}</Typography.Text>
            </div>
          </List.Item>
        )}
      />

      {logs.length === 0 && isConnected && (
        <Alert message="No logs received yet" type="info" showIcon />
      )}
    </KBPageContainer>
  );
}
```

**Acceptance:**
- Logs appear in UI live
- New logs auto-append to top
- Level badges show correct colors
- Connection status displays correctly

**Milestone A Deliverable:** Basic live stream works E2E (Pino → HTTP transport → REST API → SSE → UI).

---

### **Milestone B: Investigation Features (Filters + Details)**

**Goal:** Пользователь может локализовать проблему за 10 секунд.

#### B1: Filters UI

**Tasks:**
1. Add filter controls above logs list:
   - **Time range:** Preset buttons (Last 5m, 15m, 1h, 24h) + custom DatePicker
   - **Level:** Multi-select checkboxes (trace, debug, info, warn, error)
   - **Text search:** Input with debounce (300ms) - search in `msg` field
   - **Advanced filters (collapsible Collapse panel):**
     - Plugin ID (Input with autocomplete from seen plugins)
     - Execution ID (Input)
     - Tenant ID (Input)

2. Apply filters **client-side** on `logs` array (for live stream)
3. "Clear all filters" button
4. Show active filter count badge

**Files:**
- `kb-labs-studio/apps/studio/src/modules/observability/components/log-filters.tsx`
- `kb-labs-studio/apps/studio/src/modules/observability/pages/logs-page.tsx` (integrate)

**Acceptance:**
- Filters work live (filtering logs array in React state)
- "Last 15m" показывает только логи за последние 15 минут
- Level filter: selecting "error" shows only error logs
- Text search works with debounce
- Clear filters resets all

#### B2: Detail Drawer

**Tasks:**
1. Click on log row → open Ant Design `Drawer` (right side, 60% width)
2. Drawer content:
   - **Header:** Level badge, timestamp, plugin name
   - **Message section:** `msg` field (large font, copyable)
   - **Tabs:**
     - **Details tab:** Key-value table (all fields: time, level, plugin, executionId, meta.*)
     - **JSON tab:** Full LogRecord JSON (syntax highlighted with `react-json-view` or `@uiw/react-json-view`)
   - **Action buttons (bottom):**
     - "Copy message" (copy `msg` to clipboard)
     - "Copy JSON" (copy full LogRecord JSON)
     - "Show surrounding logs (±30s)" (apply time filter)
     - "Filter by execution" (if `executionId` exists)
     - "Filter by plugin" (if `plugin` exists)

**Files:**
- `kb-labs-studio/apps/studio/src/modules/observability/components/log-detail-drawer.tsx`
- Install: `pnpm add @uiw/react-json-view` (JSON viewer)

**Acceptance:**
- Click log → drawer opens with all details
- "Copy JSON" copies full LogRecord to clipboard
- "Show surrounding logs" applies time filter (±30s from clicked log)
- "Filter by execution" applies executionId filter

#### B3: Quick Presets

**Tasks:**
1. Add preset buttons above filter panel (horizontal button group)
   - "Errors last 15m" (level=error, time=last 15m)
   - "Warnings last 15m" (level=warn, time=last 15m)
   - "All last 5m" (time=last 5m)
   - "This execution" (requires selected log - filter by executionId)
   - "This plugin" (requires selected log - filter by plugin)

2. Clicking preset applies filters immediately
3. Preset buttons highlight when active

**Files:**
- `kb-labs-studio/apps/studio/src/modules/observability/components/log-presets.tsx`

**Acceptance:**
- Click "Errors last 15m" → UI shows только error logs за последние 15 минут
- Preset button highlights when filters match preset

#### B4: Surrounding Logs Feature

**Tasks:**
1. In detail drawer, "Show surrounding logs" button
2. When clicked:
   - Get log timestamp `time`
   - Calculate range: `[time - 30s, time + 30s]`
   - Apply time filter with this range
   - Highlight selected log in list (scroll to it)

**Acceptance:**
- Click "Show surrounding logs" → time range changes to ±30s
- Selected log highlighted in list (background color)
- List scrolls to selected log

**Milestone B Deliverable:** Пользователь может локализовать проблему за 10 секунд через фильтры и детали.

---

### **Milestone C: Export + Performance (Production-Ready)**

**Goal:** UI не лагает при высокой нагрузке, экспорт работает.

#### C1: Virtualization

**Tasks:**
1. Replace `Ant Design List` with virtualized list (use `react-window` or `react-virtuoso`)
2. Install: `pnpm add react-virtuoso` (better for variable height)
3. Render only visible rows (~30-50 rows in viewport)
4. Row height: auto (based on message length)

**Files:**
- `kb-labs-studio/apps/studio/src/modules/observability/components/log-list.tsx`
- Update `logs-page.tsx` to use `LogList` component

**Acceptance:**
- List renders 10k+ logs without lag
- Scroll performance smooth (60 FPS)
- Memory usage stable

#### C2: Batch Updates

**Tasks:**
1. In `useLogStream`, batch incoming SSE events
2. Update state every 200-500ms (debounced `setState`)
3. Collect multiple log events in temporary buffer
4. Flush buffer on timer or when buffer size > 10 logs

**Files:**
- `kb-labs-studio/packages/studio-data-client/src/hooks/use-log-stream.ts`

**Acceptance:**
- High-frequency log stream (100+ logs/s) → UI responsive
- No excessive re-renders (check React DevTools)

#### C3: Follow Mode

**Tasks:**
1. Add "Follow" toggle (Switch component) in page header
2. When enabled: auto-scroll to bottom on new logs (using virtuoso `followOutput` prop)
3. When user scrolls up manually: disable follow mode
4. Show "New logs available" banner when paused (click to re-enable follow)

**Files:**
- Update `logs-page.tsx` with follow state
- Update `LogList` component with scroll behavior

**Acceptance:**
- Follow enabled → new logs auto-scroll to bottom
- Scroll up → follow pauses, banner appears "New logs available (Click to resume)"

#### C4: Ring Buffer Limit

**Tasks:**
1. Enforce max 10k logs in UI state (already done in `useLogStream`)
2. Show info banner when buffer is full: "Showing last 10,000 logs (older logs discarded)"
3. Make limit configurable via env var: `VITE_LOG_BUFFER_SIZE`

**Acceptance:**
- UI memory usage stable (не растет бесконечно)
- Banner appears when buffer full

#### C5: Export Feature

**Tasks:**
1. "Export" button in page header (Dropdown with options)
2. Export modal/dropdown options:
   - **JSONL** (one JSON object per line - best for data processing)
   - **JSON** (array of JSON objects)
   - **CSV** (flattened: time, level, msg, plugin, executionId)
3. Export **current filtered view** (not all logs)
4. Limit: max 10k records (show warning if more)
5. Download as file with timestamp: `logs-2026-01-01-12-30-00.jsonl`

**Files:**
- `kb-labs-studio/apps/studio/src/modules/observability/components/log-export-modal.tsx`
- Utils: `kb-labs-studio/apps/studio/src/utils/export-logs.ts`

**Export formats:**

```typescript
// JSONL
{"time":"2026-01-01T12:00:00Z","level":"info","msg":"test"}\n
{"time":"2026-01-01T12:00:01Z","level":"error","msg":"fail"}\n

// JSON
[
  {"time":"2026-01-01T12:00:00Z","level":"info","msg":"test"},
  {"time":"2026-01-01T12:00:01Z","level":"error","msg":"fail"}
]

// CSV
time,level,msg,plugin,executionId
2026-01-01T12:00:00Z,info,test,mind,exec-123
2026-01-01T12:00:01Z,error,fail,workflow,exec-456
```

**Acceptance:**
- Click "Export" → dropdown shows 3 formats
- Select "JSONL" → downloads `logs-2026-01-01-12-30-00.jsonl`
- File contains filtered logs (not all logs)
- CSV format works (flattened fields)

#### C6: Redaction Layer

**Tasks:**
1. Configure Pino redaction in `kb.config.json` (Pino built-in feature)
2. Redact sensitive fields: `password`, `token`, `apiKey`, `secret`, `authorization`
3. Redaction happens at Pino level (before transport)

**Configuration (kb.config.json):**

```json
{
  "platform": {
    "adapterOptions": {
      "logger": {
        "options": {
          "redact": {
            "paths": [
              "password",
              "token",
              "apiKey",
              "secret",
              "authorization",
              "*.password",
              "*.token",
              "*.apiKey"
            ],
            "censor": "[REDACTED]"
          }
        }
      }
    }
  }
}
```

**Acceptance:**
- Log with `{ apiKey: 'secret123' }` → displayed as `{ apiKey: '[REDACTED]' }`
- Redaction works for nested fields

**Milestone C Deliverable:** Production-ready UI with virtualization, export, follow mode, ring buffer limit, redaction.

---

## 📂 File Structure (UPDATED)

```
kb-labs-rest-api/
└── packages/rest-api-server/src/
    ├── routes/logs/
    │   ├── index.ts               # Router
    │   ├── ingest.ts              # POST /logs/ingest (accept Pino logs)
    │   ├── stream.ts              # GET /logs/stream (SSE)
    │   └── query.ts               # GET /logs (historical)
    ├── services/
    │   └── log-buffer.ts          # Ring buffer implementation
    └── utils/
        └── pino-transform.ts      # pinoToLogRecord() transform

kb-labs-adapters/
└── packages/adapters-pino-http/
    ├── src/
    │   └── index.ts               # Pino HTTP transport
    ├── package.json
    ├── tsconfig.json
    └── README.md

kb-labs-studio/
├── apps/studio/src/
│   ├── modules/observability/
│   │   ├── pages/
│   │   │   └── logs-page.tsx      # NEW Main page
│   │   └── components/
│   │       ├── log-filters.tsx    # NEW Filter controls
│   │       ├── log-presets.tsx    # NEW Preset buttons
│   │       ├── log-list.tsx       # NEW Virtualized list
│   │       ├── log-detail-drawer.tsx  # NEW Detail drawer
│   │       └── log-export-modal.tsx   # NEW Export modal
│   ├── router.tsx                 # UPDATE (add /observability/logs)
│   └── utils/
│       └── export-logs.ts         # Export utilities
└── packages/studio-data-client/src/
    └── hooks/
        └── use-log-stream.ts      # NEW SSE hook

.kb/kb.config.json                 # UPDATE (Pino HTTP transport config)
```

---

## 🔧 Configuration (UPDATED)

### Backend Config (kb.config.json)

```json
{
  "platform": {
    "adapters": {
      "logger": "@kb-labs/adapters-pino"
    },
    "adapterOptions": {
      "logger": {
        "level": "info",
        "pretty": false,
        "options": {
          "transport": {
            "targets": [
              {
                "target": "pino/file",
                "level": "info",
                "options": {
                  "destination": ".kb/logs/app.log",
                  "mkdir": true
                }
              },
              {
                "target": "@kb-labs/adapters-pino-http",
                "level": "info",
                "options": {
                  "url": "http://localhost:5050/api/v1/logs/ingest",
                  "batchSize": 50,
                  "flushIntervalMs": 3000,
                  "retryAttempts": 3,
                  "retryDelayMs": 1000
                }
              }
            ]
          },
          "redact": {
            "paths": [
              "password",
              "token",
              "apiKey",
              "secret",
              "authorization",
              "*.password",
              "*.token",
              "*.apiKey"
            ],
            "censor": "[REDACTED]"
          }
        }
      }
    }
  }
}
```

### REST API Config (Environment Variables)

```bash
KB_REST_LOG_BUFFER_SIZE=10000        # Max logs in ring buffer
KB_REST_LOG_SSE_HEARTBEAT_MS=30000   # SSE heartbeat interval
KB_REST_LOG_MAX_QUERY_LIMIT=10000    # Max logs per query
```

### Frontend Config (Environment Variables)

```bash
VITE_API_BASE_URL=http://localhost:5050/api/v1
VITE_LOG_BUFFER_SIZE=10000    # Max logs in UI state
VITE_LOG_BATCH_MS=500         # Batch update interval
```

---

## 🧪 Testing Strategy

### Unit Tests
- **Backend:** Ring buffer FIFO logic, Pino transform, filter query logic
- **Frontend:** Filter logic, export formatting, ring buffer eviction

### Integration Tests
- **E2E:** Pino log → HTTP transport → REST API → SSE → UI
- **Load test:** 1000 logs/s → verify UI responsive, no memory leak

### Manual Test Cases (Demo Scenarios)

**1. "Plugin запустился → вижу execution timeline"**
- Start plugin execution → logs появляются в UI
- Click on log → detail drawer shows executionId
- Click "Filter by executionId" → shows only logs for that execution
- Export JSONL → file downloaded

**2. "Нахожу ошибку за 10 секунд"**
- Click preset "Errors last 15m" → only error logs shown
- Click on error log → detail drawer shows stack trace
- Click "Show surrounding logs" → shows warn/info logs ±30s
- Click "Filter by plugin" → локализация проблемы

**3. "Система под нагрузкой, но UI не лагает"**
- Simulate 500+ logs/s (stress test script: loop Pino logs)
- UI continues smooth scrolling (virtualization works)
- Memory usage stable (ring buffer eviction works)

---

## 🚧 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **UI lag при потоке** | High | Virtualization (react-virtuoso) + batch updates (500ms debounce) |
| **Memory leak в UI** | High | Ring buffer limit (10k) + FIFO eviction |
| **Pino transport блокирует логи** | Medium | Async transport (non-blocking), retry in background |
| **SSE connection drops** | Medium | Auto-reconnect with exponential backoff (1s → 30s max) |
| **Утечка секретов** | High | Pino redaction (before transport) - встроенная функция |
| **Потеря логов при перезапуске** | Low | File transport + ring buffer in REST API (dual persistence) |

---

## 📊 Performance Requirements

| Metric | Target | Measured By |
|--------|--------|-------------|
| **UI responsiveness** | 60 FPS scrolling | Manual test + Chrome DevTools Performance |
| **Memory usage (UI)** | < 100 MB (10k logs) | Chrome Memory Profiler |
| **Memory usage (Backend)** | < 50 MB (ring buffer) | Node.js heap snapshot |
| **SSE latency** | < 200ms (log emit → UI) | Network tab |
| **Export speed** | < 3s (10k records) | Manual test |
| **Pino transport overhead** | < 5% CPU | Node.js profiler |

---

## 🎯 AI-Ready Foundation (V2+ Preview)

**Prepared in V1 (but not used):**

1. **Structured Logging Format:**
   - All logs are JSON (Pino native format)
   - Metadata fields: `plugin`, `executionId`, `tenantId`, `traceId`
   - Easy to query and analyze

2. **Event Taxonomy (via bindings):**
   - `logger.child({ eventKind: 'run.started' })`
   - `logger.child({ eventKind: 'http.request' })`
   - → Enables AI to understand event types

3. **Correlation:**
   - `executionId`, `traceId`, `spanId` в metadata
   - → Enables AI to reconstruct execution flow

4. **Export for AI Analysis:**
   - JSONL export → feed to LLM for summarization
   - Structured format → no text parsing needed

**Future V2 features (agent-assisted):**
- "Summarize last hour" button → LLM summarizes logs
- "Find root cause" button → Causal analysis across executionId
- "Suggest fix" button → AI recommendations based on error patterns
- "Anomaly detection" → AI flags unusual patterns

---

## 📝 Documentation Deliverables

1. **API docs:** `/logs/ingest`, `/logs/stream`, `/logs` endpoint specs (OpenAPI)
2. **User guide:** "How to use Live Logs in Studio" (with screenshots)
3. **Config guide:** How to enable Pino HTTP transport in kb.config.json
4. **Package README:** `@kb-labs/adapters-pino-http` usage and config
5. **Schema doc:** Pino → LogRecord transform mapping

---

## ✅ Acceptance Checklist (Final)

- [ ] **Milestone A:** Live stream works E2E (Pino → transport → API → SSE → UI)
- [ ] **Milestone B:** Filters, detail drawer, presets работают
- [ ] **Milestone C:** Virtualization, export, follow mode, redaction работают
- [ ] **Tests:** Unit + integration tests pass
- [ ] **Docs:** API docs, user guide, config guide, package README written
- [ ] **Demo:** All 3 demo scenarios work smoothly
- [ ] **Performance:** Meets targets (60 FPS, <100 MB memory, <200ms latency)
- [ ] **Security:** Pino redaction prevents secret leaks
- [ ] **Config:** kb.config.json updated with HTTP transport

---

## 🚀 Execution Order (For Agent)

1. **Milestone A1:** Backend endpoints (`/logs/ingest`, `/logs/stream`, `/logs`)
2. **Milestone A2:** Pino HTTP transport package (`@kb-labs/adapters-pino-http`)
3. **Milestone A3:** Configure kb.config.json (enable HTTP transport)
4. **Milestone A4:** Studio skeleton page (`/observability/logs`)
5. **Milestone A5:** `useLogStream` hook
6. **Milestone A6:** Render live list (basic)
7. **Test Milestone A:** Verify E2E live stream (manual: generate logs, check UI)
8. **Milestone B1:** Filters UI
9. **Milestone B2:** Detail drawer
10. **Milestone B3:** Presets
11. **Milestone B4:** Surrounding logs
12. **Test Milestone B:** Verify investigation workflow (manual: find error in 10s)
13. **Milestone C1:** Virtualization (react-virtuoso)
14. **Milestone C2:** Batch updates (debounced setState)
15. **Milestone C3:** Follow mode
16. **Milestone C4:** Ring buffer limit + banner
17. **Milestone C5:** Export (JSONL, JSON, CSV)
18. **Milestone C6:** Pino redaction config
19. **Test Milestone C:** Load test (500+ logs/s), export test, memory test
20. **Documentation:** Write all docs (API, user guide, config, package README)
21. **Final Demo:** Run all 3 demo scenarios, record video/screenshots

---

**Estimated Effort (UPDATED):**
- Milestone A: ~6-8 hours (backend + Pino transport + skeleton UI)
- Milestone B: ~4-6 hours (UI heavy: filters + drawer + presets)
- Milestone C: ~4-6 hours (polish: virtualization + export + follow mode)
- Testing + Docs: ~2-3 hours

**Total:** ~16-23 hours (agent execution ~50% faster = 8-12 hours wall time)

---

**Prepared by:** AI Assistant
**Review Required:** Human developer (architecture decisions, Pino transport approach)
**Start Date:** TBD
**Target Completion:** TBD
