import { describe, it, expect } from 'vitest';
import { NpmPackageSource } from './npm-source.js';

describe('NpmPackageSource', () => {
  const source = new NpmPackageSource();

  describe('resolve', () => {
    it('resolves scoped package with version', async () => {
      const result = await source.resolve('@kb-labs/test-plugin@1.0.0');
      expect(result.id).toBe('@kb-labs/test-plugin');
      expect(result.version).toBe('1.0.0');
      expect(result.source).toBe('marketplace');
    });

    it('resolves scoped package without version', async () => {
      const result = await source.resolve('@kb-labs/test-plugin');
      expect(result.id).toBe('@kb-labs/test-plugin');
      expect(result.version).toBe('latest');
    });

    it('resolves unscoped package with version', async () => {
      const result = await source.resolve('lodash@4.17.21');
      expect(result.id).toBe('lodash');
      expect(result.version).toBe('4.17.21');
    });

    it('resolves unscoped package without version', async () => {
      const result = await source.resolve('lodash');
      expect(result.id).toBe('lodash');
      expect(result.version).toBe('latest');
    });

    it('throws for invalid spec', async () => {
      await expect(source.resolve('')).rejects.toThrow('Invalid package spec');
      await expect(source.resolve('./local')).rejects.toThrow('Invalid package spec');
      await expect(source.resolve('/absolute')).rejects.toThrow('Invalid package spec');
    });
  });
});
