/**
 * Snapshot API implementation.
 *
 * Adapter from plugin-facing SnapshotAPI to runtime SnapshotManager.
 */

import type {
  SnapshotAPI,
  SnapshotCaptureRequest,
  SnapshotInfo,
  SnapshotRestoreRequest,
  SnapshotRestoreInfo,
  SnapshotStatusInfo,
  SnapshotGarbageCollectRequest,
  SnapshotGarbageCollectInfo,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';

interface SnapshotManagerClient {
  captureSnapshot(request: SnapshotCaptureRequest): Promise<SnapshotInfo>;
  restoreSnapshot(request: SnapshotRestoreRequest): Promise<SnapshotRestoreInfo>;
  getSnapshotStatus(snapshotId: string): Promise<SnapshotStatusInfo>;
  deleteSnapshot(snapshotId: string): Promise<void>;
  garbageCollectSnapshots(request?: SnapshotGarbageCollectRequest): Promise<SnapshotGarbageCollectInfo>;
}

export interface CreateSnapshotAPIOptions {
  permissions?: PermissionSpec;
  manager: SnapshotManagerClient;
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

function checkNamespaceScope(
  namespace: string | undefined,
  patterns: string[] | undefined,
  deniedMessage: string
): void {
  if (!namespace || !patterns?.length) {
    return;
  }
  const allowed = patterns.some(pattern => matchesPattern(namespace, pattern));
  if (!allowed) {
    throw new Error(deniedMessage);
  }
}

function checkSnapshotPermission(
  permissions: PermissionSpec | undefined,
  operation: 'capture' | 'restore' | 'delete' | 'read' | 'garbageCollect',
  request?: SnapshotCaptureRequest | SnapshotGarbageCollectRequest
): void {
  const snapshotPerms = permissions?.platform?.snapshot;

  if (snapshotPerms === false || snapshotPerms === undefined) {
    throw new Error('Snapshot access denied: missing platform.snapshot permission');
  }

  if (snapshotPerms === true) {
    return;
  }

  if (!snapshotPerms[operation]) {
    throw new Error(
      `Snapshot operation '${operation}' denied: missing platform.snapshot.${operation} permission`
    );
  }

  if (operation === 'capture' || operation === 'garbageCollect') {
    const scopedRequest = request as SnapshotCaptureRequest | SnapshotGarbageCollectRequest | undefined;
    checkNamespaceScope(
      scopedRequest?.namespace,
      snapshotPerms.namespaces,
      `Snapshot namespace '${scopedRequest?.namespace}' denied: not in allowed namespaces scope`
    );
  }
}

/**
 * Create plugin SnapshotAPI backed by runtime SnapshotManager.
 */
export function createSnapshotAPI(options: CreateSnapshotAPIOptions): SnapshotAPI {
  const { permissions, manager } = options;

  return {
    async capture(request: SnapshotCaptureRequest): Promise<SnapshotInfo> {
      checkSnapshotPermission(permissions, 'capture', request);
      return manager.captureSnapshot(request);
    },

    async restore(request: SnapshotRestoreRequest): Promise<SnapshotRestoreInfo> {
      checkSnapshotPermission(permissions, 'restore');
      return manager.restoreSnapshot(request);
    },

    async status(snapshotId: string): Promise<SnapshotStatusInfo> {
      checkSnapshotPermission(permissions, 'read');
      return manager.getSnapshotStatus(snapshotId);
    },

    async delete(snapshotId: string): Promise<void> {
      checkSnapshotPermission(permissions, 'delete');
      await manager.deleteSnapshot(snapshotId);
    },

    async gc(request: SnapshotGarbageCollectRequest = {}): Promise<SnapshotGarbageCollectInfo> {
      checkSnapshotPermission(permissions, 'garbageCollect', request);
      return manager.garbageCollectSnapshots(request);
    },
  };
}

/**
 * Create noop SnapshotAPI (when snapshot manager is not available).
 */
export function createNoopSnapshotAPI(): SnapshotAPI {
  const notAvailable = async (): Promise<never> => {
    throw new Error('Snapshot manager not available in this context');
  };

  return {
    capture: notAvailable,
    restore: notAvailable,
    status: notAvailable,
    delete: notAvailable,
    gc: notAvailable,
  };
}
