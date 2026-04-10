import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePage } from '../use-page';
import { PageContextProvider, type PageContext } from '../page-context';
import type { ReactNode } from 'react';

describe('usePage', () => {
  it('returns page context values', () => {
    const ctx: PageContext = {
      pageId: 'commit.overview',
      pluginId: '@kb-labs/commit',
      config: { foo: 'bar' },
      permissions: ['commit:read'],
    };

    const { result } = renderHook(() => usePage(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PageContextProvider value={ctx}>{children}</PageContextProvider>
      ),
    });

    expect(result.current.pageId).toBe('commit.overview');
    expect(result.current.pluginId).toBe('@kb-labs/commit');
    expect(result.current.config).toEqual({ foo: 'bar' });
    expect(result.current.permissions).toEqual(['commit:read']);
  });

  it('throws when used outside PageContextProvider', () => {
    expect(() => {
      renderHook(() => usePage());
    }).toThrow('usePage() must be used inside a PageContextProvider');
  });
});
