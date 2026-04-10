import { describe, it, expect } from 'vitest';
import { defineFlags, validateFlags, validateFlagsSafe, FlagValidationError } from '../flags/index';

describe('defineFlags', () => {
  it('should create flag schema with type inference', () => {
    const schema = defineFlags({
      scope: {
        type: 'string',
        required: true,
      },
      'dry-run': {
        type: 'boolean',
        default: false,
      },
    });

    expect(schema.schema).toBeDefined();
    expect(schema.schema.scope).toBeDefined();
    expect(schema.schema['dry-run']).toBeDefined();
  });
});

describe('validateFlags', () => {
  it('should validate boolean flags', async () => {
    const schema = defineFlags({
      verbose: { type: 'boolean', default: false },
      quiet: { type: 'boolean' },
    });

    const flags = await validateFlags({ verbose: true, quiet: false }, schema);
    expect(flags.verbose).toBe(true);
    expect(flags.quiet).toBe(false);
  });

  it('should validate string flags', async () => {
    const schema = defineFlags({
      name: { type: 'string', required: true },
      format: { type: 'string', default: 'json' },
    });

    const flags = await validateFlags({ name: 'test', format: 'yaml' }, schema);
    expect(flags.name).toBe('test');
    expect(flags.format).toBe('yaml');
  });

  it('should validate number flags', async () => {
    const schema = defineFlags({
      limit: { type: 'number', min: 1, max: 100, default: 10 },
      port: { type: 'number' },
    });

    const flags = await validateFlags({ limit: 50, port: 8080 }, schema);
    expect(flags.limit).toBe(50);
    expect(flags.port).toBe(8080);
  });

  it('should validate array flags', async () => {
    const schema = defineFlags({
      tags: { type: 'array', items: 'string' },
      numbers: { type: 'array', items: 'number' },
    });

    const flags = await validateFlags(
      { tags: ['a', 'b'], numbers: [1, 2, 3] },
      schema
    );
    expect(flags.tags).toEqual(['a', 'b']);
    expect(flags.numbers).toEqual([1, 2, 3]);
  });

  it('should apply default values', async () => {
    const schema = defineFlags({
      verbose: { type: 'boolean', default: false },
      limit: { type: 'number', default: 10 },
      format: { type: 'string', default: 'json' },
    });

    const flags = await validateFlags({}, schema);
    expect(flags.verbose).toBe(false);
    expect(flags.limit).toBe(10);
    expect(flags.format).toBe('json');
  });

  it('should throw error for required flags', async () => {
    const schema = defineFlags({
      name: { type: 'string', required: true },
    });

    await expect(validateFlags({}, schema)).rejects.toThrow(FlagValidationError);
  });

  it('should validate choices', async () => {
    const schema = defineFlags({
      format: {
        type: 'string',
        choices: ['json', 'yaml', 'toml'] as const,
      },
    });

    const flags = await validateFlags({ format: 'json' }, schema);
    expect(flags.format).toBe('json');

    await expect(validateFlags({ format: 'xml' }, schema)).rejects.toThrow();
  });

  it('should validate pattern', async () => {
    const schema = defineFlags({
      scope: {
        type: 'string',
        pattern: /^[@a-z0-9-/]+$/i,
      },
    });

    const flags = await validateFlags({ scope: '@my-org/package' }, schema);
    expect(flags.scope).toBe('@my-org/package');

    await expect(validateFlags({ scope: 'invalid scope!' }, schema)).rejects.toThrow();
  });

  it('should validate min/max for numbers', async () => {
    const schema = defineFlags({
      limit: { type: 'number', min: 1, max: 100 },
    });

    await expect(validateFlags({ limit: 0 }, schema)).rejects.toThrow();
    await expect(validateFlags({ limit: 101 }, schema)).rejects.toThrow();
    
    const flags = await validateFlags({ limit: 50 }, schema);
    expect(flags.limit).toBe(50);
  });

  it('should coerce string to boolean', async () => {
    const schema = defineFlags({
      verbose: { type: 'boolean' },
    });

    const flags1 = await validateFlags({ verbose: 'true' }, schema);
    expect(flags1.verbose).toBe(true);

    const flags2 = await validateFlags({ verbose: 'false' }, schema);
    expect(flags2.verbose).toBe(false);
  });

  it('should coerce string to number', async () => {
    const schema = defineFlags({
      limit: { type: 'number' },
    });

    const flags = await validateFlags({ limit: '42' }, schema);
    expect(flags.limit).toBe(42);
  });

  it('should coerce comma-separated string to array', async () => {
    const schema = defineFlags({
      tags: { type: 'array', items: 'string' },
    });

    const flags = await validateFlags({ tags: 'a,b,c' }, schema);
    expect(flags.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('validateFlagsSafe', () => {
  it('should return success result for valid flags', async () => {
    const schema = defineFlags({
      name: { type: 'string', required: true },
    });

    const result = await validateFlagsSafe({ name: 'test' }, schema);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe('test');
    expect(result.errors).toEqual([]);
  });

  it('should return error result for invalid flags', async () => {
    const schema = defineFlags({
      name: { type: 'string', required: true },
    });

    const result = await validateFlagsSafe({}, schema);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.flag).toBe('name');
  });
});

describe('validateFlags - advanced features', () => {
  it('should validate conflicts', async () => {
    const schema = defineFlags({
      verbose: { type: 'boolean', conflicts: ['quiet'] },
      quiet: { type: 'boolean', conflicts: ['verbose'] },
    });

    await expect(
      validateFlags({ verbose: true, quiet: true }, schema)
    ).rejects.toThrow();
  });

  it('should validate dependsOn', async () => {
    const schema = defineFlags({
      output: { type: 'string', dependsOn: ['format'] },
      format: { type: 'string' },
    });

    await expect(
      validateFlags({ output: 'file.txt' }, schema)
    ).rejects.toThrow();

    const flags = await validateFlags(
      { output: 'file.txt', format: 'json' },
      schema
    );
    expect(flags.output).toBe('file.txt');
  });

  it('should validate implies', async () => {
    const schema = defineFlags({
      verbose: { type: 'boolean', implies: ['debug'] },
      debug: { type: 'boolean' },
    });

    const flags = await validateFlags({ verbose: true }, schema);
    expect(flags.debug).toBe(true);
  });

  it('should apply custom validator', async () => {
    const schema = defineFlags({
      port: {
        type: 'number',
        validate: (value: number) => {
          if (value < 1024 || value > 65535) {
            return 'Port must be between 1024 and 65535';
          }
          return true;
        },
      },
    });

    await expect(validateFlags({ port: 80 }, schema)).rejects.toThrow();
    await expect(validateFlags({ port: 70000 }, schema)).rejects.toThrow();

    const flags = await validateFlags({ port: 8080 }, schema);
    expect(flags.port).toBe(8080);
  });

  it('should apply async custom validator', async () => {
    const schema = defineFlags({
      name: {
        type: 'string',
        validate: async (value: string) => {
          // Simulate async check
          await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
          if (value.length < 3) {
            return 'Name must be at least 3 characters';
          }
          return true;
        },
      },
    });

    await expect(validateFlags({ name: 'ab' }, schema)).rejects.toThrow();

    const flags = await validateFlags({ name: 'test' }, schema);
    expect(flags.name).toBe('test');
  });

  it('should apply transform', async () => {
    const schema = defineFlags({
      name: {
        type: 'string',
        transform: (value: string) => value.toUpperCase(),
      },
    });

    const flags = await validateFlags({ name: 'test' }, schema);
    expect(flags.name).toBe('TEST');
  });

  it('should apply async transform', async () => {
    const schema = defineFlags({
      name: {
        type: 'string',
        transform: async (value: string) => {
          await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
          return value.trim().toLowerCase();
        },
      },
    });

    const flags = await validateFlags({ name: '  TEST  ' }, schema);
    expect(flags.name).toBe('test');
  });

  it('should validate array minLength', async () => {
    const schema = defineFlags({
      tags: {
        type: 'array',
        items: 'string',
        minLength: 2,
      },
    });

    await expect(validateFlags({ tags: ['a'] }, schema)).rejects.toThrow();

    const flags = await validateFlags({ tags: ['a', 'b'] }, schema);
    expect(flags.tags).toEqual(['a', 'b']);
  });

  it('should validate array maxLength', async () => {
    const schema = defineFlags({
      tags: {
        type: 'array',
        items: 'string',
        maxLength: 2,
      },
    });

    await expect(validateFlags({ tags: ['a', 'b', 'c'] }, schema)).rejects.toThrow();

    const flags = await validateFlags({ tags: ['a', 'b'] }, schema);
    expect(flags.tags).toEqual(['a', 'b']);
  });

  it('should validate string minLength', async () => {
    const schema = defineFlags({
      name: {
        type: 'string',
        minLength: 3,
      },
    });

    await expect(validateFlags({ name: 'ab' }, schema)).rejects.toThrow();

    const flags = await validateFlags({ name: 'abc' }, schema);
    expect(flags.name).toBe('abc');
  });

  it('should validate string maxLength', async () => {
    const schema = defineFlags({
      name: {
        type: 'string',
        maxLength: 5,
      },
    });

    await expect(validateFlags({ name: 'abcdef' }, schema)).rejects.toThrow();

    const flags = await validateFlags({ name: 'abc' }, schema);
    expect(flags.name).toBe('abc');
  });
});

