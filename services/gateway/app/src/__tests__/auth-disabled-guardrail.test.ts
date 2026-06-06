/**
 * Tests for the auth-disabled startup guardrail helper (B-023).
 *
 * When auth is disabled the gateway must only bind to a loopback address, so a
 * no-auth platform can never be reached off the local machine. isLoopbackHost
 * is the decision the guardrail in bootstrap() relies on.
 */
import { describe, it, expect } from 'vitest';
import { isLoopbackHost } from '../bootstrap.js';

describe('isLoopbackHost (B-023 guardrail)', () => {
  it.each(['127.0.0.1', 'localhost', '::1', '[::1]', '127.0.0.5', 'LOCALHOST', ' 127.0.0.1 '])(
    'treats %s as loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each(['0.0.0.0', '192.168.1.10', '10.0.0.2', 'kblabs.ru', '::', ''])(
    'treats %s as NON-loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});
