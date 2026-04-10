/**
 * Invoke API implementation
 */

import type {
  ExecutionTarget,
  InvokeAPI,
  InvokeOptions,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

/**
 * Plugin invoker function type
 */
export type PluginInvokerFn = <T = unknown>(
  pluginId: string,
  input?: unknown,
  options?: InvokeOptions
) => Promise<T>;

export interface CreateInvokeAPIOptions {
  permissions: PermissionSpec;
  invoker: PluginInvokerFn;
  auditTargetExecution?: (params: {
    method: 'invoke';
    target: ExecutionTarget;
    targetPluginId: string;
  }) => Promise<void> | void;
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

function checkTargetPermission(permissions: PermissionSpec, invokeOptions?: InvokeOptions): void {
  const target = invokeOptions?.target;
  if (!target) {
    return;
  }

  if (!target.namespace) {
    throw new PermissionError('Target namespace is required when invoke target is specified');
  }

  const executionPerms = permissions.platform?.execution;
  if (executionPerms === false || executionPerms === undefined) {
    throw new PermissionError(
      "Target execution denied: missing platform.execution.targetUse permission"
    );
  }

  if (executionPerms === true) {
    return;
  }

  if (!executionPerms.targetUse) {
    throw new PermissionError(
      "Target execution denied: missing platform.execution.targetUse permission"
    );
  }

  if (executionPerms.namespaces?.length) {
    const allowed = executionPerms.namespaces.some(pattern =>
      matchesPattern(target.namespace!, pattern)
    );
    if (!allowed) {
      throw new PermissionError(
        `Target namespace '${target.namespace}' denied: not in allowed execution namespaces scope`
      );
    }
  }
}

/**
 * Create InvokeAPI for calling other plugins
 */
export function createInvokeAPI(options: CreateInvokeAPIOptions): InvokeAPI {
  const { permissions, invoker, auditTargetExecution } = options;

  // Check if invoke is allowed (empty array = disabled)
  const allowedPlugins = permissions.invoke?.allow ?? [];
  if (allowedPlugins.length === 0) {
    return {
      async call(): Promise<never> {
        throw new PermissionError('Plugin invocation not allowed');
      },
    };
  }

  return {
    async call<T = unknown>(
      pluginId: string,
      input?: unknown,
      invokeOptions?: InvokeOptions
    ): Promise<T> {
      checkTargetPermission(permissions, invokeOptions);

      // Check plugin whitelist
      if (!allowedPlugins.includes(pluginId) && !allowedPlugins.includes('*')) {
        throw new PermissionError(`Plugin not in whitelist`, {
          pluginId,
          allowedPlugins,
        });
      }

      const target = invokeOptions?.target;
      if (target) {
        try {
          await auditTargetExecution?.({
            method: 'invoke',
            target,
            targetPluginId: pluginId,
          });
        } catch {
          // Audit failures must never block execution.
        }
      }

      return invoker<T>(pluginId, input, invokeOptions);
    },
  };
}

/**
 * Create a no-op invoke API (for when invoke is disabled)
 */
export function createNoopInvokeAPI(): InvokeAPI {
  return {
    async call(): Promise<never> {
      throw new PermissionError('Plugin invocation not allowed');
    },
  };
}
