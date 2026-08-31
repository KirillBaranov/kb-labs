/**
 * `kb release candidate` — drive a candidate operation as far as its receipt
 * allows.
 *
 * This is the command the Workflow calls, twice: once before the approval step
 * and once after. Both invocations are identical — no "phase" flag, no "resume"
 * flag — because the receipt already knows where the operation is. That is the
 * point of PR 5: the state lives in the receipt, not in the caller's argv, so a
 * crashed run and a fresh run are the same command.
 *
 * The command never takes an "approved" input. When the operation reaches
 * `bundled` it stops and reports `awaitingApproval`; only a `kb release approve`
 * document can move it on.
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
} from '@kb-labs/sdk';

import {
  advanceCandidateRelease,
  createDryRunRuntime,
  liveAdaptersUnavailable,
} from '../../shared/control-plane/index.js';
import { findRepoRoot } from '../../shared/utils';

interface CandidateFlags {
  flow?: string;
  target?: string;
  receipt?: string;
  actor?: string;
  'dry-run'?: boolean;
  json?: boolean;
}

export default defineCommand({
  id: 'release:candidate',
  description: 'Drive a release candidate receipt to its next gate or terminal state',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<CandidateFlags>): Promise<CommandResult<unknown>> {
      const { flags } = input;
      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());
      const flow = flags.flow ?? 'platform';
      const target = flags.target ?? 'canary';
      const actor = flags.actor ?? process.env.KB_RELEASE_ACTOR ?? 'workflow';

      if (target !== 'canary') {
        // `stable` is a promotion of existing bytes, not a candidate;
        // `experimental` is reserved with no consumer (decision S0.3d).
        const message = `release candidate only produces canary candidates; --target ${target} is not a candidate operation`;
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      if (!flags['dry-run']) {
        const error = liveAdaptersUnavailable('release candidate');
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: { code: error.code, message: error.message } }); }
        else { ctx.ui?.write?.(`${error.code}: ${error.message}`); }
        return { ok: false, error: error.message };
      }

      const runtime = createDryRunRuntime(repoRoot, { flow });
      try {
        const result = await advanceCandidateRelease({
          receiptStore: runtime.receiptStore,
          pipeline: runtime.pipeline,
          delivery: runtime.adapters.delivery,
          smoke: runtime.adapters.smoke,
          activation: runtime.adapters.activation,
          flow,
          actor,
          ...(flags.receipt ? { receiptId: flags.receipt } : {}),
        });

        const payload = {
          ok: true,
          dryRun: true,
          receiptId: result.receipt.receiptId,
          releaseId: result.receipt.releaseId,
          candidateId: result.receipt.candidateId ?? null,
          bundleSha256: result.receipt.bundleSha256 ?? null,
          state: result.state,
          awaitingApproval: result.awaitingApproval,
          releaseMap: result.releaseMap,
        };
        if (flags.json) { ctx.ui?.json?.(payload); }
        else {
          ctx.ui?.write?.(
            `receipt ${payload.receiptId} is at ${payload.state}`
            + (payload.awaitingApproval ? ' — awaiting the single human approval over the sealed bundle' : ''),
          );
        }
        // The workflow reads these back with ${{ steps.<id>.outputs.<key> }}.
        ctx.ui?.write?.(`::kb-output::${JSON.stringify({
          receiptId: payload.receiptId,
          state: payload.state,
          bundleSha256: payload.bundleSha256 ?? '',
          awaitingApproval: payload.awaitingApproval,
        })}`);
        return { ok: true, result: payload };
      } catch (error) {
        const message = (error as Error).message;
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }
    },
  },
});
