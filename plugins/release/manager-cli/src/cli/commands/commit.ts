/**
 * `kb release commit --bundle <bundle-dir> --json`
 *
 * Creates the release commit (and optionally its tag) from the same staged
 * worktree the bundle was built in, then verifies that the resulting commit's
 * tree digest equals the already-sealed `provenance.treeSha256` (cutover plan
 * §6A.2). A mismatch is refused: the commit would then describe different bytes
 * from the ones that were verified.
 *
 * Conceptually this runs only after approval. The approval gate itself belongs
 * to Workflow and is not wired in this change — this command supplies the
 * mechanics that gate will drive.
 */

import { resolve } from 'node:path';

import { defineCommand, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';

import { commitSealedBundle, type CommitBundleResult } from '../../shared/bundle/commit.js';
import { findRepoRoot } from '../../shared/utils';

interface CommitFlags {
  bundle?: string;
  tag?: string;
  message?: string;
  json?: boolean;
}

export default defineCommand({
  id: 'release:commit',
  description: 'Create the release commit from the staged worktree and bind it to the sealed bundle\'s tree digest',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<CommitFlags>): Promise<CommandResult<CommitBundleResult>> {
      const { flags } = input;
      const fail = (message: string): CommandResult<CommitBundleResult> => {
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.error?.(message); }
        return { ok: false, error: 'Command failed' };
      };

      if (!flags.bundle) { return fail('release commit requires --bundle <dir>'); }

      try {
        const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());
        const result = commitSealedBundle({
          repoRoot,
          bundleDir: resolve(flags.bundle),
          tag: flags.tag,
          message: flags.message,
        });

        if (flags.json) {
          const response = { ok: true as const, result };
          ctx.ui?.json?.(response);
          return response;
        }

        ctx.ui?.write?.(
          `Committed ${result.releaseId} as ${result.releaseCommit}`
          + `${result.tag ? ` (tag ${result.tag})` : ''}\n`
          + `tree digest matches the sealed bundle: ${result.treeSha256}`,
        );
        return { ok: true, result };
      } catch (error) {
        return fail(`release commit failed: ${(error as Error).message}`);
      }
    },
  },
});
