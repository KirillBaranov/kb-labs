import { describe, expect, it } from 'vitest';

import {
  ACTIVATED_LEDGER_STATES,
  BURNED_LEDGER_STATES,
  FrozenChangelogSchema,
  ReleaseCheckRecordSchema,
  ReleaseCheckReportSchema,
  ReleaseExceptionSchema,
  ReleaseLedgerEntrySchema,
  ReleaseLedgerStateSchema,
  ReleaseVersionProposalSchema,
  isAllowedLedgerTransition,
  releaseLedgerJsonSchemas,
} from './release-ledger.schema';
import { ReleaseControlChannelSchema } from './release-control-plane.schema';

const LEDGER_ENTRY = {
  schema: 'kb.release-ledger-entry/1',
  sequence: 0,
  flow: 'platform',
  version: '2.120.0',
  channel: 'canary',
  state: 'reserved',
  releaseId: 'platform-2.120.0',
  candidateId: 'platform-2.120.0-a',
  reservedAt: '2026-08-30T00:00:00Z',
  updatedAt: '2026-08-30T00:00:00Z',
  transitions: [{ from: null, to: 'reserved', at: '2026-08-30T00:00:00Z', actor: 'release-plugin' }],
  signature: null,
};

describe('release ledger contracts', () => {
  it('declares exactly the six §3 ledger states', () => {
    expect([...ReleaseLedgerStateSchema.options].sort()).toEqual(
      ['active-canary', 'cancelled', 'promoted-stable', 'published', 'rejected', 'reserved'],
    );
  });

  // Burned and activated are disjoint by construction: a version cannot both
  // have reached users and have been abandoned before doing so.
  it('keeps burned and activated states disjoint', () => {
    const burned = new Set<string>(BURNED_LEDGER_STATES);
    expect(ACTIVATED_LEDGER_STATES.some(state => burned.has(state))).toBe(false);
  });

  it('accepts a well-formed ledger entry and rejects unknown fields', () => {
    expect(() => ReleaseLedgerEntrySchema.parse(LEDGER_ENTRY)).not.toThrow();
    expect(() => ReleaseLedgerEntrySchema.parse({ ...LEDGER_ENTRY, note: 'extra' })).toThrow();
  });

  it('rejects a non-SemVer version — a ledger entry must identify exact bytes', () => {
    expect(() => ReleaseLedgerEntrySchema.parse({ ...LEDGER_ENTRY, version: 'latest' })).toThrow();
  });

  it('uses the control-plane channel enum, not a second copy', () => {
    for (const channel of ReleaseControlChannelSchema.options) {
      expect(() => ReleaseLedgerEntrySchema.parse({ ...LEDGER_ENTRY, channel })).not.toThrow();
    }
  });

  it('permits only the transitions the state table declares', () => {
    expect(isAllowedLedgerTransition('reserved', 'published')).toBe(true);
    expect(isAllowedLedgerTransition('active-canary', 'promoted-stable')).toBe(true);
    // Terminal-and-occupied: a burned version never comes back.
    expect(isAllowedLedgerTransition('cancelled', 'reserved')).toBe(false);
    expect(isAllowedLedgerTransition('rejected', 'published')).toBe(false);
    // A canary must be published before a pointer can activate it.
    expect(isAllowedLedgerTransition('reserved', 'active-canary')).toBe(false);
  });

  it('requires a compare-and-set token on every version proposal', () => {
    const proposal = {
      schema: 'kb.release-version-proposal/1',
      flow: 'platform',
      channel: 'canary',
      candidateId: 'c1',
      baselineVersion: '2.119.0',
      baselineSource: 'ledger',
      version: '2.120.0',
      bump: 'minor',
      preconditions: { expectedTailSequence: 4, knownVersions: ['2.119.0'] },
      proposedAt: '2026-08-30T00:00:00Z',
      signature: null,
    };
    expect(() => ReleaseVersionProposalSchema.parse(proposal)).not.toThrow();
    const { preconditions: _omitted, ...withoutToken } = proposal;
    expect(() => ReleaseVersionProposalSchema.parse(withoutToken)).toThrow();
  });
});

describe('check report contract', () => {
  const record = {
    id: 'source.pack-clean-install',
    stage: 'source',
    required: true,
    status: 'passed',
    startedAt: '2026-08-30T00:00:00Z',
    endedAt: '2026-08-30T00:00:10Z',
    evidenceRef: null,
    diagnostics: [],
  };

  it('carries exactly the §6A.3 per-check fields', () => {
    expect(() => ReleaseCheckRecordSchema.parse(record)).not.toThrow();
    expect(() => ReleaseCheckRecordSchema.parse({ ...record, extra: 1 })).toThrow();
    for (const key of ['id', 'stage', 'required', 'status', 'startedAt', 'endedAt', 'evidenceRef', 'diagnostics']) {
      const { [key]: _dropped, ...missing } = record as Record<string, unknown>;
      expect(() => ReleaseCheckRecordSchema.parse(missing)).toThrow();
    }
  });

  it('accepts not-implemented as a distinct status from passed', () => {
    expect(() => ReleaseCheckRecordSchema.parse({ ...record, status: 'not-implemented' })).not.toThrow();
    expect(() => ReleaseCheckRecordSchema.parse({ ...record, status: 'probably-fine' })).toThrow();
  });

  it('validates a whole report', () => {
    expect(() => ReleaseCheckReportSchema.parse({
      schema: 'kb.release-check-report/1',
      flow: 'platform',
      channel: 'canary',
      candidateId: 'c1',
      ok: false,
      blockedGates: ['approval'],
      checks: [{ ...record, status: 'failed' }],
      generatedAt: '2026-08-30T00:00:11Z',
      signature: null,
    })).not.toThrow();
  });
});

describe('exception contract', () => {
  const exception = {
    schema: 'kb.release-exception/1',
    exceptionId: 'exception-1',
    flow: 'platform',
    candidateId: 'c1',
    checkIds: ['source.pack-clean-install'],
    reason: 'registry outage during a canary-only run',
    operator: 'kirill',
    createdAt: '2026-08-30T00:00:00Z',
    expiresAt: '2026-08-30T06:00:00Z',
    stablePromotionForbidden: true,
    signature: null,
  };

  it('accepts a complete exception', () => {
    expect(() => ReleaseExceptionSchema.parse(exception)).not.toThrow();
  });

  // The literal `true` is the mechanism, not a convention: there is no shape of
  // this document that permits stable promotion.
  it('has no representation in which stable promotion is still permitted', () => {
    expect(() => ReleaseExceptionSchema.parse({ ...exception, stablePromotionForbidden: false })).toThrow();
  });

  it('rejects a blanket waiver and a placeholder reason', () => {
    expect(() => ReleaseExceptionSchema.parse({ ...exception, checkIds: [] })).toThrow();
    expect(() => ReleaseExceptionSchema.parse({ ...exception, reason: 'meh' })).toThrow();
  });
});

describe('changelog freeze contract', () => {
  it('binds content to a digest and refuses an absolute or escaping path', () => {
    const frozen = {
      schema: 'kb.release-changelog-freeze/1',
      candidateId: 'c1',
      flow: 'platform',
      frozenAt: '2026-08-30T00:00:00Z',
      changelogSha256: 'a'.repeat(64),
      entries: [{ path: 'CHANGELOG.md', sha256: 'b'.repeat(64), bytes: 3, content: 'x\n' }],
      signature: null,
    };
    expect(() => FrozenChangelogSchema.parse(frozen)).not.toThrow();
    expect(() => FrozenChangelogSchema.parse({
      ...frozen, entries: [{ ...frozen.entries[0], path: '/etc/passwd' }],
    })).toThrow();
    expect(() => FrozenChangelogSchema.parse({
      ...frozen, entries: [{ ...frozen.entries[0], path: '../escape.md' }],
    })).toThrow();
  });
});

describe('JSON Schema documents', () => {
  it('stamps a stable $id on every ledger-side contract', () => {
    for (const [name, schema] of Object.entries(releaseLedgerJsonSchemas)) {
      expect((schema as { $id?: string }).$id, name)
        .toMatch(/^https:\/\/schemas\.kb-labs\.dev\/release-control-plane\/kb\..+\.schema\.json$/);
    }
  });
});
