import { describe, it, expect } from 'vitest';
import { PIPELINE_SLOTS, SLOT_ORDER, validateMiddlewareDecl } from '../pipeline-slots';
import type { AdapterMiddlewareDecl } from '../pipeline-slots';

describe('PIPELINE_SLOTS', () => {
  it('has governance as the last slot in SLOT_ORDER', () => {
    expect(SLOT_ORDER[SLOT_ORDER.length - 1]).toBe('governance');
  });

  it('marks reserved slots correctly', () => {
    expect(PIPELINE_SLOTS['router'].reserved).toBe(true);
    expect(PIPELINE_SLOTS['resource-broker'].reserved).toBe(true);
    expect(PIPELINE_SLOTS['governance'].reserved).toBe(true);
    expect(PIPELINE_SLOTS['raw'].reserved).toBe(false);
    expect(PIPELINE_SLOTS['post-router'].reserved).toBe(false);
    expect(PIPELINE_SLOTS['post-resource-broker'].reserved).toBe(false);
  });
});

describe('validateMiddlewareDecl', () => {
  const base: AdapterMiddlewareDecl = {
    id: 'my-mw',
    handler: './middleware.js',
    target: 'llm',
  };

  it('returns no errors for a valid declaration', () => {
    const decl: AdapterMiddlewareDecl = { ...base, slot: 'post-resource-broker' };
    expect(validateMiddlewareDecl(decl)).toEqual([]);
  });

  it('returns no errors when slot is omitted', () => {
    expect(validateMiddlewareDecl(base)).toEqual([]);
  });

  it('returns error for unknown slot', () => {
    const decl: AdapterMiddlewareDecl = { ...base, slot: 'totally-unknown' };
    const errors = validateMiddlewareDecl(decl);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Unknown slot/);
    expect(errors[0]).toMatch(/totally-unknown/);
  });

  it('returns error when targeting a reserved slot', () => {
    const decl: AdapterMiddlewareDecl = { ...base, slot: 'governance' };
    const errors = validateMiddlewareDecl(decl);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/reserved/);
  });

  it('returns error for unknown after stage', () => {
    const decl: AdapterMiddlewareDecl = { ...base, after: 'nonexistent' };
    const errors = validateMiddlewareDecl(decl);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/'after'/);
    expect(errors[0]).toMatch(/nonexistent/);
  });

  it('returns error for unknown before stage', () => {
    const decl: AdapterMiddlewareDecl = { ...base, before: 'nonexistent' };
    const errors = validateMiddlewareDecl(decl);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/'before'/);
  });

  it('allows valid after/before stages', () => {
    const decl: AdapterMiddlewareDecl = { ...base, after: 'router', before: 'resource-broker' };
    expect(validateMiddlewareDecl(decl)).toEqual([]);
  });
});
