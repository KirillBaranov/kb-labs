/**
 * diag command - Unified diagnostics command combining all system checks
 */

import { defineSystemCommand } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples';
import { registry } from '../../registry/service';
import { discoverManifests } from '../../registry/discover';
import { readMarketplaceLock, DiagnosticCollector } from '@kb-labs/core-discovery';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd, safeColors, safeSymbols } from '@kb-labs/shared-cli-ui';

type DiagDetails = {
  category: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
};

type DiagSummary = {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
};

type DiagResult = {
  ok: boolean;
  diagnostics: DiagDetails[];
  summary: DiagSummary;
};

type DiagFlags = {
  json: { type: 'boolean'; description?: string };
};

export const diag = defineSystemCommand<DiagFlags, DiagResult>({
  name: 'diag',
  description: 'Comprehensive system diagnostics (plugins, cache, environment, versions)',
  category: 'info',
  examples: generateExamples('diag', 'kb', [
    { flags: {} },
    { flags: { json: true } },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'diag',
    startEvent: 'DIAG_STARTED',
    finishEvent: 'DIAG_FINISHED',
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Comprehensive diagnostic checks across multiple system components
  async handler(ctx, _argv, _flags) {
    const cwd = getContextCwd(ctx);
    const diagnostics: Array<{
      category: string;
      status: 'ok' | 'warning' | 'error';
      message: string;
      details?: Record<string, unknown>;
    }> = [];

    // 1. Environment check
    const nodeVersion = process.version;
    const cliVersion = process.env.CLI_VERSION || process.env.CLI_VERSION || '0.1.0';
    const platform = process.platform;
    const arch = process.arch;

    diagnostics.push({
      category: 'environment',
      status: 'ok',
      message: `Node ${nodeVersion}, CLI ${cliVersion}, ${platform}/${arch}`,
      details: { nodeVersion, cliVersion, platform, arch },
    });

    
    // 2. Plugin discovery check — respect KB_PLATFORM_ROOT so that in
    // installed mode (platform installed separately from project) we scan
    // the platform's node_modules, not the user's project. KB_PROJECT_ROOT
    // anchors project-scope plugin discovery under .kb/plugins/.
    try {
      const platformRoot = process.env.KB_PLATFORM_ROOT;
      const projectRoot = process.env.KB_PROJECT_ROOT;
      const discovered = await discoverManifests(cwd, false, { platformRoot, projectRoot });
      const manifests = registry.listManifests();
      
      const enabled = manifests.filter(m => m.available && !m.shadowed).length;
      const disabled = manifests.filter(m => !m.available).length;
      const shadowed = manifests.filter(m => m.shadowed).length;
      
      diagnostics.push({
        category: 'marketplace',
        status: disabled > 0 ? 'warning' : 'ok',
        message: `Found ${discovered.length} packages, ${enabled} enabled, ${disabled} unavailable, ${shadowed} shadowed`,
        details: {
          packages: discovered.length,
          enabled,
          disabled,
          shadowed,
          totalCommands: manifests.length,
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        category: 'marketplace',
        status: 'error',
        message: `Discovery failed: ${errMsg}`,
        details: { error: errMsg },
      });
    }

    // 3. Cache check
    try {
      const cachePath = path.join(cwd, '.kb', 'cache', 'cli-manifests.json');
      const cacheExists = await fs.access(cachePath).then(() => true).catch(() => false);
      
      if (cacheExists) {
        const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
        const age = Date.now() - (cache.timestamp || 0);
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        
        diagnostics.push({
          category: 'cache',
          status: 'ok',
          message: `Cache exists, ${ageHours}h old, ${Object.keys(cache.packages || {}).length} packages cached`,
          details: {
            exists: true,
            ageHours,
            packages: Object.keys(cache.packages || {}).length,
          },
        });
      } else {
        diagnostics.push({
          category: 'cache',
          status: 'ok',
          message: 'No cache found (will be created on next discovery)',
          details: { exists: false },
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        category: 'cache',
        status: 'warning',
        message: `Cache check failed: ${errMsg}`,
        details: { error: errMsg },
      });
    }

    // 4. Marketplace lock check
    try {
      const lock = await readMarketplaceLock(cwd, new DiagnosticCollector());
      if (lock) {
        const entries = Object.entries(lock.installed);
        const enabledCount = entries.filter(([, e]) => e.enabled !== false).length;
        const disabledCount = entries.length - enabledCount;
        diagnostics.push({
          category: 'marketplace-lock',
          status: 'ok',
          message: `${entries.length} installed (${enabledCount} enabled, ${disabledCount} disabled)`,
          details: { total: entries.length, enabled: enabledCount, disabled: disabledCount },
        });
      } else {
        diagnostics.push({
          category: 'marketplace-lock',
          status: 'warning',
          message: 'No marketplace.lock found — no plugins installed via marketplace',
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        category: 'marketplace-lock',
        status: 'error',
        message: `Marketplace lock check failed: ${errMsg}`,
        details: { error: errMsg },
      });
    }

    // 5. Version compatibility check
    const versionIssues: Array<{ plugin: string; required: string; current: string }> = [];
    
    try {
      const manifests = registry.listManifests();
      for (const cmd of manifests) {
        const required = cmd.manifest.engine?.kbCli;
        if (required) {
          const requiredParts = required.replace('^', '').split('.');
          const currentParts = cliVersion.split('.');
          if (requiredParts[0] && currentParts[0]) {
            const requiredMajor = parseInt(requiredParts[0], 10);
            const currentMajor = parseInt(currentParts[0], 10);
          
            if (!isNaN(requiredMajor) && !isNaN(currentMajor) && currentMajor < requiredMajor) {
              versionIssues.push({
                plugin: cmd.manifest.package || cmd.manifest.group,
                required,
                current: cliVersion,
              });
            }
          }
        }
      }
      
      if (versionIssues.length > 0) {
        diagnostics.push({
          category: 'versions',
          status: 'warning',
          message: `${versionIssues.length} plugin(s) require newer CLI version`,
          details: { issues: versionIssues },
        });
      } else {
        diagnostics.push({
          category: 'versions',
          status: 'ok',
          message: 'All plugins compatible with current CLI version',
          details: { issues: [] },
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        category: 'versions',
        status: 'error',
        message: `Version check failed: ${errMsg}`,
        details: { error: errMsg },
      });
    }

    const summary = {
      total: diagnostics.length,
      ok: diagnostics.filter((d) => d.status === 'ok').length,
      warnings: diagnostics.filter((d) => d.status === 'warning').length,
      errors: diagnostics.filter((d) => d.status === 'error').length,
    };

    ctx.platform?.logger?.info('Diag command completed', summary);

    // Return typed data
    return {
      ok: summary.errors === 0,
      diagnostics,
      summary,
    };
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Complex formatting logic for diagnostic output with multiple display modes
  formatter(result, ctx, flags) {
    // Auto-handle JSON mode
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Build UI from result data
      const hasErrors = result.summary.errors > 0;
      const hasWarnings = result.summary.warnings > 0;

      // Summary items
      const summaryItems = [
        `${safeColors.bold('Total Checks')}: ${result.summary.total}`,
        `${safeColors.success('OK')}: ${result.summary.ok}`,
        `${safeColors.warning('Warnings')}: ${result.summary.warnings}`,
        `${safeColors.error('Errors')}: ${result.summary.errors}`,
      ];

      // Diagnostics details
      const diagItems: string[] = [];
      for (const diag of result.diagnostics) {
        const icon =
          diag.status === 'ok'
            ? safeSymbols.success
            : diag.status === 'warning'
              ? safeSymbols.warning
              : safeSymbols.error;
        const colorize =
          diag.status === 'ok'
            ? safeColors.success
            : diag.status === 'warning'
              ? safeColors.warning
              : safeColors.error;

        diagItems.push(`${icon} ${colorize(safeColors.bold(diag.category))}: ${diag.message}`);

        if (diag.status === 'warning' && Array.isArray(diag.details?.issues)) {
          for (const issue of diag.details.issues as Array<{ plugin: string; required: string; current: string }>) {
            diagItems.push(
              `   ${safeColors.warning(`→ ${issue.plugin}: requires ${issue.required}, found ${issue.current}`)}`,
            );
          }
        }
      }

      // Next steps
      const nextSteps: string[] = [];
      if (hasErrors) {
        nextSteps.push(`kb marketplace doctor  ${safeColors.muted('Diagnose plugin issues')}`);
      }
      if (hasWarnings) {
        nextSteps.push(`kb marketplace list  ${safeColors.muted('List all plugins')}`);
      }
      nextSteps.push(`kb diagnose  ${safeColors.muted('Quick environment check')}`);

      // Output using ctx.ui based on status
      const sections = [
        {
          header: 'Summary',
          items: summaryItems,
        },
        {
          header: 'Details',
          items: diagItems,
        },
        {
          header: 'Next Steps',
          items: nextSteps,
        },
      ];

      if (hasErrors) {
        ctx.ui.error('System Diagnostics', { sections });
      } else if (hasWarnings) {
        ctx.ui.warn('System Diagnostics', { sections });
      } else {
        ctx.ui.success('System Diagnostics', { sections });
      }
    }
  },
});

