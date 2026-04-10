/**
 * @module @kb-labs/core-platform/serializable
 * Unit tests for serializer - 100% coverage target
 */

import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  serializeArgs,
  deserializeArgs,
} from './serializer';
import type {
  SerializableBuffer,
  SerializableDate,
  SerializableError} from './types';
import {
  SerializationError,
  DeserializationError
} from './types';

describe('serializer', () => {
  describe('primitives', () => {
    it('should serialize null', () => {
      expect(serialize(null)).toBe(null);
    });

    it('should serialize undefined as null', () => {
      expect(serialize(undefined)).toBe(null);
    });

    it('should serialize boolean', () => {
      expect(serialize(true)).toBe(true);
      expect(serialize(false)).toBe(false);
    });

    it('should serialize number', () => {
      expect(serialize(42)).toBe(42);
      expect(serialize(3.14)).toBe(3.14);
      expect(serialize(0)).toBe(0);
      expect(serialize(-100)).toBe(-100);
    });

    it('should serialize string', () => {
      expect(serialize('hello')).toBe('hello');
      expect(serialize('')).toBe('');
      expect(serialize('multi\nline')).toBe('multi\nline');
    });
  });

  describe('Buffer serialization', () => {
    it('should serialize Buffer to base64', () => {
      const buffer = Buffer.from('hello world', 'utf8');
      const result = serialize(buffer) as SerializableBuffer;

      expect(result).toEqual({
        __type: 'Buffer',
        data: buffer.toString('base64'),
      });
    });

    it('should deserialize Buffer from base64', () => {
      const original = Buffer.from('hello world', 'utf8');
      const serialized: SerializableBuffer = {
        __type: 'Buffer',
        data: original.toString('base64'),
      };

      const result = deserialize(serialized);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).toString('utf8')).toBe('hello world');
    });

    it('should round-trip Buffer', () => {
      const original = Buffer.from('test data', 'utf8');
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);

      expect(Buffer.isBuffer(deserialized)).toBe(true);
      expect((deserialized as Buffer).equals(original)).toBe(true);
    });

    it('should handle empty Buffer', () => {
      const buffer = Buffer.alloc(0);
      const serialized = serialize(buffer);
      const deserialized = deserialize(serialized);

      expect(Buffer.isBuffer(deserialized)).toBe(true);
      expect((deserialized as Buffer).length).toBe(0);
    });

    it('should handle binary data in Buffer', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      const serialized = serialize(buffer);
      const deserialized = deserialize(serialized);

      expect(Buffer.isBuffer(deserialized)).toBe(true);
      expect((deserialized as Buffer).equals(buffer)).toBe(true);
    });

    it('should throw on invalid Buffer data', () => {
      const invalid = {
        __type: 'Buffer',
        data: 123, // Not a string
      };

      expect(() => deserialize(invalid as any)).toThrow(DeserializationError);
    });

    it('should gracefully decode non-strict base64 input', () => {
      const invalid: SerializableBuffer = {
        __type: 'Buffer',
        data: 'invalid!!!base64',
      };

      const result = deserialize(invalid);
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('Date serialization', () => {
    it('should serialize Date to ISO string', () => {
      const date = new Date('2025-01-01T12:00:00.000Z');
      const result = serialize(date) as SerializableDate;

      expect(result).toEqual({
        __type: 'Date',
        iso: '2025-01-01T12:00:00.000Z',
      });
    });

    it('should deserialize Date from ISO string', () => {
      const serialized: SerializableDate = {
        __type: 'Date',
        iso: '2025-01-01T12:00:00.000Z',
      };

      const result = deserialize(serialized);
      expect(result instanceof Date).toBe(true);
      expect((result as Date).toISOString()).toBe('2025-01-01T12:00:00.000Z');
    });

    it('should round-trip Date', () => {
      const original = new Date('2025-06-15T09:30:45.123Z');
      const serialized = serialize(original);
      const deserialized = deserialize(serialized);

      expect(deserialized instanceof Date).toBe(true);
      expect((deserialized as Date).getTime()).toBe(original.getTime());
    });

    it('should throw on invalid Date', () => {
      const invalidDate = new Date('invalid');
      expect(() => serialize(invalidDate)).toThrow(SerializationError);
    });

    it('should throw on invalid ISO string', () => {
      const invalid: SerializableDate = {
        __type: 'Date',
        iso: 'not-a-date',
      };

      expect(() => deserialize(invalid)).toThrow(DeserializationError);
    });

    it('should throw on missing iso field', () => {
      const invalid = {
        __type: 'Date',
        iso: 123, // Not a string
      };

      expect(() => deserialize(invalid as any)).toThrow(DeserializationError);
    });
  });

  describe('Error serialization', () => {
    it('should serialize Error with stack', () => {
      const error = new Error('test error');
      const result = serialize(error) as SerializableError;

      expect(result.__type).toBe('Error');
      expect(result.name).toBe('Error');
      expect(result.message).toBe('test error');
      expect(result.stack).toBeDefined();
    });

    it('should serialize custom Error types', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const error = new CustomError('custom error');
      const result = serialize(error) as SerializableError;

      expect(result.name).toBe('CustomError');
      expect(result.message).toBe('custom error');
    });

    it('should serialize Error with code', () => {
      const error: any = new Error('system error');
      error.code = 'ENOENT';

      const result = serialize(error) as SerializableError;
      expect(result.code).toBe('ENOENT');
    });

    it('should deserialize Error', () => {
      const serialized: SerializableError = {
        __type: 'Error',
        name: 'TestError',
        message: 'test message',
        stack: 'Error: test\n at...',
        code: 'TEST_CODE',
      };

      const result = deserialize(serialized);
      expect(result instanceof Error).toBe(true);
      expect((result as Error).name).toBe('TestError');
      expect((result as Error).message).toBe('test message');
      expect((result as Error).stack).toBe('Error: test\n at...');
      expect((result as any).code).toBe('TEST_CODE');
    });

    it('should round-trip Error', () => {
      const original = new Error('original error');
      original.name = 'CustomError';
      (original as any).code = 'ERR123';

      const serialized = serialize(original);
      const deserialized = deserialize(serialized);

      expect(deserialized instanceof Error).toBe(true);
      expect((deserialized as Error).message).toBe('original error');
      expect((deserialized as Error).name).toBe('CustomError');
      expect((deserialized as any).code).toBe('ERR123');
    });

    it('should throw on missing message field', () => {
      const invalid = {
        __type: 'Error',
        name: 'TestError',
        // missing message
      };

      expect(() => deserialize(invalid as any)).toThrow(DeserializationError);
    });
  });

  describe('Array serialization', () => {
    it('should serialize empty array', () => {
      expect(serialize([])).toEqual([]);
    });

    it('should serialize array of primitives', () => {
      const arr = [1, 'two', true, null];
      expect(serialize(arr)).toEqual([1, 'two', true, null]);
    });

    it('should serialize nested arrays', () => {
      const arr = [1, [2, [3, [4]]]];
      expect(serialize(arr)).toEqual([1, [2, [3, [4]]]]);
    });

    it('should serialize array with special types', () => {
      const arr = [
        Buffer.from('buf'),
        new Date('2025-01-01'),
        new Error('err'),
      ];

      const result = serialize(arr) as any[];
      expect(result[0].__type).toBe('Buffer');
      expect(result[1].__type).toBe('Date');
      expect(result[2].__type).toBe('Error');
    });

    it('should deserialize array', () => {
      const serialized = [1, 'two', true, null];
      const result = deserialize(serialized);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([1, 'two', true, null]);
    });

    it('should round-trip array', () => {
      const original = [1, 'test', Buffer.from('data'), new Date('2025-01-01')];
      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as any[];

      expect(deserialized[0]).toBe(1);
      expect(deserialized[1]).toBe('test');
      expect(Buffer.isBuffer(deserialized[2])).toBe(true);
      expect(deserialized[3] instanceof Date).toBe(true);
    });
  });

  describe('Object serialization', () => {
    it('should serialize empty object', () => {
      expect(serialize({})).toEqual({});
    });

    it('should serialize flat object', () => {
      const obj = { a: 1, b: 'two', c: true };
      expect(serialize(obj)).toEqual({ a: 1, b: 'two', c: true });
    });

    it('should serialize nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: { value: 42 },
          },
        },
      };

      expect(serialize(obj)).toEqual(obj);
    });

    it('should serialize object with special types', () => {
      const obj = {
        buffer: Buffer.from('test'),
        date: new Date('2025-01-01'),
        error: new Error('test'),
      };

      const result = serialize(obj) as any;
      expect(result.buffer.__type).toBe('Buffer');
      expect(result.date.__type).toBe('Date');
      expect(result.error.__type).toBe('Error');
    });

    it('should deserialize object', () => {
      const serialized = { a: 1, b: 'two', c: true };
      const result = deserialize(serialized);

      expect(result).toEqual({ a: 1, b: 'two', c: true });
    });

    it('should round-trip object', () => {
      const original = {
        num: 42,
        str: 'test',
        buf: Buffer.from('data'),
        date: new Date('2025-01-01'),
        nested: { value: 100 },
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as any;

      expect(deserialized.num).toBe(42);
      expect(deserialized.str).toBe('test');
      expect(Buffer.isBuffer(deserialized.buf)).toBe(true);
      expect(deserialized.date instanceof Date).toBe(true);
      expect(deserialized.nested.value).toBe(100);
    });
  });

  describe('circular reference detection', () => {
    it('should detect circular reference in object', () => {
      const obj: any = { a: 1 };
      obj.self = obj;

      expect(() => serialize(obj)).toThrow(SerializationError);
      expect(() => serialize(obj)).toThrow(/circular reference/i);
    });

    it('should detect circular reference in nested object', () => {
      const obj: any = { nested: { value: 42 } };
      obj.nested.parent = obj;

      expect(() => serialize(obj)).toThrow(SerializationError);
    });

    it('should detect circular reference in array', () => {
      const arr: any[] = [1, 2, 3];
      arr.push(arr);

      expect(() => serialize(arr)).toThrow(SerializationError);
    });

    it('should treat repeated object references as circular', () => {
      const shared = { value: 42 };
      const obj = {
        a: shared,
        b: shared,
      };

      expect(() => serialize(obj)).toThrow(SerializationError);
    });
  });

  describe('unsupported types', () => {
    it('should throw on function', () => {
      const fn = () => {};
      expect(() => serialize(fn)).toThrow(SerializationError);
    });

    it('should throw on symbol', () => {
      const sym = Symbol('test');
      expect(() => serialize(sym)).toThrow(SerializationError);
    });

    it('should throw on Map', () => {
      const map = new Map([['key', 'value']]);
      expect(() => serialize(map)).toThrow(SerializationError);
    });

    it('should throw on Set', () => {
      const set = new Set([1, 2, 3]);
      expect(() => serialize(set)).toThrow(SerializationError);
    });

    it('should throw on class instance', () => {
      class CustomClass {
        value = 42;
      }

      const instance = new CustomClass();
      expect(() => serialize(instance)).toThrow(SerializationError);
    });
  });

  describe('helper functions', () => {
    describe('serializeArgs', () => {
      it('should serialize array of arguments', () => {
        const args = [
          Buffer.from('test'),
          new Date('2025-01-01'),
          { value: 42 },
        ];

        const result = serializeArgs(args) as any[];
        expect(result[0].__type).toBe('Buffer');
        expect(result[1].__type).toBe('Date');
        expect(result[2]).toEqual({ value: 42 });
      });

      it('should handle empty args', () => {
        expect(serializeArgs([])).toEqual([]);
      });
    });

    describe('deserializeArgs', () => {
      it('should deserialize array of arguments', () => {
        const serialized = [
          { __type: 'Buffer', data: Buffer.from('test').toString('base64') },
          { __type: 'Date', iso: '2025-01-01T00:00:00.000Z' },
          { value: 42 },
        ];

        const result = deserializeArgs(serialized as any) as any[];
        expect(Buffer.isBuffer(result[0])).toBe(true);
        expect(result[1] instanceof Date).toBe(true);
        expect(result[2]).toEqual({ value: 42 });
      });

      it('should handle empty args', () => {
        expect(deserializeArgs([])).toEqual([]);
      });
    });
  });

  describe('performance', () => {
    it('should serialize 10K objects in < 500ms', () => {
      const objects = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `object-${i}`,
        value: i * 2,
        nested: { data: [i, i + 1, i + 2] },
      }));

      const start = Date.now();
      objects.forEach((obj) => serialize(obj));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });

    it('should deserialize 10K objects in < 500ms', () => {
      const objects = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `object-${i}`,
        value: i * 2,
        nested: { data: [i, i + 1, i + 2] },
      }));

      const serialized = objects.map((obj) => serialize(obj));

      const start = Date.now();
      serialized.forEach((obj) => deserialize(obj));
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('edge cases', () => {
    it('should handle deeply nested structures', () => {
      let deep: any = { value: 42 };
      for (let i = 0; i < 100; i++) {
        deep = { nested: deep };
      }

      const serialized = serialize(deep);
      const deserialized = deserialize(serialized) as any;

      let current = deserialized;
      for (let i = 0; i < 100; i++) {
        expect(current.nested).toBeDefined();
        current = current.nested;
      }
      expect(current.value).toBe(42);
    });

    it('should handle large arrays', () => {
      const large = Array.from({ length: 10000 }, (_, i) => i);
      const serialized = serialize(large);
      const deserialized = deserialize(serialized);

      expect(Array.isArray(deserialized)).toBe(true);
      expect((deserialized as number[]).length).toBe(10000);
      expect((deserialized as number[])[9999]).toBe(9999);
    });

    it('should handle objects with many keys', () => {
      const obj: any = {};
      for (let i = 0; i < 1000; i++) {
        obj[`key${i}`] = i;
      }

      const serialized = serialize(obj);
      const deserialized = deserialize(serialized) as any;

      expect(Object.keys(deserialized).length).toBe(1000);
      expect(deserialized.key999).toBe(999);
    });

    it('should handle mixed special types', () => {
      const complex = {
        buffers: [Buffer.from('a'), Buffer.from('b')],
        dates: [new Date('2025-01-01'), new Date('2025-12-31')],
        errors: [new Error('err1'), new Error('err2')],
        nested: {
          more: {
            buffers: Buffer.from('nested'),
          },
        },
      };

      const serialized = serialize(complex);
      const deserialized = deserialize(serialized) as any;

      expect(Buffer.isBuffer(deserialized.buffers[0])).toBe(true);
      expect(deserialized.dates[0] instanceof Date).toBe(true);
      expect(deserialized.errors[0] instanceof Error).toBe(true);
      expect(Buffer.isBuffer(deserialized.nested.more.buffers)).toBe(true);
    });
  });
});
