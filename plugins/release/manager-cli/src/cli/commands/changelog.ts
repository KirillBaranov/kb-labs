/**
 * Release changelog command — thin adapter over planRelease + createChangelogGenerator.
 */

import { join } from 'node:path';
import { stat, writeFile, mkdir, readFile } from 'node:fs/promises';
import { defineCommand, type CLIInput, type PluginContextV3, useLLM, useLoader, displayArtifacts, type ArtifactInfo, useConfig } from '@kb-labs/sdk';
import { planRelease, type ReleaseConfig } from '@kb-labs/release-manager-core';
import { findRepoRoot } from '../../shared/utils';
import { createChangelogGenerator } from '../../shared/changelog-factory';

interface ChangelogFlags {
  scope?: string;
  from?: string;
  to?: string;
  'since-tag'?: string;
  format?: 'json' | 'md' | 'both';
  level?: 'compact' | 'standard' | 'detailed';
  template?: string;
  'breaking-only'?: boolean;
  json?: boolean;
}

interface ReleaseChangelogResult {
  exitCode: number;
  artifacts?: Array<{ name: string; path: string; size: number }>;
}

export default defineCommand({
  id: 'release:changelog',
  description: 'Generate changelog from conventional commits',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ChangelogFlags>): Promise<ReleaseChangelogResult> {
      const { flags } = input;
      const cwd = ctx.cwd || process.cwd();
      const repoRoot = await findRepoRoot(cwd);

      // 1. Load config + discover packages
      const loader = useLoader('Loading configuration...');
      loader.start();

      const fileConfig = await useConfig<ReleaseConfig>();
      const config: ReleaseConfig = fileConfig ?? {};

      loader.update({ text: 'Discovering packages...' });

      const plan = await planRelease({ cwd: repoRoot, config, scope: flags.scope });

      if (plan.packages.length === 0) {
        loader.fail(`No packages found matching scope: ${flags.scope || 'all'}`);
        return { exitCode: 1 };
      }

      // 2. Determine git working directory (for submodule support)
      let gitCwd = repoRoot;
      if (flags.scope && plan.packages[0]) {
        try {
          gitCwd = await findRepoRoot(plan.packages[0].path);
        } catch {
          gitCwd = plan.packages[0].path;
        }
      }

      // 3. Generate changelog via shared factory
      loader.update({ text: 'Generating changelog...' });

      const llm = useLLM();
      const generator = createChangelogGenerator(config, llm ?? undefined);
      const markdown = await generator.generate(plan, { repoRoot, gitCwd, config });

      const format = flags.format || config.changelog?.format || 'both';

      // 4. Save artifacts
      loader.update({ text: 'Saving artifacts...' });

      const outputDir = join(repoRoot, '.kb', 'release');
      const artifacts: ArtifactInfo[] = [];

      if (!flags.json) {
        await mkdir(outputDir, { recursive: true });

        if (markdown && (format === 'md' || format === 'both')) {
          const changelogPath = join(outputDir, 'CHANGELOG.md');

          // Read existing and prepend new content (newest first)
          let existing = '';
          try {
            existing = await readFile(changelogPath, 'utf-8');
            const footerStart = existing.indexOf('\n---\n\n*Generated automatically');
            if (footerStart !== -1) {
              existing = existing.substring(0, footerStart);
            }
          } catch { /* file doesn't exist yet */ }

          const combined = existing ? `${markdown}\n\n${existing}` : markdown;
          await writeFile(changelogPath, combined, 'utf-8');

          const stats = await stat(changelogPath);
          artifacts.push({
            name: 'Changelog',
            path: changelogPath,
            size: stats.size,
            modified: stats.mtime,
            description: 'Generated changelog in Markdown format',
          });
        }
      }

      loader.succeed('Changelog generated successfully');

      // 5. Output
      if (flags.json) {
        ctx.ui?.json?.({
          packagesCount: plan.packages.length,
          markdown: format === 'md' || format === 'both' ? markdown : undefined,
          artifacts: artifacts.map(a => ({ name: a.name, path: a.path, size: a.size ?? 0 })),
        });
      } else {
        const sections: Array<{ header?: string; items: string[] }> = [];

        sections.push({
          header: 'Summary',
          items: [
            `Packages: ${plan.packages.map(p => p.name).join(', ')}`,
            `Format: ${format === 'both' ? 'Markdown + JSON' : format}`,
          ],
        });

        if (artifacts.length > 0) {
          const artifactsLines = displayArtifacts(artifacts, {
            showSize: true,
            showTime: true,
            showDescription: true,
            maxItems: 10,
            title: '',
          });
          sections.push({ header: 'Artifacts', items: artifactsLines });
        }

        ctx.ui.sideBox({
          title: 'Changelog Generated',
          sections,
          status: 'success',
        });
      }

      return {
        exitCode: 0,
        artifacts: artifacts.map(a => ({ name: a.name, path: a.path, size: a.size ?? 0 })),
      };
    },
  },
});
