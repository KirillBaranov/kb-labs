import { describe, it, expect } from 'vitest';
import { loadBundle, ConfigValidationError } from '../api/load-bundle.js';

describe('LoadBundle Validation Integration', () => {
  it('should load bundle without validation', async () => {
    const result = await loadBundle({
      cwd: '/test',
      product: 'aiReview',
      validate: false
    });

    expect(result.config).toBeDefined();
    expect(result.config.enabled).toBe(true);
  });

  it('should load bundle with validation enabled', async () => {
    const result = await loadBundle({
      cwd: '/test',
      product: 'aiReview',
      validate: true
    });

    expect(result.config).toBeDefined();
    expect(result.config.enabled).toBe(true);
  });

  it('should load bundle with profile validation', async () => {
    const result = await loadBundle({
      cwd: '/test',
      product: 'aiReview',
      profileKey: 'test-profile',
      validate: true
    });

    expect(result.config).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.profile?.schemaVersion).toBe("1.0");
  });
});