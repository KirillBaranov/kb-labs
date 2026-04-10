import type { SuccessEnvelope } from './envelopes';

export interface SystemHealthSnapshot {
  schema: 'kb.health/1';
  ts: string;
  uptimeSec: number;
  version: {
    kbLabs: string;
    cli: string;
    rest: string;
    studio?: string;
    git?: {
      sha: string;
      dirty: boolean;
    };
    [key: string]: unknown;
  };
  registry: {
    total: number;
    withRest: number;
    withStudio: number;
    errors: number;
    generatedAt: string;
    expiresAt?: string;
    partial: boolean;
    stale: boolean;
  };
  status: 'healthy' | 'degraded';
  components: Array<{
    id: string;
    version?: string;
    restRoutes?: number;
    studioWidgets?: number;
    lastError?: string;
    meta?: Record<string, unknown>;
  }>;
  meta?: Record<string, unknown>;
}

export interface SystemInfoPayload {
  schema: 'kb.info/1';
  ts: string;
  uptimeSec: number;
  environment: string;
  versions: Record<string, string>;
  features?: Record<string, boolean>;
  meta?: Record<string, unknown>;
}

export interface SystemCapabilitiesPayload {
  schema: 'kb.capabilities/1';
  capabilities: Array<{
    id: string;
    describe: string;
    granted: boolean;
    origin?: string;
  }>;
  plugins?: Record<string, string[]>;
  meta?: Record<string, unknown>;
}

export interface SystemConfigPayload {
  schema: 'kb.config.redacted/1';
  config: Record<string, unknown>;
  redacted: string[];
  meta?: Record<string, unknown>;
}

export type InfoResponse = SuccessEnvelope<SystemInfoPayload>;
export type CapabilitiesResponse = SuccessEnvelope<SystemCapabilitiesPayload>;
export type ConfigResponse = SuccessEnvelope<SystemConfigPayload>;

