import { platform } from './container.js';
import type {
  IResourceManager,
  ResourceAvailability,
  ResourceType,
  TenantQuotas,
} from '@kb-labs/core-platform';

export interface MonitoringSnapshot {
  resource: ResourceType;
  availability?: ResourceAvailability;
  quota?: TenantQuotas;
  tenantId?: string;
  ts: string;
}

export interface MonitoringOptions {
  resources?: ResourceType[];
  tenantId?: string;
}

export async function getMonitoringSnapshot(
  options: MonitoringOptions = {}
): Promise<MonitoringSnapshot[]> {
  const resourcesManager = (platform as { resources?: IResourceManager }).resources;
  const resources =
    options.resources ?? (['workflow', 'job', 'llm', 'api'] as ResourceType[]);
  const tenantId = options.tenantId;
  const ts = new Date().toISOString();

  if (!resourcesManager) {
    return [];
  }

  return Promise.all(
    resources.map(async (resource) => {
      const availability = await resourcesManager
        .getAvailability(resource, tenantId)
        .catch(() => undefined);
      const quota = await resourcesManager
        .getQuota(tenantId ?? 'default')
        .catch(() => undefined);

      return { resource, availability, quota, tenantId, ts };
    })
  );
}

export type DegradedLevel = 'normal' | 'degraded' | 'critical';

export interface DegradedStatus {
  level: DegradedLevel;
  ts: string;
  reason?: string;
}

export interface DegradedOptions extends MonitoringOptions {
  thresholds?: {
    degraded?: number;
    critical?: number;
  };
}

export async function getDegradedStatus(
  options: DegradedOptions = {}
): Promise<DegradedStatus> {
  const thresholds = {
    degraded: options.thresholds?.degraded ?? 0.75,
    critical: options.thresholds?.critical ?? 0.9,
  };
  const ts = new Date().toISOString();

  const snapshots = await getMonitoringSnapshot(options);
  if (snapshots.length === 0) {
    return { level: 'normal', ts, reason: 'monitoring-unavailable' };
  }

  let worst: DegradedLevel = 'normal';

  for (const snap of snapshots) {
    const availability = snap.availability;
    if (!availability || availability.total === 0) {
      continue;
    }
    const ratio = availability.used / availability.total;
    const level: DegradedLevel =
      ratio >= thresholds.critical
        ? 'critical'
        : ratio >= thresholds.degraded
          ? 'degraded'
          : 'normal';

    if (levelRank(level) > levelRank(worst)) {
      worst = level;
    }
  }

  return { level: worst, ts };
}

function levelRank(level: DegradedLevel): number {
  switch (level) {
    case 'critical':
      return 2;
    case 'degraded':
      return 1;
    default:
      return 0;
  }
}

