/**
 * Mind init command (V3)
 *
 * V3 Migration:
 * - Default export with defineCommand
 * - handler: { execute(ctx, input) }
 * - NO permissions (inherited from manifest)
 * - ctx.ui, ctx.logger, ctx.state (flat structure)
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { initMindStructure } from '@kb-labs/mind-indexer';
import { join } from 'node:path';
import { promises as fsp } from 'node:fs';

interface InitInput {
  argv: string[];
  flags: {
    cwd?: string;
    force?: boolean;
    json?: boolean;
    verbose?: boolean;
    quiet?: boolean;
  };
}

interface InitResult {
  exitCode: number;
  mindDir?: string;
  artifacts?: Array<{
    name: string;
    path: string;
    size: number;
    modified: Date;
    description: string;
  }>;
}

// V3: Default export - REQUIRED
export default defineCommand({
  id: 'mind:init',
  description: 'Initialize mind workspace',

  // ❌ NO permissions here - they are in manifest.v3.ts!
  // Permissions are manifest-wide in V3

  handler: {
    async execute(ctx: PluginContextV3, input: InitInput): Promise<InitResult> {
      const startTime = Date.now();
      const { flags } = input;

      const cwd = flags.cwd || ctx.cwd;

      // V3 API: Use trace for logging (logger not yet in runtime)
      ctx.trace?.addEvent?.('mind.init.start', {
        cwd,
        command: 'mind:init',
        force: flags.force,
      });

      ctx.trace?.addEvent?.('mind.init.initializing', { cwd, force: flags.force });

      // Initialize Mind structure
      const mindDir = await initMindStructure({
        cwd,
        force: flags.force,
        log: (entry: any) => {
          if (!flags.quiet && !flags.json) {
            // V3 API: ctx.ui (not ctx.output.ui)
            ctx.ui.info(`Init: ${entry.msg || entry}`);
          }
          ctx.trace?.addEvent?.('mind.init.step', { msg: entry.msg || entry });
        },
      });

      ctx.trace?.addEvent?.('mind.init.complete', {
        mindDir,
        cwd,
      });

      // Discover created artifacts
      const artifacts: InitResult['artifacts'] = [];

      const artifactPatterns = [
        { name: 'Index', pattern: 'index.json', description: 'Main Mind index' },
        { name: 'API Index', pattern: 'api-index.json', description: 'API index' },
        { name: 'Dependencies', pattern: 'deps.json', description: 'Dependencies graph' },
        { name: 'Recent Diff', pattern: 'recent-diff.json', description: 'Recent changes diff' },
      ];

      for (const { name, pattern, description } of artifactPatterns) {
        const artifactPath = join(mindDir, pattern);
        try {
          const stats = await fsp.stat(artifactPath);
          artifacts.push({
            name,
            path: artifactPath,
            size: stats.size,
            modified: stats.mtime,
            description,
          });
        } catch {
          // Artifact doesn't exist, skip
        }
      }

      ctx.trace?.addEvent?.('mind.init.artifacts', {
        mindDir,
        artifactsCount: artifacts.length,
      });

      const timing = Date.now() - startTime;

      // Output result
      if (flags.json) {
        // V3 API: Write JSON to stdout directly
        ctx.ui.info(JSON.stringify({
          ok: true,
          summary: {
            Workspace: mindDir,
            Status: 'Initialized',
          },
          artifacts,
          timingMs: timing,
          data: {
            mindDir,
            cwd,
          },
        }));
      } else if (!flags.quiet) {
        // V3 API: Enhanced UI with MessageOptions
        const artifactItems: string[] = [];
        for (const artifact of artifacts) {
          artifactItems.push(`✓ ${artifact.name}: ${artifact.description}`);
        }

        const sections: Array<{ header?: string; items: string[] }> = [
          {
            header: 'Summary',
            items: [
              `Workspace: ${mindDir}`,
              `Status: Initialized`,
            ],
          },
        ];

        if (artifacts.length > 0) {
          sections.push({
            header: 'Created Artifacts',
            items: artifactItems,
          });
        }

        // V3 API: ctx.ui.success with MessageOptions (enhanced UI)
        ctx.ui.success('Mind workspace initialized', {
          title: 'Mind Init',
          sections,
          timing,
        });
      }

      // V3: Return structured result with exitCode
      return {
        exitCode: 0,
        mindDir,
        artifacts,
      };
    },
  },
});
