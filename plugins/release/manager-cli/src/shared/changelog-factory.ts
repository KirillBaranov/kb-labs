/**
 * Shared changelog generator factory.
 * Used by both CLI (run.ts) and REST (run-handler.ts) to avoid duplication.
 */

import {
  generateChangelog,
  generateSimpleChangelog,
  type ChangelogPackageInfo,
} from '@kb-labs/release-manager-changelog';
import type { ReleaseConfig, ChangelogGenerator } from '@kb-labs/release-manager-core';

export function createChangelogGenerator(config: ReleaseConfig, llm?: unknown): ChangelogGenerator {
  return {
    async generate(plan, opts) {
      const locale = (config.changelog?.locale as 'en' | 'ru') || 'en';
      const packages: ChangelogPackageInfo[] = plan.packages.map(pkg => ({
        name: pkg.name,
        path: pkg.path,
        currentVersion: pkg.currentVersion,
        nextVersion: pkg.nextVersion,
        bump: pkg.bump === 'auto' ? 'patch' : pkg.bump,
      }));
      try {
        const result = await generateChangelog({
          repoRoot: opts.repoRoot,
          gitCwd: opts.gitCwd,
          packages,
          range: { to: 'HEAD' },
          changelog: {
            template: config.changelog?.template ?? undefined,
            locale,
            metadata: config.changelog?.metadata,
            ignoreAuthors: config.changelog?.ignoreAuthors,
            includeTypes: config.changelog?.includeTypes as string[],
            excludeTypes: config.changelog?.excludeTypes as string[],
            collapseMerges: config.changelog?.collapseMerges,
            collapseReverts: config.changelog?.collapseReverts,
            preferMergeSummary: config.changelog?.preferMergeSummary,
            groups: config.changelog?.groups,
          },
          git: {
            autoUnshallow: config.git?.autoUnshallow,
            requireSignedTags: config.git?.requireSignedTags,
            baseUrl: config.git?.baseUrl ?? undefined,
          },
          platform: llm ? { llm } : undefined,
        });
        return result.markdown;
      } catch {
        return generateSimpleChangelog(packages, locale);
      }
    },
  };
}
