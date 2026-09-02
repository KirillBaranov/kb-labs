/**
 * `planCandidate` — the step that turns a channel request into a
 * ledger-reserved, changelog-frozen `intent.json` (execution plan PR 4).
 *
 * This is the seam between the channel/version policy and PR 3's
 * `stage → package → seal → commit` pipeline, so the assertions are mostly
 * about what the intent binds to rather than about how it was computed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';
import { ReleaseChannelError } from '@kb-labs/release-manager-core';
import { afterEach, describe, expect, it } from 'vitest';

import { loadCandidateIntent } from '../bundle/intent.js';
import {
  InMemoryReleaseLedgerStore,
  ReleasePlanError,
  planCandidate,
  readFrozenChangelog,
} from '../control-plane/index.js';
import { createReleaseFixture, type ReleaseFixture } from './fixtures/release-workspace.js';

const fixtures: ReleaseFixture[] = [];

function fixture(): ReleaseFixture {
  const created = createReleaseFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) {
    rmSync(join(created.repoRoot, '..'), { recursive: true, force: true });
  }
});

function baseInput(created: ReleaseFixture) {
  return {
    repoRoot: created.repoRoot,
    flow: 'platform',
    requestedTarget: 'canary',
    bump: 'minor' as const,
    packages: [
      { name: '@kb-labs/core-runtime', currentVersion: '2.0.0' },
      { name: '@kb-labs/sdk', currentVersion: '2.0.0' },
    ],
    plannedCommit: created.plannedCommit,
    branch: 'master',
    changelogs: { 'CHANGELOG.md': '# platform\n\n- a change\n' },
    planSha256: '0'.repeat(64),
  };
}

describe('planCandidate — channel policy', () => {
  it('rejects --target experimental with a typed diagnostic before anything is written', async () => {
    const created = fixture();
    const store = new InMemoryReleaseLedgerStore();

    let thrown: unknown;
    try {
      await planCandidate({ ...baseInput(created), requestedTarget: 'experimental', store });
    } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ReleaseChannelError);
    expect((thrown as ReleaseChannelError).code)
      .toBe(ReleaseControlDiagnosticCode.ExperimentalChannelUnavailable);

    // A rejected target must not burn a version.
    expect(await store.read()).toEqual([]);
  });

  it('rejects an unknown target', async () => {
    const created = fixture();
    await expect(planCandidate({
      ...baseInput(created), requestedTarget: 'nightly', store: new InMemoryReleaseLedgerStore(),
    })).rejects.toBeInstanceOf(ReleaseChannelError);
  });

  // §3: stable is a promotion of existing bytes, so planning a stable
  // *candidate* would allocate a version for a release that must not have one.
  it('rejects --target stable as a candidate operation', async () => {
    const created = fixture();
    const store = new InMemoryReleaseLedgerStore();
    let thrown: unknown;
    try {
      await planCandidate({ ...baseInput(created), requestedTarget: 'stable', store });
    } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(ReleasePlanError);
    expect((thrown as ReleasePlanError).code).toBe('KB_RELEASE_STABLE_NOT_A_CANDIDATE');
    expect(await store.read()).toEqual([]);
  });
});

describe('planCandidate — reservation and intent', () => {
  it('produces a ledger-reserved, channel-aware intent the bundle pipeline can load', async () => {
    const created = fixture();
    const store = new InMemoryReleaseLedgerStore();
    const result = await planCandidate({ ...baseInput(created), store });

    expect(result.channel).toBe('canary');
    expect(result.reservation.state).toBe('reserved');
    expect(result.reservation.version).toBe('2.1.0');
    expect(result.intent.releaseId).toBe('platform-2.1.0');
    // A final SemVer, not a prerelease — this is what makes byte-for-byte
    // promotion to stable possible.
    expect(result.intent.packageSet.every(pkg => pkg.version === '2.1.0')).toBe(true);

    // The intent on disk is exactly what `release stage` will consume.
    expect(existsSync(result.intentPath)).toBe(true);
    const loaded = loadCandidateIntent(result.intentPath);
    expect(loaded.intentSha256).toBe(result.intentSha256);
    expect(loaded.intent.mutationSha256).toBe(result.intent.mutationSha256);
  });

  it('freezes the changelog bytes the intent digest covers', async () => {
    const created = fixture();
    const result = await planCandidate({ ...baseInput(created), store: new InMemoryReleaseLedgerStore() });

    const frozen = readFrozenChangelog(created.repoRoot, result.intent.candidateId);
    expect(frozen!.changelogSha256).toBe(result.changelog.frozen.changelogSha256);
    expect(frozen!.entries[0]!.content).toBe('# platform\n\n- a change\n');
  });

  it('advances past a version the ledger already allocated on a second plan', async () => {
    const created = fixture();
    const store = new InMemoryReleaseLedgerStore();

    const first = await planCandidate({ ...baseInput(created), store });
    // A new candidate id is required — the same candidate would hit the
    // changelog freeze, which is a different (also correct) rejection.
    const second = await planCandidate({ ...baseInput(created), store, candidateId: 'platform-second' });

    expect(second.reservation.version).not.toBe(first.reservation.version);
    expect(second.reservation.version).toBe('2.2.0');
    expect((await store.read()).map(e => e.version)).toEqual(['2.1.0', '2.2.0']);
  });

  it('refuses to re-plan the same candidate with different changelog bytes', async () => {
    const created = fixture();
    const store = new InMemoryReleaseLedgerStore();
    const first = await planCandidate({ ...baseInput(created), store });

    await expect(planCandidate({
      ...baseInput(created),
      store,
      candidateId: first.intent.candidateId,
      changelogs: { 'CHANGELOG.md': '# regenerated\n' },
    })).rejects.toThrow(/already frozen/);
  });

  it('writes the intent under the candidate directory, keyed by candidate id', async () => {
    const created = fixture();
    const result = await planCandidate({ ...baseInput(created), store: new InMemoryReleaseLedgerStore() });
    expect(result.intentPath).toContain(join('.kb', 'release', 'candidates', result.intent.candidateId));
    const raw = JSON.parse(readFileSync(result.intentPath, 'utf8')) as { operation: string; requestedTarget: string };
    expect(raw.operation).toBe('candidate');
    expect(raw.requestedTarget).toBe('canary');
  });

  it('binds the intent to the planned commit, not to whatever HEAD becomes later', async () => {
    const created = fixture();
    const result = await planCandidate({ ...baseInput(created), store: new InMemoryReleaseLedgerStore() });
    expect(result.intent.source.plannedCommit).toBe(created.plannedCommit);
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: created.repoRoot, encoding: 'utf8' }).trim())
      .toBe(result.intent.source.plannedCommit);
  });
});
