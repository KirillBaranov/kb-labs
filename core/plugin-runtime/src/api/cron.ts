/**
 * Cron API implementation
 *
 * HTTP client adapter for Workflow Service Cron API.
 * Makes REST API calls instead of in-process manager calls.
 */

import type {
  CronAPI,
  CronRegistration,
  CronInfo,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';

export interface CreateCronAPIOptions {
  tenantId?: string;
  workflowServiceUrl: string;
  permissions?: PermissionSpec;
}

/**
 * Check if cron operation is allowed by permissions
 */
function checkCronPermission(
  permissions: PermissionSpec | undefined,
  operation: 'register' | 'unregister' | 'list' | 'trigger' | 'pause' | 'resume'
): void {
  const cronPerms = permissions?.platform?.cron;

  // If cron is false or undefined, no access
  if (cronPerms === false || cronPerms === undefined) {
    throw new Error('Cron scheduler access denied: missing platform.cron permission');
  }

  // If cron is true, all operations allowed
  if (cronPerms === true) {
    return;
  }

  // If cron is object, check specific operation
  if (typeof cronPerms === 'object' && !cronPerms[operation]) {
    throw new Error(
      `Cron operation '${operation}' denied: missing platform.cron.${operation} permission`
    );
  }
}

/**
 * Create CronAPI HTTP client
 *
 * Makes REST API calls to Workflow Service instead of in-process calls.
 */
export function createCronAPI(options: CreateCronAPIOptions): CronAPI {
  const { tenantId, workflowServiceUrl, permissions } = options;

  const fetchJSON = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const url = `${workflowServiceUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId ?? 'default',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Workflow Service request failed: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<T>;
  };

  return {
    async register(registration: CronRegistration): Promise<void> {
      checkCronPermission(permissions, 'register');

      await fetchJSON<void>('/api/cron', {
        method: 'POST',
        body: JSON.stringify({
          id: registration.id,
          schedule: registration.schedule,
          jobType: registration.jobType,
          payload: registration.payload,
          timezone: registration.timezone,
          enabled: registration.enabled ?? true,
        }),
      });
    },

    async unregister(id: string): Promise<void> {
      checkCronPermission(permissions, 'unregister');

      await fetchJSON<void>(`/api/cron/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },

    async list(): Promise<CronInfo[]> {
      checkCronPermission(permissions, 'list');

      const response = await fetchJSON<{ crons: CronInfo[] }>('/api/cron');
      return response.crons;
    },

    async trigger(id: string): Promise<void> {
      checkCronPermission(permissions, 'trigger');

      await fetchJSON<void>(`/api/cron/${encodeURIComponent(id)}/trigger`, {
        method: 'POST',
      });
    },

    async pause(id: string): Promise<void> {
      checkCronPermission(permissions, 'pause');

      await fetchJSON<void>(`/api/cron/${encodeURIComponent(id)}/pause`, {
        method: 'POST',
      });
    },

    async resume(id: string): Promise<void> {
      checkCronPermission(permissions, 'resume');

      await fetchJSON<void>(`/api/cron/${encodeURIComponent(id)}/resume`, {
        method: 'POST',
      });
    },
  };
}

/**
 * Create noop CronAPI (when cron manager is not available)
 */
export function createNoopCronAPI(): CronAPI {
  const notAvailable = () => {
    throw new Error('Cron scheduler not available in this context');
  };

  return {
    register: notAvailable,
    unregister: notAvailable,
    list: async () => [],
    trigger: notAvailable,
    pause: notAvailable,
    resume: notAvailable,
  };
}
