import { useQuery } from '@tanstack/react-query';
import type { SystemDataSource } from '../sources/system-source';
import { qk } from '../query-keys';

export function useHealthStatus(source: SystemDataSource) {
  return useQuery({
    queryKey: qk.system.health.live(),
    queryFn: async () => {
      try {
        return source.getHealth();
      } catch (error) {
        // If HTTP source fails, return degraded status
        return {
          ok: false,
          timestamp: new Date().toISOString(),
          sources: [{
            name: 'system',
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }],
        };
      }
    },
    refetchInterval: 30000, // Poll every 30 seconds
    staleTime: 15000,
    retry: 2,
    retryDelay: 1000,
  });
}

export function useReadyStatus(source: SystemDataSource) {
  const httpSource = source as any;
  
  return useQuery({
    queryKey: qk.system.health.ready(),
    queryFn: async () => {
      if (httpSource.getReady) {
        return httpSource.getReady();
      }
      // Fallback for mock sources
      return {
        ready: true as const,
      };
    },
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 2,
    retryDelay: 1000,
  });
}

export function useSystemInfo(source: SystemDataSource) {
  const httpSource = source as any;
  
  return useQuery({
    queryKey: qk.system.info(),
    queryFn: async () => {
      if (httpSource.getInfo) {
        return httpSource.getInfo();
      }
      // Fallback for mock sources
      return {
        cwd: process.cwd(),
        repo: undefined,
        profiles: [],
        plugins: [],
        apiVersion: '1.0.0',
      };
    },
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useCapabilities(source: SystemDataSource) {
  const httpSource = source as any;
  
  return useQuery({
    queryKey: qk.system.capabilities(),
    queryFn: async () => {
      if (httpSource.getCapabilities) {
        return httpSource.getCapabilities();
      }
      // Fallback for mock sources
      return {
        commands: ['audit', 'release', 'devlink', 'mind', 'analytics'],
        adapters: {
          queue: ['memory'],
          storage: ['fs'],
          auth: ['none'],
        },
      };
    },
    staleTime: 60000,
  });
}

