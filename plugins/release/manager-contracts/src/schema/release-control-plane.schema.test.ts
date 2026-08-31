import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  canonicalSha256,
  ReleaseApprovalSchema,
  ReleaseReceiptTransitions,
  TERMINAL_RECEIPT_STATES,
  isAllowedReceiptTransition,
  ReleaseDescriptorSchema,
  ReleaseDiagnosticCode,
  DeliveryEvidenceSchema,
  ReleaseBundleProvenanceSchema,
  ReleaseBundleSchema,
  ReleaseChannelPointerSchema,
  releaseGraphNodeKey,
  ReleaseDeliveryRequestSchema,
  ReleaseIntentSchema,
  ReleaseReceiptSchema,
  ReleaseSupportPolicySchema,
  releaseControlPlaneJsonSchemas,
  StablePromotionPlanSchema,
} from './release-control-plane.schema';

const fixture = JSON.parse(readFileSync(
  new URL('../../../../../core/contracts/release-control-plane/fixtures/canonical.json', import.meta.url),
  'utf8',
)) as unknown;

const contractFixtures = JSON.parse(readFileSync(
  new URL('../../../../../core/contracts/release-control-plane/fixtures/valid-contracts.json', import.meta.url),
  'utf8',
)) as Record<string, unknown>;

describe('release control-plane contracts', () => {
  it('uses the shared canonical JSON fixture and digest', () => {
    expect(canonicalJson(fixture)).toBe('{"a":{"x":1,"y":null},"unicode":"é","z":[3,{"a":"text","b":false}]}');
    expect(canonicalSha256(fixture)).toBe('e528cc5e886a233f86c7db96ccca8370c717e0feeed26d895bc5e0efea57214b');
  });

  it('rejects unknown descriptor fields', () => {
    const parsed = ReleaseDescriptorSchema.safeParse({
      schema: 'kb.release/1',
      releaseId: 'platform-2.120.0',
      candidateId: 'platform-2.120.0-a',
      bundleSha256: 'a'.repeat(64),
      index: { path: 'platform/2.120.0/release-index.json', sha256: 'b'.repeat(64) },
      launcher: {
        version: '2.120.0',
        artifacts: [{ os: 'linux', arch: 'amd64', path: 'platform/2.120.0/kb-create', sha256: 'c'.repeat(64) }],
      },
      preparedAt: '2026-08-30T00:00:00Z',
      unexpected: true,
    });

    expect(parsed.success).toBe(false);
  });

  it('validates every public contract against its golden fixture', () => {
    const schemas = {
      releaseIntent: ReleaseIntentSchema,
      releaseBundle: ReleaseBundleSchema,
      releaseBundleProvenance: ReleaseBundleProvenanceSchema,
      releaseReceipt: ReleaseReceiptSchema,
      deliveryEvidence: DeliveryEvidenceSchema,
      releaseDescriptor: ReleaseDescriptorSchema,
      releaseChannelPointer: ReleaseChannelPointerSchema,
      releaseDeliveryRequest: ReleaseDeliveryRequestSchema,
      stablePromotionPlan: StablePromotionPlanSchema,
      releaseSupportPolicy: ReleaseSupportPolicySchema,
    };

    for (const [name, schema] of Object.entries(schemas)) {
      expect(schema.safeParse(contractFixtures[name]).success, name).toBe(true);
    }
  });

  it('publishes strict JSON Schema and a data-driven transition table', () => {
    expect(releaseControlPlaneJsonSchemas.ReleaseDescriptor).toMatchObject({
      $id: 'https://schemas.kb-labs.dev/release-control-plane/kb.release-1.schema.json',
      definitions: {
        ReleaseDescriptor: {
          additionalProperties: false,
        },
      },
    });
    expect(isAllowedReceiptTransition('bundled', 'approved')).toBe(true);
    expect(isAllowedReceiptTransition('bundled', 'completed')).toBe(false);
  });

  it('publishes the PR 5 workflow documents alongside the PR 1 set', () => {
    // The approval and the compensation journal cross the same boundaries the
    // PR 1 documents do — an operator reads the first, a recovering process
    // reads the second — so they are published contracts, not internal shapes.
    const approval = ReleaseApprovalSchema.safeParse({
      schema: 'kb.release-approval/1',
      approvalId: 'rcpt-platform-1.0.0-abc123',
      receiptId: 'rcpt-platform-1.0.0',
      decision: 'approved',
      subject: {
        operation: 'candidate',
        intentSha256: 'a'.repeat(64),
        bundleSha256: 'b'.repeat(64),
        requestedTarget: 'canary',
      },
      subjectSha256: 'c'.repeat(64),
      actor: 'kirill',
      at: '2026-08-31T09:00:00Z',
      signature: null,
    });
    expect(approval.success).toBe(true);
    expect(releaseControlPlaneJsonSchemas.ReleaseApproval).toBeDefined();
    expect(releaseControlPlaneJsonSchemas.StablePromotionJournal).toBeDefined();
  });

  it('records the failure edges §6A.1.5 states in prose beneath the grid', () => {
    // The version-burning split is a contract, not an implementation choice:
    // artifact failure burns, infrastructure failure parks.
    expect(isAllowedReceiptTransition('artifacts-published', 'rejected')).toBe(true);
    expect(isAllowedReceiptTransition('artifacts-published', 'needs-attention')).toBe(true);
    expect(isAllowedReceiptTransition('rollback-requested', 'rollback-needs-attention')).toBe(true);
    // A cancelled/rejected/rolled-back receipt is terminal and has no way out.
    for (const terminal of TERMINAL_RECEIPT_STATES) {
      expect(ReleaseReceiptTransitions.some(([from]) => from === terminal)).toBe(false);
    }
  });

  it('assigns every published contract a distinct $id', () => {
    const ids = Object.values(releaseControlPlaneJsonSchemas).map(schema => (schema as { $id?: string }).$id);
    expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects a bundle provenance that claims a release commit', () => {
    const valid = contractFixtures.releaseBundleProvenance as Record<string, unknown>;
    const provenance = valid.provenance as Record<string, unknown>;
    const parsed = ReleaseBundleProvenanceSchema.safeParse({
      ...valid,
      provenance: { ...provenance, releaseCommit: 'a'.repeat(40) },
    });

    expect(parsed.success).toBe(false);
  });

  it('keys graph nodes by kind, version and binary target', () => {
    expect(releaseGraphNodeKey({ id: '@kb-labs/core-runtime', kind: 'package', version: '2.120.0' }))
      .toBe('package:@kb-labs/core-runtime@2.120.0');
    expect(releaseGraphNodeKey({ id: 'kb-create', kind: 'binary', version: '0.9.0', os: 'linux', arch: 'amd64' }))
      .toBe('binary:kb-create@0.9.0:linux/amd64');
  });

  it('exposes the §7.3 release diagnostic error taxonomy', () => {
    expect(ReleaseDiagnosticCode).toEqual({
      LegacyUnsupported: 'KB_CREATE_RELEASE_LEGACY_UNSUPPORTED',
      Retired: 'KB_CREATE_RELEASE_RETIRED',
      NotActivated: 'KB_CREATE_RELEASE_NOT_ACTIVATED',
    });
  });
});
