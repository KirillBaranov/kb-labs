import { createRegistry } from '@kb-labs/core-registry';
import { generateExamples } from '../../utils/generate-examples';
import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';

type HealthFlags = {
  json: { type: 'boolean'; description?: string };
};

type HealthSnapshot = {
  status: string;
  version: { kbLabs?: string; cli?: string; rest?: string; git?: { sha: string; dirty?: boolean } };
  registry: { total: number; withRest: number; withStudio: number; errors: number; generatedAt: string; expiresAt?: string; partial?: boolean; stale?: boolean };
  uptimeSec: number;
};

type HealthResult = CommandResult & {
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  snapshot?: HealthSnapshot;
};

export const health = defineSystemCommand<HealthFlags, HealthResult>({
  name: 'health',
  description: 'Report overall CLI health snapshot',
  longDescription: 'Shows the kb.health/1 snapshot shared with REST and Studio.',
  category: 'info',
  // Also accessible as `kb health` (short form without group prefix)
  aliases: ['health'],
  examples: generateExamples('health', 'kb', [
    { flags: {} },
    { flags: { json: true } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'health',
    startEvent: 'HEALTH_STARTED',
    finishEvent: 'HEALTH_FINISHED',
  },
  async handler(ctx, _argv, _flags) {
    const cliApi = await createRegistry({
      cache: { ttlMs: 5000 },
    });

    try {
      ctx.platform?.logger?.info('Health check started');

      const snapshot = await cliApi.getSystemHealth({
        uptimeSec: process.uptime(),
        version: { rest: 'n/a' },
        meta: { source: 'cli' },
      });

      ctx.platform?.logger?.info('Health check completed', { status: snapshot.status });

      return {
        ok: snapshot.status === 'healthy',
        status: snapshot.status === 'healthy' ? 'success' as const : 'warning' as const,
        healthStatus: (snapshot.status as HealthResult['healthStatus']) || 'unhealthy',
        snapshot: snapshot as HealthSnapshot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.platform?.logger?.error('Health check failed', error instanceof Error ? error : undefined, { error: message });

      return {
        ok: false,
        status: 'error' as const,
        healthStatus: 'degraded' as const,
        error: message,
      };
    } finally {
      await cliApi.dispose();
    }
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Complex health status formatting with nested conditions for different health states
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      const jsonOutput = result.snapshot || {
        schema: 'kb.health/1',
        status: result.healthStatus,
        error: result.error,
      };
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      if (result.error) {
        ctx.ui.error('System Health', {
          sections: [
            {
              header: 'Status',
              items: [`Status: ${result.healthStatus}`, `Error: ${result.error}`],
            },
          ],
        });
      } else if (result.snapshot) {
        const snapshot = result.snapshot;
        const gitInfo = snapshot.version.git
          ? `${snapshot.version.git.sha}${snapshot.version.git.dirty ? ' (dirty)' : ''}`
          : 'n/a';

        const sections = [
          {
            header: 'Status',
            items: [
              `Status: ${result.healthStatus}`,
              `KB Labs: ${snapshot.version.kbLabs}`,
              `CLI: ${process.env.CLI_VERSION ?? (ctx as any)?.cliVersion ?? '0.0.0'}`,
              `REST: ${snapshot.version.rest}`,
              `Git: ${gitInfo}`,
            ],
          },
          {
            header: 'Registry',
            items: [
              `Plugins: ${snapshot.registry.total} total (rest ${snapshot.registry.withRest}, studio ${snapshot.registry.withStudio})`,
              `Errors: ${snapshot.registry.errors}`,
              `Generated: ${snapshot.registry.generatedAt}`,
              `Expires: ${snapshot.registry.expiresAt ?? 'n/a'}`,
              `Partial: ${snapshot.registry.partial ? 'yes' : 'no'}`,
              `Stale: ${snapshot.registry.stale ? 'yes' : 'no'}`,
            ],
          },
          {
            header: 'System',
            items: [`Uptime: ${snapshot.uptimeSec}s`],
          },
        ];

        if (result.healthStatus === 'healthy') {
          ctx.ui.success('System Health', { sections });
        } else {
          ctx.ui.warn('System Health', { sections });
        }
      }
    }
  },
});

