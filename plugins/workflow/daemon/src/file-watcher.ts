/**
 * @module @kb-labs/workflow-daemon/file-watcher
 * WorkflowFileWatcher - watches .kb/workflows/ and .kb/jobs/ for YAML changes
 * and triggers manifest cache invalidation + cron re-discovery on each change.
 */

import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { access } from 'node:fs/promises';
import type { ILogger } from '@kb-labs/core-platform';
import type { WorkflowService } from '@kb-labs/workflow-engine';
import type { CronDiscovery } from './cron-discovery.js';
import type { CronScheduler } from './cron-scheduler.js';

export interface WorkflowFileWatcherOptions {
  /** Absolute paths to watch (e.g. ['.kb/workflows', '.kb/jobs']). */
  watchDirs: string[];
  workflowService: WorkflowService;
  cronDiscovery: CronDiscovery;
  cronScheduler: CronScheduler;
  logger: ILogger;
  /** Debounce delay in ms before reloading after a file change. Default: 300. */
  debounceMs?: number;
}

/**
 * WorkflowFileWatcher monitors YAML files in the given directories and
 * invalidates the workflow manifest cache + re-discovers cron jobs whenever
 * a .yml / .yaml file is created, modified, or deleted.
 *
 * Debounced 300 ms (configurable) to coalesce rapid save events from editors.
 */
export class WorkflowFileWatcher {
  private readonly watchers: FSWatcher[] = [];
  private readonly workflowService: WorkflowService;
  private readonly cronDiscovery: CronDiscovery;
  private readonly cronScheduler: CronScheduler;
  private readonly logger: ILogger;
  private readonly debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: WorkflowFileWatcherOptions) {
    this.workflowService = options.workflowService;
    this.cronDiscovery = options.cronDiscovery;
    this.cronScheduler = options.cronScheduler;
    this.logger = options.logger;
    this.debounceMs = options.debounceMs ?? 300;

    for (const dir of options.watchDirs) {
      this.startWatcher(dir);
    }
  }

  private startWatcher(dir: string): void {
    // Check directory existence asynchronously; skip silently if missing.
    access(dir).then(() => {
      try {
        const watcher = watch(dir, { persistent: false }, (eventType, filename) => {
          if (!filename) { return; }
          if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) { return; }
          this.scheduleReload(dir, filename);
        });

        watcher.on('error', (err) => {
          this.logger.warn('WorkflowFileWatcher: watcher error', {
            dir,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        this.watchers.push(watcher);
        this.logger.info('WorkflowFileWatcher: watching directory', { dir });
      } catch (err) {
        this.logger.warn('WorkflowFileWatcher: could not start watcher', {
          dir,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }).catch(() => {
      this.logger.debug('WorkflowFileWatcher: directory does not exist, skipping', { dir });
    });
  }

  private scheduleReload(dir: string, filename: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.reload(dir, filename).catch((err) => {
        this.logger.error(
          'WorkflowFileWatcher: reload failed',
          err instanceof Error ? err : undefined,
          { dir, filename },
        );
      });
    }, this.debounceMs);
  }

  private async reload(dir: string, filename: string): Promise<void> {
    this.logger.info('WorkflowFileWatcher: YAML change detected, reloading', { dir, filename });

    await this.workflowService.refreshManifests();

    // Re-discover cron jobs: clear user-sourced jobs first to avoid duplicates.
    this.cronScheduler.clearUserJobs();
    const discovered = await this.cronDiscovery.discoverAll();

    this.logger.info('WorkflowFileWatcher: reload complete', {
      filename,
      cronJobs: discovered,
    });
  }

  /** Stop all watchers and cancel any pending debounce timer. */
  close(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    for (const watcher of this.watchers) {
      watcher.close();
    }

    this.watchers.length = 0;
    this.logger.info('WorkflowFileWatcher: stopped');
  }
}
