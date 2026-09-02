/**
 * Version ledger and version policy (execution plan PR 4, DoD).
 *
 * The three properties under test are the ones the whole channel model rests
 * on: concurrent plans never receive the same version, a burned version is
 * never reissued, and the baseline comes from the ledger rather than from the
 * stable pointer or npm.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ReleaseLedgerEntry } from '@kb-labs/release-manager-contracts';
import { ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FileReleaseLedgerStore,
  InMemoryReleaseLedgerStore,
  buildVersionProposal,
  ledgerBaseline,
  reserveVersion,
  transitionLedgerEntry,
  type ReleaseLedgerStore,
} from '../control-plane/index.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

function tempStore(): FileReleaseLedgerStore {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-ledger-'));
  roots.push(root);
  return new FileReleaseLedgerStore(join(root, 'ledger.jsonl'));
}

async function allocate(
  store: ReleaseLedgerStore,
  flow: string,
  bump: 'patch' | 'minor' | 'major',
  candidateId: string,
): Promise<{ ok: boolean; version?: string; code?: string }> {
  const entries = await store.read();
  const proposal = buildVersionProposal({
    flow, channel: 'canary', candidateId, bump, entries,
    workspaceVersions: ['1.19.2'],
  });
  const result = await reserveVersion(store, proposal);
  return result.ok
    ? { ok: true, version: result.entry.version }
    : { ok: false, code: result.code };
}

describe('version policy baseline', () => {
  function entry(version: string, state: ReleaseLedgerEntry['state'], sequence: number): ReleaseLedgerEntry {
    return {
      schema: 'kb.release-ledger-entry/1',
      sequence,
      flow: 'platform',
      version,
      channel: 'canary',
      state,
      releaseId: `platform-${version}`,
      candidateId: `c-${version}`,
      reservedAt: '2026-08-30T00:00:00Z',
      updatedAt: '2026-08-30T00:00:00Z',
      transitions: [],
      signature: null,
    };
  }

  // The cutover plan's own worked example: stable is 1.19.2 while immutable
  // canaries exist up to 1.22.33. Deriving from the stable pointer would
  // propose 1.19.3 and collide with every one of them.
  it('takes the baseline from the highest ledger version, not the current stable pointer', () => {
    const entries = [
      entry('1.19.2', 'promoted-stable', 0),
      entry('1.20.0', 'active-canary', 1),
      entry('1.22.33', 'published', 2),
    ];
    expect(ledgerBaseline(entries, 'platform', ['1.19.2'])).toEqual({ version: '1.22.33', source: 'ledger' });

    const proposal = buildVersionProposal({
      flow: 'platform', channel: 'canary', candidateId: 'c1',
      bump: 'patch', entries, workspaceVersions: ['1.19.2'],
    });
    expect(proposal.version).toBe('1.22.34');
    expect(proposal.baselineSource).toBe('ledger');
  });

  it('counts burned versions in the baseline — a rejected canary still moved the number forward', () => {
    const entries = [entry('1.20.0', 'active-canary', 0), entry('1.21.0', 'rejected', 1)];
    const proposal = buildVersionProposal({
      flow: 'platform', channel: 'canary', candidateId: 'c1',
      bump: 'patch', entries,
    });
    expect(proposal.version).toBe('1.21.1');
  });

  it('falls back to the workspace only when the flow has no ledger history at all', () => {
    const proposal = buildVersionProposal({
      flow: 'platform', channel: 'canary', candidateId: 'c1',
      bump: 'minor', entries: [], workspaceVersions: ['2.4.1', '2.3.0'],
    });
    expect(proposal.baselineVersion).toBe('2.4.1');
    expect(proposal.baselineSource).toBe('workspace');
    expect(proposal.version).toBe('2.5.0');
  });

  it('ignores another flow\'s versions when computing a baseline', () => {
    const entries = [{ ...entry('9.9.9', 'published', 0), flow: 'sdk' }];
    expect(ledgerBaseline(entries, 'platform', ['1.0.0']).source).toBe('workspace');
  });
});

describe('atomic version reservation', () => {
  // The DoD race test. Every reservation is started before any of them has
  // finished reading, so all ten hold the same stale tail — which is precisely
  // the situation the compare-and-set exists to resolve.
  it('never hands the same version to two concurrent plans', async () => {
    const store = tempStore();
    const attempts = 10;

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) => allocate(store, 'platform', 'patch', `candidate-${i}`)),
    );

    const won = results.filter(result => result.ok);
    const versions = won.map(result => result.version!);
    expect(new Set(versions).size).toBe(versions.length);
    expect(won.length).toBeGreaterThan(0);

    // Losers are told they lost a race, not that their number was taken —
    // the distinction is what tells a caller to recompute rather than retry.
    for (const lost of results.filter(result => !result.ok)) {
      expect(lost.code).toBe(ReleaseControlDiagnosticCode.ReservationConflict);
    }

    const persisted = await store.read();
    expect(persisted.map(e => e.version).sort()).toEqual(versions.slice().sort());
    expect(new Set(persisted.map(e => e.sequence)).size).toBe(persisted.length);
  });

  it('serialises repeated reservations into a strictly increasing sequence', async () => {
    const store = tempStore();
    const versions: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = await allocate(store, 'platform', 'patch', `candidate-${i}`);
      expect(result.ok).toBe(true);
      versions.push(result.version!);
    }
    expect(versions).toEqual(['1.19.3', '1.19.4', '1.19.5', '1.19.6']);
    expect((await store.read()).map(e => e.sequence)).toEqual([0, 1, 2, 3]);
  });

  it('rejects a stale proposal even when it is the only writer', async () => {
    const store = new InMemoryReleaseLedgerStore();
    const stale = buildVersionProposal({
      flow: 'platform', channel: 'canary', candidateId: 'c1',
      bump: 'patch', entries: [], workspaceVersions: ['1.0.0'],
    });
    expect((await reserveVersion(store, stale)).ok).toBe(true);

    const replayed = await reserveVersion(store, stale);
    expect(replayed.ok).toBe(false);
    expect(replayed.ok === false && replayed.code).toBe(ReleaseControlDiagnosticCode.ReservationConflict);
  });
});

describe('burned versions', () => {
  // §3: a cancelled reservation keeps its number forever. The next release
  // steps past it, leaving a gap — which is explicitly acceptable.
  it('never reissues a cancelled version, and tolerates the resulting gap', async () => {
    const store = tempStore();

    const first = await allocate(store, 'platform', 'patch', 'candidate-a');
    expect(first.version).toBe('1.19.3');

    await transitionLedgerEntry(store, 'platform', '1.19.3', 'cancelled', { reason: 'operator abandoned the release' });

    const second = await allocate(store, 'platform', 'patch', 'candidate-b');
    expect(second.version).toBe('1.19.4');
    expect(second.version).not.toBe(first.version);

    const entries = await store.read();
    expect(entries.find(e => e.version === '1.19.3')!.state).toBe('cancelled');
    // The gap: 1.19.3 exists in the ledger and will never be published.
    expect(entries.map(e => e.version)).toEqual(['1.19.3', '1.19.4']);
  });

  it('never reissues a rejected version even when the requested bump lands on it', async () => {
    const store = tempStore();
    const minor = await allocate(store, 'platform', 'minor', 'candidate-a');
    expect(minor.version).toBe('1.20.0');
    await transitionLedgerEntry(store, 'platform', '1.20.0', 'rejected', { reason: 'public smoke failed' });

    // A second minor from the same 1.19.2 baseline would want 1.20.0 again;
    // the policy steps past the burned number instead.
    const next = await allocate(store, 'platform', 'minor', 'candidate-b');
    expect(next.version).toBe('1.21.0');
  });

  it('refuses a proposal whose version is already allocated, regardless of the tail token', async () => {
    const store = new InMemoryReleaseLedgerStore();
    const first = await allocate(store, 'platform', 'patch', 'candidate-a');
    expect(first.ok).toBe(true);

    const entries = await store.read();
    const colliding = {
      ...buildVersionProposal({
        flow: 'platform', channel: 'canary', candidateId: 'c2',
        bump: 'patch', entries,
      }),
      version: first.version!,
    };
    const result = await reserveVersion(store, colliding);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe(ReleaseControlDiagnosticCode.VersionAlreadyAllocated);
  });

  it('rejects a ledger transition that is not in the state table', async () => {
    const store = tempStore();
    await allocate(store, 'platform', 'patch', 'candidate-a');
    await expect(transitionLedgerEntry(store, 'platform', '1.19.3', 'promoted-stable'))
      .rejects.toThrow(/not allowed/);
  });
});
