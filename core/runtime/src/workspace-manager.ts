/**
 * @module @kb-labs/core-runtime/workspace-manager
 * Runtime manager for workspace providers.
 */

import type {
  IWorkspaceProvider,
  MaterializeWorkspaceRequest,
  WorkspaceDescriptor,
  AttachWorkspaceRequest,
  WorkspaceAttachment,
  WorkspaceStatusResult,
  WorkspaceProviderCapabilities,
} from '@kb-labs/core-platform';
import type { PlatformContainer } from './container.js';

export class WorkspaceManager {
  constructor(
    private readonly platform: Pick<PlatformContainer, 'getAdapter'>
  ) {}

  /**
   * Check whether workspace provider is configured.
   */
  hasProvider(): boolean {
    return !!this.platform.getAdapter<IWorkspaceProvider>('workspace');
  }

  /**
   * Materialize a workspace.
   */
  async materializeWorkspace(
    request: MaterializeWorkspaceRequest
  ): Promise<WorkspaceDescriptor> {
    const provider = this.getProviderOrThrow();
    return provider.materialize(request);
  }

  /**
   * Attach workspace to environment.
   */
  async attachWorkspace(
    request: AttachWorkspaceRequest
  ): Promise<WorkspaceAttachment> {
    const provider = this.getProviderOrThrow();
    return provider.attach(request);
  }

  /**
   * Release workspace attachment.
   */
  async releaseWorkspace(workspaceId: string, environmentId?: string): Promise<void> {
    const provider = this.getProviderOrThrow();
    await provider.release(workspaceId, environmentId);
  }

  /**
   * Get workspace lifecycle status.
   */
  async getWorkspaceStatus(workspaceId: string): Promise<WorkspaceStatusResult> {
    const provider = this.getProviderOrThrow();
    return provider.getStatus(workspaceId);
  }

  /**
   * Read provider capabilities.
   */
  getCapabilities(): WorkspaceProviderCapabilities {
    const provider = this.getProviderOrThrow();
    return provider.getCapabilities?.() ?? {};
  }

  /**
   * Shutdown manager resources (reserved for future internal workers).
   */
  async shutdown(): Promise<void> {
    // No background resources yet.
  }

  private getProviderOrThrow(): IWorkspaceProvider {
    const provider = this.platform.getAdapter<IWorkspaceProvider>('workspace');
    if (!provider) {
      throw new Error(
        'Workspace provider not configured. ' +
        'Configure platform.adapters.workspace with an adapter implementing IWorkspaceProvider.'
      );
    }
    return provider;
  }
}
