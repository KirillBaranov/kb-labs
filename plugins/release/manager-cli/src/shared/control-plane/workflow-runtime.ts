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
 *   CI adapters. Two of the three halves exist: the pipeline (PR 3/PR 4) and the
 *   adapters themselves (PR 6's `CiDeliveryAdapter`/`CiSmokeAdapter`/
 *   `CiActivationAdapter`, which CI runs today through `kb release
 *   deliver-request`). What is still missing is the *Workflow-side* half — an
 *   `ActivationAdapter`/`DeliveryAdapter` that dispatches
 *   `.github/workflows/release-deliver.yml`, waits for the run and reads back its
 *   `DeliveryEvidence` artifact — together with the two endpoints it would talk
 *   to: the conditional-write pointer/support store (decision S0.1) and the
 *   durable receipt store on vm-1 (S0.2). Neither is deployed.
 *
 *   Until that exists, `liveAdaptersUnavailable` refuses with a typed diagnostic
 *   rather than silently falling back to fakes — a "successful" release that
 *   published nothing would be far worse than a refusal. That refusal is the
 *   whole reason a production release cannot yet be driven from this repository,
 *   and it is deliberately loud rather than a TODO.
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
    `${operation} needs a Workflow-side delivery adapter that dispatches `
    + '.github/workflows/release-deliver.yml and reads back its DeliveryEvidence, plus the two endpoints '
    + 'it writes through: the conditional-write pointer/support store (decision S0.1) and the durable '
    + 'receipt store on vm-1 (S0.2). The CI half of the delivery plane exists and is exercised by '
    + '`kb release deliver-request`; the dispatch half and the infrastructure do not. '
    + 'Run with --dry-run to drive the receipt state machine against the fake delivery plane. '
    + 'Falling back to fakes here would report a release that published nothing.',
  );
}
