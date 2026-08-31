/**
 * Wiring for the CLI entry points that Workflow steps call.
 *
 * Two modes, and the difference between them is deliberately narrow:
 *
 * - **dry run** — the real, file-backed receipt/lease/journal stores, the
 *   simulated build pipeline and the fake CI adapters. Everything about the
 *   state machine is exercised for real, including durability across processes:
 *   the workflow's approval step runs in a *different* process from the step
 *   that sealed the bundle, so a dry run that kept receipts in memory would
 *   prove nothing about resume. Nothing is built, published or pointed at.
 *
 * - **live** — the same stores with `createRepoCandidatePipeline` and the real
 *   CI adapters. The pipeline half exists (PR 3/PR 4); the adapter half is
 *   PR 6's `workflow_dispatch` delivery. Until it lands, `liveAdaptersUnavailable`
 *   refuses with a typed diagnostic rather than silently falling back to fakes —
 *   a "successful" release that published nothing would be far worse than a
 *   refusal.
 */

import { join } from 'node:path';

import { ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';

import { createFakeAdapters, type FakeAdapterSet } from './adapters-fake.js';
import { FileJournalStore, releaseJournalDir, type JournalStore } from './journal.js';
import type { LeaseStore } from './lease.js';
import {
  FileLeaseStore,
  FileReceiptStore,
  releaseLeaseDir,
  releaseReceiptDir,
} from './receipt-file-store.js';
import { SimulatedCandidatePipeline } from './pipeline-simulated.js';
import type { CandidatePipeline } from './pipeline.js';
import type { ReceiptStore } from './receipt.js';
import { ReleaseReceiptError } from './receipt.js';

export interface ControlPlaneRuntime {
  receiptStore: ReceiptStore;
  leaseStore: LeaseStore;
  journalStore: JournalStore;
  adapters: FakeAdapterSet;
  pipeline: CandidatePipeline;
  dryRun: true;
}

/**
 * A dry run keeps its receipts beside the real ones but under its own root, so
 * a rehearsal can never be mistaken for — or collide with — a real release.
 */
export function dryRunRoot(repoRoot: string): string {
  return join(repoRoot, '.kb', 'release', 'dry-run');
}

export function createDryRunRuntime(repoRoot: string, options: {
  flow?: string;
  version?: string;
} = {}): ControlPlaneRuntime {
  const root = dryRunRoot(repoRoot);
  return {
    receiptStore: new FileReceiptStore(releaseReceiptDir(root)),
    leaseStore: new FileLeaseStore(releaseLeaseDir(root)),
    journalStore: new FileJournalStore(releaseJournalDir(root)),
    adapters: createFakeAdapters([
      // One clean sample so a dry run's observation window can actually close;
      // a real monitor supplies these in PR 6.
      { id: 'dry-run-sample', observedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), trigger: null, severity: 'info' },
    ]),
    pipeline: new SimulatedCandidatePipeline({
      ...(options.flow ? { flow: options.flow } : {}),
      ...(options.version ? { version: options.version } : {}),
    }),
    dryRun: true,
  };
}

/** The persistent stores a real (non-dry-run) operation reads and writes. */
export function createLiveStores(repoRoot: string): {
  receiptStore: ReceiptStore;
  leaseStore: LeaseStore;
  journalStore: JournalStore;
} {
  return {
    receiptStore: new FileReceiptStore(releaseReceiptDir(repoRoot)),
    leaseStore: new FileLeaseStore(releaseLeaseDir(repoRoot)),
    journalStore: new FileJournalStore(releaseJournalDir(repoRoot)),
  };
}

export function liveAdaptersUnavailable(operation: string): ReleaseReceiptError {
  return new ReleaseReceiptError(
    ReleaseControlDiagnosticCode.DeliveryTransient,
    `${operation} needs the real CI delivery adapters, which land with PR 6 (thin CI delivery). `
    + 'Run with --dry-run to drive the receipt state machine against the fake delivery plane, '
    + 'or wait for the delivery workflow. Falling back to fakes here would report a release that published nothing.',
  );
}
