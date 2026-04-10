import { useEffect, useRef, type ReactNode } from 'react';
import { devToolsStore, GenericChannel } from '@kb-labs/studio-devtools';
import type { DevToolsPlugin, EventBusEvent } from '@kb-labs/studio-devtools';
import { eventBus } from '@kb-labs/studio-event-bus';
import { useFeatureFlags } from '@/hooks/use-feature-flags';

interface DevToolsProviderProps {
  children: ReactNode;
  /** External plugins to register alongside built-in channels */
  plugins?: DevToolsPlugin[];
}

/**
 * Mounts all DevTools instrumentation when the 'devtools-panel' feature flag is enabled.
 * Must be placed inside SettingsProvider (for feature flags) and outside RegistryV2Provider
 * (so MF events from registry load are captured).
 */
export function DevToolsProvider({ children, plugins = [] }: DevToolsProviderProps) {
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled('devtools-panel');
  const pluginsRef = useRef(plugins);
  pluginsRef.current = plugins;

  useEffect(() => {
    if (!enabled) { return; }

    // --- EventBus channel ---
    const eventBusChannel = new GenericChannel<EventBusEvent>(
      'eventbus',
      'EventBus',
      'NodeIndexOutlined',
    );
    devToolsStore.registerChannel(eventBusChannel);

    // Backfill existing history
    eventBus.getHistory().forEach((record) => {
      eventBusChannel.push({
        id: `eb-${record.meta.timestamp}-${Math.random().toString(36).slice(2)}`,
        event: record.event,
        payload: record.payload,
        sourcePluginId: record.meta.sourcePluginId,
        sourcePageId: record.meta.sourcePageId,
        timestamp: record.meta.timestamp,
      });
    });

    // Live stream
    eventBus.setDevToolsObserver((record) => {
      eventBusChannel.push({
        id: `eb-${record.meta.timestamp}-${Math.random().toString(36).slice(2)}`,
        event: record.event,
        payload: record.payload,
        sourcePluginId: record.meta.sourcePluginId,
        sourcePageId: record.meta.sourcePageId,
        timestamp: record.meta.timestamp,
      });
    });

    // --- External plugins ---
    pluginsRef.current.forEach((p) => { devToolsStore.registerPlugin(p); });

    return () => {
      eventBus.clearDevToolsObserver();
      devToolsStore.unregisterChannel('eventbus');
      pluginsRef.current.forEach((p) => {
        devToolsStore.unregisterChannel(p.channel.id);
      });
    };
  }, [enabled]);

  return <>{children}</>;
}
