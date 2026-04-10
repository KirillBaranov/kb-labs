/**
 * @module @kb-labs/plugin-runtime/__tests__/error-handling
 *
 * Tests for error handling and IPC error serialization.
 *
 * V3 error handling:
 * - Standardized error types with codes
 * - JSON serialization for IPC transport
 * - Stack trace preservation
 * - Error wrapping utilities
 */

import { describe, it, expect } from 'vitest';
import {
  PluginError,
  PermissionError,
  TimeoutError,
  AbortError,
  ConfigError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  PlatformError,
  wrapError,
  isPluginError,
  ErrorCode,
} from '@kb-labs/plugin-contracts';

describe('Error Handling', () => {
  describe('PluginError base class', () => {
    it('should create error with message and code', () => {
      const error = new PluginError('Test error', 'TEST_CODE');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('PluginError');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PluginError);
    });

    it('should store error details', () => {
      const error = new PluginError('Error with details', 'TEST', {
        field: 'username',
        value: 'invalid',
      });

      expect(error.details).toEqual({
        field: 'username',
        value: 'invalid',
      });
    });

    it('should have stack trace', () => {
      const error = new PluginError('Error message', 'TEST');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error message');
    });
  });

  describe('JSON serialization', () => {
    it('should serialize to JSON', () => {
      const error = new PluginError('Serialization test', 'SERIALIZE', {
        foo: 'bar',
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'PluginError',
        message: 'Serialization test',
        code: 'SERIALIZE',
        details: { foo: 'bar' },
        stack: expect.stringContaining('Error'),
      });
    });

    it('should deserialize from JSON', () => {
      const original = new PluginError('Original error', 'ORIGINAL', {
        data: 'test',
      });

      const json = original.toJSON();
      const deserialized = PluginError.fromJSON(json);

      expect(deserialized.message).toBe(original.message);
      expect(deserialized.code).toBe(original.code);
      expect(deserialized.details).toEqual(original.details);
      expect(deserialized.stack).toBe(original.stack);
    });

    it('should preserve stack trace through serialization', () => {
      const error = new PluginError('Stack test', 'STACK');
      const originalStack = error.stack;

      const json = error.toJSON();
      const restored = PluginError.fromJSON(json);

      expect(restored.stack).toBe(originalStack);
      expect(restored.stack).toContain('Stack test');
    });
  });

  describe('Specialized error types', () => {
    it('should create PermissionError with correct code', () => {
      const error = new PermissionError('Access denied', { path: '/etc/passwd' });

      expect(error).toBeInstanceOf(PermissionError);
      expect(error).toBeInstanceOf(PluginError);
      expect(error.name).toBe('PermissionError');
      expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
      expect(error.message).toBe('Access denied');
      expect(error.details?.path).toBe('/etc/passwd');
    });

    it('should create TimeoutError with correct code', () => {
      const error = new TimeoutError('Operation timed out');

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should create AbortError with default message', () => {
      const error = new AbortError();

      expect(error).toBeInstanceOf(AbortError);
      expect(error.name).toBe('AbortError');
      expect(error.code).toBe(ErrorCode.ABORTED);
      expect(error.message).toBe('Operation aborted');
    });

    it('should create ConfigError with details', () => {
      const error = new ConfigError('Invalid configuration', {
        field: 'port',
        value: -1,
      });

      expect(error).toBeInstanceOf(ConfigError);
      expect(error.code).toBe(ErrorCode.CONFIG_ERROR);
      expect(error.details?.field).toBe('port');
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Validation failed', {
        errors: ['Field required', 'Invalid format'],
      });

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError('Resource not found', {
        resourceType: 'plugin',
        id: '@kb-labs/missing',
      });

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should create RateLimitError with retry info', () => {
      const error = new RateLimitError('Too many requests', 5000);

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT);
      expect(error.retryAfterMs).toBe(5000);
      expect(error.details?.retryAfterMs).toBe(5000);
    });

    it('should create PlatformError with service name', () => {
      const error = new PlatformError('llm', 'LLM service unavailable', {
        statusCode: 503,
      });

      expect(error).toBeInstanceOf(PlatformError);
      expect(error.code).toBe(ErrorCode.PLATFORM_ERROR);
      expect(error.service).toBe('llm');
      expect(error.details?.service).toBe('llm');
      expect(error.details?.statusCode).toBe(503);
    });
  });

  describe('Error wrapping utilities', () => {
    it('should identify PluginError instances', () => {
      const pluginError = new PluginError('Test', 'TEST');
      const permissionError = new PermissionError('Access denied');
      const regularError = new Error('Regular error');

      expect(isPluginError(pluginError)).toBe(true);
      expect(isPluginError(permissionError)).toBe(true);
      expect(isPluginError(regularError)).toBe(false);
      expect(isPluginError('string')).toBe(false);
      expect(isPluginError(null)).toBe(false);
    });

    it('should wrap Error as PluginError', () => {
      const original = new Error('Original error');
      original.stack = 'Original stack trace';

      const wrapped = wrapError(original);

      expect(wrapped).toBeInstanceOf(PluginError);
      expect(wrapped.message).toBe('Original error');
      expect(wrapped.code).toBe('INTERNAL_ERROR');
      expect(wrapped.details?.originalName).toBe('Error');
      expect(wrapped.details?.stack).toContain('Original stack');
    });

    it('should wrap TypeError with custom code', () => {
      const original = new TypeError('Type mismatch');

      const wrapped = wrapError(original, 'TYPE_ERROR');

      expect(wrapped).toBeInstanceOf(PluginError);
      expect(wrapped.code).toBe('TYPE_ERROR');
      expect(wrapped.details?.originalName).toBe('TypeError');
    });

    it('should not re-wrap PluginError', () => {
      const original = new PluginError('Already wrapped', 'CUSTOM');

      const wrapped = wrapError(original);

      expect(wrapped).toBe(original); // Same instance
      expect(wrapped.code).toBe('CUSTOM');
    });

    it('should wrap non-Error objects as string', () => {
      const wrapped1 = wrapError('string error');
      expect(wrapped1.message).toBe('string error');
      expect(wrapped1.code).toBe('INTERNAL_ERROR');

      const wrapped2 = wrapError(42);
      expect(wrapped2.message).toBe('42');

      const wrapped3 = wrapError({ foo: 'bar' });
      expect(wrapped3.message).toBe('[object Object]');
    });
  });

  describe('Error code constants', () => {
    it('should have all error codes defined', () => {
      expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCode.ABORTED).toBe('ABORTED');
      expect(ErrorCode.CONFIG_ERROR).toBe('CONFIG_ERROR');
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.RATE_LIMIT).toBe('RATE_LIMIT');
      expect(ErrorCode.PLATFORM_ERROR).toBe('PLATFORM_ERROR');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.IPC_ERROR).toBe('IPC_ERROR');
    });
  });

  describe('IPC error transport', () => {
    it('should preserve all error info through IPC round-trip', () => {
      const original = new PermissionError('File access denied', {
        path: '/etc/passwd',
        operation: 'read',
      });

      // Simulate IPC transport
      const serialized = JSON.stringify(original.toJSON());
      const transmitted = JSON.parse(serialized);
      const restored = PluginError.fromJSON(transmitted);

      expect(restored.message).toBe(original.message);
      expect(restored.code).toBe(original.code);
      // name is NOT preserved - fromJSON always creates PluginError
      expect(restored.name).toBe('PluginError');
      expect(restored.details).toEqual(original.details);
      expect(restored.stack).toBe(original.stack);

      // Use code to identify error type after deserialization
      expect(restored.code).toBe(ErrorCode.PERMISSION_DENIED);
    });

    it('should handle nested error details', () => {
      const error = new ValidationError('Validation failed', {
        errors: [
          { field: 'email', message: 'Invalid format' },
          { field: 'age', message: 'Must be positive' },
        ],
        metadata: {
          timestamp: Date.now(),
          validator: 'zod',
        },
      });

      const json = error.toJSON();
      const restored = PluginError.fromJSON(json);

      expect(restored.details?.errors).toHaveLength(2);
      expect(restored.details?.metadata).toBeDefined();
    });
  });

  describe('Error instanceof checks', () => {
    it('should work with instanceof after deserialization', () => {
      const original = new TimeoutError('Timeout');
      const json = original.toJSON();
      const restored = PluginError.fromJSON(json);

      // Generic PluginError check works
      expect(restored).toBeInstanceOf(PluginError);

      // But type-specific check doesn't (lost in JSON)
      expect(restored).not.toBeInstanceOf(TimeoutError);

      // Use code instead
      expect(restored.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should recommend checking error.code for deserialized errors', () => {
      const errors = [
        new PermissionError('Access denied'),
        new TimeoutError('Timeout'),
        new AbortError(),
      ];

      for (const error of errors) {
        const json = error.toJSON();
        const restored = PluginError.fromJSON(json);

        // After deserialization, use code not instanceof
        if (restored.code === ErrorCode.PERMISSION_DENIED) {
          expect(error).toBeInstanceOf(PermissionError);
        } else if (restored.code === ErrorCode.TIMEOUT) {
          expect(error).toBeInstanceOf(TimeoutError);
        } else if (restored.code === ErrorCode.ABORTED) {
          expect(error).toBeInstanceOf(AbortError);
        }
      }
    });
  });
});
