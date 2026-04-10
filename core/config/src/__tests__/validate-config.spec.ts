import { describe, it, expect } from 'vitest';
import { validateProductConfig } from '../validation/validate-config';

describe('config: validate product config', () => {
  it('validates aiReview config with review schema', () => {
    const cfg = { rules: [], maxFiles: 10 } as any;
    const result = validateProductConfig('aiReview' as any, cfg);
    expect(result.ok).toBe(true);
  });

  it('allows unknown product (no schema)', () => {
    const result = validateProductConfig('release' as any, {});
    expect(result.ok).toBe(true);
  });
});


