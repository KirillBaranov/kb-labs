export interface ReadyComponents {
  cliApi: {
    initialized: boolean;
  };
  registry: {
    loaded: boolean;
    partial: boolean;
    stale: boolean;
  };
  plugins: {
    mounted: boolean;
    inProgress: boolean;
    routeCount: number;
    errors: number;
    failures: Array<{ id: string; error: string }>;
    lastCompletedAt: string | null;
    lastDurationMs: number | null;
  };
  redis: {
    enabled: boolean;
    healthy: boolean;
    states?: Record<string, unknown>;
  };
}

interface ReadyResponseBase {
  schema: 'kb.ready/1';
  ts: string;
  reason: string;
  components: ReadyComponents;
}

export type ReadyResponse = ReadyResponseBase & {
  ready: true;
  status: 'ready' | 'degraded';
};

export type NotReadyResponse = ReadyResponseBase & {
  ready: false;
  status: 'initializing' | 'degraded';
};
