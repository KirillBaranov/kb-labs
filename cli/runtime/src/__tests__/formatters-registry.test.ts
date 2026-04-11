import { describe, it, expect } from 'vitest';
import { FormattersRegistry, type OutputFormatter } from '../formatters/formatters-registry.js';

describe('FormattersRegistry', () => {
  it('registers and retrieves a formatter', () => {
    const registry = new FormattersRegistry();
    const fmt: OutputFormatter = { name: 'json', format: (d) => JSON.stringify(d) };

    registry.register(fmt);

    expect(registry.get('json')).toBe(fmt);
  });

  it('returns undefined for unregistered formatter', () => {
    const registry = new FormattersRegistry();
    expect(registry.get('nope')).toBeUndefined();
  });

  it('format() delegates to the registered formatter', () => {
    const registry = new FormattersRegistry();
    registry.register({ name: 'upper', format: (d) => String(d).toUpperCase() });

    expect(registry.format('hello', 'upper')).toBe('HELLO');
  });

  it('format() throws when formatter not found', () => {
    const registry = new FormattersRegistry();
    expect(() => registry.format({}, 'missing')).toThrow('Formatter "missing" not found');
  });

  it('later registration overwrites earlier one with same name', () => {
    const registry = new FormattersRegistry();
    registry.register({ name: 'json', format: () => 'v1' });
    registry.register({ name: 'json', format: () => 'v2' });

    expect(registry.format({}, 'json')).toBe('v2');
  });

  it('supports multiple formatters side by side', () => {
    const registry = new FormattersRegistry();
    registry.register({ name: 'json', format: (d) => JSON.stringify(d) });
    registry.register({ name: 'csv', format: () => 'a,b,c' });

    expect(registry.format({ x: 1 }, 'json')).toBe('{"x":1}');
    expect(registry.format(null, 'csv')).toBe('a,b,c');
  });
});
