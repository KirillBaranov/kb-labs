/**
 * `ReleaseSupportPolicy` generation and sealing (execution plan §7.7 "В PR 4").
 *
 * Two invariants carry the whole document: `minimumSupported` only moves
 * forward, and burned versions appear in neither list.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ReleaseControlDiagnosticCode,
  ReleaseSupportPolicySchema,
  type ReleaseLedgerEntry,
  type ReleaseLedgerState,
} from '@kb-labs/release-manager-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  SupportPolicyError,
  buildSupportPolicy,
  readSupportPolicy,
  sealSupportPolicy,
} from '../control-plane/index.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-support-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

const NOTICE = 'This installation predates kb.release/1 and must be reinstalled.';

let sequence = 0;
function entry(version: string, state: ReleaseLedgerState, flow = 'platform'): ReleaseLedgerEntry {
  sequence += 1;
  return {
    schema: 'kb.release-ledger-entry/1',
    sequence,
    flow,
    version,
    channel: 'canary',
    state,
    releaseId: `${flow}-${version}`,
    candidateId: `c-${version}`,
    reservedAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
    transitions: [],
    signature: null,
  };
}

function build(entries: ReleaseLedgerEntry[], minimumSupported: string, previous = null as never) {
  return buildSupportPolicy({
    flow: 'platform',
    entries,
    minimumSupported,
    legacyNotice: NOTICE,
    generatedAt: '2026-08-31T00:00:00Z',
    previous,
  });
}

describe('support policy membership', () => {
  it('derives supported and retired from activated ledger entries', () => {
    const policy = build([
      entry('2.119.0', 'promoted-stable'),
      entry('2.120.0', 'promoted-stable'),
      entry('2.121.0', 'active-canary'),
    ], 'platform-2.120.0');

    expect(() => ReleaseSupportPolicySchema.parse(policy)).not.toThrow();
    expect(policy.supported).toEqual(['platform-2.120.0', 'platform-2.121.0']);
    expect(policy.retired).toEqual([
      { releaseId: 'platform-2.119.0', reason: 'superseded', replacedBy: 'platform-2.120.0' },
    ]);
  });

  // §4.9 / §7.3: a canary that was reserved and abandoned was never available,
  // so it is neither supported nor *retired* — retirement describes something
  // that used to exist.
  it('keeps burned versions out of both lists', () => {
    const policy = build([
      entry('2.120.0', 'promoted-stable'),
      entry('2.121.0', 'rejected'),
      entry('2.122.0', 'cancelled'),
      entry('2.123.0', 'active-canary'),
    ], 'platform-2.120.0');

    expect(policy.supported).toEqual(['platform-2.120.0', 'platform-2.123.0']);
    expect(policy.retired).toEqual([]);
    const listed = [...policy.supported, ...policy.retired.map(r => r.releaseId)];
    expect(listed).not.toContain('platform-2.121.0');
    expect(listed).not.toContain('platform-2.122.0');
  });

  it('excludes versions that were published but never activated by a pointer', () => {
    const policy = build([
      entry('2.120.0', 'promoted-stable'),
      entry('2.121.0', 'published'),
      entry('2.122.0', 'reserved'),
    ], 'platform-2.120.0');
    expect(policy.supported).toEqual(['platform-2.120.0']);
  });

  it('ignores another flow entirely', () => {
    const policy = build([
      entry('2.120.0', 'promoted-stable'),
      entry('9.9.9', 'promoted-stable', 'sdk'),
    ], 'platform-2.120.0');
    expect(policy.supported).toEqual(['platform-2.120.0']);
  });

  it('refuses a minimumSupported that names a burned version', () => {
    let thrown: unknown;
    try {
      build([entry('2.120.0', 'rejected')], 'platform-2.120.0');
    } catch (error) { thrown = error; }
    expect((thrown as SupportPolicyError).code).toBe(ReleaseControlDiagnosticCode.SupportPolicyBurnedVersion);
  });

  it('refuses a minimumSupported that carries no valid version', () => {
    expect(() => build([entry('2.120.0', 'promoted-stable')], 'platform-latest')).toThrow(SupportPolicyError);
  });
});

describe('minimumSupported monotonicity', () => {
  it('accepts a forward move', () => {
    const entries = [entry('2.120.0', 'promoted-stable'), entry('2.121.0', 'promoted-stable')];
    const first = build(entries, 'platform-2.120.0');
    const second = buildSupportPolicy({
      flow: 'platform', entries, minimumSupported: 'platform-2.121.0',
      legacyNotice: NOTICE, generatedAt: '2026-09-01T00:00:00Z', previous: first,
    });
    expect(second.minimumSupported).toBe('platform-2.121.0');
  });

  // Lowering it would silently un-retire releases consumers were already told
  // are out of support, at an unpredictable time per consumer because the
  // document is mutable and cached.
  it('rejects a publish that lowers minimumSupported relative to the previous sealed policy', () => {
    const entries = [entry('2.120.0', 'promoted-stable'), entry('2.121.0', 'promoted-stable')];
    const previous = build(entries, 'platform-2.121.0');

    let thrown: unknown;
    try {
      buildSupportPolicy({
        flow: 'platform', entries, minimumSupported: 'platform-2.120.0',
        legacyNotice: NOTICE, generatedAt: '2026-09-01T00:00:00Z', previous,
      });
    } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(SupportPolicyError);
    expect((thrown as SupportPolicyError).code).toBe(ReleaseControlDiagnosticCode.SupportPolicyNotMonotonic);
  });

  // Sealing re-checks against whatever is on disk, not only against the
  // `previous` the caller happened to pass — the on-disk policy is the only
  // thing that can still contradict the new one.
  it('rejects sealing a backwards policy even when the caller passed no previous', () => {
    const repoRoot = tempRoot();
    const entries = [entry('2.120.0', 'promoted-stable'), entry('2.121.0', 'promoted-stable')];

    sealSupportPolicy(repoRoot, build(entries, 'platform-2.121.0'));
    expect(readSupportPolicy(repoRoot)!.minimumSupported).toBe('platform-2.121.0');

    const backwards = build(entries, 'platform-2.120.0');
    let thrown: unknown;
    try { sealSupportPolicy(repoRoot, backwards); } catch (error) { thrown = error; }
    expect((thrown as SupportPolicyError).code).toBe(ReleaseControlDiagnosticCode.SupportPolicyNotMonotonic);

    // The rejected policy did not overwrite the sealed one.
    expect(readSupportPolicy(repoRoot)!.minimumSupported).toBe('platform-2.121.0');
  });

  it('seals a digest over the exact bytes CI will publish', () => {
    const repoRoot = tempRoot();
    const policy = build([entry('2.120.0', 'promoted-stable')], 'platform-2.120.0');
    const sealed = sealSupportPolicy(repoRoot, policy);
    expect(sealed.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readSupportPolicy(repoRoot)).toEqual(policy);
  });

  it('returns null when nothing has been sealed yet', () => {
    expect(readSupportPolicy(tempRoot())).toBeNull();
  });
});
