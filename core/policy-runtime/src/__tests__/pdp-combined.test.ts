import { describe, expect, it } from 'vitest';
import type { Identity, Relation } from '@kb-labs/core-contracts';
import { createPolicyDecisionPoint, AGENT_DENY_REASON } from '../pdp.js';
import { FakeGroupReader, FakeRelationReader } from './fakes.js';
import type { Group } from '../types.js';

const grp = (groupId: string, parents: string[] = []): Group => ({
  groupId,
  tenantId: 't1',
  parents,
});

const user = (userId: string, tenantId = 't1'): Identity => ({ userId, tenantId, type: 'user' });

const rel = (subjectUserId: string, relation: string, resourceId: string, tenantId = 't1'): Relation => ({
  tenantId,
  subjectUserId,
  relation,
  resourceType: 'workflow',
  resourceId,
});

const WORKFLOW_GRANTS = {
  workflow: { owner: ['workflow:view', 'workflow:delete'], member: ['workflow:view'] },
};

describe('combined PDP — RBAC', () => {
  it('allows when a group grants the action', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader({ t1: [grp('admin')] }, { 't1:alice': ['admin'] }, { 't1:admin': ['users:write'] }),
      relations: new FakeRelationReader(),
    });
    expect(await pdp.check(user('alice'), 'users:write')).toEqual({ allow: true });
  });

  it('denies with permission_denied when the user has groups but not the action', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader({ t1: [grp('member')] }, { 't1:bob': ['member'] }, { 't1:member': ['users:read'] }),
      relations: new FakeRelationReader(),
    });
    expect(await pdp.check(user('bob'), 'users:write')).toEqual({ allow: false, reason: 'permission_denied' });
  });

  it('denies with no_membership when the user has no groups and no relation', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader(),
    });
    expect(await pdp.check(user('nobody'), 'users:read')).toEqual({ allow: false, reason: 'no_membership' });
  });
});

describe('combined PDP — ReBAC', () => {
  it('allows via an owner relation', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([rel('alice', 'owner', 'wf-42')]),
      relationGrants: WORKFLOW_GRANTS,
    });
    expect(await pdp.check(user('alice'), 'workflow:delete', { type: 'workflow', id: 'wf-42' })).toEqual({ allow: true });
  });

  it('denies when the relation does not grant the action (member cannot delete)', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([rel('alice', 'member', 'wf-42')]),
      relationGrants: WORKFLOW_GRANTS,
    });
    const d = await pdp.check(user('alice'), 'workflow:delete', { type: 'workflow', id: 'wf-42' });
    expect(d.allow).toBe(false);
  });

  it('denies when the user holds no relation on the resource', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([rel('alice', 'owner', 'wf-OTHER')]),
      relationGrants: WORKFLOW_GRANTS,
    });
    const d = await pdp.check(user('alice'), 'workflow:delete', { type: 'workflow', id: 'wf-42' });
    expect(d.allow).toBe(false);
  });

  it('allows a non-enum permission string via ReBAC (no enum guard in the engine)', async () => {
    // `workflow:view` is NOT a platform PERMISSIONS enum value — must still flow.
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([rel('alice', 'member', 'wf-42')]),
      relationGrants: WORKFLOW_GRANTS,
    });
    expect(await pdp.check(user('alice'), 'workflow:view', { type: 'workflow', id: 'wf-42' })).toEqual({ allow: true });
  });

  it('isolates relations by tenant (A relation invisible to a tenant-B identity)', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([rel('alice', 'owner', 'wf-42', 'tenantA')]),
      relationGrants: WORKFLOW_GRANTS,
    });
    // Same userId+resource, but identity is in tenantB → must NOT match.
    const d = await pdp.check(user('alice', 'tenantB'), 'workflow:delete', { type: 'workflow', id: 'wf-42' });
    expect(d.allow).toBe(false);
  });
});

describe('combined PDP — OR semantics', () => {
  it('allows when RBAC denies but ReBAC grants', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader({ t1: [grp('member')] }, { 't1:alice': ['member'] }, { 't1:member': ['unrelated:thing'] }),
      relations: new FakeRelationReader([rel('alice', 'owner', 'wf-42')]),
      relationGrants: WORKFLOW_GRANTS,
    });
    expect(await pdp.check(user('alice'), 'workflow:delete', { type: 'workflow', id: 'wf-42' })).toEqual({ allow: true });
  });
});

describe('combined PDP — machine', () => {
  const machine = (): Identity => ({ userId: 'ci', tenantId: 't1', type: 'machine' });

  it('denies machines by default (safe closed-world)', async () => {
    const pdp = createPolicyDecisionPoint({ groups: new FakeGroupReader(), relations: new FakeRelationReader() });
    expect(await pdp.check(machine(), 'anything')).toEqual({ allow: false, reason: 'machine_denied' });
  });

  it('honours an injected machinePolicy (legacy allow-all)', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader(),
      machinePolicy: () => true,
    });
    expect(await pdp.check(machine(), 'anything')).toEqual({ allow: true });
  });

  it('machine listResources fail-closes (bypasses ReBAC even with a matching relation)', async () => {
    // A relation keyed on the machine's clientId must NOT leak resources —
    // machines never resolve ReBAC.
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([rel('ci', 'owner', 'wf-42')]),
      relationGrants: WORKFLOW_GRANTS,
      machinePolicy: () => true,
    });
    expect(await pdp.listResources(machine(), 'workflow:view', 'workflow')).toEqual([]);
    expect(await pdp.enumeratePermissions(machine())).toEqual([]);
  });
});

describe('combined PDP — agent fail-closed', () => {
  const agent = (): Identity => ({ userId: 'alice', tenantId: 't1', type: 'agent' });

  it('denies agents until constrained delegation lands', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader({ t1: [grp('admin')] }, { 't1:alice': ['admin'] }, { 't1:admin': ['users:write'] }),
      relations: new FakeRelationReader(),
    });
    // Even though alice (the delegator) is admin, the agent is denied.
    expect(await pdp.check(agent(), 'users:write')).toEqual({ allow: false, reason: AGENT_DENY_REASON });
  });

  it('agent enumerate and listResources are empty', async () => {
    const pdp = createPolicyDecisionPoint({ groups: new FakeGroupReader(), relations: new FakeRelationReader() });
    expect(await pdp.enumeratePermissions(agent())).toEqual([]);
    expect(await pdp.listResources(agent(), 'workflow:view', 'workflow')).toEqual([]);
  });
});

describe('combined PDP — enumeratePermissions & listResources', () => {
  it('enumerates the RBAC permission set for a user', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader({ t1: [grp('admin')] }, { 't1:alice': ['admin'] }, { 't1:admin': ['users:read', 'users:write'] }),
      relations: new FakeRelationReader(),
    });
    expect((await pdp.enumeratePermissions(user('alice'))).sort()).toEqual(['users:read', 'users:write']);
  });

  it('listResources returns ResourceRefs reachable via a granting relation', async () => {
    const pdp = createPolicyDecisionPoint({
      groups: new FakeGroupReader(),
      relations: new FakeRelationReader([
        rel('alice', 'owner', 'wf-1'),
        rel('alice', 'member', 'wf-2'),
        rel('alice', 'owner', 'wf-1'), // duplicate → deduped
      ]),
      relationGrants: WORKFLOW_GRANTS,
    });
    // view is granted to both owner and member → both wf-1 and wf-2.
    const refs = await pdp.listResources(user('alice'), 'workflow:view', 'workflow');
    expect(refs.map((r) => r.id).sort()).toEqual(['wf-1', 'wf-2']);
    expect(refs.every((r) => r.type === 'workflow')).toBe(true);

    // delete is granted only to owner → only wf-1.
    const deletable = await pdp.listResources(user('alice'), 'workflow:delete', 'workflow');
    expect(deletable.map((r) => r.id)).toEqual(['wf-1']);
  });
});
