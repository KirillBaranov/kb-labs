/**
 * @module @kb-labs/workflow-daemon/cron-discovery
 * CronDiscovery - discovers cron jobs from plugin manifests and user YAML files
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import YAML from 'yaml';
import type { ILogger } from '@kb-labs/core-platform';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import type { CronScheduler } from './cron-scheduler.js';
import {
  PluginCronJobSchema,
  UserCronJobSchema,
} from '@kb-labs/workflow-contracts';

export interface CronDiscoveryOptions {
  cliApi: IEntityRegistry;
  scheduler: CronScheduler;
  logger: ILogger;
  workspaceRoot: string;
}

/**
 * CronDiscovery scans for cron jobs from:
 * 1. Plugin manifests (manifest.cron section)
 * 2. User YAML files (.kb/jobs/*.yml)
 */
export class CronDiscovery {
  private readonly cliApi: IEntityRegistry;
  private readonly scheduler: CronScheduler;
  private readonly logger: ILogger;
  private readonly workspaceRoot: string;

  constructor(options: CronDiscoveryOptions) {
    this.cliApi = options.cliApi;
    this.scheduler = options.scheduler;
    this.logger = options.logger;
    this.workspaceRoot = options.workspaceRoot;
  }

  /**
   * Discover and register all cron jobs.
   * Scans plugin manifests and user YAML files.
   */
  async discoverAll(): Promise<{ plugins: number; users: number }> {
    this.logger.info('Starting cron job discovery');

    const pluginJobs = await this.discoverPluginJobs();
    const userJobs = await this.discoverUserJobs();

    this.logger.info('Cron job discovery complete', {
      pluginJobs,
      userJobs,
      total: pluginJobs + userJobs,
    });

    return { plugins: pluginJobs, users: userJobs };
  }

  /**
   * Discover cron jobs from plugin manifests via entity registry.
   * Uses queryEntities({ kind: 'cron' }) — no manual manifest scanning.
   */
  private async discoverPluginJobs(): Promise<number> {
    let count = 0;

    try {
      const cronEntities = this.cliApi.queryEntities({ kind: 'cron' });

      for (const entity of cronEntities) {
        try {
          const validated = PluginCronJobSchema.parse(entity.declaration);
          this.scheduler.registerPluginJob(entity.ref.pluginId, validated);
          count++;
        } catch (error) {
          this.logger.warn('Invalid plugin cron job definition', {
            pluginId: entity.ref.pluginId,
            entityId: entity.ref.entityId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (cronEntities.length > 0) {
        this.logger.debug('Discovered plugin cron jobs via registry', {
          total: cronEntities.length,
          registered: count,
        });
      }
    } catch (error) {
      this.logger.error(
        'Failed to discover plugin cron jobs',
        error instanceof Error ? error : undefined
      );
    }

    return count;
  }

  /**
   * Discover cron jobs from user YAML files in .kb/jobs/*.yml
   */
  private async discoverUserJobs(): Promise<number> {
    let count = 0;
    const jobsDir = join(this.workspaceRoot, '.kb', 'jobs');

    try {
      // Check if directory exists
      const dirStat = await stat(jobsDir).catch(() => null);
      if (!dirStat?.isDirectory()) {
        this.logger.debug('User jobs directory does not exist', { jobsDir });
        return 0;
      }

      // Read all files in directory
      const files = await readdir(jobsDir);

      // Filter YAML files
      const yamlFiles = files.filter((file) => {
        const ext = extname(file);
        return ext === '.yml' || ext === '.yaml';
      });

      // Process all YAML files in parallel
      const results = await Promise.allSettled(
        yamlFiles.map(async (file) => {
          const filePath = join(jobsDir, file);
          const ext = extname(file);

          const content = await readFile(filePath, 'utf-8');
          const parsed = YAML.parse(content);

          // Validate against UserCronJobSchema
          const validated = UserCronJobSchema.parse(parsed);

          // Only register if autoStart is true
          if (validated.autoStart) {
            const fileName = basename(file, ext);
            this.scheduler.registerUserJob(fileName, validated);
            return 1;
          } else {
            this.logger.debug('Skipping user cron job (autoStart: false)', {
              file,
            });
            return 0;
          }
        })
      );

      // Sum up counts from successful results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          count += result.value;
        } else {
          this.logger.warn('Failed to parse user cron job file', {
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to discover user cron jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return count;
  }
}
