/**
 * @module @kb-labs/core-platform/__tests__/errors
 *
 * Tests for `AdapterUnavailableError` — the typed error thrown by NoOp
 * adapter implementations.
 */

import { describe, it, expect } from 'vitest';
import { AdapterUnavailableError } from '../errors.js';

describe('AdapterUnavailableError', () => {
  it('is an instance of Error', () => {
    const err = new AdapterUnavailableError('llm');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AdapterUnavailableError);
  });

  it('preserves the slot and reason fields', () => {
    const err = new AdapterUnavailableError('embeddings', 'not-configured');
    expect(err.slot).toBe('embeddings');
    expect(err.reason).toBe('not-configured');
  });

  it('defaults reason to "not-configured"', () => {
    const err = new AdapterUnavailableError('llm');
    expect(err.reason).toBe('not-configured');
  });

  it('uses a helpful default message that names the slot and config key', () => {
    const err = new AdapterUnavailableError('llm', 'not-configured');
    expect(err.message).toContain('llm');
    expect(err.message).toMatch(/not configured|kb\.config/i);
  });

  it('accepts a custom message override', () => {
    const err = new AdapterUnavailableError('llm', 'load-failed', 'redis is dead');
    expect(err.message).toBe('redis is dead');
  });

  it('sets name to "AdapterUnavailableError" for stable identification', () => {
    const err = new AdapterUnavailableError('llm');
    expect(err.name).toBe('AdapterUnavailableError');
  });

  it('survives serialization to a useful string', () => {
    const err = new AdapterUnavailableError('llm');
    expect(String(err)).toContain('AdapterUnavailableError');
    expect(String(err)).toContain('llm');
  });

  it('supports instanceof check after passing through async boundary', async () => {
    const thrower = async () => {
      throw new AdapterUnavailableError('llm');
    };
    let caught: unknown;
    try {
      await thrower();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AdapterUnavailableError);
  });

  it('distinguishes "not-configured" from "load-failed"', () => {
    const a = new AdapterUnavailableError('llm', 'not-configured');
    const b = new AdapterUnavailableError('llm', 'load-failed');
    expect(a.reason).not.toBe(b.reason);
  });
});
