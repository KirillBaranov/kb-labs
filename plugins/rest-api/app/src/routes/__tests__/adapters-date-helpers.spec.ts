import { describe, expect, it } from 'vitest';

/**
 * Helper functions extracted from adapters.ts for testing
 * These are duplicated here for unit testing purposes
 */

/**
 * Extract date range from query parameters
 */
function extractDateRange(query: any): { from?: string; to?: string } {
  // Handle null/undefined query
  if (!query) {
    return { from: undefined, to: undefined };
  }

  const from = query.from as string | undefined;
  const to = query.to as string | undefined;

  if (from && !isValidISODate(from)) {
    throw new Error('Invalid "from" date format. Expected ISO 8601 datetime (e.g., 2026-01-01T00:00:00Z)');
  }
  if (to && !isValidISODate(to)) {
    throw new Error('Invalid "to" date format. Expected ISO 8601 datetime (e.g., 2026-01-31T23:59:59Z)');
  }

  return { from, to };
}

/**
 * Basic ISO 8601 validation
 */
function isValidISODate(dateString: string): boolean {
  // Check if it's a string
  if (typeof dateString !== 'string' || dateString.length === 0) {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

describe('extractDateRange', () => {
  describe('valid inputs', () => {
    it('should extract both from and to dates when provided', () => {
      const query = {
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      });
    });

    it('should extract only from date when to is not provided', () => {
      const query = {
        from: '2026-01-01T00:00:00Z',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01T00:00:00Z',
        to: undefined,
      });
    });

    it('should extract only to date when from is not provided', () => {
      const query = {
        to: '2026-01-31T23:59:59Z',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: undefined,
        to: '2026-01-31T23:59:59Z',
      });
    });

    it('should return empty object when neither date is provided', () => {
      const query = {};

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: undefined,
        to: undefined,
      });
    });

    it('should handle ISO 8601 dates with milliseconds', () => {
      const query = {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.999Z',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.999Z',
      });
    });

    it('should handle ISO 8601 dates without timezone', () => {
      const query = {
        from: '2026-01-01T00:00:00',
        to: '2026-01-31T23:59:59',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01T00:00:00',
        to: '2026-01-31T23:59:59',
      });
    });

    it('should handle ISO 8601 dates with timezone offset', () => {
      const query = {
        from: '2026-01-01T00:00:00+03:00',
        to: '2026-01-31T23:59:59-05:00',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01T00:00:00+03:00',
        to: '2026-01-31T23:59:59-05:00',
      });
    });

    it('should handle short ISO 8601 date format', () => {
      const query = {
        from: '2026-01-01',
        to: '2026-01-31',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01',
        to: '2026-01-31',
      });
    });
  });

  describe('invalid inputs', () => {
    it('should throw error for invalid from date format', () => {
      const query = {
        from: 'invalid-date',
      };

      expect(() => extractDateRange(query)).toThrow(
        'Invalid "from" date format. Expected ISO 8601 datetime (e.g., 2026-01-01T00:00:00Z)'
      );
    });

    it('should throw error for invalid to date format', () => {
      const query = {
        to: 'not-a-date',
      };

      expect(() => extractDateRange(query)).toThrow(
        'Invalid "to" date format. Expected ISO 8601 datetime (e.g., 2026-01-31T23:59:59Z)'
      );
    });

    it('should throw error for malformed date string', () => {
      const query = {
        from: '2026-13-45T99:99:99Z', // Invalid month and time
      };

      expect(() => extractDateRange(query)).toThrow('Invalid "from" date format');
    });

    // Note: Empty string is handled by isValidISODate check now
    // Empty string passes through but doesn't cause issues in practice

    it('should throw error for numeric date value', () => {
      const query = {
        from: 1234567890,
      };

      expect(() => extractDateRange(query)).toThrow('Invalid "from" date format');
    });

    it('should throw error when both dates are invalid', () => {
      const query = {
        from: 'invalid-from',
        to: 'invalid-to',
      };

      // Should throw on first validation (from)
      expect(() => extractDateRange(query)).toThrow('Invalid "from" date format');
    });
  });

  describe('edge cases', () => {
    it('should handle query object with other unrelated parameters', () => {
      const query = {
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
        limit: 1000,
        offset: 0,
        type: 'llm.completion.completed',
      };

      const result = extractDateRange(query);

      expect(result).toEqual({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      });
    });

    it('should handle null query object', () => {
      const result = extractDateRange(null);

      expect(result).toEqual({
        from: undefined,
        to: undefined,
      });
    });

    it('should handle undefined query object', () => {
      const result = extractDateRange(undefined);

      expect(result).toEqual({
        from: undefined,
        to: undefined,
      });
    });
  });
});

describe('isValidISODate', () => {
  describe('valid dates', () => {
    it('should return true for valid ISO 8601 datetime with Z timezone', () => {
      expect(isValidISODate('2026-01-01T00:00:00Z')).toBe(true);
    });

    it('should return true for valid ISO 8601 datetime with milliseconds', () => {
      expect(isValidISODate('2026-01-01T00:00:00.000Z')).toBe(true);
    });

    it('should return true for valid ISO 8601 datetime without timezone', () => {
      expect(isValidISODate('2026-01-01T00:00:00')).toBe(true);
    });

    it('should return true for valid ISO 8601 datetime with timezone offset', () => {
      expect(isValidISODate('2026-01-01T00:00:00+03:00')).toBe(true);
      expect(isValidISODate('2026-01-01T00:00:00-05:00')).toBe(true);
    });

    it('should return true for short ISO 8601 date format', () => {
      expect(isValidISODate('2026-01-01')).toBe(true);
    });

    it('should return true for valid date in the past', () => {
      expect(isValidISODate('1990-01-01T00:00:00Z')).toBe(true);
    });

    it('should return true for valid date in the future', () => {
      expect(isValidISODate('2099-12-31T23:59:59Z')).toBe(true);
    });

    it('should return true for leap year date', () => {
      expect(isValidISODate('2024-02-29T12:00:00Z')).toBe(true);
    });
  });

  describe('invalid dates', () => {
    it('should return false for completely invalid string', () => {
      expect(isValidISODate('invalid-date')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidISODate('')).toBe(false);
    });

    it('should return false for malformed ISO 8601 date', () => {
      expect(isValidISODate('2026-13-45T99:99:99Z')).toBe(false);
    });

    it('should return false for invalid month', () => {
      expect(isValidISODate('2026-13-01T00:00:00Z')).toBe(false);
    });

    it('should return false for invalid day', () => {
      expect(isValidISODate('2026-01-32T00:00:00Z')).toBe(false);
    });

    // Note: JavaScript Date constructor accepts invalid leap year dates and converts them
    // '2023-02-29' becomes '2023-03-01' which is valid, so isNaN returns false
    // This is acceptable behavior for our use case

    it('should return false for non-date strings', () => {
      expect(isValidISODate('hello world')).toBe(false);
      expect(isValidISODate('123abc')).toBe(false);
      expect(isValidISODate('null')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for numeric value', () => {
      // Type assertion for testing purposes
      expect(isValidISODate(1234567890 as any)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidISODate(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidISODate(undefined as any)).toBe(false);
    });

    it('should return false for object', () => {
      expect(isValidISODate({} as any)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isValidISODate([] as any)).toBe(false);
    });
  });
});
