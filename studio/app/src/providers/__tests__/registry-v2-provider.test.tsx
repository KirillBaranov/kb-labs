/**
 * @vitest-environment jsdom
 *
 * Regression test for the Module Federation race in RegistryV2Provider.
 *
 * Bug: `initFederation()` ran in the provider's own `useEffect` (deps: [data]),
 * while `loading` flipped to `false` in the same render as soon as `data`
 * arrived. A child mounted in that same commit (e.g. PageContainer, gated on
 * `loading`) could call `loadRemote()` before `initFederation()` had a chance
 * to register the MF remotes/shared scope — React flushes passive effects
 * bottom-up (children before parents), so the child's mount effect can run
 * before the provider's effect in the very commit both are triggered by.
 * Symptom in the app: "TypeError: Cannot read properties of undefined
 * (reading 'useState')" when deep-linking into a plugin page.
 *
 * Fix: `loading` now also depends on a `federationReady` state flag that is
 * only set (via setState, forcing an additional commit) after
 * `initFederation()` has actually run — so any child gated on `loading`
 * mounts strictly after federation is initialized.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@kb-labs/studio-federation', () => ({
  initFederation: vi.fn(),
}));

import { initFederation } from '@kb-labs/studio-federation';
import { RegistryV2Provider, useRegistryV2 } from '../registry-v2-provider.js';

const REGISTRY_RESPONSE = {
  schema: 'kb.studio/2',
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  plugins: [
    { remoteName: 'workflowPlugin', remoteEntryUrl: '/plugins/@kb-labs/workflow/widgets/remoteEntry.js', pluginId: 'workflow', pages: [] },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Records, at the moment a child mounted in the same commit as `loading`
// flipping to false runs its own mount effect, how many times initFederation
// had already been called.
function renderWithChildGatedOnLoading() {
  const callCountsWhenChildEffectRuns: number[] = [];

  function Child() {
    React.useEffect(() => {
      callCountsWhenChildEffectRuns.push(vi.mocked(initFederation).mock.calls.length);
    }, []);
    return null;
  }

  function Consumer() {
    const { loading } = useRegistryV2();
    if (loading) { return null; }
    return <Child />;
  }

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <RegistryV2Provider apiBaseUrl="/api/v1">
        <Consumer />
      </RegistryV2Provider>
    </QueryClientProvider>,
  );

  return callCountsWhenChildEffectRuns;
}

describe('RegistryV2Provider — federation init race', () => {
  it('has already called initFederation() by the time a loading-gated child mounts', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: REGISTRY_RESPONSE }),
      }),
    ));

    const callCountsWhenChildEffectRuns = renderWithChildGatedOnLoading();

    await waitFor(() => expect(callCountsWhenChildEffectRuns.length).toBeGreaterThan(0));

    expect(vi.mocked(initFederation)).toHaveBeenCalledTimes(1);
    // The child's effect must observe initFederation() as already called —
    // not race ahead of it.
    expect(callCountsWhenChildEffectRuns[0]).toBe(1);
  });
});
