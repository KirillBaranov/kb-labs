/**
 * Registry V2 provider — fetches StudioRegistryV2 and initializes Module Federation.
 *
 * Fetches StudioRegistryV2 and initializes Module Federation remotes.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { initFederation, type StudioRegistryV2 } from '@kb-labs/studio-federation';
import { studioConfig } from '../config/studio.config';

interface RegistryV2ContextValue {
  registry: StudioRegistryV2;
  loading: boolean;
  error: Error | null;
}

const EMPTY_REGISTRY: StudioRegistryV2 = {
  schema: 'kb.studio/2',
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  plugins: [],
};

const RegistryV2Context = React.createContext<RegistryV2ContextValue>({
  registry: EMPTY_REGISTRY,
  loading: true,
  error: null,
});

async function fetchRegistryV2(apiBaseUrl: string, token?: string): Promise<StudioRegistryV2> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {headers['Authorization'] = `Bearer ${token}`;}

  const res = await fetch(`${apiBaseUrl}/studio/registry`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch studio registry: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as { ok?: boolean; data?: StudioRegistryV2 } | StudioRegistryV2;
  // REST API wraps response in { ok, data, meta } envelope
  if ('data' in json && json.data) {
    return json.data as StudioRegistryV2;
  }
  return json as StudioRegistryV2;
}

export function RegistryV2Provider({
  children,
  apiBaseUrl = '/api/v1',
}: {
  children: React.ReactNode;
  apiBaseUrl?: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['studio-registry-v2', apiBaseUrl],
    queryFn: () => fetchRegistryV2(apiBaseUrl, studioConfig.gatewayToken),
    staleTime: 10_000,
    gcTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });

  const federationInitialized = React.useRef(false);
  // Tracks whether initFederation() has actually run for the current `data`.
  // Kept as separate state (not just a ref) so consumers re-render — and only
  // mount plugin pages — one commit *after* initFederation() has completed,
  // instead of racing it: React flushes effects bottom-up (children before
  // parents), so a child mounted in the same commit as this provider's effect
  // could call loadRemote() before initFederation() registers the remotes.
  const [federationReady, setFederationReady] = React.useState(false);

  // Initialize Module Federation once when registry is first loaded.
  // Cache invalidation is handled lazily at navigation time via syncRemoteEntry()
  // inside loadPageComponent — so the running page is never disrupted mid-session.
  React.useEffect(() => {
    if (!data) { return; }
    if (!federationInitialized.current) {
      if (data.plugins.length > 0) {
        initFederation(data.plugins);
      }
      federationInitialized.current = true;
    }
    setFederationReady(true);
  }, [data]);

  const value = React.useMemo<RegistryV2ContextValue>(
    () => ({
      registry: data ?? EMPTY_REGISTRY,
      loading: isLoading || !federationReady,
      error: error instanceof Error ? error : null,
    }),
    [data, isLoading, error, federationReady],
  );

  return (
    <RegistryV2Context.Provider value={value}>
      {children}
    </RegistryV2Context.Provider>
  );
}

export function useRegistryV2(): RegistryV2ContextValue {
  return React.useContext(RegistryV2Context);
}
