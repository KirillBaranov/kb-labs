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

/**
 * Companion document to `bundle.json`, sealed into the bundle directory as
 * `provenance.json`.
 *
 * `bundle.json` answers "which exact bytes are in this bundle"; this document
 * answers "what those bytes mean" — which package each tarball is, how each
 * package is classified, which binary targets were selected and how everything
 * relates in the compatibility graph. Bundle verification (cutover plan §6A.2)
 * cannot enforce classification, graph or version consistency without it, so a
 * sealed bundle is incomplete until both documents are present.
 */
export const ReleasePackageClassificationSchema = z.enum([
  'platform',
  'member',
  'sdk',
  'plugin',
  'adapter',
  /**
   * Escape hatch for a package that ships in the release but is not part of any
   * compatibility line. It must be stated explicitly: rule 6 forbids a package
   * being carried along with no classification at all.
   */
  'deliveryOnly',
]);
export type ReleasePackageClassification = z.infer<typeof ReleasePackageClassificationSchema>;

export const ReleaseBinaryOsSchema = z.enum(['linux', 'darwin', 'windows']);
export const ReleaseBinaryArchSchema = z.enum(['amd64', 'arm64']);

const ReleaseGraphNodeSchema = z.object({
  id: nonEmpty,
  kind: z.enum(['package', 'binary']),
  /** Mandatory for every node, including binaries — an unversioned node cannot be resolved. */
  version: nonEmpty,
  os: ReleaseBinaryOsSchema.optional(),
  arch: ReleaseBinaryArchSchema.optional(),
}).strict();

/**
 * Stable reference for a graph node. Edges and profiles address nodes by this
 * key rather than by bare id, because the same binary id ships for several
 * `{os, arch}` targets and the same package name can appear at more than one
 * version across a promotion window — a bare id would silently resolve to the
 * wrong node instead of dangling.
 */
export function releaseGraphNodeKey(node: {
  id: string;
  kind: 'package' | 'binary';
  version: string;
  os?: string;
  arch?: string;
}): string {
  return node.kind === 'binary'
    ? `binary:${node.id}@${node.version}:${node.os}/${node.arch}`
    : `package:${node.id}@${node.version}`;
}

const ReleaseGraphEdgeSchema = z.object({
  from: nonEmpty,
  to: nonEmpty,
  kind: z.enum(['requires', 'provides']),
  /** SemVer range validated with the shared semver implementation, never ad hoc. */
  range: nonEmpty,
}).strict();

const ReleasePlatformProfileSchema = z.object({
  id: nonEmpty,
  members: z.array(nonEmpty).min(1),
  providers: z.array(nonEmpty),
}).strict();

export const ReleaseCompatibilityGraphSchema = z.object({
  nodes: z.array(ReleaseGraphNodeSchema).min(1),
  edges: z.array(ReleaseGraphEdgeSchema),
  profiles: z.array(ReleasePlatformProfileSchema),
}).strict();
export type ReleaseCompatibilityGraph = z.infer<typeof ReleaseCompatibilityGraphSchema>;

export const ReleaseBundleProvenanceSchema = z.object({
  schema: z.literal('kb.release-bundle-provenance/1'),
  releaseId: nonEmpty,
  candidateId: nonEmpty,
  /**
   * No `releaseCommit` field exists here on purpose: sealing happens before the
   * release commit is created, so a bundle claiming one is describing a tree it
   * could not have been built from. `.strict()` turns that into a hard reject.
   */
  provenance: z.object({
    plannedCommit: z.string().regex(/^[a-f0-9]{40}$/, 'expected full git SHA'),
    treeSha256: sha256,
    intentSha256: sha256,
    sealedAt: rfc3339,
    versions: z.object({
      platform: nonEmpty,
      sdk: nonEmpty.nullable(),
    }).strict(),
  }).strict(),
  /** Verbatim copy of the intent package set; every entry must end up classified. */
  plannedPackages: z.array(PackageSetEntrySchema).min(1),
  packages: z.array(z.object({
    name: nonEmpty,
    version: nonEmpty,
    classification: ReleasePackageClassificationSchema,
    tarball: relativePath.nullable(),
    sha256: sha256.nullable(),
  }).strict()).min(1),
  binaries: z.array(z.object({
    id: nonEmpty,
    version: nonEmpty,
    os: ReleaseBinaryOsSchema,
    arch: ReleaseBinaryArchSchema,
    path: relativePath,
    sha256,
  }).strict()),
  index: z.object({
    path: relativePath,
    sha256,
    version: nonEmpty,
    channelLabel: nonEmpty,
  }).strict(),
  graph: ReleaseCompatibilityGraphSchema,
  signature,
}).strict();
export type ReleaseBundleProvenance = z.infer<typeof ReleaseBundleProvenanceSchema>;

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
  ReleaseBundleProvenance: ReleaseBundleProvenanceSchema,
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
  ReleaseBundleProvenance: 'kb.release-bundle-provenance/1',
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
