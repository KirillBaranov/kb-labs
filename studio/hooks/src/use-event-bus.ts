import { useEffect, useCallback, useRef } from 'react';
import { useEventBusContext, type EventHandler } from '@kb-labs/studio-event-bus';
import { usePageContext } from './page-context.js';

export interface UseEventBusReturn {
  /** Publish an event. pluginId/pageId auto-injected from context. */
  publish: <T = unknown>(event: string, payload: T) => void;
  /** Subscribe to an event. Auto-unsubscribes on unmount. Returns manual unsubscribe fn. */
  subscribe: <T = unknown>(event: string, handler: EventHandler<T>) => () => void;
}

/**
 * EventBus hook for cross-plugin communication.
 *
 * @example
 * ```tsx
 * const bus = useEventBus();
 * bus.publish('commit:completed', { scope });
 * bus.subscribe('quality:scanDone', (payload) => { ... });
 * ```
 */
export function useEventBus(): UseEventBusReturn {
  const bus = useEventBusContext();
  const { pluginId, pageId } = usePageContext();
  const unsubs = useRef<Array<() => void>>([]);

  // Auto-cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      for (const unsub of unsubs.current) {
        unsub();
      }
      unsubs.current = [];
    };
  }, []);

  const publish = useCallback(
    <T = unknown>(event: string, payload: T) => {
      bus.publish(event, payload, pluginId, pageId);
    },
    [bus, pluginId, pageId],
  );

  const subscribe = useCallback(
    <T = unknown>(event: string, handler: EventHandler<T>) => {
      const unsub = bus.subscribe(event, handler, pluginId, pageId);
      unsubs.current.push(unsub);
      return unsub;
    },
    [bus, pluginId, pageId],
  );

  return { publish, subscribe };
}
