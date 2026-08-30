/**
 * Versioned, transport-neutral contracts for the release control plane.
 *
 * Every object is strict on purpose: these documents cross plugin, Workflow,
 * CI and launcher boundaries, so silently accepting an unknown field would
 * make an approval cover a different payload than the receiver observes.
 */

import { createHash } from 'node:crypto';

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'expected lowercase SHA-256 hex');
const rfc3339 = z.string().datetime({ offset: true });
const nonEmpty = z.string().min(1);
const relativePath = z.string().min(1).refine(
  value => !value.startsWith('/') && !value.includes('..') && !value.includes('://'),
  'expected a base-relative path',
);
const signature = z.string().min(1).nullable().optional();

export const ReleaseControlChannelSchema = z.enum(['canary', 'stable', 'experimental']);
export type ReleaseControlChannel = z.infer<typeof ReleaseControlChannelSchema>;

const PackageSetEntrySchema = z.object({
  name: nonEmpty,
  version: nonEmpty,
}).strict();

const PointerReferenceSchema = z.object({
  path: relativePath,
  sha256,
}).strict();

const NpmTagSchema = z.object({
  package: nonEmpty,
  tag: nonEmpty,
  version: nonEmpty,
}).strict();

const CandidateIdentitySchema = z.object({
  receiptId: nonEmpty,
  releaseId: nonEmpty,
  bundleSha256: sha256,
  indexSha256: sha256,
}).strict();

export const CandidateReleaseIntentSchema = z.object({
  schema: z.literal('kb.release-intent/1'),
  operation: z.literal('candidate'),
  releaseId: nonEmpty,
  candidateId: nonEmpty,
  source: z.object({
    plannedCommit: z.string().regex(/^[a-f0-9]{40}$/, 'expected full git SHA'),
    branch: z.literal('master'),
  }).strict(),
  flow: nonEmpty,
  requestedTarget: z.literal('canary'),
  planSha256: sha256,
  mutationSha256: sha256,
  packageSet: z.array(PackageSetEntrySchema).min(1),
  signature,
}).strict();

export const PromotionReleaseIntentSchema = z.object({
  schema: z.literal('kb.release-intent/1'),
  operation: z.literal('promotion'),
  releaseId: nonEmpty,
  candidate: CandidateIdentitySchema,
  requestedTarget: z.literal('stable'),
  currentStablePointerSha256: sha256.nullable(),
  promotionPlanSha256: sha256,
  signature,
}).strict();

export const ReleaseIntentSchema = z.discriminatedUnion('operation', [
  CandidateReleaseIntentSchema,
  PromotionReleaseIntentSchema,
]);
export type ReleaseIntent = z.infer<typeof ReleaseIntentSchema>;

export const ReleaseBundleSchema = z.object({
  schema: z.literal('kb.release-bundle/1'),
  releaseId: nonEmpty,
  candidateId: nonEmpty,
  bundleSha256: sha256,
  intentSha256: sha256,
  indexSha256: sha256,
  treeSha256: sha256,
  files: z.array(z.object({
    path: relativePath,
    sha256,
    size: z.number().int().nonnegative(),
  }).strict()).min(1),
  signature,
}).strict();
export type ReleaseBundle = z.infer<typeof ReleaseBundleSchema>;

export const ReleaseReceiptStateSchema = z.enum([
  'planned',
  'source-checked',
  'staged',
  'bundled',
  'approved',
  'committed',
  'artifact-delivery-requested',
  'artifacts-published',
  'candidate-smoke-passed',
  'canary-activation-requested',
  'canary-active',
  'promotion-planned',
  'promotion-checked',
  'promotion-approved',
  'stable-preflight',
  'stable-staged',
  'stable-committing',
  'stable-active',
  'stable-observing',
  'rollback-requested',
  'rolled-back',
  'rollback-needs-attention',
  'completed',
  'cancelled',
  'rejected',
  'needs-attention',
]);
export type ReleaseReceiptState = z.infer<typeof ReleaseReceiptStateSchema>;

const ReceiptTransitionSchema = z.object({
  from: ReleaseReceiptStateSchema.nullable(),
  to: ReleaseReceiptStateSchema,
  at: rfc3339,
  actor: nonEmpty,
  reason: z.string().min(1).optional(),
}).strict();

const EvidenceReferenceSchema = z.object({
  id: nonEmpty,
  kind: nonEmpty,
  sha256: sha256.optional(),
  uri: z.string().url().optional(),
}).strict();

export const ReleaseReceiptSchema = z.object({
  schema: z.literal('kb.release-receipt/1'),
  receiptId: nonEmpty,
  releaseId: nonEmpty,
  candidateId: nonEmpty.optional(),
  bundleSha256: sha256.optional(),
  indexSha256: sha256.optional(),
  state: ReleaseReceiptStateSchema,
  releaseCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  treeSha256: sha256.optional(),
  transitions: z.array(ReceiptTransitionSchema),
  evidence: z.array(EvidenceReferenceSchema),
  signature,
}).strict();
export type ReleaseReceipt = z.infer<typeof ReleaseReceiptSchema>;

export const DeliveryEvidenceSchema = z.object({
  schema: z.literal('kb.delivery-evidence/1'),
  receiptId: nonEmpty,
  candidateId: nonEmpty,
  bundleSha256: sha256,
  operation: z.enum(['publish-artifacts', 'stage-channel', 'commit-channel', 'compensate-channel']),
  targetChannel: ReleaseControlChannelSchema.optional(),
  ciRunId: nonEmpty,
  observedAt: rfc3339,
  artifacts: z.array(z.object({
    url: z.string().url(),
    sha256,
  }).strict()),
  observedDistTags: z.array(NpmTagSchema),
  result: z.enum(['succeeded', 'degraded', 'failed']),
  signature,
}).strict();
export type DeliveryEvidence = z.infer<typeof DeliveryEvidenceSchema>;

export const ReleaseDescriptorSchema = z.object({
  schema: z.literal('kb.release/1'),
  releaseId: nonEmpty,
  candidateId: nonEmpty,
  bundleSha256: sha256,
  index: PointerReferenceSchema,
  launcher: z.object({
    version: nonEmpty,
    artifacts: z.array(z.object({
      os: z.enum(['linux', 'darwin']),
      arch: z.enum(['amd64', 'arm64']),
      path: relativePath,
      sha256,
    }).strict()).min(1),
  }).strict(),
  preparedAt: rfc3339,
  signature,
}).strict();
export type ReleaseDescriptor = z.infer<typeof ReleaseDescriptorSchema>;

export const ReleaseChannelPointerSchema = z.object({
  schema: z.literal('kb.release-channel/1'),
  channel: ReleaseControlChannelSchema,
  releaseId: nonEmpty,
  release: PointerReferenceSchema,
  signature,
}).strict();
export type ReleaseChannelPointer = z.infer<typeof ReleaseChannelPointerSchema>;

export const ReleaseDeliveryRequestSchema = z.object({
  schema: z.literal('kb.release-delivery-request/1'),
  receiptId: nonEmpty,
  candidateId: nonEmpty,
  bundle: z.object({
    uri: z.string().url(),
    sha256,
  }).strict(),
  expectedBundleSha256: sha256,
  stepId: nonEmpty,
  operation: z.enum(['publish-artifacts', 'stage-channel', 'commit-channel', 'compensate-channel']),
  targetChannel: ReleaseControlChannelSchema.optional(),
  expectedPreviousPointerSha256: sha256.nullable().optional(),
  pointerPlanSha256: sha256.optional(),
}).strict();
export type ReleaseDeliveryRequest = z.infer<typeof ReleaseDeliveryRequestSchema>;

export const StablePromotionPlanSchema = z.object({
  schema: z.literal('kb.stable-promotion/1'),
  promotionId: nonEmpty,
  candidate: CandidateIdentitySchema,
  previous: z.object({
    stablePointerSha256: sha256.nullable(),
    releaseId: nonEmpty.nullable(),
    npmTags: z.array(NpmTagSchema),
  }).strict(),
  next: z.object({
    stablePointerSha256: sha256,
    releaseId: nonEmpty,
    npmTags: z.array(NpmTagSchema),
  }).strict(),
  leaseKey: nonEmpty,
  observation: z.object({
    durationSeconds: z.number().int().positive(),
    minimumSamples: z.number().int().nonnegative(),
    triggers: z.array(nonEmpty),
  }).strict(),
  signature,
}).strict();
export type StablePromotionPlan = z.infer<typeof StablePromotionPlanSchema>;

export const ReleaseSupportPolicySchema = z.object({
  schema: z.literal('kb.release-support/1'),
  contract: z.literal('kb.release/1'),
  minimumSupported: nonEmpty,
  supported: z.array(nonEmpty),
  retired: z.array(z.object({
    releaseId: nonEmpty,
    reason: nonEmpty,
    replacedBy: nonEmpty.optional(),
  }).strict()),
  legacyNotice: nonEmpty,
  generatedAt: rfc3339,
  signature,
}).strict();
export type ReleaseSupportPolicy = z.infer<typeof ReleaseSupportPolicySchema>;

export const ReleaseReceiptTransitions = [
  ['planned', 'source-checked'],
  ['source-checked', 'staged'],
  ['staged', 'bundled'],
  ['bundled', 'approved'],
  ['approved', 'committed'],
  ['committed', 'artifact-delivery-requested'],
  ['artifact-delivery-requested', 'artifacts-published'],
  ['artifacts-published', 'candidate-smoke-passed'],
  ['candidate-smoke-passed', 'canary-activation-requested'],
  ['canary-activation-requested', 'canary-active'],
  ['canary-active', 'completed'],
  ['promotion-planned', 'promotion-checked'],
  ['promotion-checked', 'promotion-approved'],
  ['promotion-approved', 'stable-preflight'],
  ['stable-preflight', 'stable-staged'],
  ['stable-staged', 'stable-committing'],
  ['stable-committing', 'stable-active'],
  ['stable-active', 'stable-observing'],
  ['stable-observing', 'completed'],
  ['stable-preflight', 'rollback-requested'],
  ['stable-staged', 'rollback-requested'],
  ['stable-committing', 'rollback-requested'],
  ['stable-active', 'rollback-requested'],
  ['stable-observing', 'rollback-requested'],
  ['rollback-requested', 'rolled-back'],
] as const satisfies ReadonlyArray<readonly [ReleaseReceiptState, ReleaseReceiptState]>;

export function isAllowedReceiptTransition(from: ReleaseReceiptState, to: ReleaseReceiptState): boolean {
  return ReleaseReceiptTransitions.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to);
}

/** Canonical JSON used for every digest-bearing release control-plane document. */
export function canonicalJson(value: unknown): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value))) {
    throw new TypeError('canonical release JSON accepts safe integer numbers only');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new TypeError(`cannot canonicalize ${typeof value}`);
}

export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const schemas = {
  ReleaseIntent: ReleaseIntentSchema,
  ReleaseBundle: ReleaseBundleSchema,
  ReleaseReceipt: ReleaseReceiptSchema,
  DeliveryEvidence: DeliveryEvidenceSchema,
  ReleaseDescriptor: ReleaseDescriptorSchema,
  ReleaseChannelPointer: ReleaseChannelPointerSchema,
  ReleaseDeliveryRequest: ReleaseDeliveryRequestSchema,
  StablePromotionPlan: StablePromotionPlanSchema,
  ReleaseSupportPolicy: ReleaseSupportPolicySchema,
} as const;

const schemaIds: Record<keyof typeof schemas, string> = {
  ReleaseIntent: 'kb.release-intent/1',
  ReleaseBundle: 'kb.release-bundle/1',
  ReleaseReceipt: 'kb.release-receipt/1',
  DeliveryEvidence: 'kb.delivery-evidence/1',
  ReleaseDescriptor: 'kb.release/1',
  ReleaseChannelPointer: 'kb.release-channel/1',
  ReleaseDeliveryRequest: 'kb.release-delivery-request/1',
  StablePromotionPlan: 'kb.stable-promotion/1',
  ReleaseSupportPolicy: 'kb.release-support/1',
};

export const releaseControlPlaneJsonSchemas = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, zodToJsonSchema(schema, {
    name,
    $refStrategy: 'none',
  })]),
) as Record<keyof typeof schemas, ReturnType<typeof zodToJsonSchema>>;

for (const [name, id] of Object.entries(schemaIds)) {
  const target = (releaseControlPlaneJsonSchemas as Record<string, { $id?: string }>)[name];
  if (target) {
    target.$id = `https://schemas.kb-labs.dev/release-control-plane/${id.replace('/', '-')}.schema.json`;
  }
}

/**
 * Error taxonomy for release/support diagnostics (execution plan §7.3).
 * These codes are the only vocabulary `kb-create` and the launcher use to
 * distinguish legacy-epoch rejection from in-contract retirement from a
 * canary that was reserved but never activated.
 */
export const ReleaseDiagnosticCode = {
  LegacyUnsupported: 'KB_CREATE_RELEASE_LEGACY_UNSUPPORTED',
  Retired: 'KB_CREATE_RELEASE_RETIRED',
  NotActivated: 'KB_CREATE_RELEASE_NOT_ACTIVATED',
} as const;
export type ReleaseDiagnosticCode = typeof ReleaseDiagnosticCode[keyof typeof ReleaseDiagnosticCode];
