/**
 * @module @kb-labs/llm-router/test/resolver
 * Unit tests for TierResolver and CapabilityResolver.
 */

import { describe, it, expect } from 'vitest';
import { TierResolver, CapabilityResolver } from '../src/resolver.js';
import type { LLMTier, LLMCapability } from '@kb-labs/core-platform';

describe('TierResolver', () => {
  describe('exact match', () => {
    it('should return configured tier when request matches', () => {
      const resolver = new TierResolver('medium');
      const result = resolver.resolve('medium');

      expect(result.tier).toBe('medium');
      expect(result.adapted).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it('should return configured tier for each tier level', () => {
      const tiers: LLMTier[] = ['small', 'medium', 'large'];

      for (const tier of tiers) {
        const resolver = new TierResolver(tier);
        const result = resolver.resolve(tier);

        expect(result.tier).toBe(tier);
        expect(result.adapted).toBe(false);
      }
    });
  });

  describe('no request (default)', () => {
    it('should return configured tier when no tier requested', () => {
      const resolver = new TierResolver('medium');
      const result = resolver.resolve(undefined);

      expect(result.tier).toBe('medium');
      expect(result.adapted).toBe(false);
      expect(result.warning).toBeUndefined();
    });

    it('should work with all configured tiers', () => {
      const tiers: LLMTier[] = ['small', 'medium', 'large'];

      for (const tier of tiers) {
        const resolver = new TierResolver(tier);
        const result = resolver.resolve();

        expect(result.tier).toBe(tier);
        expect(result.adapted).toBe(false);
      }
    });
  });

  describe('escalation (request < configured)', () => {
    it('should escalate small → medium silently', () => {
      const resolver = new TierResolver('medium');
      const result = resolver.resolve('small');

      expect(result.tier).toBe('medium');
      expect(result.adapted).toBe(true);
      expect(result.warning).toBeUndefined(); // No warning for escalation
    });

    it('should escalate small → large silently', () => {
      const resolver = new TierResolver('large');
      const result = resolver.resolve('small');

      expect(result.tier).toBe('large');
      expect(result.adapted).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should escalate medium → large silently', () => {
      const resolver = new TierResolver('large');
      const result = resolver.resolve('medium');

      expect(result.tier).toBe('large');
      expect(result.adapted).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  describe('degradation (request > configured)', () => {
    it('should degrade large → medium with warning', () => {
      const resolver = new TierResolver('medium');
      const result = resolver.resolve('large');

      expect(result.tier).toBe('medium');
      expect(result.adapted).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('large');
      expect(result.warning).toContain('medium');
    });

    it('should degrade large → small with warning', () => {
      const resolver = new TierResolver('small');
      const result = resolver.resolve('large');

      expect(result.tier).toBe('small');
      expect(result.adapted).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('large');
      expect(result.warning).toContain('small');
    });

    it('should degrade medium → small with warning', () => {
      const resolver = new TierResolver('small');
      const result = resolver.resolve('medium');

      expect(result.tier).toBe('small');
      expect(result.adapted).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('medium');
      expect(result.warning).toContain('small');
    });
  });

  describe('getConfiguredTier', () => {
    it('should return the configured tier', () => {
      const resolver = new TierResolver('large');
      expect(resolver.getConfiguredTier()).toBe('large');
    });
  });
});

describe('CapabilityResolver', () => {
  describe('simple config (no capabilities set)', () => {
    it('should report all capabilities as available', () => {
      const resolver = new CapabilityResolver();

      expect(resolver.hasCapability('reasoning')).toBe(true);
      expect(resolver.hasCapability('coding')).toBe(true);
      expect(resolver.hasCapability('vision')).toBe(true);
      expect(resolver.hasCapability('fast')).toBe(true);
    });

    it('should return all capabilities from getCapabilities', () => {
      const resolver = new CapabilityResolver();
      const caps = resolver.getCapabilities();

      expect(caps).toContain('reasoning');
      expect(caps).toContain('coding');
      expect(caps).toContain('vision');
      expect(caps).toContain('fast');
      expect(caps).toHaveLength(4);
    });

    it('should return true for hasAllCapabilities with any set', () => {
      const resolver = new CapabilityResolver();

      expect(resolver.hasAllCapabilities(['reasoning', 'coding'])).toBe(true);
      expect(resolver.hasAllCapabilities(['vision', 'fast'])).toBe(true);
      expect(resolver.hasAllCapabilities(['reasoning', 'coding', 'vision', 'fast'])).toBe(true);
    });
  });

  describe('advanced config (specific capabilities)', () => {
    it('should only report configured capabilities as available', () => {
      const resolver = new CapabilityResolver(new Set(['coding', 'fast']));

      expect(resolver.hasCapability('coding')).toBe(true);
      expect(resolver.hasCapability('fast')).toBe(true);
      expect(resolver.hasCapability('reasoning')).toBe(false);
      expect(resolver.hasCapability('vision')).toBe(false);
    });

    it('should return only configured capabilities', () => {
      const caps: LLMCapability[] = ['coding', 'fast'];
      const resolver = new CapabilityResolver(new Set(caps));
      const result = resolver.getCapabilities();

      expect(result).toHaveLength(2);
      expect(result).toContain('coding');
      expect(result).toContain('fast');
    });

    it('should correctly check multiple capabilities', () => {
      const resolver = new CapabilityResolver(new Set(['coding', 'fast']));

      expect(resolver.hasAllCapabilities(['coding'])).toBe(true);
      expect(resolver.hasAllCapabilities(['coding', 'fast'])).toBe(true);
      expect(resolver.hasAllCapabilities(['coding', 'reasoning'])).toBe(false);
      expect(resolver.hasAllCapabilities(['vision'])).toBe(false);
    });

    it('should work with single capability', () => {
      const resolver = new CapabilityResolver(new Set(['vision']));

      expect(resolver.hasCapability('vision')).toBe(true);
      expect(resolver.hasCapability('coding')).toBe(false);
      expect(resolver.getCapabilities()).toEqual(['vision']);
    });
  });

  describe('empty array vs undefined', () => {
    it('should treat empty set as "all available"', () => {
      const resolver = new CapabilityResolver(new Set());

      expect(resolver.hasCapability('reasoning')).toBe(true);
      expect(resolver.getCapabilities()).toHaveLength(4);
    });

    it('should treat undefined as "all available"', () => {
      const resolver = new CapabilityResolver(undefined);

      expect(resolver.hasCapability('reasoning')).toBe(true);
      expect(resolver.getCapabilities()).toHaveLength(4);
    });
  });
});
