import { describe, it, expect } from 'vitest';
import {
  classifyError,
  isRateLimitError,
  isRetryableError,
  extractRetryAfter,
} from '../error-classifier.js';

describe('classifyError', () => {
  describe('rate_limit', () => {
    it('detects 429 in message', () => {
      expect(classifyError(new Error('429 Too Many Requests'))).toBe('rate_limit');
    });

    it('detects "rate limit" phrase', () => {
      expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
    });

    it('detects "too many requests"', () => {
      expect(classifyError(new Error('too many requests'))).toBe('rate_limit');
    });

    it('detects "quota exceeded"', () => {
      expect(classifyError(new Error('quota exceeded for this project'))).toBe('rate_limit');
    });

    it('detects by error name containing ratelimit', () => {
      const err = new Error('limited');
      err.name = 'RateLimitError';
      expect(classifyError(err)).toBe('rate_limit');
    });

    it('detects status 429 on plain object', () => {
      expect(classifyError({ status: 429 })).toBe('rate_limit');
    });
  });

  describe('timeout', () => {
    it('detects "timeout" in message', () => {
      expect(classifyError(new Error('request timeout'))).toBe('timeout');
    });

    it('detects "timed out"', () => {
      expect(classifyError(new Error('operation timed out'))).toBe('timeout');
    });

    it('detects "etimedout"', () => {
      expect(classifyError(new Error('ETIMEDOUT'))).toBe('timeout');
    });

    it('detects "deadline exceeded"', () => {
      expect(classifyError(new Error('context deadline exceeded'))).toBe('timeout');
    });

    it('detects by error name', () => {
      const err = new Error('slow');
      err.name = 'TimeoutError';
      expect(classifyError(err)).toBe('timeout');
    });

    it('detects string code containing "timeout"', () => {
      expect(classifyError({ code: 'REQUEST_TIMEOUT' })).toBe('timeout');
    });
  });

  describe('network', () => {
    it('detects ECONNREFUSED in message', () => {
      expect(classifyError(new Error('ECONNREFUSED'))).toBe('network');
    });

    it('detects ECONNRESET', () => {
      expect(classifyError(new Error('ECONNRESET'))).toBe('network');
    });

    it('detects ENOTFOUND', () => {
      expect(classifyError(new Error('ENOTFOUND api.openai.com'))).toBe('network');
    });

    it('detects "network" keyword', () => {
      expect(classifyError(new Error('network error'))).toBe('network');
    });

    it('detects FetchError by name', () => {
      const err = new Error('failed to fetch');
      err.name = 'FetchError';
      expect(classifyError(err)).toBe('network');
    });

    it('detects ECONNREFUSED code on object', () => {
      expect(classifyError({ code: 'ECONNREFUSED' })).toBe('network');
    });
  });

  describe('server_error', () => {
    it('detects 500 in message', () => {
      expect(classifyError(new Error('HTTP 500 Internal Server Error'))).toBe('server_error');
    });

    it('detects 502 Bad Gateway', () => {
      expect(classifyError(new Error('502 Bad Gateway'))).toBe('server_error');
    });

    it('detects 503 Service Unavailable', () => {
      expect(classifyError(new Error('503 Service Unavailable'))).toBe('server_error');
    });

    it('detects "service unavailable" phrase', () => {
      expect(classifyError(new Error('service unavailable, retry later'))).toBe('server_error');
    });

    it('detects status >= 500 on object', () => {
      expect(classifyError({ statusCode: 503 })).toBe('server_error');
      expect(classifyError({ status: 502 })).toBe('server_error');
    });
  });

  describe('client_error', () => {
    it('detects 401 Unauthorized', () => {
      expect(classifyError(new Error('401 Unauthorized'))).toBe('client_error');
    });

    it('detects 403 Forbidden', () => {
      expect(classifyError(new Error('403 Forbidden'))).toBe('client_error');
    });

    it('detects 404 Not Found', () => {
      expect(classifyError(new Error('404 Not Found'))).toBe('client_error');
    });

    it('detects "bad request" phrase', () => {
      expect(classifyError(new Error('bad request: invalid parameter'))).toBe('client_error');
    });

    it('detects status 4xx on object', () => {
      expect(classifyError({ status: 404 })).toBe('client_error');
      expect(classifyError({ status: 401 })).toBe('client_error');
    });
  });

  describe('unknown', () => {
    it('returns unknown for plain Error with no identifiable pattern', () => {
      expect(classifyError(new Error('something went wrong'))).toBe('unknown');
    });

    it('returns unknown for null', () => {
      expect(classifyError(null)).toBe('unknown');
    });

    it('returns unknown for undefined', () => {
      expect(classifyError(undefined)).toBe('unknown');
    });

    it('returns unknown for empty object', () => {
      expect(classifyError({})).toBe('unknown');
    });
  });
});

describe('isRateLimitError', () => {
  it('returns true for rate limit error', () => {
    expect(isRateLimitError(new Error('rate limit exceeded'))).toBe(true);
  });

  it('returns false for timeout', () => {
    expect(isRateLimitError(new Error('timeout'))).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('rate_limit → retryable by default', () => {
    expect(isRetryableError(new Error('rate limit'))).toBe(true);
  });

  it('timeout → retryable by default', () => {
    expect(isRetryableError(new Error('timeout'))).toBe(true);
  });

  it('network → retryable by default', () => {
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('server_error → retryable by default', () => {
    expect(isRetryableError(new Error('503 service unavailable'))).toBe(true);
  });

  it('client_error → NOT retryable by default', () => {
    expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
  });

  it('custom retryableTypes: only network', () => {
    const err = new Error('rate limit');
    expect(isRetryableError(err, ['network'])).toBe(false);
    expect(isRetryableError(new Error('ECONNRESET'), ['network'])).toBe(true);
  });
});

describe('extractRetryAfter', () => {
  it('reads obj.retryAfter in ms (>= 1000)', () => {
    expect(extractRetryAfter({ retryAfter: 5000 })).toBe(5000);
  });

  it('converts obj.retryAfter in seconds (< 1000) to ms', () => {
    expect(extractRetryAfter({ retryAfter: 30 })).toBe(30000);
  });

  it('reads obj["retry-after"] and converts seconds', () => {
    expect(extractRetryAfter({ 'retry-after': 60 })).toBe(60000);
  });

  it('reads obj.retryAfterMs directly', () => {
    expect(extractRetryAfter({ retryAfterMs: 8000 })).toBe(8000);
  });

  it('reads from obj.headers["retry-after"] and converts', () => {
    expect(extractRetryAfter({ headers: { 'retry-after': 10 } })).toBe(10000);
  });

  it('parses string retry-after', () => {
    expect(extractRetryAfter({ 'retry-after': '45' })).toBe(45000);
  });

  it('returns undefined for non-object', () => {
    expect(extractRetryAfter(null)).toBeUndefined();
    expect(extractRetryAfter('string')).toBeUndefined();
    expect(extractRetryAfter(42)).toBeUndefined();
  });

  it('returns undefined when no retry-after field', () => {
    expect(extractRetryAfter({ message: 'rate limit' })).toBeUndefined();
  });
});
