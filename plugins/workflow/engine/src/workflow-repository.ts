/**
 * @module @kb-labs/workflow-engine/workflow-repository
 *
 * Repository for standalone workflow definitions.
 *
 * ## Features
 * - CRUD operations for user-created workflows
 * - File-based storage via platform.storage (`.kb/workflows/*.yaml`)
 * - Validation using WorkflowSpecSchema
 * - Conversion to unified WorkflowRuntime format
 *
 * ## Usage
 * ```typescript
 * const repo = new WorkflowRepository({ platform });
 * const workflow = await repo.create(spec);
 * ```
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { WorkflowSpecSchema } from '@kb-labs/workflow-contracts';
import type { WorkflowSpec } from '@kb-labs/workflow-contracts';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import type {
  WorkflowRuntime,
  WorkflowTrigger,
  WorkflowSchedule,
  WorkflowStats,
} from './manifest-scanner';

/**
 * Stored workflow metadata (what we persist to disk)
 */
interface StoredWorkflow {
  id: string;
  spec: WorkflowSpec;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'paused' | 'disabled';
  stats?: WorkflowStats;
}

/**
 * List options for filtering workflows
 */
export interface WorkflowListOptions {
  status?: 'active' | 'paused' | 'disabled';
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Options for WorkflowRepository
 */
export interface WorkflowRepositoryOptions {
  /** Platform services (for storage, logger, etc.) */
  platform: PlatformServices;

  /** Storage directory for workflows (default: '.kb/workflows') */
  storageDir?: string;

  /** Workspace root directory (default: process.cwd()) */
  workspaceRoot?: string;
}

/**
 * Workflow Repository
 *
 * Manages standalone workflow definitions (user-created via UI/API).
 * Uses platform.storage for persistence.
 */
export class WorkflowRepository {
  private readonly platform: PlatformServices;
  private readonly storageDir: string;
  private readonly workspaceRoot: string;
  private readonly absoluteStorageDir: string;

  constructor(options: WorkflowRepositoryOptions) {
    this.platform = options.platform;
    this.storageDir = options.storageDir ?? '.kb/workflows';
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.absoluteStorageDir = resolve(this.workspaceRoot, this.storageDir);
  }

  /**
   * Create a new standalone workflow.
   */
  async create(spec: WorkflowSpec): Promise<WorkflowRuntime> {
    // Validate spec
    const validated = WorkflowSpecSchema.parse(spec);

    // Generate ID
    const id = `wf-${randomUUID().slice(0, 8)}`;

    const stored: StoredWorkflow = {
      id,
      spec: validated,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
    };

    // Save to storage
    await this.saveWorkflow(id, stored);

    this.platform.logger?.info('WorkflowRepository: Created workflow', {
      id,
      name: spec.name,
    });

    return this.toRuntime(stored);
  }

  /**
   * Get workflow by ID.
   */
  async get(id: string): Promise<WorkflowRuntime | null> {
    const stored = await this.loadWorkflow(id);
    return stored ? this.toRuntime(stored) : null;
  }

  /**
   * List all workflows with optional filtering.
   */
  async list(options?: WorkflowListOptions): Promise<WorkflowRuntime[]> {
    const allFiles = await this.listWorkflowFiles();

    // Load all workflows in parallel
    const allWorkflows = await Promise.all(
      allFiles.map(async filename => {
        const id = filename.replace(/\.(yaml|yml)$/, '');
        const stored = await this.loadWorkflow(id);
        return stored ? this.toRuntime(stored) : null;
      }),
    );

    // Filter out nulls and apply status filter
    const workflows = allWorkflows.filter((workflow): workflow is WorkflowRuntime => {
      if (!workflow) {return false;}
      if (options?.status && workflow.status !== options.status) {return false;}
      return true;
    });

    // Apply pagination
    if (options?.offset !== undefined || options?.limit !== undefined) {
      const start = options.offset ?? 0;
      const end = options.limit ? start + options.limit : undefined;
      return workflows.slice(start, end);
    }

    return workflows;
  }

  /**
   * Update existing workflow.
   */
  async update(id: string, spec: Partial<WorkflowSpec>): Promise<WorkflowRuntime> {
    const stored = await this.loadWorkflow(id);
    if (!stored) {
      throw new Error(`Workflow not found: ${id}`);
    }

    // Merge with existing spec
    const updatedSpec = { ...stored.spec, ...spec };

    // Validate merged spec
    const validated = WorkflowSpecSchema.parse(updatedSpec);

    const updated: StoredWorkflow = {
      ...stored,
      spec: validated,
      updatedAt: new Date().toISOString(),
    };

    await this.saveWorkflow(id, updated);

    this.platform.logger?.info('WorkflowRepository: Updated workflow', {
      id,
      name: validated.name,
    });

    return this.toRuntime(updated);
  }

  /**
   * Delete workflow.
   */
  async delete(id: string): Promise<void> {
    const path = this.getWorkflowPath(id);

    try {
      await this.platform.storage.delete(path);
      this.platform.logger?.info('WorkflowRepository: Deleted workflow', { id });
    } catch (error) {
      this.platform.logger?.error(
        'WorkflowRepository: Delete failed',
        error instanceof Error ? error : undefined,
        { id }
      );
      throw error;
    }
  }

  /**
   * Enable workflow (set status to active).
   */
  async enable(id: string): Promise<void> {
    await this.updateStatus(id, 'active');
  }

  /**
   * Disable workflow.
   */
  async disable(id: string): Promise<void> {
    await this.updateStatus(id, 'disabled');
  }

  /**
   * Pause workflow.
   */
  async pause(id: string): Promise<void> {
    await this.updateStatus(id, 'paused');
  }

  /**
   * Resume workflow (unpause).
   */
  async resume(id: string): Promise<void> {
    await this.updateStatus(id, 'active');
  }

  /**
   * Update workflow statistics.
   */
  async updateStats(id: string, stats: Partial<WorkflowStats>): Promise<void> {
    const stored = await this.loadWorkflow(id);
    if (!stored) {
      throw new Error(`Workflow not found: ${id}`);
    }

    const updated: StoredWorkflow = {
      ...stored,
      stats: { ...stored.stats, ...stats } as WorkflowStats,
      updatedAt: new Date().toISOString(),
    };

    await this.saveWorkflow(id, updated);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private async updateStatus(
    id: string,
    status: 'active' | 'paused' | 'disabled'
  ): Promise<void> {
    const stored = await this.loadWorkflow(id);
    if (!stored) {
      throw new Error(`Workflow not found: ${id}`);
    }

    const updated: StoredWorkflow = {
      ...stored,
      status,
      updatedAt: new Date().toISOString(),
    };

    await this.saveWorkflow(id, updated);
    this.platform.logger?.info('WorkflowRepository: Updated workflow status', {
      id,
      status,
    });
  }

  private getWorkflowPath(id: string): string {
    // Try .yml first, then .yaml
    const ymlPath = join(this.absoluteStorageDir, `${id}.yml`);
    const yamlPath = join(this.absoluteStorageDir, `${id}.yaml`);

    if (existsSync(ymlPath)) {
      return ymlPath;
    }
    return yamlPath; // Default to .yaml for new files
  }

  private async saveWorkflow(id: string, workflow: StoredWorkflow): Promise<void> {
    const path = this.getWorkflowPath(id);
    const yaml = stringifyYaml(workflow, { indent: 2 });

    try {
      // Ensure directory exists
      if (!existsSync(this.absoluteStorageDir)) {
        await mkdir(this.absoluteStorageDir, { recursive: true });
      }

      await writeFile(path, yaml, 'utf-8');
    } catch (error) {
      this.platform.logger?.error(
        'WorkflowRepository: Save failed',
        error instanceof Error ? error : undefined,
        { path }
      );
      throw error;
    }
  }

  private async loadWorkflow(id: string): Promise<StoredWorkflow | null> {
    const path = this.getWorkflowPath(id);

    try {
      if (!existsSync(path)) {
        return null;
      }

      const content = await readFile(path, 'utf-8');
      const parsed = parseYaml(content) as any;

      // Check if it's already in StoredWorkflow format
      if (parsed.id && parsed.spec && parsed.createdAt) {
        return parsed as StoredWorkflow;
      }

      // Otherwise, it's a simple workflow YAML - convert to StoredWorkflow
      const spec: WorkflowSpec = {
        name: parsed.name,
        version: parsed.version || '1.0.0',
        description: parsed.description,
        on: parsed.on || { manual: true },
        isolation: parsed.isolation,
        inputs: parsed.inputs,
        jobs: parsed.jobs,
        env: parsed.env,
        secrets: parsed.secrets,
      };

      const stored: StoredWorkflow = {
        id: parsed.id || id,
        spec,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
      };

      return stored;
    } catch (error) {
      // File not found is expected, other errors should be logged
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return null;
      }

      this.platform.logger?.error(
        'WorkflowRepository: Load failed',
        error instanceof Error ? error : undefined,
        { path }
      );
      return null;
    }
  }

  private async listWorkflowFiles(): Promise<string[]> {
    try {
      // Check if directory exists
      if (!existsSync(this.absoluteStorageDir)) {
        return [];
      }

      // List all .yaml and .yml files in storage directory
      const files = await readdir(this.absoluteStorageDir);
      return files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch (error) {
      // Directory doesn't exist yet - return empty array
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return [];
      }

      this.platform.logger?.error(
        'WorkflowRepository: List failed',
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Convert stored workflow to WorkflowRuntime format.
   */
  private toRuntime(stored: StoredWorkflow): WorkflowRuntime {
    const { id, spec, status, stats } = stored;

    // Convert triggers from spec.on to WorkflowTrigger[]
    const triggers: WorkflowTrigger[] = [];
    if (spec.on.manual) {
      triggers.push({ type: 'manual' });
    }
    if (spec.on.push) {
      triggers.push({ type: 'push' });
    }
    if (spec.on.webhook) {
      triggers.push({
        type: 'webhook',
        config: typeof spec.on.webhook === 'object' ? spec.on.webhook : undefined,
      });
    }

    // Extract schedule if present
    let schedule: WorkflowSchedule | undefined;
    if (spec.on.schedule) {
      triggers.push({
        type: 'schedule',
        config: spec.on.schedule,
      });

      schedule = {
        cron: spec.on.schedule.cron,
        enabled: status === 'active',
      };
    }

    // Extract tags from spec (we can use env vars or description as source)
    const tags: string[] = ['standalone'];
    if (spec.description) {
      // Extract hashtags from description
      const hashtagMatches = spec.description.match(/#\w+/g);
      if (hashtagMatches) {
        tags.push(...hashtagMatches.map((t) => t.slice(1)));
      }
    }

    return {
      id,
      source: 'standalone',
      name: spec.name,
      description: spec.description,
      tags,
      triggers,
      schedule,
      status,
      stats,
      // Store full spec for execution
      input: spec,
      // Expose declared input schema for REST API / Studio UI
      inputSchema: spec.inputs,
    };
  }
}
