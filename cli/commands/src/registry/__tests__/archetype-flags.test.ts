import { describe, it, expect } from 'vitest';
import { getArchetypeFlags, schemaFlag, ARCHETYPE_FLAGS } from '../archetype-flags.js';
import type { FlagDefinition } from '../types.js';

describe('ARCHETYPE_FLAGS', () => {
  it('read injects output, limit, offset', () => {
    const names = ARCHETYPE_FLAGS['read']!.map(f => f.name);
    expect(names).toContain('output');
    expect(names).toContain('limit');
    expect(names).toContain('offset');
  });

  it('mutate injects output, dry-run, yes', () => {
    const names = ARCHETYPE_FLAGS['mutate']!.map(f => f.name);
    expect(names).toContain('output');
    expect(names).toContain('dry-run');
    expect(names).toContain('yes');
  });

  it('execute injects output, wait, watch, timeout, yes', () => {
    const names = ARCHETYPE_FLAGS['execute']!.map(f => f.name);
    expect(names).toContain('output');
    expect(names).toContain('wait');
    expect(names).toContain('watch');
    expect(names).toContain('timeout');
    expect(names).toContain('yes');
  });

  it('analyze injects output, format, stream', () => {
    const names = ARCHETYPE_FLAGS['analyze']!.map(f => f.name);
    expect(names).toContain('output');
    expect(names).toContain('format');
    expect(names).toContain('stream');
  });
});

describe('getArchetypeFlags', () => {
  it('returns all archetype flags when none declared', () => {
    const result = getArchetypeFlags('read', []);
    const names = result.map(f => f.name);
    expect(names).toContain('output');
    expect(names).toContain('limit');
    expect(names).toContain('offset');
  });

  it('does not overwrite flags already declared by plugin author', () => {
    const existing: FlagDefinition[] = [
      { name: 'output', type: 'string', description: 'custom output flag' },
    ];
    const result = getArchetypeFlags('read', existing);
    expect(result.map(f => f.name)).not.toContain('output');
    expect(result.map(f => f.name)).toContain('limit');
  });

  it('returns empty array for unknown operationType', () => {
    const result = getArchetypeFlags('unknown-type', []);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when all archetype flags already declared', () => {
    const existing: FlagDefinition[] = [
      { name: 'output', type: 'string' },
      { name: 'limit',  type: 'number' },
      { name: 'offset', type: 'number' },
    ];
    const result = getArchetypeFlags('read', existing);
    expect(result).toHaveLength(0);
  });
});

describe('schemaFlag', () => {
  it('is named "schema" and is boolean', () => {
    expect(schemaFlag.name).toBe('schema');
    expect(schemaFlag.type).toBe('boolean');
  });

  it('has a description', () => {
    expect(schemaFlag.description).toBeTruthy();
  });
});
