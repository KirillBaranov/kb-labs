import { useState, useEffect } from 'react';
import { devToolsStore } from '@kb-labs/studio-devtools';
import type { DevToolsChannel } from '@kb-labs/studio-devtools';

export interface UseDevToolsStoreReturn {
  channels: readonly DevToolsChannel[];
  clear(): void;
}

/**
 * Subscribe to the DevTools store and re-render on any change.
 * Uses the same forceUpdate pattern as ReactQueryDevtools.
 */
export function useDevToolsStore(): UseDevToolsStoreReturn {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    return devToolsStore.subscribe(() => { forceUpdate((n) => n + 1); });
  }, []);

  return {
    channels: devToolsStore.getChannels(),
    clear: () => { devToolsStore.clear(); },
  };
}
