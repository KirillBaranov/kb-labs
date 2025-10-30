import { describe, it, expect } from 'vitest';
import { validateProductConfig } from '../validation/validate-config.js';

describe('Product Config Validation', () => {
  it('should validate aiReview config', () => {
    const config = { enabled: true, threshold: 0.8 };
    const result = validateProductConfig('aiReview', config);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('should validate devlink config', () => {
    const config = { enabled: true, port: 3000 };
    const result = validateProductConfig('devlink', config);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('should return ok for unknown products', () => {
    const config = { enabled: true };
    const result = validateProductConfig('unknownProduct', config);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
  });
});