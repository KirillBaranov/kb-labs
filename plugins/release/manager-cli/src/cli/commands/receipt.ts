/**
 * `kb release receipt` — read the operational truth.
 *
 * Read-only by construction. The receipt store has exactly one writer (the
 * Workflow, execution plan §3.2), and this command is the operator's window on
 * it: what state an operation is in, who moved it there and when, and what
 * evidence backs each move.
 *
 * It also answers the question §3C makes load-bearing — "why can I not promote
 * to stable" — by surfacing receipts parked in `rollback-needs-attention`, which
 * block every subsequent stable operation until reconciled.
 */

import {
  defineCommand,
  type CLIInput,
  type CommandResult,
  type PluginContextV3,
} from '@kb-labs/sdk';

import {
  blockingStableReceipts,
  createDryRunRuntime,
  createLiveStores,
} from '../../shared/control-plane/index.js';
import { findRepoRoot } from '../../shared/utils';

interface ReceiptFlags {
  receipt?: string;
  state?: string;
  blocking?: boolean;
  'dry-run'?: boolean;
  json?: boolean;
}

export default defineCommand({
  id: 'release:receipt',
  description: 'Show a release receipt, or list receipts by state',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<ReceiptFlags>): Promise<CommandResult<unknown>> {
      const { flags } = input;
      const repoRoot = await findRepoRoot(ctx.cwd || process.cwd());
      const store = flags['dry-run']
        ? createDryRunRuntime(repoRoot).receiptStore
        : createLiveStores(repoRoot).receiptStore;

      if (flags.blocking) {
        const blocking = await blockingStableReceipts(store);
        const payload = { ok: true, blocking: blocking.map(receipt => receipt.receiptId) };
        if (flags.json) { ctx.ui?.json?.(payload); }
        else {
          ctx.ui?.write?.(blocking.length === 0
            ? 'no receipt is blocking stable promotions'
            : `stable promotions are blocked by: ${payload.blocking.join(', ')}`);
        }
        return { ok: true, result: payload };
      }

      if (flags.receipt) {
        const receipt = await store.read(flags.receipt);
        if (!receipt) {
          const message = `no receipt ${flags.receipt}`;
          if (flags.json) { ctx.ui?.json?.({ ok: false, error: message }); } else { ctx.ui?.write?.(message); }
          return { ok: false, error: message };
        }
        if (flags.json) { ctx.ui?.json?.({ ok: true, receipt }); }
        else {
          ctx.ui?.write?.(`${receipt.receiptId} — ${receipt.state}`);
          for (const transition of receipt.transitions) {
            ctx.ui?.write?.(`  ${transition.from ?? '—'} → ${transition.to}  ${transition.at}  ${transition.actor}${transition.reason ? `  (${transition.reason})` : ''}`);
          }
        }
        return { ok: true, result: receipt };
      }

      const receipts = flags.state
        ? await store.listByState(flags.state as Parameters<typeof store.listByState>[0])
        : await store.list();
      const rows = receipts.map(receipt => ({ receiptId: receipt.receiptId, releaseId: receipt.releaseId, state: receipt.state }));
      if (flags.json) { ctx.ui?.json?.({ ok: true, receipts: rows }); }
      else { for (const row of rows) { ctx.ui?.write?.(`${row.receiptId}  ${row.releaseId}  ${row.state}`); } }
      return { ok: true, result: rows };
    },
  },
});
