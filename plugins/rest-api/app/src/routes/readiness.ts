// Shared readiness state for health and plugin routes
export interface ReadinessState {
  cliApiInitialized: boolean;
  registryLoaded: boolean;
  registryPartial: boolean;
  registryStale: boolean;
  pluginRoutesMounted: boolean;
  pluginMountInProgress: boolean;
  pluginRoutesCount: number;
  pluginRouteErrors: number;
  pluginRouteFailures: Array<{ id: string; error: string }>;
  lastPluginMountTs?: string | null;
  pluginRoutesLastDurationMs?: number | null;
  redisEnabled: boolean;
  redisConnected: boolean;
  redisStates: {
    publisher: string | null;
    subscriber: string | null;
    cache: string | null;
  };
}

export function createInitialReadinessState(): ReadinessState {
  return {
    cliApiInitialized: false,
    registryLoaded: false,
    registryPartial: false,
    registryStale: false,
    pluginRoutesMounted: false,
    pluginMountInProgress: true,
    pluginRoutesCount: 0,
    pluginRouteErrors: 0,
    pluginRouteFailures: [],
    lastPluginMountTs: null,
    pluginRoutesLastDurationMs: null,
    redisEnabled: false,
    redisConnected: true,
    redisStates: {
      publisher: null,
      subscriber: null,
      cache: null,
    },
  };
}

export function isReady(readiness: ReadinessState): boolean {
  return (
    readiness.cliApiInitialized &&
    readiness.registryLoaded &&
    !readiness.registryPartial &&
    !readiness.registryStale &&
    (!readiness.redisEnabled || readiness.redisConnected)
  );
}

export function resolveReadinessReason(readiness: ReadinessState):
  | 'ready'
  | 'cli_api_not_initialized'
  | 'registry_not_loaded'
  | 'registry_partial'
  | 'registry_snapshot_stale'
  | 'redis_unavailable'
  | 'plugin_mount_in_progress' {
  if (!readiness.cliApiInitialized) {
    return 'cli_api_not_initialized';
  }
  if (!readiness.registryLoaded) {
    if (readiness.registryStale) {
      return 'registry_snapshot_stale';
    }
    if (readiness.registryPartial) {
      return 'registry_partial';
    }
    return 'registry_not_loaded';
  }
  if (readiness.redisEnabled && !readiness.redisConnected) {
    return 'redis_unavailable';
  }
  if (readiness.pluginMountInProgress) {
    return 'plugin_mount_in_progress';
  }
  return 'ready';
}
