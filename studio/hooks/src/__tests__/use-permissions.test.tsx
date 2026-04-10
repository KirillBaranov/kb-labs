import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from '../use-permissions';
import { PageContextProvider, type PageContext } from '../page-context';
import type { ReactNode } from 'react';

function makeWrapper(permissions: string[]) {
  const ctx: PageContext = {
    pageId: 'test.page',
    pluginId: '@kb-labs/test',
    config: {},
    permissions,
  };
  return ({ children }: { children: ReactNode }) => (
    <PageContextProvider value={ctx}>{children}</PageContextProvider>
  );
}

describe('usePermissions', () => {
  it('returns true for granted permission', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: makeWrapper(['commit:read', 'commit:write']),
    });
    expect(result.current.hasPermission('commit:write')).toBe(true);
  });

  it('returns false for missing permission', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: makeWrapper(['commit:read']),
    });
    expect(result.current.hasPermission('commit:write')).toBe(false);
  });

  it('exposes all permissions', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: makeWrapper(['a', 'b', 'c']),
    });
    expect(result.current.permissions).toEqual(['a', 'b', 'c']);
  });
});
