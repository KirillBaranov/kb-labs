import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventBus } from '../use-event-bus';
import { PageContextProvider, type PageContext } from '../page-context';
import { EventBusProvider, StudioEventBus } from '@kb-labs/studio-event-bus';
import type { ReactNode } from 'react';

function makeWrapper(bus: StudioEventBus, ctx?: Partial<PageContext>) {
  const pageCtx: PageContext = {
    pageId: ctx?.pageId ?? 'test.page',
    pluginId: ctx?.pluginId ?? '@kb-labs/test',
    config: {},
    permissions: [],
    ...ctx,
  };
  return ({ children }: { children: ReactNode }) => (
    <EventBusProvider bus={bus}>
      <PageContextProvider value={pageCtx}>{children}</PageContextProvider>
    </EventBusProvider>
  );
}

describe('useEventBus', () => {
  let bus: StudioEventBus;

  beforeEach(() => {
    bus = new StudioEventBus();
  });

  it('publishes events with auto-injected source', () => {
    const handler = vi.fn();
    bus.subscribe('test:event', handler, 'other', 'other-page');

    const { result } = renderHook(() => useEventBus(), {
      wrapper: makeWrapper(bus, { pluginId: '@kb-labs/commit', pageId: 'commit.overview' }),
    });

    act(() => {
      result.current.publish('test:event', { value: 42 });
    });

    expect(handler).toHaveBeenCalledWith(
      { value: 42 },
      expect.objectContaining({
        sourcePluginId: '@kb-labs/commit',
        sourcePageId: 'commit.overview',
      }),
    );
  });

  it('subscribes and receives events', () => {
    const handler = vi.fn();

    const { result } = renderHook(() => useEventBus(), {
      wrapper: makeWrapper(bus),
    });

    act(() => {
      result.current.subscribe('incoming', handler);
    });

    bus.publish('incoming', { data: 'hello' }, 'source', 'src-page');

    expect(handler).toHaveBeenCalledWith(
      { data: 'hello' },
      expect.objectContaining({ sourcePluginId: 'source' }),
    );
  });

  it('auto-unsubscribes on unmount', () => {
    const handler = vi.fn();

    const { result, unmount } = renderHook(() => useEventBus(), {
      wrapper: makeWrapper(bus),
    });

    act(() => {
      result.current.subscribe('test', handler);
    });

    unmount();

    bus.publish('test', {}, 'x', 'x');
    expect(handler).not.toHaveBeenCalled();
  });
});
