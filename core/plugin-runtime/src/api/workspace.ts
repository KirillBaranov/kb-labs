/**
 * Workspace API implementation.
 *
 * Adapter from plugin-facing WorkspaceAPI to runtime WorkspaceManager.
 */

import type {
  WorkspaceAPI,
  WorkspaceMaterializeRequest,
  WorkspaceInfo,
  WorkspaceAttachRequest,
  WorkspaceAttachmentInfo,
  WorkspaceStatusInfo,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';

interface WorkspaceManagerClient {
  materializeWorkspace(request: WorkspaceMaterializeRequest): Promise<WorkspaceInfo>;
  attachWorkspace(request: WorkspaceAttachRequest): Promise<WorkspaceAttachmentInfo>;
  releaseWorkspace(workspaceId: string, environmentId?: string): Promise<void>;
  getWorkspaceStatus(workspaceId: string): Promise<WorkspaceStatusInfo>;
}

export interface CreateWorkspaceAPIOptions {
  permissions?: PermissionSpec;
  manager: WorkspaceManagerClient;
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

function checkScope(
  value: string | undefined,
  patterns: string[] | undefined,
  deniedMessage: string
): void {
  if (!value || !patterns?.length) {
    return;
  }
  const allowed = patterns.some(pattern => matchesPattern(value, pattern));
  if (!allowed) {
    throw new Error(deniedMessage);
  }
}

function checkWorkspacePermission(
  permissions: PermissionSpec | undefined,
  operation: 'materialize' | 'attach' | 'release' | 'read',
  request?: WorkspaceMaterializeRequest | WorkspaceAttachRequest
): void {
  const workspacePerms = permissions?.platform?.workspace;

  if (workspacePerms === false || workspacePerms === undefined) {
    throw new Error('Workspace access denied: missing platform.workspace permission');
  }

  if (workspacePerms === true) {
    return;
  }

  if (!workspacePerms[operation]) {
    throw new Error(
      `Workspace operation '${operation}' denied: missing platform.workspace.${operation} permission`
    );
  }

  if (operation === 'materialize') {
    const materializeRequest = request as WorkspaceMaterializeRequest | undefined;
    checkScope(
      materializeRequest?.sourceRef,
      workspacePerms.sources,
      `Workspace source '${materializeRequest?.sourceRef}' denied: not in allowed sources scope`
    );
    checkScope(
      materializeRequest?.basePath,
      workspacePerms.paths,
      `Workspace path '${materializeRequest?.basePath}' denied: not in allowed paths scope`
    );
    checkScope(
      materializeRequest?.namespace,
      workspacePerms.namespaces,
      `Workspace namespace '${materializeRequest?.namespace}' denied: not in allowed namespaces scope`
    );
  }

  if (operation === 'attach') {
    const attachRequest = request as WorkspaceAttachRequest | undefined;
    checkScope(
      attachRequest?.mountPath,
      workspacePerms.paths,
      `Workspace path '${attachRequest?.mountPath}' denied: not in allowed paths scope`
    );
  }
}

/**
 * Create plugin WorkspaceAPI backed by runtime WorkspaceManager.
 */
export function createWorkspaceAPI(options: CreateWorkspaceAPIOptions): WorkspaceAPI {
  const { permissions, manager } = options;

  return {
    async materialize(request: WorkspaceMaterializeRequest): Promise<WorkspaceInfo> {
      checkWorkspacePermission(permissions, 'materialize', request);
      return manager.materializeWorkspace(request);
    },

    async attach(request: WorkspaceAttachRequest): Promise<WorkspaceAttachmentInfo> {
      checkWorkspacePermission(permissions, 'attach', request);
      return manager.attachWorkspace(request);
    },

    async release(workspaceId: string, environmentId?: string): Promise<void> {
      checkWorkspacePermission(permissions, 'release');
      await manager.releaseWorkspace(workspaceId, environmentId);
    },

    async status(workspaceId: string): Promise<WorkspaceStatusInfo> {
      checkWorkspacePermission(permissions, 'read');
      return manager.getWorkspaceStatus(workspaceId);
    },
  };
}

/**
 * Create noop WorkspaceAPI (when workspace manager is not available).
 */
export function createNoopWorkspaceAPI(): WorkspaceAPI {
  const notAvailable = async (): Promise<never> => {
    throw new Error('Workspace manager not available in this context');
  };

  return {
    materialize: notAvailable,
    attach: notAvailable,
    release: notAvailable,
    status: notAvailable,
  };
}
