import type { HealthStatus } from '../contracts/system';
import type {
  ReadyResponse,
  NotReadyResponse,
  SystemInfoPayload,
  SystemCapabilitiesPayload,
  SystemConfigPayload,
} from '@kb-labs/rest-api-contracts';

export interface RouteInfo {
  method: string;
  url: string;
}

export interface RoutesResponse {
  schema: string;
  ts: string;
  count: number;
  routes: RouteInfo[];
  raw?: string;
}

export interface PlatformHealthComponent {
  id: string;
  version?: string;
  restRoutes?: number;
  studioWidgets?: number;
  lastError?: string;
}

export interface PlatformHealthSnapshot {
  status: 'healthy' | 'degraded';
  uptimeSec: number;
  registry: {
    total: number;
    withRest: number;
    withStudio: number;
    errors: number;
    partial: boolean;
    stale: boolean;
  };
  components: PlatformHealthComponent[];
}

export interface SystemDataSource {
  getHealth(): Promise<HealthStatus>;
  getPlatformHealth?(): Promise<PlatformHealthSnapshot>;
  getReady?(): Promise<ReadyResponse | NotReadyResponse>;
  getInfo?(): Promise<SystemInfoPayload>;
  getCapabilities?(): Promise<SystemCapabilitiesPayload>;
  getConfig?(): Promise<SystemConfigPayload>;
  /** Get all registered API routes */
  getRoutes(): Promise<RoutesResponse>;
  /** Get the base URL of the API (e.g., http://localhost:5050/api/v1) */
  getBaseUrl(): string;
}

