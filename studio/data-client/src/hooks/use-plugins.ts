import { useQuery } from '@tanstack/react-query';
import type { PluginsDataSource } from '../sources/plugins-source';
import { qk } from '../query-keys';

export function usePluginsRegistry(source: PluginsDataSource) {
  return useQuery({
    queryKey: qk.plugins.registry(),
    queryFn: () => source.getPlugins(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
