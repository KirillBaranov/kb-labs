import { describe, expect, it } from 'vitest';
import { resolveGroupClosure } from '../rbac/inheritance.js';
import type { Group } from '../types.js';

const g = (groupId: string, parents: string[] = []): Group => ({
  groupId,
  tenantId: 't1',
  parents,
});

describe('resolveGroupClosure', () => {
  it('returns the direct group when it has no parents', () => {
    const closure = resolveGroupClosure(['member'], [g('member')]);
    expect([...closure].sort()).toEqual(['member']);
  });

  it('follows a single parent chain', () => {
    const groups = [g('lead', ['member']), g('member', ['base']), g('base')];
    const closure = resolveGroupClosure(['lead'], groups);
    expect([...closure].sort()).toEqual(['base', 'lead', 'member']);
  });

  it('resolves a diamond without duplicating', () => {
    // admin → (a, b); a → base; b → base
    const groups = [g('admin', ['a', 'b']), g('a', ['base']), g('b', ['base']), g('base')];
    const closure = resolveGroupClosure(['admin'], groups);
    expect([...closure].sort()).toEqual(['a', 'admin', 'b', 'base']);
  });

  it('terminates on a cycle (A → B → A)', () => {
    const groups = [g('A', ['B']), g('B', ['A'])];
    const closure = resolveGroupClosure(['A'], groups);
    expect([...closure].sort()).toEqual(['A', 'B']);
  });

  it('includes a direct group even when it has no Group record (permissions may still attach)', () => {
    const closure = resolveGroupClosure(['orphan'], []);
    expect([...closure]).toEqual(['orphan']);
  });

  it('unions multiple direct groups', () => {
    const groups = [g('x', ['shared']), g('y', ['shared']), g('shared')];
    const closure = resolveGroupClosure(['x', 'y'], groups);
    expect([...closure].sort()).toEqual(['shared', 'x', 'y']);
  });
});
