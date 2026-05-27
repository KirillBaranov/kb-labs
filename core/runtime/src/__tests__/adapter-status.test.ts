/**
 * @module @kb-labs/core-runtime/__tests__/adapter-status
 *
 * Behavioural tests for the adapter status registry. The registry is a
 * global singleton, so every test starts with `resetAdapterStatus()` for
 * isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAdapterStatus,
  getAdapterStatusFor,
  getAdapterStatusRegistry,
  resetAdapterStatus,
  type AdapterSlotStatus,
} from '../adapter-status.js';

function row(slot: string, overrides: Partial<AdapterSlotStatus> = {}): AdapterSlotStatus {
  return {
    slot: slot as AdapterSlotStatus['slot'],
    mode: 'real',
    implementation: '@kb-labs/test-adapter',
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('adapter-status registry', () => {
  beforeEach(() => {
    resetAdapterStatus();
  });

  describe('record() / list()', () => {
    it('returns empty list before any record is written', () => {
      expect(getAdapterStatus()).toEqual([]);
    });

    it('writes a status and reads it back via list()', () => {
      const reg = getAdapterStatusRegistry();
      reg.record(row('cache'));
      const list = getAdapterStatus();
      expect(list).toHaveLength(1);
      expect(list[0]!.slot).toBe('cache');
    });

    it('overwrites a slot when record() is called twice', () => {
      const reg = getAdapterStatusRegistry();
      reg.record(row('cache', { mode: 'inmemory', implementation: 'InMemoryCache' }));
      reg.record(row('cache', { mode: 'real', implementation: '@kb-labs/adapters-redis' }));
      expect(getAdapterStatus()).toHaveLength(1);
      expect(getAdapterStatusFor('cache')!.mode).toBe('real');
      expect(getAdapterStatusFor('cache')!.implementation).toBe('@kb-labs/adapters-redis');
    });
  });

  describe('get() / getAdapterStatusFor()', () => {
    it('returns undefined for unknown slot', () => {
      expect(getAdapterStatusFor('cache')).toBeUndefined();
    });

    it('returns the exact row that was recorded', () => {
      const reg = getAdapterStatusRegistry();
      const status = row('llm', {
        mode: 'noop',
        implementation: 'NoOpLLM',
        reason: 'not-configured',
      });
      reg.record(status);
      expect(getAdapterStatusFor('llm')).toEqual(status);
    });
  });

  describe('resetAdapterStatus()', () => {
    it('clears all records', () => {
      const reg = getAdapterStatusRegistry();
      reg.record(row('cache'));
      reg.record(row('llm', { mode: 'noop', implementation: 'NoOpLLM' }));
      expect(getAdapterStatus()).toHaveLength(2);
      resetAdapterStatus();
      expect(getAdapterStatus()).toEqual([]);
    });
  });

  describe('singleton behaviour', () => {
    it('multiple getAdapterStatusRegistry() calls return views on the same store', () => {
      getAdapterStatusRegistry().record(row('cache'));
      // Different handle, same backing store.
      const list = getAdapterStatusRegistry().list();
      expect(list).toHaveLength(1);
    });

    it('survives across distinct callers via globalThis singleton', () => {
      getAdapterStatusRegistry().record(row('storage'));
      // Re-import equivalent via top-level helpers
      expect(getAdapterStatusFor('storage')).toBeDefined();
    });
  });

  describe('mode types are exhaustive in practice', () => {
    it('accepts each documented mode', () => {
      const reg = getAdapterStatusRegistry();
      reg.record(row('cache', { mode: 'real' }));
      reg.record(row('llm', { mode: 'noop' }));
      reg.record(row('documentDatabase', { mode: 'inmemory' }));
      expect(getAdapterStatusFor('cache')!.mode).toBe('real');
      expect(getAdapterStatusFor('llm')!.mode).toBe('noop');
      expect(getAdapterStatusFor('documentDatabase')!.mode).toBe('inmemory');
    });
  });
});
