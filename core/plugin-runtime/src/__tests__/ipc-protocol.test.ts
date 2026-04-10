/**
 * @module @kb-labs/plugin-runtime/__tests__/ipc-protocol
 *
 * Tests for IPC protocol message types and type guards.
 *
 * V3 IPC Protocol:
 * - Parent → Child: ExecuteMessage, AbortMessage
 * - Child → Parent: ReadyMessage, ResultMessage, ErrorMessage
 * - JSON-serializable messages over IPC channel
 */

import { describe, it, expect } from 'vitest';
import {
  isParentMessage,
  isChildMessage,
  type ExecuteMessage,
  type AbortMessage,
  type ParentMessage,
  type ResultMessage,
  type ErrorMessage,
  type ReadyMessage,
  type ChildMessage,
} from '../sandbox/ipc-protocol.js';
import type { PluginContextDescriptor } from '@kb-labs/plugin-contracts';

describe('IPC Protocol', () => {
  const mockDescriptor: PluginContextDescriptor = {
    hostType: 'cli',
    pluginId: '@kb-labs/test',
    pluginVersion: '1.0.0',
    requestId: 'test-req-123',
    permissions: {},
    hostContext: { host: 'cli', argv: [], flags: {} },
  };

  describe('ExecuteMessage', () => {
    it('should create valid execute message', () => {
      const msg: ExecuteMessage = {
        type: 'execute',
        descriptor: mockDescriptor,
        socketPath: '/tmp/kb-test.sock',
        handlerPath: '/test/handler.js',
        input: { foo: 'bar' },
        cwd: '/test',
      };

      expect(msg.type).toBe('execute');
      expect(msg.descriptor).toEqual(mockDescriptor);
      expect(msg.socketPath).toBe('/tmp/kb-test.sock');
      expect(msg.handlerPath).toBe('/test/handler.js');
      expect(msg.input).toEqual({ foo: 'bar' });
    });

    it('should be recognized as ParentMessage', () => {
      const msg: ExecuteMessage = {
        type: 'execute',
        descriptor: mockDescriptor,
        socketPath: '/tmp/kb-test.sock',
        handlerPath: '/test/handler.js',
        input: {},
        cwd: '/test',
      };

      expect(isParentMessage(msg)).toBe(true);
      expect(isChildMessage(msg)).toBe(false);
    });
  });

  describe('AbortMessage', () => {
    it('should create valid abort message', () => {
      const msg: AbortMessage = {
        type: 'abort',
      };

      expect(msg.type).toBe('abort');
    });

    it('should be recognized as ParentMessage', () => {
      const msg: AbortMessage = {
        type: 'abort',
      };

      expect(isParentMessage(msg)).toBe(true);
      expect(isChildMessage(msg)).toBe(false);
    });
  });

  describe('ReadyMessage', () => {
    it('should create valid ready message', () => {
      const msg: ReadyMessage = {
        type: 'ready',
      };

      expect(msg.type).toBe('ready');
    });

    it('should be recognized as ChildMessage', () => {
      const msg: ReadyMessage = {
        type: 'ready',
      };

      expect(isChildMessage(msg)).toBe(true);
      expect(isParentMessage(msg)).toBe(false);
    });
  });

  describe('ResultMessage', () => {
    it('should carry raw handler output as data', () => {
      const msg: ResultMessage = {
        type: 'result',
        data: { success: true, output: 'test' },
      };

      expect(msg.type).toBe('result');
      expect(msg.data).toEqual({ success: true, output: 'test' });
    });

    it('should carry CommandResult as data when handler returns it', () => {
      const msg: ResultMessage = {
        type: 'result',
        data: { exitCode: 0, result: { foo: 'bar' }, meta: { custom: true } },
      };

      expect(msg.data).toEqual({ exitCode: 0, result: { foo: 'bar' }, meta: { custom: true } });
    });

    it('should allow undefined data (void handler)', () => {
      const msg: ResultMessage = {
        type: 'result',
        data: undefined,
      };

      expect(msg.type).toBe('result');
      expect(msg.data).toBeUndefined();
    });

    it('should allow primitive data', () => {
      const msg: ResultMessage = {
        type: 'result',
        data: 'hello',
      };

      expect(msg.data).toBe('hello');
    });

    it('should be recognized as ChildMessage', () => {
      const msg: ResultMessage = {
        type: 'result',
        data: { test: 'data' },
      };

      expect(isChildMessage(msg)).toBe(true);
      expect(isParentMessage(msg)).toBe(false);
    });
  });

  describe('ErrorMessage', () => {
    it('should create valid error message', () => {
      const msg: ErrorMessage = {
        type: 'error',
        error: {
          name: 'PluginError',
          message: 'Something went wrong',
          code: 'INTERNAL_ERROR',
          stack: 'Error: Something went wrong\n  at ...',
        },
      };

      expect(msg.type).toBe('error');
      expect(msg.error.name).toBe('PluginError');
      expect(msg.error.message).toBe('Something went wrong');
      expect(msg.error.code).toBe('INTERNAL_ERROR');
      expect(msg.error.stack).toContain('Error');
    });

    it('should be recognized as ChildMessage', () => {
      const msg: ErrorMessage = {
        type: 'error',
        error: {
          name: 'Error',
          message: 'Test error',
          code: 'UNKNOWN',
        },
      };

      expect(isChildMessage(msg)).toBe(true);
      expect(isParentMessage(msg)).toBe(false);
    });
  });

  describe('Type Guards', () => {
    describe('isParentMessage', () => {
      it('should accept execute message', () => {
        const msg = {
          type: 'execute',
          descriptor: mockDescriptor,
          socketPath: '/tmp/test.sock',
          handlerPath: '/test.js',
          input: {},
        };

        expect(isParentMessage(msg)).toBe(true);
      });

      it('should accept abort message', () => {
        const msg = { type: 'abort' };
        expect(isParentMessage(msg)).toBe(true);
      });

      it('should reject child messages', () => {
        expect(isParentMessage({ type: 'ready' })).toBe(false);
        expect(isParentMessage({ type: 'result', data: {} })).toBe(false);
        expect(isParentMessage({ type: 'error', error: {} })).toBe(false);
      });

      it('should reject null and undefined', () => {
        expect(isParentMessage(null)).toBe(false);
        expect(isParentMessage(undefined)).toBe(false);
      });

      it('should reject non-objects', () => {
        expect(isParentMessage('string')).toBe(false);
        expect(isParentMessage(123)).toBe(false);
        expect(isParentMessage(true)).toBe(false);
      });

      it('should reject objects without type field', () => {
        expect(isParentMessage({})).toBe(false);
        expect(isParentMessage({ foo: 'bar' })).toBe(false);
      });

      it('should reject objects with invalid type', () => {
        expect(isParentMessage({ type: 'unknown' })).toBe(false);
        expect(isParentMessage({ type: 'execute-wrong' })).toBe(false);
      });
    });

    describe('isChildMessage', () => {
      it('should accept ready message', () => {
        const msg = { type: 'ready' };
        expect(isChildMessage(msg)).toBe(true);
      });

      it('should accept result message', () => {
        const msg = { type: 'result', data: { test: 'data' } };
        expect(isChildMessage(msg)).toBe(true);
      });

      it('should accept error message', () => {
        const msg = {
          type: 'error',
          error: { name: 'Error', message: 'test' },
        };
        expect(isChildMessage(msg)).toBe(true);
      });

      it('should reject parent messages', () => {
        expect(isChildMessage({ type: 'execute' })).toBe(false);
        expect(isChildMessage({ type: 'abort' })).toBe(false);
      });

      it('should reject null and undefined', () => {
        expect(isChildMessage(null)).toBe(false);
        expect(isChildMessage(undefined)).toBe(false);
      });

      it('should reject non-objects', () => {
        expect(isChildMessage('string')).toBe(false);
        expect(isChildMessage(123)).toBe(false);
        expect(isChildMessage(false)).toBe(false);
      });

      it('should reject objects without type field', () => {
        expect(isChildMessage({})).toBe(false);
        expect(isChildMessage({ data: 'test' })).toBe(false);
      });

      it('should reject objects with invalid type', () => {
        expect(isChildMessage({ type: 'unknown' })).toBe(false);
        expect(isChildMessage({ type: 'result-wrong' })).toBe(false);
      });
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize and deserialize ExecuteMessage', () => {
      const msg: ExecuteMessage = {
        type: 'execute',
        descriptor: mockDescriptor,
        socketPath: '/tmp/test.sock',
        handlerPath: '/handler.js',
        input: { foo: 'bar', nested: { value: 123 } },
        cwd: '/test',
      };

      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ExecuteMessage;

      expect(parsed.type).toBe('execute');
      expect(parsed.descriptor).toEqual(mockDescriptor);
      expect(parsed.socketPath).toBe('/tmp/test.sock');
      expect(parsed.handlerPath).toBe('/handler.js');
      expect(parsed.input).toEqual({ foo: 'bar', nested: { value: 123 } });
    });

    it('should serialize and deserialize ResultMessage', () => {
      const msg: ResultMessage = {
        type: 'result',
        data: { success: true, output: [1, 2, 3] },
      };

      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ResultMessage;

      expect(parsed.type).toBe('result');
      expect(parsed.data).toEqual({ success: true, output: [1, 2, 3] });
    });

    it('should serialize and deserialize ErrorMessage', () => {
      const msg: ErrorMessage = {
        type: 'error',
        error: {
          name: 'PermissionError',
          message: 'Access denied',
          code: 'PERMISSION_DENIED',
          stack: 'Error: Access denied\n  at ...',
          details: { path: '/forbidden' },
        },
      };

      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ErrorMessage;

      expect(parsed.type).toBe('error');
      expect(parsed.error.name).toBe('PermissionError');
      expect(parsed.error.message).toBe('Access denied');
      expect(parsed.error.code).toBe('PERMISSION_DENIED');
      expect(parsed.error.stack).toContain('Error');
      expect(parsed.error.details).toEqual({ path: '/forbidden' });
    });
  });

  describe('Union Types', () => {
    it('should allow ParentMessage union to accept both execute and abort', () => {
      const messages: ParentMessage[] = [
        {
          type: 'execute',
          descriptor: mockDescriptor,
          socketPath: '/tmp/test.sock',
          handlerPath: '/test.js',
          input: {},
          cwd: '/test',
        },
        {
          type: 'abort',
        },
      ];

      expect(messages).toHaveLength(2);
      expect(messages[0]!.type).toBe('execute');
      expect(messages[1]!.type).toBe('abort');
    });

    it('should allow ChildMessage union to accept ready, result, error', () => {
      const messages: ChildMessage[] = [
        { type: 'ready' },
        { type: 'result', data: { test: 'data' } },
        {
          type: 'error',
          error: { name: 'Error', message: 'test', code: 'UNKNOWN' },
        },
      ];

      expect(messages).toHaveLength(3);
      expect(messages[0]!.type).toBe('ready');
      expect(messages[1]!.type).toBe('result');
      expect(messages[2]!.type).toBe('error');
    });
  });
});
