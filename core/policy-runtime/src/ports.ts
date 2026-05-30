/**
 * @module @kb-labs/core-policy-runtime/ports
 *
 * Reader ports — the only I/O the engine performs (Cedar-style: the PDP
 * receives data, never reaches into a store directly). A document-backed
 * implementation lives in `./readers`; tests inject in-memory fakes.
 */

import type { ListResourcesOptions, Relation } from '@kb-labs/core-contracts';
import type { Group } from './types.js';

export interface IGroupReader {
  /**
   * All groups defined in the tenant. Loaded once per decision so the
   * inheritance closure is computed in-memory — the document contract
   * has no recursive query, and per-level fetches would be N+1.
   */
  listGroups(tenantId: string): Promise<Group[]>;

  /** Group ids the user is a DIRECT member of (before inheritance). */
  listGroupIdsForUser(tenantId: string, userId: string): Promise<string[]>;

  /** Permissions granted directly to the given groups (no inheritance — caller passes the closure). */
  listPermissionsForGroups(tenantId: string, groupIds: string[]): Promise<string[]>;
}

export interface IRelationReader {
  /** Relations the user holds on ONE specific resource. */
  listRelations(
    tenantId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<Relation[]>;

  /** Relations the user holds across ALL resources of a type (for `listResources`). Paginatable. */
  listRelationsForType(
    tenantId: string,
    userId: string,
    resourceType: string,
    opts?: ListResourcesOptions,
  ): Promise<Relation[]>;
}
