import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  IWorkspaceProvider,
  MaterializeWorkspaceRequest,
  WorkspaceDescriptor,
  AttachWorkspaceRequest,
  WorkspaceAttachment,
  WorkspaceStatusResult,
  WorkspaceProviderCapabilities,
  WorkspaceStatus,
} from '@kb-labs/core-platform';

export { manifest } from './manifest.js';

interface WorkspaceContext {
  cwd?: string;
}

export interface WorktreeWorkspaceAdapterConfig {
  worktreeDir?: string;
  branch?: string;
  initSubmodules?: boolean;
  installDeps?: boolean;
  workspace?: WorkspaceContext;
}

interface WorktreeRecord {
  workspaceId: string;
  worktreePath: string;
  branch: string;
  status: WorkspaceStatus;
  createdAt: string;
  runId?: string;
}

const TIMEOUTS = {
  worktree: 30_000,
  submodules: 600_000,
  install: 300_000,
  cleanup: 30_000,
} as const;

export class WorktreeWorkspaceAdapter implements IWorkspaceProvider {
  private readonly repoRoot: string;
  private readonly worktreeBaseDir: string;
  private readonly defaultBranch: string;
  private readonly initSubmodules: boolean;
  private readonly installDeps: boolean;
  private readonly records = new Map<string, WorktreeRecord>();

  constructor(config: WorktreeWorkspaceAdapterConfig = {}) {
    this.repoRoot = path.resolve(config.workspace?.cwd ?? process.cwd());
    this.worktreeBaseDir = path.resolve(this.repoRoot, config.worktreeDir ?? '.worktrees');
    this.defaultBranch = config.branch ?? 'main';
    this.initSubmodules = config.initSubmodules ?? true;
    this.installDeps = config.installDeps ?? true;
  }

  async materialize(request: MaterializeWorkspaceRequest): Promise<WorkspaceDescriptor> {
    const workspaceId = request.workspaceId ?? `wt_${randomUUID().slice(0, 8)}`;
    const branch = request.sourceRef ?? this.defaultBranch;
    const runId = (request.metadata as Record<string, unknown>)?.runId as string | undefined;
    const onProgress = request.onProgress;

    if (!existsSync(this.worktreeBaseDir)) {
      mkdirSync(this.worktreeBaseDir, { recursive: true });
    }

    const worktreePath = path.join(this.worktreeBaseDir, workspaceId);

    // Reuse existing worktree (retry scenario — same run, same workspace)
    if (existsSync(worktreePath)) {
      const existing = this.records.get(workspaceId);
      if (existing) {
        onProgress?.({ stage: 'reuse', message: 'Reusing existing worktree', progress: 100 });
        return {
          workspaceId,
          provider: 'worktree',
          status: 'ready',
          rootPath: worktreePath,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
          metadata: { branch, runId, repoRoot: this.repoRoot, reused: true },
        };
      }
      // Worktree exists on disk but not in records (stale) — reuse anyway
      onProgress?.({ stage: 'reuse', message: 'Reusing existing worktree (recovered)', progress: 100 });
      const now = new Date().toISOString();
      this.records.set(workspaceId, { workspaceId, worktreePath, branch, status: 'ready', createdAt: now, runId });
      return {
        workspaceId,
        provider: 'worktree',
        status: 'ready',
        rootPath: worktreePath,
        createdAt: now,
        updatedAt: now,
        metadata: { branch, runId, repoRoot: this.repoRoot, reused: true },
      };
    }

    const safeBranch = branch.replace(/[^a-zA-Z0-9_\-./]/g, '');
    if (!safeBranch || safeBranch !== branch) {
      throw new Error(`Invalid branch name: ${branch}`);
    }

    const progress = (stage: string, message: string, pct?: number) => {
      onProgress?.({ stage, message, progress: pct });
    };

    try {
      // Stage 1: Create worktree
      progress('worktree', `Creating worktree from ${safeBranch}...`, 10);
      this.exec(
        `git worktree add --detach "${worktreePath}" ${safeBranch}`,
        this.repoRoot,
        TIMEOUTS.worktree,
      );
      progress('worktree', 'Worktree created', 25);

      // Stage 2: Initialize submodules
      if (this.initSubmodules) {
        progress('submodules', 'Initializing submodules...', 30);
        this.exec(
          'git submodule update --recursive',
          worktreePath,
          TIMEOUTS.submodules,
        );
        progress('submodules', 'Submodules ready', 60);
      }

      // Stage 3: Install dependencies
      if (this.installDeps) {
        progress('dependencies', 'Installing dependencies (pnpm install)...', 65);
        this.exec(
          'pnpm install --frozen-lockfile',
          worktreePath,
          TIMEOUTS.install,
        );
        progress('dependencies', 'Dependencies installed', 95);
      }

      progress('ready', 'Workspace ready', 100);

      const record: WorktreeRecord = {
        workspaceId,
        worktreePath,
        branch,
        status: 'ready',
        createdAt: new Date().toISOString(),
        runId,
      };
      this.records.set(workspaceId, record);

      return {
        workspaceId,
        provider: 'worktree',
        status: 'ready',
        rootPath: worktreePath,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
        metadata: { branch, runId, repoRoot: this.repoRoot },
      };
    } catch (error) {
      progress('failed', `Provisioning failed: ${error instanceof Error ? error.message : String(error)}`);

      try {
        this.exec(`git worktree remove "${worktreePath}" --force`, this.repoRoot, TIMEOUTS.cleanup);
      } catch { /* ignore cleanup errors */ }

      throw new Error(
        `Failed to provision workspace: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async attach(_request: AttachWorkspaceRequest): Promise<WorkspaceAttachment> {
    return {
      workspaceId: _request.workspaceId,
      environmentId: _request.environmentId,
      mountPath: this.records.get(_request.workspaceId)?.worktreePath,
      attachedAt: new Date().toISOString(),
    };
  }

  async release(workspaceId: string): Promise<void> {
    const record = this.records.get(workspaceId);
    if (!record) {
      return;
    }

    try {
      this.exec(`git worktree remove "${record.worktreePath}" --force`, this.repoRoot, TIMEOUTS.cleanup);
    } catch {
      if (existsSync(record.worktreePath)) {
        rmSync(record.worktreePath, { recursive: true, force: true });
      }
      try {
        this.exec('git worktree prune', this.repoRoot, TIMEOUTS.cleanup);
      } catch { /* ignore */ }
    }

    record.status = 'released';
    this.records.delete(workspaceId);
  }

  async getStatus(workspaceId: string): Promise<WorkspaceStatusResult> {
    const record = this.records.get(workspaceId);
    if (!record) {
      return { workspaceId, status: 'released', updatedAt: new Date().toISOString() };
    }

    const exists = existsSync(record.worktreePath);
    return {
      workspaceId,
      status: exists ? record.status : 'failed',
      updatedAt: record.createdAt,
    };
  }

  getCapabilities(): WorkspaceProviderCapabilities {
    return {
      supportsAttach: true,
      supportsRelease: true,
    };
  }

  private exec(command: string, cwd: string, timeout = 60_000): string {
    return execSync(command, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
}

/**
 * Adapter factory — called by platform adapter loader.
 */
export function createAdapter(config: WorktreeWorkspaceAdapterConfig = {}): WorktreeWorkspaceAdapter {
  return new WorktreeWorkspaceAdapter(config);
}
