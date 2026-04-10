/**
 * @module @kb-labs/studio-data-client/hooks/use-platform
 * Platform configuration hooks
 */

import { useQuery } from '@tanstack/react-query';
import type { PlatformDataSource } from '../sources/platform-source';
import { qk } from '../query-keys';

/**
 * Get platform configuration (adapters, options, execution mode)
 */
export function usePlatformConfig(source: PlatformDataSource) {
  return useQuery({
    queryKey: qk.platform.config(),
    queryFn: async () => {
      return source.getConfig();
    },
    staleTime: 60000, // Cache for 1 minute (config rarely changes)
    retry: 2,
    retryDelay: 1000,
  });
}
