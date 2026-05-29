import { describe, it, expect } from 'vitest';
import type { Policy } from '@kb-labs/core-policy';
import type { AuthContext } from '@kb-labs/gateway-contracts';
import { actionForOperation, toIdentity, createPermits } from '../mcp/authz.js';

const auth: AuthContext = {
  type: 'machine',
  userId: 'host-1',
  namespaceId: 'tenant-1',
  tier: 'pro',
  permissions: ['host:connect'],
};

const PERMIT_ALL: Policy = { schemaVersion: '1.0', rules: [{ action: '*', allow: ['*'] }] };
const DENY_ALL: Policy = { schemaVersion: '1.0', rules: [{ action: '*', deny: ['*'] }] };

describe('actionForOperation', () => {
  it("maps 'read' to mcp.read", () => {
    expect(actionForOperation('read')).toBe('mcp.read');
  });
  it("maps 'mutate' to mcp.write", () => {
    expect(actionForOperation('mutate')).toBe('mcp.write');
  });
  it("maps 'execute' to mcp.write", () => {
    expect(actionForOperation('execute')).toBe('mcp.write');
  });
  it('maps undefined to mcp.write (fail safe)', () => {
    expect(actionForOperation(undefined)).toBe('mcp.write');
  });
});

describe('toIdentity', () => {
  it('maps userId to user and type+tier to roles', () => {
    expect(toIdentity(auth)).toEqual({ user: 'host-1', roles: ['machine', 'pro'] });
  });
});

describe('createPermits', () => {
  it('permits everything under the permit-all policy (v1 stub behaviour)', () => {
    const permits = createPermits(PERMIT_ALL, auth);
    expect(permits('read', 'mind')).toBe(true);
    expect(permits('mutate', 'workflow')).toBe(true);
    expect(permits(undefined, 'commit')).toBe(true);
  });

  it('denies everything under a deny-all policy', () => {
    const permits = createPermits(DENY_ALL, auth);
    expect(permits('read', 'mind')).toBe(false);
    expect(permits('mutate', 'workflow')).toBe(false);
  });
});
