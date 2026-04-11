import { describe, it, expect } from 'vitest';
import { pickEnv } from '../isolation/env-filter.js';

describe('pickEnv', () => {
  const fullEnv: Record<string, string> = {
    HOME: '/home/user',
    PATH: '/usr/bin',
    SECRET_KEY: 'shhh',
    NODE_ENV: 'production',
    KB_PROJECT_ROOT: '/workspace',
  };

  it('returns only allowed variables', () => {
    const result = pickEnv(fullEnv, ['HOME', 'NODE_ENV']);
    expect(result).toEqual({ HOME: '/home/user', NODE_ENV: 'production' });
  });

  it('returns empty object when allowlist is empty', () => {
    expect(pickEnv(fullEnv, [])).toEqual({});
  });

  it('returns empty object when allowlist is undefined', () => {
    expect(pickEnv(fullEnv, undefined)).toEqual({});
  });

  it('skips variables not present in env', () => {
    const result = pickEnv(fullEnv, ['HOME', 'NONEXISTENT']);
    expect(result).toEqual({ HOME: '/home/user' });
  });

  it('handles env with undefined values', () => {
    const env: Record<string, string | undefined> = {
      PRESENT: 'yes',
      UNDEFINED: undefined,
    };
    const result = pickEnv(env, ['PRESENT', 'UNDEFINED']);
    expect(result).toEqual({ PRESENT: 'yes' });
  });

  it('returns empty object for empty env', () => {
    expect(pickEnv({}, ['HOME'])).toEqual({});
  });
});
