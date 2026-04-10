/**
 * Environment API implementation.
 *
 * Adapter from plugin-facing EnvironmentAPI to runtime EnvironmentManager.
 */

import type {
  EnvironmentAPI,
  EnvironmentCreateRequest,
  EnvironmentInfo,
  EnvironmentLeaseInfo,
  EnvironmentStatusInfo,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';

interface EnvironmentManagerClient {
  createEnvironment(request: EnvironmentCreateRequest): Promise<EnvironmentInfo>;
  getEnvironmentStatus(environmentId: string): Promise<EnvironmentStatusInfo>;
  destroyEnvironment(environmentId: string, reason?: string): Promise<void>;
  renewEnvironmentLease(environmentId: string, ttlMs: number): Promise<EnvironmentLeaseInfo>;
}

export interface CreateEnvironmentAPIOptions {
  permissions?: PermissionSpec;
  manager: EnvironmentManagerClient;
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

function checkEnvironmentPermission(
  permissions: PermissionSpec | undefined,
  operation: 'create' | 'read' | 'destroy' | 'renewLease',
  request?: EnvironmentCreateRequest
): void {
  const envPerms = permissions?.platform?.environment;

  if (envPerms === false || envPerms === undefined) {
    throw new Error('Environment access denied: missing platform.environment permission');
  }

  if (envPerms === true) {
    return;
  }

  if (!envPerms[operation]) {
    throw new Error(
      `Environment operation '${operation}' denied: missing platform.environment.${operation} permission`
    );
  }

  if (operation === 'create' && request?.templateId && envPerms.templates?.length) {
    const allowed = envPerms.templates.some(pattern => matchesPattern(request.templateId!, pattern));
    if (!allowed) {
      throw new Error(
        `Environment template '${request.templateId}' denied: not in allowed templates scope`
      );
    }
  }

  if (operation === 'create' && request?.namespace && envPerms.namespaces?.length) {
    const allowed = envPerms.namespaces.some(pattern =>
      matchesPattern(request.namespace!, pattern)
    );
    if (!allowed) {
      throw new Error(
        `Environment namespace '${request.namespace}' denied: not in allowed namespaces scope`
      );
    }
  }
}

/**
 * Create plugin EnvironmentAPI backed by runtime EnvironmentManager.
 */
export function createEnvironmentAPI(options: CreateEnvironmentAPIOptions): EnvironmentAPI {
  const { permissions, manager } = options;

  return {
    async create(request: EnvironmentCreateRequest): Promise<EnvironmentInfo> {
      checkEnvironmentPermission(permissions, 'create', request);
      return manager.createEnvironment(request);
    },

    async status(environmentId: string): Promise<EnvironmentStatusInfo> {
      checkEnvironmentPermission(permissions, 'read');
      return manager.getEnvironmentStatus(environmentId);
    },

    async destroy(environmentId: string, reason?: string): Promise<void> {
      checkEnvironmentPermission(permissions, 'destroy');
      await manager.destroyEnvironment(environmentId, reason);
    },

    async renewLease(environmentId: string, ttlMs: number): Promise<EnvironmentLeaseInfo> {
      checkEnvironmentPermission(permissions, 'renewLease');
      return manager.renewEnvironmentLease(environmentId, ttlMs);
    },
  };
}

/**
 * Create noop EnvironmentAPI (when environment manager is not available).
 */
export function createNoopEnvironmentAPI(): EnvironmentAPI {
  const notAvailable = async (): Promise<never> => {
    throw new Error('Environment manager not available in this context');
  };

  return {
    create: notAvailable,
    status: notAvailable,
    destroy: notAvailable,
    renewLease: notAvailable,
  };
}
