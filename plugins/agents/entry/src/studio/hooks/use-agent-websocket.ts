/**
 * React hook for WebSocket connection to agent turn snapshots.
 * Self-contained copy for plugin widget use — no studio-data-client dependency.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ServerMessage, Turn } from '@kb-labs/agent-contracts';

export interface UseAgentWebSocketOptions {
  url: string | null;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  onComplete?: (success: boolean, summary: string) => void;
  onTurnsChanged?: () => void;
  onError?: (error: { code: string; message: string }) => void;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface UseAgentWebSocketReturn {
  status: ConnectionStatus;
  isConnected: boolean;
  turns: Turn[];
  error: { code: string; message: string } | null;
  send: (message: unknown) => void;
  clearTurns: () => void;
}

export function useAgentWebSocket(options: UseAgentWebSocketOptions): UseAgentWebSocketReturn {
  const {
    url,
    autoReconnect = true,
    reconnectDelay = 1000,
    maxReconnectAttempts = 5,
    onComplete,
    onTurnsChanged,
    onError,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);
  const isCompletedRef = useRef(false);

  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const onTurnsChangedRef = useRef(onTurnsChanged);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onTurnsChangedRef.current = onTurnsChanged; }, [onTurnsChanged]);

  const closeSocket = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const openSocket = useCallback((wsUrl: string) => {
    closeSocket();
    setStatus('connecting');
    reconnectAttemptsRef.current = 0;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // status set by connection:ready message
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as ServerMessage;

        switch (data.type) {
          case 'conversation:snapshot': {
            const { completedTurns, activeTurns } = data.payload;
            const incoming = [...completedTurns, ...activeTurns].sort((a, b) => a.sequence - b.sequence);
            isCompletedRef.current = false;
            setTurns((prev) => {
              if (prev.length === 0) { return incoming; }
              const merged = new Map<string, Turn>();
              for (const t of incoming) { merged.set(t.id, t); }
              for (const t of prev) {
                const snap = merged.get(t.id);
                if (snap && t.status === 'streaming' && snap.status === 'streaming' && t.steps.length > snap.steps.length) {
                  merged.set(t.id, t);
                }
              }
              return [...merged.values()].sort((a, b) => a.sequence - b.sequence);
            });
            onTurnsChangedRef.current?.();
            break;
          }

          case 'turn:snapshot': {
            const { turn } = data.payload;
            isCompletedRef.current = false;
            setTurns((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((t) => t.id === turn.id);
              if (idx >= 0) {
                const existing = updated[idx]!;
                if (existing.status === 'streaming' && turn.status === 'streaming' && turn.steps.length < existing.steps.length) {
                  return prev;
                }
                updated[idx] = turn;
              } else {
                const insertAt = updated.findIndex((t) => t.sequence > turn.sequence);
                if (insertAt >= 0) { updated.splice(insertAt, 0, turn); }
                else { updated.push(turn); }
              }
              return updated;
            });
            onTurnsChangedRef.current?.();
            break;
          }

          case 'connection:ready': {
            reconnectAttemptsRef.current = 0;
            setStatus('connected');
            break;
          }

          case 'run:completed': {
            const { success, summary } = data.payload;
            isCompletedRef.current = true;
            onCompleteRef.current?.(success, summary);
            break;
          }

          case 'error': {
            const { code, message } = data.payload;
            setError({ code, message });
            onErrorRef.current?.({ code, message });
            break;
          }
        }
      } catch (err) {
        console.error('[useAgentWebSocket] Failed to parse message:', err);
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = (event) => {
      if (
        shouldReconnectRef.current &&
        !isCompletedRef.current &&
        autoReconnect &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        reconnectAttemptsRef.current++;
        setStatus('reconnecting');
        reconnectTimeoutRef.current = setTimeout(() => {
          if (shouldReconnectRef.current) {
            openSocket(wsUrl);
          }
        }, reconnectDelay * reconnectAttemptsRef.current);
      } else {
        setStatus('disconnected');
      }
    };
  }, [autoReconnect, closeSocket, maxReconnectAttempts, reconnectDelay]);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const clearTurns = useCallback(() => {
    setTurns([]);
    setError(null);
    isCompletedRef.current = false;
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = false;
    closeSocket();
    setTurns([]);
    setError(null);
    isCompletedRef.current = false;

    if (url) {
      shouldReconnectRef.current = true;
      openSocket(url);
    } else {
      setStatus('disconnected');
    }

    return () => {
      shouldReconnectRef.current = false;
      closeSocket();
    };
  }, [url]);

  return {
    status,
    isConnected: status === 'connected',
    turns,
    error,
    send,
    clearTurns,
  };
}

/**
 * Build WebSocket URL for an agent session from current window location.
 * Assumes REST API is at /api/v1 on same host.
 */
export function buildAgentWsUrl(sessionId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/api/v1/ws/plugins/agents/session/${sessionId}`;
}
