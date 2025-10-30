import { describe, it, expect } from 'vitest';
import { validateProfile } from '../validator/validator.js';

describe('Profile Validator v1.0', () => {
  it('should validate new format profiles with schemaVersion 1.0', () => {
    const profile = {
      schemaVersion: "1.0",
      name: "test-profile",
      version: "1.0.0",
      exports: {},
      defaults: {}
    };

    const result = validateProfile(profile);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('should validate legacy format profiles', () => {
    const profile = {
      kind: "preset",
      scope: "test",
      products: ["aiReview"]
    };

    const result = validateProfile(profile);
    expect(result.ok).toBe(true);
    expect(result.errors).toBeNull();
  });

  it('should handle invalid profiles', () => {
    const profile = null;

    const result = validateProfile(profile);
    expect(result.ok).toBe(false);
    expect(result.errors).toBeDefined();
  });
});