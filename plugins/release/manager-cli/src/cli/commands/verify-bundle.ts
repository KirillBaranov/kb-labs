/**
 * `kb release verify-bundle` — pure validation of an already-sealed bundle.
 *
 * Mandatory immediately after `release seal` and before Workflow is handed a
 * bundle locator: everything downstream (the approval over `bundleSha256`, CI
 * publishing exact bytes, the launcher resolving an immutable descriptor)
 * treats the bundle as authoritative, so this is the last point where an
 * inconsistency is still cheap to reject.
 *
 * It produces no artifacts and repairs nothing — see cutover plan §6A.2.
 */

import { defineCommand, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';

import { verifyBundleDirectory, type BundleVerificationReport } from '../../shared/verify-bundle.js';

interface VerifyBundleFlags {
  bundle?: string;
  expectedSha256?: string;
  json?: boolean;
}

export default defineCommand({
  id: 'release:verify-bundle',
  description: 'Validate a sealed release bundle directory against every bundle verification rule',

  handler: {
    async execute(
      ctx: PluginContextV3,
      input: CLIInput<VerifyBundleFlags>,
    ): Promise<CommandResult<BundleVerificationReport>> {
      const { flags } = input;

      if (!flags.bundle) {
        const msg = 'release verify-bundle requires --bundle <dir>';
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: msg }); } else { ctx.ui?.error?.(msg); }
        return { ok: false, error: 'Command failed' };
      }

      const report = verifyBundleDirectory(flags.bundle, flags.expectedSha256);

      if (flags.json) {
        ctx.ui?.json?.(report);
        return report.ok ? { ok: true, result: report } : { ok: false, error: 'Command failed', result: report };
      }

      if (report.ok) {
        ctx.ui?.write?.(
          `OK: ${report.releaseId ?? 'bundle'} sealed as ${report.bundleSha256} — `
          + `${report.counts.files} files, ${report.counts.tarballs} tarballs, `
          + `${report.counts.binaries} binaries, ${report.counts.nodes} graph nodes verified`,
        );
        return { ok: true, result: report };
      }

      for (const diagnostic of report.diagnostics) {
        ctx.ui?.error?.(`[rule ${diagnostic.rule}] ${diagnostic.code}: ${diagnostic.message}`);
      }
      return { ok: false, error: 'Command failed', result: report };
    },
  },
});
