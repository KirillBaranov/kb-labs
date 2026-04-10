/**
 * Tests for RegexPIIDetector — PII detection and reversible masking.
 */

import { describe, it, expect } from 'vitest';
import { RegexPIIDetector } from './pii-detector.js';

describe('RegexPIIDetector', () => {
  const detector = new RegexPIIDetector();

  // ── detect() ─────────────────────────────────────────────────────────────

  describe('detect()', () => {
    it('should detect email addresses', () => {
      const matches = detector.detect('Contact john@example.com for info');
      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe('email');
      expect(matches[0]!.value).toBe('john@example.com');
    });

    it('should detect multiple emails', () => {
      const matches = detector.detect('From alice@test.org to bob@company.io');
      expect(matches).toHaveLength(2);
      expect(matches[0]!.value).toBe('alice@test.org');
      expect(matches[1]!.value).toBe('bob@company.io');
    });

    it('should detect IPv4 addresses', () => {
      const matches = detector.detect('Server at 192.168.1.100 is down');
      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe('ipv4');
      expect(matches[0]!.value).toBe('192.168.1.100');
    });

    it('should detect OpenAI API keys', () => {
      const matches = detector.detect('key: sk-abcdefghijklmnopqrstuvwxyz12345678');
      expect(matches.some((m) => m.name === 'openai-key')).toBe(true);
    });

    it('should detect GitHub tokens', () => {
      const matches = detector.detect('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
      expect(matches.some((m) => m.name === 'github-token')).toBe(true);
    });

    it('should detect SSH keys', () => {
      const text = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGrBqMeVfOQ5MBwF3FqZ7pFbME3y';
      const matches = detector.detect(text);
      expect(matches.some((m) => m.name === 'ssh-key')).toBe(true);
    });

    it('should detect connection strings', () => {
      const matches = detector.detect('mongodb+srv://user:pass@cluster.example.com/db');
      expect(matches.some((m) => m.name === 'mongodb-uri')).toBe(true);
    });

    it('should detect passwords', () => {
      const matches = detector.detect('password=supersecret123');
      expect(matches.some((m) => m.name === 'password')).toBe(true);
    });

    it('should return empty array for clean text', () => {
      const matches = detector.detect('Hello world, this is a normal sentence.');
      expect(matches).toHaveLength(0);
    });
  });

  // ── redact() ─────────────────────────────────────────────────────────────

  describe('redact()', () => {
    it('should replace PII with placeholders', () => {
      const result = detector.redact('Email john@example.com please');
      expect(result.redacted).toBe('Email [PII_001] please');
      expect(result.placeholderMap.get('[PII_001]')).toBe('john@example.com');
    });

    it('should reuse placeholders for identical values', () => {
      const result = detector.redact('From john@example.com to john@example.com');
      expect(result.redacted).toBe('From [PII_001] to [PII_001]');
      expect(result.placeholderMap.size).toBe(1);
    });

    it('should assign different placeholders for different values', () => {
      const result = detector.redact('From alice@test.org to bob@test.org');
      expect(result.redacted).toContain('[PII_001]');
      expect(result.redacted).toContain('[PII_002]');
      expect(result.placeholderMap.size).toBe(2);
    });

    it('should use custom prefix', () => {
      const result = detector.redact('Email john@example.com', 'REDACTED');
      expect(result.redacted).toBe('Email [REDACTED_001]');
    });

    it('should return original text when no PII found', () => {
      const text = 'Just a normal sentence.';
      const result = detector.redact(text);
      expect(result.redacted).toBe(text);
      expect(result.placeholderMap.size).toBe(0);
    });
  });

  // ── restore() ────────────────────────────────────────────────────────────

  describe('restore()', () => {
    it('should restore placeholders to original values', () => {
      const { redacted, placeholderMap } = detector.redact('Contact john@example.com');
      const restored = detector.restore(redacted, placeholderMap);
      expect(restored).toBe('Contact john@example.com');
    });

    it('should handle multiple placeholders', () => {
      const text = 'From alice@a.com to bob@b.com at 10.0.0.1';
      const { redacted, placeholderMap } = detector.redact(text);
      const restored = detector.restore(redacted, placeholderMap);
      expect(restored).toBe(text);
    });

    it('should handle repeated placeholders in response', () => {
      const map = new Map<string, string>([['[PII_001]', 'john@example.com']]);
      const text = 'Sent to [PII_001]. Confirmed: [PII_001]';
      const restored = detector.restore(text, map);
      expect(restored).toBe('Sent to john@example.com. Confirmed: john@example.com');
    });

    it('should return text unchanged with empty map', () => {
      const text = 'No placeholders here';
      const restored = detector.restore(text, new Map());
      expect(restored).toBe(text);
    });
  });

  // ── allowlist ────────────────────────────────────────────────────────────

  describe('allowlist', () => {
    it('should skip allowlisted values', () => {
      const d = new RegexPIIDetector({ allowlist: ['admin@company.com'] });
      const result = d.redact('Contact admin@company.com or john@gmail.com');
      expect(result.redacted).toContain('admin@company.com');
      expect(result.redacted).toContain('[PII_001]');
    });

    it('should support wildcard allowlist', () => {
      const d = new RegexPIIDetector({ allowlist: ['*@company.com'] });
      const result = d.redact('From alice@company.com to bob@gmail.com');
      expect(result.redacted).toContain('alice@company.com');
      expect(result.redacted).toContain('[PII_001]');
    });
  });

  // ── selective patterns ───────────────────────────────────────────────────

  describe('selective patterns', () => {
    it('should only detect enabled categories', () => {
      const d = new RegexPIIDetector({ patterns: ['email'] });
      const text = 'Email john@test.com IP 192.168.1.1';
      const matches = d.detect(text);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe('email');
    });
  });

  // ── roundtrip ────────────────────────────────────────────────────────────

  describe('roundtrip', () => {
    it('should survive full redact → restore cycle', () => {
      const original = `
        User john@example.com logged in from 192.168.1.42.
        API key: sk-abcdefghijklmnopqrstuv1234567890ab
        DB: postgres://admin:secret@db.internal.com:5432/app
      `;
      const { redacted, placeholderMap } = detector.redact(original);

      // Verify no PII in redacted text
      expect(redacted).not.toContain('john@example.com');
      expect(redacted).not.toContain('192.168.1.42');
      expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuv1234567890ab');

      // Restore should give back original
      const restored = detector.restore(redacted, placeholderMap);
      expect(restored).toBe(original);
    });
  });
});
