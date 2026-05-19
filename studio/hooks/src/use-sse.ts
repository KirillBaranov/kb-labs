import { useEffect, useState, useRef, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────

export type SSEConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface UseSSEOptions<T> {
  /** SSE event name(s) to listen on (default: 'message') */
  events?: string | string[];
  /** Event that signals the stream is done (auto-closes connection) */
  doneEvent?: string;
  /** SSE event names that indicate the stream ended cleanly (no error raised on close) */
  terminalEvents?: string[];
  /** Enable/disable the hook (default: true) */
  enabled?: boolean;
  /** Auto-reconnect on error (default: false) */
  reconnect?: boolean;
  /** Max reconnect attempts (default: 5) */
  maxReconnects?: number;
  /** Base reconnect delay in ms, doubles each attempt (default: 2000) */
  reconnectIntervalMs?: number;
  /** Max events to keep in buffer (0 = unlimited, default: 0) */
  maxEvents?: number;
  /** Parse event data (default: JSON.parse) */
  parse?: (raw: string) => T;
  /** Query params appended to endpoint */
  params?: Record<string, string | number | boolean>;
  /** Called on each incoming event */
  onEvent?: (event: T) => void;
  /** Called on connection open */
  onOpen?: () => void;
  /** Called on error (before reconnect) */
  onError?: (error: Error) => void;
  /** Called when done event received or connection closed cleanly */
  onDone?: () => void;
}

export interface UseSSEReturn<T> {
  /** Accumulated events */
  events: T[];
  /** Latest event received */
  latest: T | undefined;
  /** Whether EventSource is connected */
  isConnected: boolean;
  /** Granular connection status */
  connectionStatus: SSEConnectionStatus;
  /** True if stream closed via a terminal/done event (not a network error) */
  closedClean: boolean;
  /** Last error (null when closed cleanly) */
  error: Error | null;
  /** Manually close the connection */
  close: () => void;
  /** Clear the event buffer */
  clear: () => void;
  /** Current reconnect attempt count */
  reconnectCount: number;
}

// ─── Hook ──────────────────────────────────────────────────────────

/**
 * Generic SSE hook for server-sent event streams.
 *
 * Pass `null` as endpoint to keep the hook mounted but inactive.
 *
 * @example
 * ```tsx
 * // Workflow logs
 * const { events, isConnected } = useSSE<LogEvent>(
 *   runId ? `/workflows/runs/${runId}/logs` : null,
 *   { events: 'workflow.log', doneEvent: 'workflow.done', params: { follow: '1' } },
 * );
 *
 * // Observability log stream with reconnect
 * const { events, latest } = useSSE<LogRecord>('/logs/stream', {
 *   params: { level: 'error' },
 *   maxEvents: 500,
 *   reconnect: true,
 * });
 * ```
 */
export function useSSE<T = unknown>(
  endpoint: string | null,
  options: UseSSEOptions<T> = {},
): UseSSEReturn<T> {
  const {
    events: eventNames = 'message',
    doneEvent,
    terminalEvents,
    enabled = true,
    reconnect = false,
    maxReconnects = 5,
    reconnectIntervalMs = 2000,
    maxEvents = 0,
    parse = defaultParse,
    params,
    onEvent,
    onOpen,
    onError,
    onDone,
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [latest, setLatest] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<SSEConnectionStatus>('closed');
  const [closedClean, setClosedClean] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUser = useRef(false);
  const closedByTerminal = useRef(false);

  // Stable refs for callbacks to avoid re-subscribing on every render
  const onEventRef = useRef(onEvent);
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  const onDoneRef = useRef(onDone);
  const parseRef = useRef(parse);
  onEventRef.current = onEvent;
  onOpenRef.current = onOpen;
  onErrorRef.current = onError;
  onDoneRef.current = onDone;
  parseRef.current = parse;

  // Stable serialized deps for objects/arrays — avoids inline JSON.stringify in dep array
  const eventNamesKey = JSON.stringify(eventNames);
  const paramsKey = JSON.stringify(params);
  const terminalEventsKey = JSON.stringify(terminalEvents);

  const close = useCallback(() => {
    closedByUser.current = true;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus('closed');
    setClosedClean(true);
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setLatest(undefined);
  }, []);

  useEffect(() => {
    if (!endpoint || !enabled) {
      // Clean up if we were connected
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    closedByUser.current = false;
    closedByTerminal.current = false;
    setItems([]);
    setLatest(undefined);
    setError(null);
    setClosedClean(false);
    setReconnectCount(0);
    setConnectionStatus('connecting');

    let attempt = 0;

    function connect() {
      const url = buildSSEUrl(endpoint!, params);
      const es = new EventSource(url);
      esRef.current = es;

      const names = Array.isArray(eventNames) ? eventNames : [eventNames];

      const handleMessage = (e: MessageEvent) => {
        try {
          const parsed = parseRef.current(e.data) as T;
          setLatest(parsed);
          setItems((prev) => {
            const next = [...prev, parsed];
            return maxEvents > 0 && next.length > maxEvents ? next.slice(-maxEvents) : next;
          });
          onEventRef.current?.(parsed);
        } catch (err) {
          const parseError = err instanceof Error ? err : new Error('Failed to parse SSE event data');
          setError(parseError);
          onErrorRef.current?.(parseError);
        }
      };

      for (const name of names) {
        es.addEventListener(name, handleMessage as EventListener);
      }

      // Terminal events close the stream cleanly — no error raised
      const allTerminal = [
        ...(terminalEvents ?? []),
        ...(doneEvent ? [doneEvent] : []),
      ];
      for (const name of allTerminal) {
        es.addEventListener(name, () => {
          closedByTerminal.current = true;
          es.close();
          esRef.current = null;
          setIsConnected(false);
          setConnectionStatus('closed');
          setClosedClean(true);
          onDoneRef.current?.();
        });
      }

      // Legacy doneEvent kept for backward compat (already covered above, but no-op duplicate)

      es.onopen = () => {
        attempt = 0;
        setReconnectCount(0);
        setIsConnected(true);
        setConnectionStatus('live');
        setError(null);
        onOpenRef.current?.();
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setIsConnected(false);

        // Clean close by user or terminal event — suppress error
        if (closedByUser.current || closedByTerminal.current) {
          setConnectionStatus('closed');
          return;
        }

        const connError = new Error('SSE connection lost');
        setError(connError);
        onErrorRef.current?.(connError);

        if (reconnect && attempt < maxReconnects) {
          attempt++;
          setReconnectCount(attempt);
          setConnectionStatus('reconnecting');
          const delay = reconnectIntervalMs * Math.pow(2, attempt - 1);
          reconnectTimer.current = setTimeout(connect, delay);
        } else {
          setConnectionStatus('closed');
        }
      };
    }

    connect();

    return () => {
      closedByUser.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, enabled, doneEvent, reconnect, maxReconnects, reconnectIntervalMs, maxEvents, eventNamesKey, paramsKey, terminalEventsKey]);

  return { events: items, latest, isConnected, connectionStatus, closedClean, error, close, clear, reconnectCount };
}

// ─── Helpers ───────────────────────────────────────────────────────

function defaultParse<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function buildSSEUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
): string {
  const base = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
  if (!params || Object.keys(params).length === 0) {
    return base;
  }
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      sp.set(key, String(value));
    }
  }
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${sp.toString()}`;
}
