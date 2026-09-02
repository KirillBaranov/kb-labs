/**
 * `kb release stage --intent <intent.json> --json`
 *
 * Creates a disposable git worktree from the intent's `plannedCommit`, applies
 * only the planned version/changelog/dependency mutations there, and returns
 * `treeSha256` (cutover plan §6A.2). It never touches `master` or the primary
 * working tree, and a failure leaves nothing behind.
 *
 * This command replaced the previous `release stage`, which packed the
 * currently-committed versions into tarballs from the primary checkout. That
 * job now belongs to `release package`, which does it inside the staged
 * worktree against an explicit intent instead of against whatever happens to be
 * on disk.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineCommand, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';

import { loadCandidateIntent } from '../../shared/bundle/intent.js';
import { discardStaging, stageRelease } from '../../shared/bundle/stage.js';
import { findRepoRoot } from '../../shared/utils';

interface StageFlags {
  intent?: string;
  /** JSON map of worktree-relative path → changelog file the plan froze. */
  changelogs?: string;
  discard?: boolean;
  json?: boolean;
}

export interface StagePayload {
  releaseId: string;
  candidateId: string;
  plannedCommit: string;
  treeSha256: string;
  worktree: string;
  statePath: string;
  mutations: { versions: number; dependencies: number; changelogs: number };
}

function loadChangelogs(repoRoot: string, spec: string | undefined): Record<string, string> | undefined {
  if (!spec) { return undefined; }
  const map = JSON.parse(readFileSync(resolve(repoRoot, spec), 'utf8')) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(map).map(([target, source]) => [target, readFileSync(resolve(repoRoot, source), 'utf8')]),
  );
}

export default defineCommand({
  id: 'release:stage',
  description: 'Apply an intent\'s planned mutations in a disposable worktree and return its treeSha256',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<StageFlags>): Promise<CommandResult<StagePayload>> {
      const { flags } = input;
      const fail = (message: string): CommandResult<StagePayload> => {
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.error?.(message); }
        return { ok: false, error: 'Command failed' };
      };

      if (!flags.intent) { return fail('release stage requires --intent <intent.json>'); }

      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());

      try {
        const { intent, intentSha256 } = loadCandidateIntent(flags.intent);

        if (flags.discard) {
          discardStaging(repoRoot, intent.candidateId);
          const message = `Discarded staging worktree for ${intent.candidateId}`;
          if (flags.json) { ctx.ui?.json?.({ ok: true, discarded: intent.candidateId }); } else { ctx.ui?.write?.(message); }
          return { ok: true } as CommandResult<StagePayload>;
        }

        const { state, statePath, plan } = stageRelease({
          repoRoot,
          intent,
          intentSha256,
          changelogs: loadChangelogs(repoRoot, flags.changelogs),
        });

        const result: StagePayload = {
          releaseId: state.releaseId,
          candidateId: state.candidateId,
          plannedCommit: state.plannedCommit,
          treeSha256: state.treeSha256,
          worktree: state.worktree,
          statePath,
          mutations: {
            versions: plan.versions.length,
            dependencies: plan.dependencies.length,
            changelogs: plan.changelogs.length,
          },
        };

        if (flags.json) {
          const response = { ok: true as const, result };
          ctx.ui?.json?.(response);
          return response;
        }

        ctx.ui?.write?.(
          `Staged ${state.releaseId} from ${state.plannedCommit.slice(0, 12)} in ${state.worktree}\n`
          + `treeSha256: ${state.treeSha256}\n`
          + `mutations: ${plan.versions.length} version(s), ${plan.dependencies.length} dependency range(s), `
          + `${plan.changelogs.length} changelog(s)`,
        );
        return { ok: true, result };
      } catch (error) {
        return fail(`release stage failed: ${(error as Error).message}`);
      }
    },
  },
});
