/**
 * quality:dead-code - Detect and optionally remove dead source files
 *
 * Uses reachability analysis: builds import graph, walks from entry points,
 * files not reachable are dead. Zero false positives by design.
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import type { DeadCodeResult, DeadCodeRemovalResult, DeadCodeBackupManifest } from '@kb-labs/quality-contracts';
import { CACHE_KEYS } from '@kb-labs/quality-contracts';
import {
  scanDeadFiles,
  removeDeadFiles,
  restoreFromBackup,
  listBackups,
} from '@kb-labs/quality-core/dead-code';
import type { DeadCodeFlags } from './flags.js';

type DeadCodeInput = DeadCodeFlags & { argv?: string[] };

type DeadCodeCommandResult = {
  exitCode: number;
  result?: DeadCodeResult | DeadCodeRemovalResult | DeadCodeBackupManifest[];
  meta?: Record<string, unknown>;
};

export default defineCommand({
  id: 'quality:dead-code',
  description: 'Detect and optionally remove dead (unreachable) source files',

  handler: {
    async execute(
      ctx: PluginContextV3,
      input: DeadCodeInput,
    ): Promise<DeadCodeCommandResult> {
      const { ui, platform } = ctx;
      const flags = (input as any).flags ?? input;

      // --- Sub-operations ---

      // List backups
      if (flags['list-backups']) {
        const backups = listBackups(ctx.cwd);
        if (flags.json) {
          ui?.json?.(backups);
        } else {
          outputBackupList(backups, ui);
        }
        return { exitCode: 0, result: backups };
      }

      // Restore from backup
      if (flags.restore) {
        try {
          const result = await restoreFromBackup(ctx.cwd, flags.restore);
          if (flags.json) {
            ui?.json?.(result);
          } else {
            ui?.success?.(`Restored ${result.restoredFiles} file(s) from backup ${flags.restore}`, {});
            if (result.restoredExports > 0) {
              ui?.info?.(`Note: ${result.restoredExports} package.json export(s) were cleaned. You may need to rebuild.`);
            }
          }
          return { exitCode: 0 };
        } catch (err: any) {
          if (flags.json) {
            ui?.json?.({ error: err.message });
          } else {
            ui?.error?.(err.message);
          }
          return { exitCode: 1 };
        }
      }

      // --- Main scan flow ---

      // Check cache
      const cacheKey = `${CACHE_KEYS.DEAD_CODE}:${flags.package || 'all'}`;
      if (!flags.refresh && !flags['auto-remove']) {
        const cached = await platform.cache.get<DeadCodeResult>(cacheKey);
        if (cached) {
          outputDeadCodeReport({ ...cached, cached: true }, flags, ui);
          return { exitCode: cached.summary.totalDead > 0 ? 1 : 0, result: cached };
        }
      }

      // Run scan
      const result = await scanDeadFiles(ctx.cwd, {
        packageFilter: flags.package,
        verbose: flags.verbose,
      });

      // Cache results for 5 minutes
      await platform.cache.set(cacheKey, result, 5 * 60 * 1000);

      // Track analytics
      await platform.analytics.track('quality:dead-code', {
        totalPackages: result.summary.totalPackages,
        totalFiles: result.summary.totalFiles,
        totalDead: result.summary.totalDead,
        totalDeadBytes: result.summary.totalDeadBytes,
        duration: result.duration,
        autoRemove: !!flags['auto-remove'],
        dryRun: !!flags['dry-run'],
      });

      // Auto-remove flow
      if (flags['auto-remove']) {
        if (result.summary.totalDead === 0) {
          if (flags.json) {
            ui?.json?.({ message: 'No dead files found', ...result });
          } else {
            ui?.success?.('No dead files found. Nothing to remove.', {});
          }
          return { exitCode: 0, result };
        }

        const removalResult = await removeDeadFiles(ctx.cwd, result, {
          dryRun: flags['dry-run'],
        });

        if (flags.json) {
          ui?.json?.(removalResult);
        } else {
          outputRemovalReport(removalResult, flags, ui);
        }

        return { exitCode: 0, result: removalResult };
      }

      // Output scan results
      outputDeadCodeReport({ ...result, cached: false }, flags, ui);

      return {
        exitCode: result.summary.totalDead > 0 ? 1 : 0,
        result,
      };
    },
  },
});

// --- Output helpers ---

function outputDeadCodeReport(
  result: DeadCodeResult & { cached?: boolean },
  flags: any,
  ui: any,
): void {
  if (flags.json) {
    ui?.json?.(result);
    return;
  }

  const sections: Array<{ header: string; items: string[] }> = [];

  // Per-package results (only packages with dead files)
  const packagesWithDead = result.packages.filter(p => p.deadFiles.length > 0);

  if (packagesWithDead.length > 0) {
    const items: string[] = [];
    for (const pkg of packagesWithDead) {
      items.push(`${pkg.packageName} (${pkg.deadFiles.length} dead file${pkg.deadFiles.length === 1 ? '' : 's'})`);
      for (const dead of pkg.deadFiles.slice(0, 5)) {
        const sizeKb = (dead.sizeBytes / 1024).toFixed(1);
        items.push(`  ${dead.relativePath} (${sizeKb} KB)`);
      }
      if (pkg.deadFiles.length > 5) {
        items.push(`  ... and ${pkg.deadFiles.length - 5} more`);
      }
    }
    sections.push({ header: 'Dead Files', items });
  }

  // Verbose: show entry points
  if (flags.verbose) {
    for (const pkg of result.packages) {
      if (pkg.entryPoints.length > 0) {
        const items = pkg.entryPoints.slice(0, 10).map(ep => `  ${ep}`);
        if (pkg.entryPoints.length > 10) {
          items.push(`  ... and ${pkg.entryPoints.length - 10} more`);
        }
        sections.push({ header: `Entry Points: ${pkg.packageName}`, items });
      }
    }
  }

  // Warnings
  const allWarnings = result.packages.flatMap(p => p.warnings);
  if (allWarnings.length > 0) {
    sections.push({
      header: 'Warnings',
      items: allWarnings.slice(0, 10),
    });
  }

  // Summary
  const totalDeadKb = (result.summary.totalDeadBytes / 1024).toFixed(1);
  const summaryItems = [
    `Packages scanned: ${result.summary.totalPackages}`,
    `Total source files: ${result.summary.totalFiles}`,
    `Alive files: ${result.summary.totalAlive}`,
    `Dead files: ${result.summary.totalDead}`,
    result.summary.totalDead > 0 ? `Dead code size: ${totalDeadKb} KB` : null,
    result.summary.emptyDirectories.length > 0
      ? `Empty directories: ${result.summary.emptyDirectories.length}`
      : null,
    `Duration: ${(result.duration / 1000).toFixed(1)}s`,
    result.cached ? '(cached — use --refresh to rescan)' : null,
  ].filter(Boolean) as string[];
  sections.push({ header: 'Summary', items: summaryItems });

  // Recommendations
  if (result.summary.totalDead > 0) {
    sections.push({
      header: 'Next Steps',
      items: [
        'Run with --auto-remove --dry-run to preview removal',
        'Run with --auto-remove to remove and create backup',
        'Run with --verbose to see entry points',
      ],
    });
  }

  const title =
    result.summary.totalDead === 0
      ? 'No dead files found'
      : `${result.summary.totalDead} dead file(s) found`;

  ui?.success?.('Dead code analysis completed', { title, sections });
}

function outputRemovalReport(
  result: DeadCodeRemovalResult,
  flags: any,
  ui: any,
): void {
  const isDryRun = flags['dry-run'];
  const prefix = isDryRun ? '[DRY RUN] Would' : 'Successfully';

  const sections: Array<{ header: string; items: string[] }> = [];

  const items = [
    `${prefix} remove ${result.filesRemoved} file(s)`,
    `${prefix} free ${(result.bytesRemoved / 1024).toFixed(1)} KB`,
  ];

  if (result.emptyDirsRemoved > 0) {
    items.push(`${prefix} remove ${result.emptyDirsRemoved} empty director${result.emptyDirsRemoved === 1 ? 'y' : 'ies'}`);
  }
  if (result.exportsCleanedUp > 0) {
    items.push(`${prefix} clean ${result.exportsCleanedUp} package.json export(s)`);
  }

  sections.push({ header: isDryRun ? 'Preview' : 'Removal Complete', items });

  if (!isDryRun) {
    sections.push({
      header: 'Backup',
      items: [
        `Backup ID: ${result.backupId}`,
        `To restore: pnpm kb quality:dead-code --restore ${result.backupId}`,
      ],
    });
  }

  // Show removed files
  const fileItems: string[] = [];
  for (const file of result.manifest.removedFiles.slice(0, 10)) {
    const sizeKb = (file.sizeBytes / 1024).toFixed(1);
    fileItems.push(`${file.backupPath} (${sizeKb} KB)`);
  }
  if (result.manifest.removedFiles.length > 10) {
    fileItems.push(`... and ${result.manifest.removedFiles.length - 10} more`);
  }
  sections.push({ header: 'Files', items: fileItems });

  const title = isDryRun
    ? `[DRY RUN] Would remove ${result.filesRemoved} file(s)`
    : `Removed ${result.filesRemoved} file(s)`;

  ui?.success?.(title, { title, sections });
}

function outputBackupList(
  backups: DeadCodeBackupManifest[],
  ui: any,
): void {
  if (backups.length === 0) {
    ui?.info?.('No backups found.');
    return;
  }

  const sections: Array<{ header: string; items: string[] }> = [];

  for (const backup of backups) {
    const date = new Date(backup.createdAt).toLocaleString();
    const items = [
      `Date: ${date}`,
      `Git: ${backup.gitBranch} @ ${backup.gitSha.slice(0, 8)}`,
      `Files: ${backup.totalFilesRemoved}`,
      `Size: ${(backup.totalBytesRemoved / 1024).toFixed(1)} KB`,
      `Restore: pnpm kb quality:dead-code --restore ${backup.id}`,
    ];
    sections.push({ header: `Backup: ${backup.id}`, items });
  }

  ui?.success?.(`${backups.length} backup(s) found`, {
    title: 'Dead Code Backups',
    sections,
  });
}
