import { describe, it, expect } from 'vitest';
import { generateCommandSchema } from '../schema-generator.js';
import type { CommandManifest } from '../../registry/types.js';

function makeManifest(overrides: Partial<CommandManifest> = {}): CommandManifest {
  return {
    manifestVersion: '1.0',
    segments: ['workflow', 'runs', 'list'],
    id: 'list',
    group: 'workflow',
    subgroup: 'runs',
    describe: 'List workflow runs',
    ...overrides,
  };
}

describe('generateCommandSchema', () => {
  it('produces valid JSON Schema structure', () => {
    const schema = generateCommandSchema(makeManifest()) as Record<string, unknown>;
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['type']).toBe('object');
    expect(schema['title']).toBe('workflow runs list');
    expect(schema['description']).toBe('List workflow runs');
  });

  it('maps flag types correctly', () => {
    const manifest = makeManifest({
      flags: [
        { name: 'limit',  type: 'number',  description: 'Max results' },
        { name: 'json',   type: 'boolean', description: 'JSON output' },
        { name: 'format', type: 'string',  description: 'Format' },
      ],
    });
    const schema = generateCommandSchema(manifest) as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['limit']!['type']).toBe('number');
    expect(props['json']!['type']).toBe('boolean');
    expect(props['format']!['type']).toBe('string');
  });

  it('includes choices as enum', () => {
    const manifest = makeManifest({
      flags: [{ name: 'output', type: 'string', choices: ['json', 'table', 'csv'] }],
    });
    const schema = generateCommandSchema(manifest) as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['output']!['enum']).toEqual(['json', 'table', 'csv']);
  });

  it('includes required flags in required[]', () => {
    const manifest = makeManifest({
      flags: [
        { name: 'text', type: 'string', required: true, description: 'Query' },
        { name: 'json', type: 'boolean' },
      ],
    });
    const schema = generateCommandSchema(manifest) as Record<string, unknown>;
    expect(schema['required']).toEqual(['text']);
  });

  it('includes operationType when present', () => {
    const manifest = makeManifest({ operationType: 'read' });
    const schema = generateCommandSchema(manifest) as Record<string, unknown>;
    expect(schema['operationType']).toBe('read');
  });

  it('omits operationType when not declared', () => {
    const schema = generateCommandSchema(makeManifest()) as Record<string, unknown>;
    expect('operationType' in schema).toBe(false);
  });

  it('includes examples array', () => {
    const manifest = makeManifest({ examples: ['kb workflow runs list', 'kb workflow runs list --json'] });
    const schema = generateCommandSchema(manifest) as Record<string, unknown>;
    expect(schema['examples']).toEqual(['kb workflow runs list', 'kb workflow runs list --json']);
  });

  it('handles command with no flags (empty properties)', () => {
    const schema = generateCommandSchema(makeManifest({ flags: [] })) as Record<string, unknown>;
    expect(schema['properties']).toEqual({});
    expect('required' in schema).toBe(false);
  });

  it('includes default values in properties', () => {
    const manifest = makeManifest({
      flags: [{ name: 'limit', type: 'number', default: 20 }],
    });
    const schema = generateCommandSchema(manifest) as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['limit']!['default']).toBe(20);
  });
});
