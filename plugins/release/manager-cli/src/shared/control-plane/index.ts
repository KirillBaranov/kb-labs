/**
 * Channel policy, version ledger, staged checks, break-glass exceptions,
 * changelog freezing and support policy (execution plan PR 4).
 *
 * Everything here sits *upstream* of PR 3's `stage → package → seal → commit`
 * bundle pipeline: it decides which channel, which version and which changelog
 * bytes a candidate gets, and emits the `intent.json` that pipeline consumes.
 */

/**
 * PR 5 adds the Workflow layer on top: the receipt state machine, the single
 * approval, the candidate saga and the stable promotion saga. It orchestrates
 * everything below rather than duplicating it.
 */

/**
 * PR 6 adds the delivery plane the Workflow reaches through those adapters:
 * conditional-write CAS primitives for the two mutable documents, narrow
 * immutable publication targets, and the real adapter implementations.
 */

export * from './adapters.js';
export * from './adapters-fake.js';
export * from './cas-store.js';
export * from './ci-delivery.js';
export * from './delivery-clients.js';
export * from './delivery-targets.js';
export * from './support-policy-publish.js';
export * from './approval.js';
export * from './changelog-freeze.js';
export * from './journal.js';
export * from './lease.js';
export * from './pipeline.js';
export * from './pipeline-simulated.js';
export * from './receipt.js';
export * from './receipt-file-store.js';
export * from './saga-candidate.js';
export * from './saga-promotion.js';
export * from './workflow-runtime.js';
export * from './check-executors.js';
export * from './checks.js';
export * from './exception.js';
export * from './ledger.js';
export * from './ledger-file-store.js';
export * from './plan.js';
export * from './support-policy.js';
export * from './version-policy.js';
