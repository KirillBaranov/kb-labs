import { describe, expect, it } from 'vitest';
import { formatViolation } from '../src/format.js';
import type { PolicyViolation } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const minimal: PolicyViolation = {
  rule: 'sdk-only-deps',
  severity: 'error',
  message: 'pkg-a imports @kb-labs/core directly',
};

const full: PolicyViolation = {
  rule: 'boundary-check',
  severity: 'warning',
  message: 'pkg-b depends on pkg-c (category: plugins)',
  package: 'pkg-b',
  detail: 'Category "platform" may only depend on: shared',
  file: 'plugins/kb-labs-foo/package.json',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatViolation', () => {
  describe('first line', () => {
    it('includes severity and rule in brackets/dash format', () => {
      const result = formatViolation(minimal);
      expect(result).toMatch(/^\[error\] sdk-only-deps — /);
    });

    it('includes the message', () => {
      const result = formatViolation(minimal);
      expect(result).toContain('pkg-a imports @kb-labs/core directly');
    });

    it('does NOT include package by default', () => {
      const result = formatViolation(full);
      expect(result).not.toContain('(pkg-b)');
    });

    it('includes package when includePackage is true', () => {
      const result = formatViolation(full, { includePackage: true });
      expect(result.split('\n')[0]).toContain('(pkg-b)');
    });
  });

  describe('detail line', () => {
    it('includes detail by default when present', () => {
      const result = formatViolation(full);
      expect(result).toContain('  → Category "platform" may only depend on: shared');
    });

    it('omits detail when includeDetail is false', () => {
      const result = formatViolation(full, { includeDetail: false });
      expect(result).not.toContain('→');
    });

    it('does not add a detail line when the field is absent', () => {
      const result = formatViolation(minimal);
      expect(result).not.toContain('→');
    });
  });

  describe('file line', () => {
    it('includes file by default when present', () => {
      const result = formatViolation(full);
      expect(result).toContain('  @ plugins/kb-labs-foo/package.json');
    });

    it('omits file when includeFile is false', () => {
      const result = formatViolation(full, { includeFile: false });
      // Use the specific line-prefix so we don't match `@kb-labs/…` in the message.
      expect(result).not.toMatch(/^  @ /m);
    });

    it('does not add a file line when the field is absent', () => {
      const result = formatViolation(minimal);
      // The file indicator is always `  @ <path>` — use the specific prefix
      // so we don't accidentally match the `@kb-labs/…` in the message text.
      expect(result).not.toMatch(/^  @ /m);
    });
  });

  describe('line ordering', () => {
    it('emits: first line → detail → file', () => {
      const result = formatViolation(full);
      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^\[warning\] boundary-check —/);
      expect(lines[1]).toMatch(/^  → /);
      expect(lines[2]).toMatch(/^  @ /);
    });

    it('returns a single line for a minimal violation', () => {
      const result = formatViolation(minimal);
      expect(result.split('\n')).toHaveLength(1);
    });
  });

  describe('no trailing newline', () => {
    it('does not end with a newline', () => {
      expect(formatViolation(full)).not.toMatch(/\n$/);
      expect(formatViolation(minimal)).not.toMatch(/\n$/);
    });
  });

  describe('severity variants', () => {
    it('formats "warning" severity correctly', () => {
      const v: PolicyViolation = { ...minimal, severity: 'warning' };
      expect(formatViolation(v)).toMatch(/^\[warning\]/);
    });

    it('formats "error" severity correctly', () => {
      const v: PolicyViolation = { ...minimal, severity: 'error' };
      expect(formatViolation(v)).toMatch(/^\[error\]/);
    });
  });
});
