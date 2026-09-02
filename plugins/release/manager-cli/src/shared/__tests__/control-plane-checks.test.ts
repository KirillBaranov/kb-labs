/**
 * Staged checks, break-glass exceptions and changelog freezing
 * (execution plan PR 4 items 4, 6 and 7).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ReleaseCheckReportSchema, ReleaseControlDiagnosticCode } from '@kb-labs/release-manager-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ChangelogFreezeError,
  DEFAULT_EXCEPTION_TTL_HOURS,
  MAX_EXCEPTION_TTL_HOURS,
  RELEASE_CHECK_GROUPS,
  ReleaseExceptionError,
  blockedGates,
  checksForChannel,
  checksForStage,
  createReleaseException,
  freezeChangelog,
  frozenChangelogEntries,
  isStablePromotionForbidden,
  readExceptions,
  readFrozenChangelog,
  runStagedChecks,
  type ReleaseCheckDefinition,
} from '../control-plane/index.js';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-cp-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

const CONTEXT = { repoRoot: '/nowhere', flow: 'platform', channel: 'canary' as const, candidateId: 'candidate-1' };

function definition(overrides: Partial<ReleaseCheckDefinition> & { id: string }): ReleaseCheckDefinition {
  return {
    stage: 'source',
    gate: 'approval',
    title: overrides.id,
    required: true,
    ...overrides,
  };
}

describe('check groups', () => {
  it('covers every group of the §6A.3 table across the four stages', () => {
    expect(checksForStage('source').map(c => c.id)).toEqual([
      'source.branch-clean-tag-intent',
      'source.lockfile-toolchain-dependency-direction',
      'source.build-lint-typecheck-unit',
      'source.pack-clean-install',
      'source.migration-rollback-class-downgrade',
    ]);
    expect(checksForStage('artifact').map(c => c.id)).toEqual([
      'artifact.package-manifest-publishability',
      'artifact.checksums-inventory-graph',
    ]);
    expect(checksForStage('delivery')).toHaveLength(1);
    expect(checksForStage('post-delivery')).toHaveLength(1);
  });

  // §6A.3 puts migration downgrade validation behind the stable gate: there is
  // no previous stable for a canary to downgrade to.
  it('restricts migration rollback/downgrade validation to the stable channel', () => {
    const canary = checksForChannel('canary').map(c => c.id);
    const stable = checksForChannel('stable').map(c => c.id);
    expect(canary).not.toContain('source.migration-rollback-class-downgrade');
    expect(stable).toContain('source.migration-rollback-class-downgrade');
  });
});

describe('staged check report', () => {
  it('emits the structured per-check shape Workflow consumes instead of stdout', async () => {
    const report = await runStagedChecks({
      context: CONTEXT,
      stages: ['source'],
      definitions: [definition({
        id: 'source.pack-clean-install',
        run: () => ({ ok: true, diagnostics: [], evidenceRef: 'log://pack' }),
      })],
    });

    expect(() => ReleaseCheckReportSchema.parse(report)).not.toThrow();
    const [record] = report.checks;
    expect(Object.keys(record!).sort()).toEqual(
      ['diagnostics', 'endedAt', 'evidenceRef', 'id', 'required', 'stage', 'startedAt', 'status'],
    );
    expect(record!.status).toBe('passed');
    expect(record!.evidenceRef).toBe('log://pack');
    expect(report.ok).toBe(true);
    expect(report.blockedGates).toEqual([]);
  });

  it('reports a failure with codes and names the gate it blocks', async () => {
    const report = await runStagedChecks({
      context: CONTEXT,
      stages: ['source'],
      definitions: [definition({
        id: 'source.build-lint-typecheck-unit',
        gate: 'approval',
        run: () => ({ ok: false, diagnostics: [{ code: 'X_FAILED', message: 'typecheck failed', severity: 'error' }] }),
      })],
    });
    expect(report.ok).toBe(false);
    expect(report.checks[0]!.status).toBe('failed');
    expect(report.checks[0]!.diagnostics[0]!.code).toBe('X_FAILED');
    expect(report.blockedGates).toEqual(['approval']);
  });

  it('turns a thrown executor into a diagnostic rather than an unhandled failure', async () => {
    const report = await runStagedChecks({
      context: CONTEXT,
      stages: ['source'],
      definitions: [definition({ id: 'source.pack-clean-install', run: () => { throw new Error('boom'); } })],
    });
    expect(report.checks[0]!.status).toBe('failed');
    expect(report.checks[0]!.diagnostics[0]!.code).toBe('KB_RELEASE_CHECK_THREW');
  });

  // The stub contract for PR 5/6/7: a declared-but-unimplemented gate must
  // never look satisfied, or PR 4 would ship with the delivery gates open.
  it('reports declared-but-unimplemented checks as not-implemented, and blocks on them', async () => {
    const report = await runStagedChecks({
      context: CONTEXT,
      stages: ['delivery', 'post-delivery'],
    });
    expect(report.checks.map(c => c.status)).toEqual(['not-implemented', 'not-implemented']);
    expect(report.checks.every(c => c.status !== 'passed')).toBe(true);
    expect(report.blockedGates.sort()).toEqual(['next-transition', 'stable-transition']);
    expect(report.ok).toBe(false);
  });

  it('does not let a non-required failure block its gate', () => {
    const records = [{
      id: 'source.pack-clean-install',
      stage: 'source' as const,
      required: false,
      status: 'failed' as const,
      startedAt: '2026-08-30T00:00:00Z',
      endedAt: '2026-08-30T00:00:01Z',
      evidenceRef: null,
      diagnostics: [],
    }];
    expect(blockedGates(records)).toEqual([]);
  });
});

describe('break-glass exceptions', () => {
  const base = {
    flow: 'platform',
    candidateId: 'candidate-1',
    checkIds: ['source.pack-clean-install'],
    reason: 'registry outage during a canary-only run',
    operator: 'kirill',
  };

  it('requires reason, TTL and operator, and marks the candidate stable-forbidden', () => {
    const repoRoot = tempRoot();
    const { exception, path } = createReleaseException({ repoRoot, ...base, ttlHours: 6 });

    expect(exception.stablePromotionForbidden).toBe(true);
    expect(exception.operator).toBe('kirill');
    expect(Date.parse(exception.expiresAt) - Date.parse(exception.createdAt)).toBe(6 * 3600_000);
    expect(path.endsWith('.json')).toBe(true);
    expect(readExceptions(repoRoot, 'candidate-1')).toHaveLength(1);
    expect(isStablePromotionForbidden(repoRoot, 'candidate-1')).toBe(true);
  });

  it('rejects a blanket waiver, an unknown check id, a placeholder reason and an absurd TTL', () => {
    const repoRoot = tempRoot();
    expect(() => createReleaseException({ repoRoot, ...base, checkIds: [] })).toThrow(ReleaseExceptionError);
    expect(() => createReleaseException({ repoRoot, ...base, checkIds: ['nope'] })).toThrow(/Unknown check id/);
    expect(() => createReleaseException({ repoRoot, ...base, reason: 'meh' })).toThrow(ReleaseExceptionError);
    expect(() => createReleaseException({ repoRoot, ...base, ttlHours: MAX_EXCEPTION_TTL_HOURS + 1 }))
      .toThrow(/TTL must be between/);
  });

  it('defaults to a 24-hour TTL', () => {
    const repoRoot = tempRoot();
    const { exception } = createReleaseException({ repoRoot, ...base });
    expect(Date.parse(exception.expiresAt) - Date.parse(exception.createdAt))
      .toBe(DEFAULT_EXCEPTION_TTL_HOURS * 3600_000);
  });

  it('waives a covered failure while it is live, and stops waiving once expired', async () => {
    const repoRoot = tempRoot();
    const { exception } = createReleaseException({ repoRoot, ...base, ttlHours: 1 });
    const failing = [definition({
      id: 'source.pack-clean-install',
      run: () => ({ ok: false, diagnostics: [{ code: 'X', message: 'failed', severity: 'error' as const }] }),
    })];
    const context = { ...CONTEXT, repoRoot };

    const live = await runStagedChecks({
      context, stages: ['source'], definitions: failing, exceptions: [exception],
    });
    expect(live.checks[0]!.status).toBe('excepted');
    expect(live.ok).toBe(true);
    expect(live.checks[0]!.diagnostics.map(d => d.code)).toContain('KB_RELEASE_CHECK_EXCEPTED');

    const expired = await runStagedChecks({
      context,
      stages: ['source'],
      definitions: failing,
      exceptions: [exception],
      now: () => new Date(Date.parse(exception.expiresAt) + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });
    expect(expired.checks[0]!.status).toBe('failed');
    expect(expired.ok).toBe(false);
  });

  // The irreversibility: an expired exception stops waiving checks, but the
  // candidate does not become promotable again.
  it('keeps stable promotion forbidden after the exception has expired', () => {
    const repoRoot = tempRoot();
    createReleaseException({
      repoRoot, ...base, ttlHours: 1,
      now: () => new Date(Date.now() - 10 * 3600_000),
    });
    expect(isStablePromotionForbidden(repoRoot, 'candidate-1')).toBe(true);
  });

  it('only waives checks it names, for the candidate it names', async () => {
    const repoRoot = tempRoot();
    const { exception } = createReleaseException({ repoRoot, ...base });
    const failing = [definition({
      id: 'source.build-lint-typecheck-unit',
      run: () => ({ ok: false, diagnostics: [] }),
    })];
    const other = await runStagedChecks({
      context: { ...CONTEXT, repoRoot }, stages: ['source'], definitions: failing, exceptions: [exception],
    });
    expect(other.checks[0]!.status).toBe('failed');

    const wrongCandidate = await runStagedChecks({
      context: { ...CONTEXT, repoRoot, candidateId: 'candidate-2' },
      stages: ['source'],
      definitions: [definition({ id: 'source.pack-clean-install', run: () => ({ ok: false, diagnostics: [] }) })],
      exceptions: [exception],
    });
    expect(wrongCandidate.checks[0]!.status).toBe('failed');
  });

  it('names only real check ids in its error message so a typo is actionable', () => {
    const repoRoot = tempRoot();
    let message = '';
    try { createReleaseException({ repoRoot, ...base, checkIds: ['typo'] }); }
    catch (error) { message = (error as Error).message; }
    for (const check of RELEASE_CHECK_GROUPS) { expect(message).toContain(check.id); }
  });
});

describe('changelog freezing', () => {
  it('freezes the exact bytes and hands them back on an identical retry', () => {
    const repoRoot = tempRoot();
    const entries = { 'CHANGELOG.md': '# 1.20.0\n\n- did a thing\n' };

    const first = freezeChangelog({ repoRoot, flow: 'platform', candidateId: 'c1', entries });
    expect(first.created).toBe(true);

    const retry = freezeChangelog({ repoRoot, flow: 'platform', candidateId: 'c1', entries });
    expect(retry.created).toBe(false);
    expect(retry.frozen.changelogSha256).toBe(first.frozen.changelogSha256);
  });

  // The point of the freeze: a second LLM generation cannot substitute text
  // under a digest that already covers the first one.
  it('refuses to regenerate different bytes for the same candidate', () => {
    const repoRoot = tempRoot();
    freezeChangelog({ repoRoot, flow: 'platform', candidateId: 'c1', entries: { 'CHANGELOG.md': 'first\n' } });

    let thrown: unknown;
    try {
      freezeChangelog({ repoRoot, flow: 'platform', candidateId: 'c1', entries: { 'CHANGELOG.md': 'regenerated\n' } });
    } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ChangelogFreezeError);
    expect((thrown as ChangelogFreezeError).code).toBe(ReleaseControlDiagnosticCode.ChangelogAlreadyFrozen);
    // The original bytes survive the rejected attempt.
    expect(frozenChangelogEntries(readFrozenChangelog(repoRoot, 'c1')!)).toEqual({ 'CHANGELOG.md': 'first\n' });
  });

  it('digests content, not the moment of freezing', () => {
    const repoRoot = tempRoot();
    const a = freezeChangelog({
      repoRoot, flow: 'platform', candidateId: 'a',
      entries: { 'CHANGELOG.md': 'same\n' }, frozenAt: '2026-08-30T00:00:00Z',
    });
    const b = freezeChangelog({
      repoRoot, flow: 'platform', candidateId: 'b',
      entries: { 'CHANGELOG.md': 'same\n' }, frozenAt: '2026-08-31T00:00:00Z',
    });
    expect(a.frozen.changelogSha256).toBe(b.frozen.changelogSha256);
  });

  it('freezes every path, and a different candidate is a different freeze', () => {
    const repoRoot = tempRoot();
    const result = freezeChangelog({
      repoRoot, flow: 'platform', candidateId: 'c1',
      entries: { 'b/CHANGELOG.md': 'b\n', 'a/CHANGELOG.md': 'a\n' },
    });
    // Sorted so the digest is order-independent across callers.
    expect(result.frozen.entries.map(e => e.path)).toEqual(['a/CHANGELOG.md', 'b/CHANGELOG.md']);
    expect(readFrozenChangelog(repoRoot, 'c2')).toBeNull();
  });

  it('writes a file that fails to load if it is tampered with', () => {
    const repoRoot = tempRoot();
    const { path } = freezeChangelog({
      repoRoot, flow: 'platform', candidateId: 'c1', entries: { 'CHANGELOG.md': 'x\n' },
    });
    writeFileSync(path, JSON.stringify({ schema: 'kb.release-changelog-freeze/1', entries: [] }));
    expect(() => readFrozenChangelog(repoRoot, 'c1')).toThrow();
  });
});
