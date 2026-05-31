/**
 * @module @kb-labs/core-policy-runtime/factory
 *
 * Construct a document-backed PDP from any `IDocumentDatabase`. Used by
 * the platform adapter `buildFactory` (which derives `policy` from the
 * already-assembled `documentDatabase`) — and by the gateway, which
 * passes its host-specific config (`machinePolicy`, `relationGrants`)
 * in-process.
 */

import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import type { IPolicyDecisionPoint } from '@kb-labs/core-contracts';
import { createPolicyDecisionPoint } from './pdp.js';
import { DocumentGroupReader, DocumentRelationReader } from './readers/document-readers.js';
import type { RelationGrants } from './types.js';

export interface DocumentBackedPolicyConfig {
  relationGrants?: RelationGrants;
  machinePolicy?: (action: string) => boolean;
  invalidate?: (userId?: string) => void;
}

export function createDocumentBackedPolicy(
  docs: IDocumentDatabase,
  config: DocumentBackedPolicyConfig = {},
): IPolicyDecisionPoint {
  return createPolicyDecisionPoint({
    groups: new DocumentGroupReader(docs),
    relations: new DocumentRelationReader(docs),
    relationGrants: config.relationGrants,
    machinePolicy: config.machinePolicy,
    invalidate: config.invalidate,
  });
}
