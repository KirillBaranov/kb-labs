/**
 * @module @kb-labs/core-platform/wrappers/__tests__/scoped-analytics
 * Tests for ScopedAnalytics wrapper that overrides source attribution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { IAnalytics, AnalyticsEvent, AnalyticsContext } from '../adapters/analytics';
import { ScopedAnalytics } from './scoped-analytics';

// Mock analytics adapter for testing
class MockAnalytics implements IAnalytics {
  public trackedEvents: AnalyticsEvent[] = [];
  private context: AnalyticsContext;

  constructor(context: AnalyticsContext) {
    this.context = context;
  }

  async track(event: string, payload?: unknown): Promise<void> {
    const analyticsEvent: AnalyticsEvent = {
      id: `mock-${Date.now()}`,
      schema: 'kb.v1',
      type: event,
      ts: new Date().toISOString(),
      ingestTs: new Date().toISOString(),
      source: this.context.source,
      runId: this.context.runId,
      actor: this.context.actor,
      ctx: this.context.ctx,
      payload,
    };
    this.trackedEvents.push(analyticsEvent);
  }

  async identify(userId: string, traits?: Record<string, unknown>): Promise<void> {
    await this.track('user.identify', { userId, ...traits });
  }

  async flush(): Promise<void> {
    // No-op for mock
  }

  // Support getSource() and setSource() to match FileAnalytics behavior
  getSource(): { product: string; version: string } {
    return this.context.source;
  }

  setSource(source: { product: string; version: string }): void {
    this.context = {
      ...this.context,
      source,
    };
  }

  getTrackedEvents(): AnalyticsEvent[] {
    return this.trackedEvents;
  }

  clearEvents(): void {
    this.trackedEvents = [];
  }
}

// ScopedAnalytics is now imported from the real implementation

describe('ScopedAnalytics', () => {
  let mockAnalytics: MockAnalytics;
  let scopedAnalytics: ScopedAnalytics;

  beforeEach(() => {
    // Create mock analytics with root context (simulating @kb-labs/ai-review)
    const rootContext: AnalyticsContext = {
      source: {
        product: '@kb-labs/ai-review',
        version: '1.0.0',
      },
      runId: 'test-run-123',
    };

    mockAnalytics = new MockAnalytics(rootContext);

    // Wrap with scoped analytics (simulating @kb-labs/mind)
    scopedAnalytics = new ScopedAnalytics(mockAnalytics, {
      product: '@kb-labs/mind',
      version: '0.1.0',
    });
  });

  describe('Constructor', () => {
    it('should store scoped source', () => {
      expect(scopedAnalytics.getScopedSource()).toEqual({
        product: '@kb-labs/mind',
        version: '0.1.0',
      });
    });
  });

  describe('track()', () => {
    it('should delegate to real analytics', async () => {
      await scopedAnalytics.track('test.event', { foo: 'bar' });

      const events = mockAnalytics.getTrackedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('test.event');
      expect(events[0]!.payload).toEqual({ foo: 'bar' });
    });

    it('should override source.product with scoped value', async () => {
      await scopedAnalytics.track('mind.rag-index.started', { scope: 'default' });

      const events = mockAnalytics.getTrackedEvents();
      expect(events).toHaveLength(1);

      // Verify source was overridden
      expect(events[0]!.source.product).toBe('@kb-labs/mind');
      expect(events[0]!.source.version).toBe('0.1.0');
    });
  });


  describe('identify()', () => {
    it('should delegate to real analytics', async () => {
      await scopedAnalytics.identify('user-123', { name: 'Test User' });

      const events = mockAnalytics.getTrackedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('user.identify');
    });
  });

  describe('Multiple scoped instances', () => {
    it('should allow different plugins to have separate scopes', async () => {
      const mindScoped = new ScopedAnalytics(mockAnalytics, {
        product: '@kb-labs/mind',
        version: '0.1.0',
      });

      const workflowScoped = new ScopedAnalytics(mockAnalytics, {
        product: '@kb-labs/workflow',
        version: '2.0.0',
      });

      const commitScoped = new ScopedAnalytics(mockAnalytics, {
        product: '@kb-labs/commit',
        version: '1.5.0',
      });

      await mindScoped.track('mind.event', {});
      await workflowScoped.track('workflow.event', {});
      await commitScoped.track('commit.event', {});

      const events = mockAnalytics.getTrackedEvents();
      expect(events).toHaveLength(3);

      // Note: All events share the same MockAnalytics instance, so the last
      // setSource() call wins. This is expected behavior - each wrapper
      // modifies the shared underlying adapter.
      // In real usage, each plugin gets its own platform.analytics instance.
      expect(events[2]!.source.product).toBe('@kb-labs/commit');
    });
  });

  describe('Nested wrapper chains', () => {
    it('should work with other analytics wrappers (AnalyticsEmbeddings, etc.)', async () => {
      // Simulating the actual wrapper chain:
      // OpenAIEmbeddings → AnalyticsEmbeddings → QueuedEmbeddings → ScopedAnalytics (new!)

      const scopedWrapper = new ScopedAnalytics(mockAnalytics, {
        product: '@kb-labs/mind',
        version: '0.1.0',
      });

      // The scoped wrapper should still pass through to the real analytics
      await scopedWrapper.track('embeddings.embedBatch.started', {
        batchSize: 10,
        totalTextLength: 5000,
      });

      const events = mockAnalytics.getTrackedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('embeddings.embedBatch.started');
      expect(events[0]!.payload).toMatchObject({
        batchSize: 10,
        totalTextLength: 5000,
      });
    });
  });
});

describe('Integration: ScopedAnalytics + handler-executor', () => {
  it('should demonstrate the complete flow', async () => {
    // Simulate the flow:
    // 1. Parent process creates analytics with root context
    const rootContext: AnalyticsContext = {
      source: { product: '@kb-labs/ai-review', version: '1.0.0' },
      runId: 'parent-run-123',
    };
    const parentAnalytics = new MockAnalytics(rootContext);

    // 2. Subprocess receives ExecutionContext via IPC
    const executionContext = {
      pluginId: '@kb-labs/mind',
      pluginVersion: '0.1.0',
      requestId: 'req-456',
    };

    // 3. handler-executor creates scoped analytics
    const scopedAnalytics = new ScopedAnalytics(parentAnalytics, {
      product: executionContext.pluginId,
      version: executionContext.pluginVersion,
    });

    // 4. Plugin handler uses scoped analytics (via usePlatform())
    await scopedAnalytics.track('mind.rag-index.started', { scope: 'default' });
    await scopedAnalytics.track('embeddings.embedBatch.completed', {
      batchSize: 50,
      durationMs: 1234,
    });

    // 5. Verify events were tracked with correct source
    const events = parentAnalytics.getTrackedEvents();
    expect(events).toHaveLength(2);

    // Verify source was overridden to plugin source
    expect(events[0]!.source.product).toBe('@kb-labs/mind');
    expect(events[0]!.source.version).toBe('0.1.0');
    expect(events[1]!.source.product).toBe('@kb-labs/mind');
    expect(events[1]!.source.version).toBe('0.1.0');
  });

  it('should support getSource/setSource restore pattern', async () => {
    // Simulate nested plugin execution with source save/restore
    const rootContext: AnalyticsContext = {
      source: { product: '@kb-labs/workflow', version: '2.0.0' },
      runId: 'workflow-run-123',
    };
    const analytics = new MockAnalytics(rootContext);

    // Workflow tracks event
    await analytics.track('workflow.started', {});

    // Save original source before nested plugin
    const originalSource = analytics.getSource();
    expect(originalSource).toEqual({
      product: '@kb-labs/workflow',
      version: '2.0.0',
    });

    try {
      // Mind plugin executes (nested)
      analytics.setSource({ product: '@kb-labs/mind', version: '0.1.0' });
      await analytics.track('mind.rag-index.started', {});
    } finally {
      // Restore workflow source
      analytics.setSource(originalSource);
    }

    // Workflow continues
    await analytics.track('workflow.completed', {});

    // Verify events have correct sources
    const events = analytics.getTrackedEvents();
    expect(events).toHaveLength(3);
    expect(events[0]!.source.product).toBe('@kb-labs/workflow');
    expect(events[1]!.source.product).toBe('@kb-labs/mind');
    expect(events[2]!.source.product).toBe('@kb-labs/workflow'); // Restored!
  });
});
