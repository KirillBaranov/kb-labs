import { describe, expect, it } from 'vitest';
import { createRbacEngine } from '../rbac/engine.js';
import { FakeGroupReader } from './fakes.js';
import type { Group } from '../types.js';

const grp = (groupId: string, parents: string[] = []): Group => ({
  groupId,
  tenantId: 't1',
  parents,
});

describe('RBAC engine', () => {
  it('resolves permissions from a directly-held group', () => {
    const reader = new FakeGroupReader(
      { t1: [grp('admin')] },
      { 't1:alice': ['admin'] },
      { 't1:admin': ['users:read', 'users:write'] },
    );
    const rbac = createRbacEngine(reader);
    return rbac.resolvePermissions('t1', 'alice').then((perms) => {
      expect([...perms].sort()).toEqual(['users:read', 'users:write']);
    });
  });

  it('inherits permissions from parent groups', async () => {
    const reader = new FakeGroupReader(
      { t1: [grp('lead', ['member']), grp('member')] },
      { 't1:alice': ['lead'] },
      { 't1:lead': ['sprint:close'], 't1:member': ['task:view'] },
    );
    const rbac = createRbacEngine(reader);
    const perms = await rbac.resolvePermissions('t1', 'alice');
    expect([...perms].sort()).toEqual(['sprint:close', 'task:view']);
  });

  it('unions permissions across multiple group memberships', async () => {
    const reader = new FakeGroupReader(
      { t1: [grp('a'), grp('b')] },
      { 't1:alice': ['a', 'b'] },
      { 't1:a': ['x:read'], 't1:b': ['y:write'] },
    );
    const rbac = createRbacEngine(reader);
    const perms = await rbac.resolvePermissions('t1', 'alice');
    expect([...perms].sort()).toEqual(['x:read', 'y:write']);
  });

  it('returns empty for a user with no memberships', async () => {
    const reader = new FakeGroupReader({ t1: [grp('admin')] }, {}, { 't1:admin': ['x'] });
    const rbac = createRbacEngine(reader);
    const perms = await rbac.resolvePermissions('t1', 'nobody');
    expect(perms.size).toBe(0);
  });

  it('loads the tenant group list exactly once per resolution (no N+1)', async () => {
    const reader = new FakeGroupReader(
      { t1: [grp('lead', ['member']), grp('member', ['base']), grp('base')] },
      { 't1:alice': ['lead'] },
      { 't1:base': ['p'] },
    );
    const rbac = createRbacEngine(reader);
    await rbac.resolvePermissions('t1', 'alice');
    expect(reader.listGroupsCalls).toBe(1);
  });
});
