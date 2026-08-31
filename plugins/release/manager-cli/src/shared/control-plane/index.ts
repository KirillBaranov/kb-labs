/**
 * Channel policy, version ledger, staged checks, break-glass exceptions,
 * changelog freezing and support policy (execution plan PR 4).
 *
 * Everything here sits *upstream* of PR 3's `stage → package → seal → commit`
 * bundle pipeline: it decides which channel, which version and which changelog
 * bytes a candidate gets, and emits the `intent.json` that pipeline consumes.
 */

export * from './changelog-freeze.js';
export * from './check-executors.js';
export * from './checks.js';
export * from './exception.js';
export * from './ledger.js';
export * from './ledger-file-store.js';
export * from './plan.js';
export * from './support-policy.js';
export * from './version-policy.js';
