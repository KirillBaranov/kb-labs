/**
 * `kb release approve` — record the one human approval for an operation.
 *
 * This command is why there is no `approved: true` input anywhere in the
 * workflow. The Workflow's `builtin:approval` step decides *whether* a human
 * said yes; this command turns that answer into an immutable receipt transition
 * carrying who, when, and — through `subjectSha256` — exactly which digests were
 * signed. A boolean could not carry the third part, and the third part is the
 * one that stops an approval granted over one bundle from covering another.
 *
 * `--decision reject` is a first-class outcome, not an error: refusal moves the
 * operation to `cancelled`, destroys the staging worktree and burns the reserved
 * version (execution plan §3.4). Nothing is published either way.
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
} from '@kb-labs/sdk';

import {
  applyApproval,
  buildApproval,
  cancelCandidateRelease,
  createDryRunRuntime,
  createLiveStores,
  requireReceipt,
  stablePromotionPlanSha256,
  type ReceiptStore,
} from '../../shared/control-plane/index.js';
import { findRepoRoot } from '../../shared/utils';

interface ApproveFlags {
  receipt?: string;
  actor?: string;
  decision?: string;
  comment?: string;
  /** Required for a promotion approval: the sealed plan file being signed. */
  plan?: string;
  intent?: string;
  'dry-run'?: boolean;
  json?: boolean;
}

export default defineCommand({
  id: 'release:approve',
  description: 'Record the single human approval (or refusal) for a release operation',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ApproveFlags>): Promise<CommandResult<unknown>> {
      const { flags } = input;
      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());
      const decision = flags.decision === 'reject' ? 'rejected' : 'approved';
      const actor = flags.actor ?? process.env.KB_RELEASE_ACTOR ?? '';

      if (!flags.receipt || !actor) {
        // An approval with no named operator is not an approval — it is an
        // anonymous state change, which is the thing this whole design removes.
        const message = 'release approve requires --receipt and --actor (or KB_RELEASE_ACTOR)';
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }

      const runtime = flags['dry-run'] ? createDryRunRuntime(repoRoot) : null;
      const receiptStore: ReceiptStore = runtime?.receiptStore ?? createLiveStores(repoRoot).receiptStore;

      try {
        const receipt = await requireReceipt(receiptStore, flags.receipt);
        const at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

        if (decision === 'rejected' && receipt.state === 'bundled') {
          const cancelled = await cancelCandidateRelease({
            receiptStore,
            pipeline: runtime?.pipeline ?? { discard: async () => undefined } as never,
            delivery: null as never,
            smoke: null as never,
            activation: null as never,
            flow: receipt.releaseId.split('-')[0] ?? 'platform',
            actor,
          }, receipt.receiptId, flags.comment ?? 'the operator refused the release map');
          const payload = { ok: true, receiptId: cancelled.receiptId, state: cancelled.state, decision };
          if (flags.json) { ctx.ui?.json?.(payload); } else { ctx.ui?.write?.(`receipt ${cancelled.receiptId} is cancelled`); }
          return { ok: true, result: payload };
        }

        const isPromotion = receipt.state === 'promotion-checked';
        const approval = buildApproval({
          receiptId: receipt.receiptId,
          decision,
          subject: isPromotion
            ? {
              operation: 'promotion',
              promotionPlanSha256: flags.plan
                ? stablePromotionPlanSha256(JSON.parse(await readPlan(flags.plan)))
                : requirePlanDigest(),
            }
            : {
              operation: 'candidate',
              intentSha256: flags.intent ?? receipt.evidence.find(entry => entry.kind === 'release-intent')?.sha256
                ?? requireIntentDigest(),
              bundleSha256: receipt.bundleSha256 ?? requireBundleDigest(),
              requestedTarget: 'canary',
            },
          actor,
          at,
          ...(flags.comment ? { comment: flags.comment } : {}),
        });

        const updated = await applyApproval(receiptStore, approval, receipt);
        const payload = {
          ok: true,
          receiptId: updated.receiptId,
          state: updated.state,
          decision,
          approvalId: approval.approvalId,
          subjectSha256: approval.subjectSha256,
          actor,
          at,
        };
        if (flags.json) { ctx.ui?.json?.(payload); }
        else { ctx.ui?.write?.(`receipt ${updated.receiptId} is now ${updated.state} (signed by ${actor} over ${approval.subjectSha256})`); }
        ctx.ui?.write?.(`::kb-output::${JSON.stringify({ receiptId: updated.receiptId, state: updated.state })}`);
        return { ok: true, result: payload };
      } catch (error) {
        const message = (error as Error).message;
        if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
        return { ok: false, error: message };
      }
    },
  },
});

async function readPlan(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf8');
}

function requirePlanDigest(): never {
  throw new Error('a promotion approval must name the sealed plan it signs: pass --plan <StablePromotionPlan.json>');
}

function requireIntentDigest(): never {
  throw new Error('the receipt carries no intent digest to sign; pass --intent <sha256>');
}

function requireBundleDigest(): never {
  throw new Error('the receipt carries no bundleSha256: an approval can only be granted over a sealed bundle');
}
