/**
 * @module @kb-labs/core-policy-runtime
 *
 * Runtime authorization engine (RBAC + ReBAC) implementing
 * `IPolicyDecisionPoint`. See README.
 */

// Engine record + config types
export type { Group, GroupPermission, PolicyMembership, RelationGrants } from './types.js';

// Collection name constants (schema contract shared with the seed stores)
export {
  POLICY_MEMBERSHIPS,
  POLICY_GROUPS,
  POLICY_GROUP_PERMISSIONS,
  POLICY_RELATIONS,
} from './collections.js';

// Reader ports
export type { IGroupReader, IRelationReader } from './ports.js';

// Engines (composable building blocks)
export { createRbacEngine, type RbacEngine } from './rbac/engine.js';
export { resolveGroupClosure } from './rbac/inheritance.js';
export { createRebacEngine, type RebacEngine } from './rebac/engine.js';

// Combined PDP
export {
  createPolicyDecisionPoint,
  AGENT_DENY_REASON,
  type PolicyEngineDeps,
} from './pdp.js';

// Document-backed readers + factory
export { DocumentGroupReader, DocumentRelationReader } from './readers/document-readers.js';
export { createDocumentBackedPolicy, type DocumentBackedPolicyConfig } from './factory.js';
