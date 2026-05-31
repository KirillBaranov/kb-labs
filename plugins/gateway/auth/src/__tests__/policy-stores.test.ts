/**
 * Tests for the RBAC + ReBAC seed stores (ClickUp 869def338) and the
 * end-to-end agreement between the gateway WRITE path (these stores) and
 * the engine READ path (`@kb-labs/core-policy-runtime`), both targeting
 * the same document collections.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDocumentDatabase } from '@kb-labs/sdk/testing';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import type { Identity } from '@kb-labs/core-contracts';
import { createDocumentBackedPolicy } from '@kb-labs/core-policy-runtime';
import { PolicyMembershipsStore } from '../policy-memberships-store.js';
import { GroupsStore } from '../groups-store.js';
import { GroupPermissionsStore } from '../group-permissions-store.js';
import { RelationsStore } from '../relations-store.js';

const T = 'tenant-a';
const user = (userId: string, tenantId = T): Identity => ({ userId, tenantId, type: 'user' });

let docs: IDocumentDatabase;

beforeEach(() => {
  docs = createInMemoryDocumentDatabase();
});

describe('PolicyMembershipsStore (multi-group)', () => {
  it('allows a user to belong to multiple groups in the same tenant (R1)', async () => {
    const store = new PolicyMembershipsStore(docs);
    await store.addGroup('alice', T, 'engineers');
    await store.addGroup('alice', T, 'on-call');
    const groups = await store.listGroupsForUser('alice', T);
    expect(groups.sort()).toEqual(['engineers', 'on-call']);
  });

  it('addGroup is idempotent', async () => {
    const store = new PolicyMembershipsStore(docs);
    await store.addGroup('alice', T, 'engineers');
    await store.addGroup('alice', T, 'engineers');
    expect(await store.listGroupsForUser('alice', T)).toEqual(['engineers']);
  });

  it('removeGroup removes one membership only', async () => {
    const store = new PolicyMembershipsStore(docs);
    await store.addGroup('alice', T, 'engineers');
    await store.addGroup('alice', T, 'on-call');
    await store.removeGroup('alice', T, 'on-call');
    expect(await store.listGroupsForUser('alice', T)).toEqual(['engineers']);
  });

  it('removeAllForUser clears the user', async () => {
    const store = new PolicyMembershipsStore(docs);
    await store.addGroup('alice', T, 'engineers');
    await store.addGroup('bob', T, 'engineers');
    await store.removeAllForUser('alice');
    expect(await store.listGroupsForUser('alice', T)).toEqual([]);
    expect(await store.listGroupsForUser('bob', T)).toEqual(['engineers']);
  });
});

describe('GroupsStore', () => {
  it('ensureGroup creates then updates parents idempotently', async () => {
    const store = new GroupsStore(docs);
    await store.ensureGroup({ groupId: 'lead', tenantId: T, parents: ['member'] });
    await store.ensureGroup({ groupId: 'lead', tenantId: T, parents: ['member', 'on-call'] });
    const g = await store.getGroup('lead', T);
    expect(g?.parents.sort()).toEqual(['member', 'on-call']);
    expect(await store.listGroups(T)).toHaveLength(1);
  });
});

describe('GroupPermissionsStore', () => {
  it('grant is idempotent and listByGroup returns the set', async () => {
    const store = new GroupPermissionsStore(docs);
    await store.grantMany('admin', T, ['users:read', 'users:write']);
    await store.grant('admin', T, 'users:read'); // dup
    expect((await store.listByGroup('admin', T)).sort()).toEqual(['users:read', 'users:write']);
  });

  it('revoke removes a permission', async () => {
    const store = new GroupPermissionsStore(docs);
    await store.grantMany('admin', T, ['users:read', 'users:write']);
    await store.revoke('admin', T, 'users:write');
    expect(await store.listByGroup('admin', T)).toEqual(['users:read']);
  });
});

describe('end-to-end: seed (write stores) → engine (read path) agree on schema', () => {
  it('RBAC: seeded group permission allows the action', async () => {
    await new GroupsStore(docs).ensureGroup({ groupId: 'tenant-admin', tenantId: T, parents: [] });
    await new GroupPermissionsStore(docs).grantMany('tenant-admin', T, ['users:write']);
    await new PolicyMembershipsStore(docs).addGroup('alice', T, 'tenant-admin');

    const pdp = createDocumentBackedPolicy(docs);
    expect(await pdp.check(user('alice'), 'users:write')).toEqual({ allow: true });
    expect(await pdp.check(user('bob'), 'users:write')).toMatchObject({ allow: false });
  });

  it('RBAC inheritance: child inherits parent permissions through the seeded graph', async () => {
    const groups = new GroupsStore(docs);
    await groups.ensureGroup({ groupId: 'base', tenantId: T, parents: [] });
    await groups.ensureGroup({ groupId: 'lead', tenantId: T, parents: ['base'] });
    await new GroupPermissionsStore(docs).grant('base', T, 'task:view');
    await new PolicyMembershipsStore(docs).addGroup('alice', T, 'lead');

    const pdp = createDocumentBackedPolicy(docs);
    expect(await pdp.check(user('alice'), 'task:view')).toEqual({ allow: true });
  });

  it('ReBAC: seeded owner relation allows delete; tenant isolation holds', async () => {
    const relations = new RelationsStore(docs);
    await relations.addRelation({
      tenantId: T,
      subjectUserId: 'alice',
      relation: 'owner',
      resourceType: 'workflow',
      resourceId: 'wf-42',
    });

    const pdp = createDocumentBackedPolicy(docs, {
      relationGrants: { workflow: { owner: ['workflow:delete'] } },
    });

    expect(await pdp.check(user('alice'), 'workflow:delete', { type: 'workflow', id: 'wf-42' })).toEqual({
      allow: true,
    });
    // Different tenant → relation invisible.
    expect(
      await pdp.check(user('alice', 'tenant-b'), 'workflow:delete', { type: 'workflow', id: 'wf-42' }),
    ).toMatchObject({ allow: false });
  });

  it('listResources returns seeded ReBAC-scoped resources', async () => {
    const relations = new RelationsStore(docs);
    await relations.addRelation({
      tenantId: T,
      subjectUserId: 'alice',
      relation: 'owner',
      resourceType: 'workflow',
      resourceId: 'wf-1',
    });
    const pdp = createDocumentBackedPolicy(docs, {
      relationGrants: { workflow: { owner: ['workflow:view'] } },
    });
    const refs = await pdp.listResources(user('alice'), 'workflow:view', 'workflow');
    expect(refs).toEqual([{ type: 'workflow', id: 'wf-1', tenantId: T }]);
  });
});
