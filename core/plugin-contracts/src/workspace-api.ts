/**
 * Workspace API for plugin-controlled workspace lifecycle.
 */

export type WorkspaceStatus =
  | 'pending'
  | 'materializing'
  | 'ready'
  | 'attaching'
  | 'attached'
  | 'releasing'
  | 'released'
  | 'failed';

export interface WorkspaceMountInfo {
  hostPath?: string;
  mountPath?: string;
  readOnly?: boolean;
}

export interface WorkspaceMaterializeRequest {
  workspaceId?: string;
  tenantId?: string;
  namespace?: string;
  sourceRef?: string;
  basePath?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceInfo {
  workspaceId: string;
  provider: string;
  status: WorkspaceStatus;
  rootPath?: string;
  mount?: WorkspaceMountInfo;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceAttachRequest {
  workspaceId: string;
  environmentId: string;
  mountPath?: string;
  readOnly?: boolean;
}

export interface WorkspaceAttachmentInfo {
  workspaceId: string;
  environmentId: string;
  mountPath?: string;
  attachedAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceStatusInfo {
  workspaceId: string;
  status: WorkspaceStatus;
  reason?: string;
  updatedAt: string;
}

export interface WorkspaceAPI {
  materialize(request: WorkspaceMaterializeRequest): Promise<WorkspaceInfo>;
  attach(request: WorkspaceAttachRequest): Promise<WorkspaceAttachmentInfo>;
  release(workspaceId: string, environmentId?: string): Promise<void>;
  status(workspaceId: string): Promise<WorkspaceStatusInfo>;
}
