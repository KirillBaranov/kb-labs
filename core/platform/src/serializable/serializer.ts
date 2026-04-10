/**
 * @module @kb-labs/core-platform/serializable
 * Serializer for cross-process communication.
 *
 * Handles serialization/deserialization of complex types:
 * - Buffer (to/from base64)
 * - Date (to/from ISO 8601)
 * - Error (with stack traces)
 * - Circular reference detection
 *
 * @example
 * ```typescript
 * import { serialize, deserialize } from '@kb-labs/core-platform/serializable';
 *
 * const data = {
 *   buffer: Buffer.from('hello'),
 *   date: new Date(),
 *   error: new Error('test'),
 *   nested: { values: [1, 2, 3] },
 * };
 *
 * const serialized = serialize(data);
 * const deserialized = deserialize(serialized);
 * ```
 */

import type {
  SerializableValue,
  SerializableBuffer,
  SerializableDate,
  SerializableError,
  SerializableArray,
  SerializableObject} from './types';
import {
  SerializationError,
  DeserializationError,
} from './types';

/**
 * Serialize value for IPC transmission.
 *
 * Handles special types:
 * - Buffer → base64 string
 * - Date → ISO 8601 string
 * - Error → structured object with stack
 * - Detects and throws on circular references
 *
 * @param value - Value to serialize
 * @returns Serialized value safe for JSON transmission
 * @throws SerializationError if value contains unsupported types or circular refs
 *
 * @example
 * ```typescript
 * const result = serialize({
 *   buf: Buffer.from('hello'),
 *   date: new Date('2025-01-01'),
 *   error: new Error('test'),
 * });
 * // result = {
 * //   buf: { __type: 'Buffer', data: 'aGVsbG8=' },
 * //   date: { __type: 'Date', iso: '2025-01-01T00:00:00.000Z' },
 * //   error: { __type: 'Error', name: 'Error', message: 'test', stack: '...' },
 * // }
 * ```
 */
export function serialize(value: unknown): SerializableValue {
  const seen = new WeakSet<object>();
  return serializeValue(value, seen);
}

/**
 * Internal serialization with circular reference tracking.
 */
function serializeValue(value: unknown, seen: WeakSet<object>): SerializableValue {
  // Primitives
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  // Check for circular references
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new SerializationError('Circular reference detected');
    }
    seen.add(value);
  }

  // Buffer → base64
  if (Buffer.isBuffer(value)) {
    return {
      __type: 'Buffer',
      data: value.toString('base64'),
    } as SerializableBuffer;
  }

  // Date → ISO string
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new SerializationError('Cannot serialize invalid Date');
    }
    return {
      __type: 'Date',
      iso: value.toISOString(),
    } as SerializableDate;
  }

  // Error → structured
  if (value instanceof Error) {
    return {
      __type: 'Error',
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: (value as any).code,
    } as SerializableError;
  }

  // Array
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen)) as SerializableArray;
  }

  // Plain object
  if (typeof value === 'object' && value.constructor === Object) {
    const result: SerializableObject = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeValue(val, seen);
    }
    return result;
  }

  // Unsupported type
  throw new SerializationError(
    `Cannot serialize type: ${typeof value} (constructor: ${value.constructor?.name || 'unknown'})`
  );
}

/**
 * Deserialize value from IPC transmission.
 *
 * Reconstructs special types:
 * - base64 string → Buffer
 * - ISO 8601 string → Date
 * - structured object → Error (with stack)
 *
 * @param value - Serialized value
 * @returns Original value reconstructed from serialization
 * @throws DeserializationError if value format is invalid
 *
 * @example
 * ```typescript
 * const serialized = {
 *   buf: { __type: 'Buffer', data: 'aGVsbG8=' },
 *   date: { __type: 'Date', iso: '2025-01-01T00:00:00.000Z' },
 *   error: { __type: 'Error', name: 'Error', message: 'test' },
 * };
 *
 * const result = deserialize(serialized);
 * // result = {
 * //   buf: Buffer.from('hello'),
 * //   date: new Date('2025-01-01'),
 * //   error: Error('test'),
 * // }
 * ```
 */
export function deserialize(value: SerializableValue): unknown {
  // Primitives
  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  // Must be object/array at this point
  if (typeof value !== 'object') {
    throw new DeserializationError(`Invalid serialized value type: ${typeof value}`);
  }

  // Check for special types
  const obj = value as any;

  // Buffer
  if (obj.__type === 'Buffer') {
    if (typeof obj.data !== 'string') {
      throw new DeserializationError('Invalid SerializableBuffer: missing or invalid data field');
    }
    try {
      return Buffer.from(obj.data, 'base64');
    } catch (error) {
      throw new DeserializationError(`Failed to decode Buffer: ${error}`);
    }
  }

  // Date
  if (obj.__type === 'Date') {
    if (typeof obj.iso !== 'string') {
      throw new DeserializationError('Invalid SerializableDate: missing or invalid iso field');
    }
    const date = new Date(obj.iso);
    if (isNaN(date.getTime())) {
      throw new DeserializationError(`Invalid ISO date string: ${obj.iso}`);
    }
    return date;
  }

  // Error
  if (obj.__type === 'Error') {
    if (typeof obj.message !== 'string') {
      throw new DeserializationError('Invalid SerializableError: missing or invalid message field');
    }
    const error = new Error(obj.message);
    if (typeof obj.name === 'string') {
      error.name = obj.name;
    }
    if (typeof obj.stack === 'string') {
      error.stack = obj.stack;
    }
    if (obj.code !== undefined) {
      (error as any).code = obj.code;
    }
    return error;
  }

  // Array
  if (Array.isArray(value)) {
    return value.map((item) => deserialize(item));
  }

  // Plain object
  const result: any = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = deserialize(val);
  }
  return result;
}

/**
 * Serialize multiple values (convenience for adapter method args).
 *
 * @example
 * ```typescript
 * const args = serializeArgs([
 *   Buffer.from('hello'),
 *   new Date(),
 *   { nested: { value: 42 } },
 * ]);
 * ```
 */
export function serializeArgs(args: unknown[]): SerializableValue[] {
  return args.map((arg) => serialize(arg));
}

/**
 * Deserialize multiple values (convenience for adapter method args).
 *
 * @example
 * ```typescript
 * const args = deserializeArgs([
 *   { __type: 'Buffer', data: 'aGVsbG8=' },
 *   { __type: 'Date', iso: '2025-01-01T00:00:00.000Z' },
 *   { nested: { value: 42 } },
 * ]);
 * ```
 */
export function deserializeArgs(args: SerializableValue[]): unknown[] {
  return args.map((arg) => deserialize(arg));
}
