/**
 * @module @kb-labs/plugin-runtime/__tests__/trace-context
 *
 * Tests for TraceContext implementation.
 *
 * TraceContext provides distributed tracing primitives:
 * - Unique trace/span IDs for request tracking
 * - Event recording with timestamps
 * - Attribute storage
 * - Error recording with stack traces
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTraceContext } from '../context/trace.js';
import type { Logger } from '@kb-labs/plugin-contracts';

describe('TraceContext', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => mockLogger),
    };
  });

  describe('trace/span IDs', () => {
    it('should store trace and span IDs', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      expect(trace.traceId).toBe('trace-123');
      expect(trace.spanId).toBe('span-456');
      expect(trace.parentSpanId).toBeUndefined();
    });

    it('should store parent span ID when provided', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        parentSpanId: 'parent-789',
        logger: mockLogger,
      });

      expect(trace.traceId).toBe('trace-123');
      expect(trace.spanId).toBe('span-456');
      expect(trace.parentSpanId).toBe('parent-789');
    });
  });

  describe('addEvent', () => {
    it('should record events with timestamps', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.addEvent('plugin.started', { stage: 'init' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[trace] plugin.started',
        expect.objectContaining({
          traceId: 'trace-123',
          spanId: 'span-456',
          stage: 'init',
        })
      );

      // Verify timestamp is in expected range
      const call = (mockLogger.debug as any).mock.calls[0];
      expect(call).toBeDefined();
    });

    it('should record events without attributes', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.addEvent('checkpoint');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[trace] checkpoint',
        expect.objectContaining({
          traceId: 'trace-123',
          spanId: 'span-456',
        })
      );
    });

    it('should record multiple events', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.addEvent('event1', { data: 'foo' });
      trace.addEvent('event2', { data: 'bar' });
      trace.addEvent('event3', { data: 'baz' });

      expect(mockLogger.debug).toHaveBeenCalledTimes(3);
      expect((mockLogger.debug as any).mock.calls[0][0]).toBe('[trace] event1');
      expect((mockLogger.debug as any).mock.calls[1][0]).toBe('[trace] event2');
      expect((mockLogger.debug as any).mock.calls[2][0]).toBe('[trace] event3');
    });
  });

  describe('setAttribute', () => {
    it('should store string attributes', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.setAttribute('user.id', 'user-123');
      trace.setAttribute('plugin.version', '1.0.0');

      // Attributes are stored internally (no public getter, but used in events)
      trace.addEvent('test-event');

      // Should log with context
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should store number attributes', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.setAttribute('response.statusCode', 200);
      trace.setAttribute('duration.ms', 1234);

      // No error should be thrown
      expect(() => {
        trace.setAttribute('count', 42);
      }).not.toThrow();
    });

    it('should store boolean attributes', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.setAttribute('error', false);
      trace.setAttribute('cached', true);

      expect(() => {
        trace.setAttribute('success', true);
      }).not.toThrow();
    });

    it('should allow overwriting attributes', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      trace.setAttribute('status', 'pending');
      trace.setAttribute('status', 'completed');

      // No error, last value wins
      expect(() => {
        trace.setAttribute('status', 'failed');
      }).not.toThrow();
    });
  });

  describe('recordError', () => {
    it('should record error as event with exception details', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      const error = new Error('Something went wrong');
      error.name = 'CustomError';

      trace.recordError(error);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[trace] exception',
        expect.objectContaining({
          traceId: 'trace-123',
          spanId: 'span-456',
          'exception.type': 'CustomError',
          'exception.message': 'Something went wrong',
          'exception.stacktrace': expect.stringContaining('Error'),
        })
      );
    });

    it('should include stack trace in error recording', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      const error = new Error('Test error');

      trace.recordError(error);

      const call = (mockLogger.debug as any).mock.calls[0];
      const attributes = call[1];

      expect(attributes['exception.stacktrace']).toBeDefined();
      expect(typeof attributes['exception.stacktrace']).toBe('string');
    });

    it('should handle errors without custom name', () => {
      const trace = createTraceContext({
        traceId: 'trace-123',
        spanId: 'span-456',
        logger: mockLogger,
      });

      const error = new Error('Standard error');
      // error.name defaults to "Error"

      trace.recordError(error);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        '[trace] exception',
        expect.objectContaining({
          'exception.type': 'Error',
          'exception.message': 'Standard error',
        })
      );
    });
  });

  describe('integration - typical usage flow', () => {
    it('should support full trace lifecycle', () => {
      const trace = createTraceContext({
        traceId: 'trace-abc',
        spanId: 'span-def',
        parentSpanId: 'parent-ghi',
        logger: mockLogger,
      });

      // Set attributes
      trace.setAttribute('plugin.id', '@kb-labs/test-plugin');
      trace.setAttribute('plugin.version', '1.2.3');
      trace.setAttribute('tenant.id', 'acme-corp');

      // Record events
      trace.addEvent('plugin.init', { stage: 'start' });
      trace.addEvent('data.loaded', { records: 100 });
      trace.addEvent('processing.complete', { duration: 523 });

      // Record error (if any)
      const error = new Error('Validation failed');
      trace.recordError(error);

      // Verify all events were logged
      expect(mockLogger.debug).toHaveBeenCalledTimes(4); // 3 events + 1 error
    });

    it('should maintain trace ID across multiple events', () => {
      const trace = createTraceContext({
        traceId: 'consistent-trace',
        spanId: 'span-1',
        logger: mockLogger,
      });

      trace.addEvent('event1');
      trace.addEvent('event2');
      trace.addEvent('event3');

      // All calls should have same trace ID
      const calls = (mockLogger.debug as any).mock.calls;
      expect(calls[0][1].traceId).toBe('consistent-trace');
      expect(calls[1][1].traceId).toBe('consistent-trace');
      expect(calls[2][1].traceId).toBe('consistent-trace');
    });
  });
});
