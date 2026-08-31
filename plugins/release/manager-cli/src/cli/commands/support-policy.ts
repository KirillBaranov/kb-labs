/**
 * `kb release support-policy` — generate and seal `kb.release-support/1`.
 *
 * The plugin owns the exact bytes (cutover plan §4.9); CI publishes them
 * unmodified and never decides the list contents. Membership is derived from
 * the version ledger rather than hand-listed, which is what keeps the two
 * invariants mechanical: `minimumSupported` only moves forward, and versions
 * that were reserved but never activated appear in neither list.
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
} from '@kb-labs/sdk';

import {
  FileReleaseLedgerStore,
  SupportPolicyError,
  buildSupportPolicy,
  readSupportPolicy,
  releaseLedgerPath,
  sealSupportPolicy,
} from '../../shared/control-plane/index.js';
import { findRepoRoot } from '../../shared/utils';

interface SupportPolicyFlags {
  flow?: string;
  minimumSupported?: string;
  legacyNotice?: string;
  json?: boolean;
}

const DEFAULT_LEGACY_NOTICE =
  'This installation predates the kb.release/1 contract and cannot be updated in place. '
  + 'Reinstall with the current installer to move onto the supported release line.';

export default defineCommand({
  id: 'release:support-policy',
  description: 'Generate and seal the release support policy from the version ledger',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<SupportPolicyFlags>): Promise<CommandResult<unknown>> {
      const { flags } = input;
      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());
      const flow = flags.flow ?? 'platform';

      if (!flags.minimumSupported) {
        const message = 'release support-policy requires --minimum-supported <releaseId> (e.g. platform-2.120.0).';
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); }
        else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      const store = new FileReleaseLedgerStore(releaseLedgerPath(repoRoot));
      const entries = await store.read();

      try {
        const policy = buildSupportPolicy({
          flow,
          entries,
          minimumSupported: flags.minimumSupported,
          legacyNotice: flags.legacyNotice ?? DEFAULT_LEGACY_NOTICE,
          previous: readSupportPolicy(repoRoot),
        });
        const sealed = sealSupportPolicy(repoRoot, policy);

        const output = {
          ok: true as const,
          path: sealed.path,
          sha256: sealed.sha256,
          minimumSupported: policy.minimumSupported,
          supported: policy.supported,
          retired: policy.retired,
        };
        if (flags.json) {
          ctx.ui?.json?.(output);
        } else {
          ctx.ui?.sideBox?.({
            title: 'Release Support Policy',
            sections: [
              { header: 'Minimum supported', items: [policy.minimumSupported] },
              { header: 'Supported', items: policy.supported.length ? policy.supported : ['(none yet)'] },
              { header: 'Retired', items: policy.retired.map(r => `${r.releaseId} — ${r.reason}`) },
              { items: [`Sealed at ${sealed.path}`, `sha256 ${sealed.sha256}`] },
            ],
            status: 'success',
          });
        }
        return { ok: true, result: output };
      } catch (error) {
        const failure = error instanceof SupportPolicyError
          ? { code: error.code, message: error.message }
          : { code: 'KB_RELEASE_SUPPORT_POLICY_FAILED', message: (error as Error).message };
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: failure }); }
        else { ctx.ui?.write?.(`${failure.code}: ${failure.message}`); }
        return { ok: false, error: failure.message };
      }
    },
  },
});
