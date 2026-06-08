// Regression test for the E2E aggregation logic.
//
// Run: node --test scripts/ci/aggregate-e2e-result.test.mjs
//
// Documents the root cause of the "E2E Platform Tests red on main" bug: the old
// aggregator counted `skipped` shards (gated out because upstream CI failed) as
// a failure. The first three cases below fail against the old `success && success`
// logic and pass against `evaluate()`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate } from './aggregate-e2e-result.mjs';

test('both shards passed → green', () => {
  const { ok } = evaluate({ e2e: 'success', mcp: 'success' });
  assert.equal(ok, true);
});

test('both shards skipped (upstream CI not green) → green, not a failure', () => {
  // This is THE bug: the old aggregator reported failure here.
  const { ok, reason } = evaluate({ e2e: 'skipped', mcp: 'skipped' });
  assert.equal(ok, true);
  assert.match(reason, /skipped/i);
});

test('one passed, one skipped → green', () => {
  assert.equal(evaluate({ e2e: 'success', mcp: 'skipped' }).ok, true);
  assert.equal(evaluate({ e2e: 'skipped', mcp: 'success' }).ok, true);
});

test('a shard that actually ran and failed → red', () => {
  const { ok, reason } = evaluate({ e2e: 'failure', mcp: 'success' });
  assert.equal(ok, false);
  assert.match(reason, /e2e=failure/);
});

test('a cancelled shard → red', () => {
  assert.equal(evaluate({ e2e: 'success', mcp: 'cancelled' }).ok, false);
});

test('unknown/empty result is treated defensively as red', () => {
  assert.equal(evaluate({ e2e: '', mcp: 'success' }).ok, false);
  assert.equal(evaluate({ e2e: 'success', mcp: undefined }).ok, false);
});
