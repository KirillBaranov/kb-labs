/**
 * @module @kb-labs/adapters-environment-docker
 * Docker CLI adapter implementing IEnvironmentProvider.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import type {
  IEnvironmentProvider,
  CreateEnvironmentRequest,
  ReserveEnvironmentRequest,
  ReservedEnvironment,
  StartEnvironmentRequest,
  EnvironmentDescriptor,
  EnvironmentStatusResult,
  EnvironmentLease,
  EnvironmentProviderCapabilities,
  EnvironmentStatus,
} from '@kb-labs/core-platform';

export { manifest } from './manifest.js';

const execFileAsync = promisify(execFile);

interface WorkspaceContext {
  cwd?: string;
}

export type DockerExec = (args: string[]) => Promise<string>;

/**
 * Gateway coordination config for container runtime.
 * The adapter owns all transport-specific setup — callers know nothing about Gateway.
 */
export interface GatewayConfig {
  /** WebSocket URL the runtime-server connects to, e.g. ws://kb-gateway:4000 */
  wsUrl: string;
  /** JWT secret for signing per-container access tokens */
  jwtSecret: string;
  /** Internal secret for dispatch endpoint */
  dispatchSecret: string;
  /** Dispatch endpoint URL, e.g. http://localhost:4000/internal/dispatch */
  dispatchUrl: string;
}

/**
 * Docker provider configuration.
 */
export interface DockerEnvironmentAdapterConfig {
  dockerBinary?: string;
  defaultImage?: string;
  network?: string;
  autoRemove?: boolean;
  defaultTtlMs?: number;
  mountWorkspace?: boolean;
  workspaceMountPath?: string;
  workspace?: WorkspaceContext;
  /**
   * Optional command executor override (primarily for tests).
   * Receives argv for docker binary and must resolve stdout.
   */
  execDocker?: DockerExec;
  /**
   * Command to run inside the container to start the runtime server.
   * E.g. ['node', '/app/dist/cli.cjs']
   */
  runtimeCommand?: string[];
  /**
   * Extra host mappings passed as --add-host flags.
   * E.g. ['host.docker.internal:host-gateway'] for Linux dev environments
   * where host.docker.internal is not automatically available.
   */
  extraHosts?: string[];
  /**
   * Gateway coordination config.
   * When present, the adapter mints a JWT per container and injects
   * GATEWAY_WS_URL, RUNTIME_HOST_ID, GATEWAY_TOKEN, GATEWAY_ALLOW_WS into env.
   * Callers never see these details.
   */
  gateway?: GatewayConfig;
}

/**
 * Docker CLI implementation of IEnvironmentProvider.
 */
export class DockerEnvironmentAdapter implements IEnvironmentProvider {
  private readonly dockerBinary: string;
  private readonly defaultImage: string;
  private readonly network?: string;
  private readonly autoRemove: boolean;
  private readonly defaultTtlMs: number;
  private readonly mountWorkspace: boolean;
  private readonly workspaceMountPath: string;
  private readonly workspaceCwd?: string;
  private readonly dockerExec: DockerExec;
  private readonly runtimeCommand?: string[];
  private readonly extraHosts: string[];
  private readonly gateway?: GatewayConfig;

  // reserved environments pending start(): environmentId → reservation metadata
  private readonly reserved = new Map<string, { runId: string; ttlMs: number; createdAt: Date }>();
  // active environments: environmentId → Docker containerId (for getStatus/destroy lookup)
  private readonly active = new Map<string, string>();

  constructor(private readonly config: DockerEnvironmentAdapterConfig = {}) {
    this.dockerBinary = config.dockerBinary ?? 'docker';
    this.defaultImage = config.defaultImage ?? 'node:20-alpine';
    this.network = config.network;
    this.autoRemove = config.autoRemove ?? true;
    this.defaultTtlMs = config.defaultTtlMs ?? 60 * 60 * 1000;
    this.mountWorkspace = config.mountWorkspace ?? true;
    this.workspaceMountPath = config.workspaceMountPath ?? '/workspace';
    this.workspaceCwd = config.workspace?.cwd;
    this.dockerExec = config.execDocker ?? this.defaultExecDocker.bind(this);
    this.runtimeCommand = config.runtimeCommand;
    this.extraHosts = config.extraHosts ?? [];
    this.gateway = config.gateway;
  }

  /**
   * Phase 1: Reserve an environmentId without starting the container.
   * The adapter generates a stable runtimeHostId used as environmentId.
   * When gateway config is present, this id will be used for JWT and RUNTIME_HOST_ID.
   */
  async reserve(request: ReserveEnvironmentRequest): Promise<ReservedEnvironment> {
    const runId = request.runId ?? randomUUID();
    const environmentId = `runtime-${runId}`;
    const ttlMs = request.ttlMs ?? this.defaultTtlMs;

    this.reserved.set(environmentId, { runId, ttlMs, createdAt: new Date() });

    return { environmentId };
  }

  /**
   * Phase 2: Start the container for a previously reserved environmentId.
   * Injects all gateway coordination env vars (JWT, WS URL, etc.) internally.
   */
  async start(environmentId: string, request: StartEnvironmentRequest): Promise<EnvironmentDescriptor> {
    const reservation = this.reserved.get(environmentId);
    if (!reservation) {
      throw new Error(`No reservation found for environmentId: ${environmentId}. Call reserve() first.`);
    }
    this.reserved.delete(environmentId);

    const { runId, ttlMs } = reservation;
    const image = request.image ?? this.defaultImage;
    const containerName = this.buildContainerName(runId);
    const args = ['run', '-d'];

    if (this.autoRemove) {
      args.push('--rm');
    }

    args.push('--name', containerName);
    args.push('--label', `kb.run_id=${runId}`);
    args.push('--label', `kb.environment_id=${environmentId}`);

    if (this.network) {
      args.push('--network', this.network);
    }

    for (const host of this.extraHosts) {
      args.push('--add-host', host);
    }

    // Adapter-owned env vars: gateway coordination
    const namespaceId = (request.metadata?.namespaceId as string | undefined) ?? 'default';
    const gatewayEnv = await this.buildGatewayEnv(environmentId, namespaceId);
    for (const [key, value] of Object.entries(gatewayEnv)) {
      args.push('-e', `${key}=${value}`);
    }

    // Caller-supplied extra env vars (merged after gateway env)
    for (const [key, value] of Object.entries(request.env ?? {})) {
      args.push('-e', `${key}=${value}`);
    }

    const workspacePath = request.workspacePath ?? this.workspaceCwd;
    if (workspacePath && this.mountWorkspace) {
      args.push('-v', `${workspacePath}:${this.workspaceMountPath}`);
      args.push('-w', this.workspaceMountPath);
    }

    args.push(image);

    const command = this.runtimeCommand;
    if (command && command.length > 0) {
      args.push(...command);
    }

    const containerId = (await this.execDocker(args)).trim();

    // Register containerId for getStatus/destroy lookup by environmentId
    this.active.set(environmentId, containerId);

    const now = new Date();
    const lease = this.buildLease(now, ttlMs, runId);

    return {
      environmentId,
      provider: 'docker-cli',
      status: 'ready',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lease,
      metadata: {
        image,
        containerName,
        containerId,
      },
    };
  }

  /**
   * Single-phase create (legacy / simple use cases without gateway).
   */
  async create(request: CreateEnvironmentRequest): Promise<EnvironmentDescriptor> {
    const image = request.image ?? this.defaultImage;
    const ttlMs = request.ttlMs ?? this.defaultTtlMs;
    const runId = request.runId ?? 'run';

    const containerName = this.buildContainerName(runId);
    const args = ['run', '-d'];

    if (this.autoRemove) {
      args.push('--rm');
    }

    args.push('--name', containerName);
    args.push('--label', `kb.run_id=${runId}`);
    if (request.templateId) {
      args.push('--label', `kb.template_id=${request.templateId}`);
    }

    if (this.network) {
      args.push('--network', this.network);
    }

    for (const host of this.extraHosts) {
      args.push('--add-host', host);
    }

    for (const [key, value] of Object.entries(request.env ?? {})) {
      args.push('-e', `${key}=${value}`);
    }

    const workspacePath = request.workspacePath ?? this.workspaceCwd;
    if (workspacePath && this.mountWorkspace) {
      args.push('-v', `${workspacePath}:${this.workspaceMountPath}`);
      args.push('-w', this.workspaceMountPath);
    }

    args.push(image);

    if (request.command && request.command.length > 0) {
      args.push(...request.command);
    } else if (this.runtimeCommand && this.runtimeCommand.length > 0) {
      args.push(...this.runtimeCommand);
    }

    const containerId = (await this.execDocker(args)).trim();

    const now = new Date();
    const lease = this.buildLease(now, ttlMs, runId);

    return {
      environmentId: containerId,
      provider: 'docker-cli',
      status: 'ready',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lease,
      metadata: {
        image,
        containerName,
        templateId: request.templateId,
      },
    };
  }

  async getStatus(environmentId: string): Promise<EnvironmentStatusResult> {
    const now = new Date().toISOString();
    // Resolve logical environmentId → actual Docker container ID (from start())
    const dockerRef = this.active.get(environmentId) ?? environmentId;

    try {
      const state = (await this.execDocker([
        'inspect',
        '-f',
        '{{.State.Status}}',
        dockerRef,
      ])).trim();

      return {
        environmentId,
        status: this.mapDockerStateToStatus(state),
        updatedAt: now,
        reason: state,
      };
    } catch (error) {
      if (this.isMissingContainerError(error)) {
        return {
          environmentId,
          status: 'terminated',
          updatedAt: now,
          reason: 'container_not_found',
        };
      }
      throw error;
    }
  }

  async destroy(environmentId: string): Promise<void> {
    // Clean up any pending reservation
    this.reserved.delete(environmentId);
    // Resolve logical environmentId → actual Docker container ID (from start())
    const dockerRef = this.active.get(environmentId) ?? environmentId;
    this.active.delete(environmentId);

    try {
      await this.execDocker(['rm', '-f', dockerRef]);
    } catch (error) {
      if (this.isMissingContainerError(error)) {
        return;
      }
      throw error;
    }
  }

  async renewLease(environmentId: string, ttlMs: number): Promise<EnvironmentLease> {
    const now = new Date();
    return this.buildLease(now, ttlMs, environmentId);
  }

  getCapabilities(): EnvironmentProviderCapabilities {
    return {
      supportsLeaseRenewal: true,
      supportsExecProbe: false,
      supportsLogs: false,
      supportsSnapshots: false,
      custom: {
        provider: 'docker-cli',
        supportsTwoPhaseProvisioning: true,
      },
    };
  }

  /**
   * Build gateway coordination env vars for a container.
   * Mints a short-lived JWT using the environmentId as hostId.
   * Returns empty object when gateway is not configured.
   */
  private async buildGatewayEnv(environmentId: string, namespaceId: string): Promise<Record<string, string>> {
    if (!this.gateway) {
      return {};
    }

    const { signAccessToken } = await import('@kb-labs/gateway-auth');
    const { token } = await signAccessToken(
      { hostId: environmentId, namespaceId, type: 'machine' as const, tier: 'free' as const },
      { secret: this.gateway.jwtSecret },
    );

    return {
      GATEWAY_WS_URL: this.gateway.wsUrl,
      RUNTIME_HOST_ID: environmentId,
      GATEWAY_TOKEN: token,
      // Allow ws:// on Docker bridge networks (trusted, orchestrated network)
      GATEWAY_ALLOW_WS: '1',
    };
  }

  private async execDocker(args: string[]): Promise<string> {
    return this.dockerExec(args);
  }

  private async defaultExecDocker(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.dockerBinary, args, {
        encoding: 'utf8',
      });
      return stdout;
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(`Docker command failed: ${this.dockerBinary} ${args.join(' ')} :: ${details}`);
    }
  }

  private buildLease(now: Date, ttlMs: number, owner?: string): EnvironmentLease {
    return {
      leaseId: randomUUID(),
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      owner,
    };
  }

  private buildContainerName(runId: string): string {
    const normalizedRunId = runId.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32);
    const entropy = randomUUID().slice(0, 8);
    return `kb-env-${normalizedRunId}-${Date.now().toString(36)}-${entropy}`;
  }

  private mapDockerStateToStatus(state: string): EnvironmentStatus {
    switch (state) {
      case 'running':
        return 'ready';
      case 'created':
      case 'restarting':
      case 'paused':
        return 'provisioning';
      case 'exited':
      case 'dead':
        return 'terminated';
      default:
        return 'degraded';
    }
  }

  private isMissingContainerError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes('no such container') ||
      message.includes('no such object') ||
      message.includes('container not found')
    );
  }
}

/**
 * Create Docker environment adapter.
 */
export function createAdapter(config?: DockerEnvironmentAdapterConfig): DockerEnvironmentAdapter {
  return new DockerEnvironmentAdapter(config);
}

export default createAdapter;
