import { EventEmitter } from 'node:events';

export type RegistryBroadcast = {
  type: 'registry';
  rev: number;
  generatedAt?: string;
  partial?: boolean;
  stale?: boolean;
  expiresAt?: string | null;
  ttlMs?: number | null;
  checksum?: string;
  checksumAlgorithm?: 'sha256';
  previousChecksum?: string | null;
};

export type HealthBroadcast = {
  type: 'health';
  status: 'healthy' | 'degraded';
  ts: string;
  ready: boolean;
  reason?: string;
  registryPartial?: boolean;
  registryStale?: boolean;
  registryLoaded?: boolean;
  pluginMountInProgress?: boolean;
  pluginRoutesMounted?: boolean;
  pluginsMounted?: number;
  pluginsFailed?: number;
  lastPluginMountTs?: string | null;
  pluginRoutesLastDurationMs?: number | null;
  redisEnabled?: boolean;
  redisHealthy?: boolean;
  redisStates?: {
    publisher: string | null;
    subscriber: string | null;
    cache: string | null;
  };
};

export type BroadcastEvent = RegistryBroadcast | HealthBroadcast;

export class EventHub {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0);
  }

  publish(event: BroadcastEvent): void {
    this.emitter.emit('broadcast', event);
  }

  subscribe(handler: (event: BroadcastEvent) => void): () => void {
    this.emitter.on('broadcast', handler);
    return () => {
      this.emitter.off('broadcast', handler);
    };
  }
}
