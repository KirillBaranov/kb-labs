import { describe, it, expect } from 'vitest';
import { authUrl } from '../api-base.js';

describe('authUrl', () => {
  it('builds same-origin /api-prefixed paths', () => {
    expect(authUrl('/auth/me')).toBe('/api/auth/me');
    expect(authUrl('/auth/login')).toBe('/api/auth/login');
    expect(authUrl('/auth/logout')).toBe('/api/auth/logout');
    expect(authUrl('/auth/refresh')).toBe('/api/auth/refresh');
    expect(authUrl('/auth/permissions')).toBe('/api/auth/permissions');
  });
});
