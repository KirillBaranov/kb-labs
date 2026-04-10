import { describe, it, expect } from 'vitest';
import { interpolateString, interpolateConfig } from '../config-interpolation.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {delete process.env[k];}
      else {process.env[k] = v;}
    }
  }
}

// ── interpolateString ─────────────────────────────────────────────────────────

describe('interpolateString', () => {
  it('replaces a single placeholder', () => {
    withEnv({ TEST_HOST: 'localhost' }, () => {
      expect(interpolateString('${TEST_HOST}')).toBe('localhost');
    });
  });

  it('replaces multiple placeholders in one string', () => {
    withEnv({ PROTO: 'http', HOST: 'example.com', PORT: '8080' }, () => {
      expect(interpolateString('${PROTO}://${HOST}:${PORT}/api')).toBe('http://example.com:8080/api');
    });
  });

  it('leaves non-placeholder text unchanged', () => {
    withEnv({ VAR: 'x' }, () => {
      expect(interpolateString('prefix-${VAR}-suffix')).toBe('prefix-x-suffix');
    });
  });

  it('returns unchanged string when no placeholders', () => {
    expect(interpolateString('just a plain string')).toBe('just a plain string');
  });

  it('throws on missing env var when required=true (default)', () => {
    delete process.env['__MISSING_VAR__'];
    expect(() => interpolateString('${__MISSING_VAR__}')).toThrow(
      /environment variable "__MISSING_VAR__" is not set/,
    );
  });

  it('leaves placeholder unresolved when required=false', () => {
    delete process.env['__MISSING_VAR__'];
    const result = interpolateString('value-${__MISSING_VAR__}', false);
    expect(result).toBe('value-${__MISSING_VAR__}');
  });

  it('handles empty string', () => {
    expect(interpolateString('')).toBe('');
  });

  it('replaces same placeholder appearing twice', () => {
    withEnv({ DUP: 'hello' }, () => {
      expect(interpolateString('${DUP}-${DUP}')).toBe('hello-hello');
    });
  });
});

// ── interpolateConfig ─────────────────────────────────────────────────────────

describe('interpolateConfig', () => {
  it('passes numbers through unchanged', () => {
    expect(interpolateConfig(42)).toBe(42);
  });

  it('passes booleans through unchanged', () => {
    expect(interpolateConfig(true)).toBe(true);
  });

  it('passes null through unchanged', () => {
    expect(interpolateConfig(null)).toBeNull();
  });

  it('passes undefined through unchanged', () => {
    expect(interpolateConfig(undefined)).toBeUndefined();
  });

  it('interpolates top-level string', () => {
    withEnv({ MY_VAL: 'resolved' }, () => {
      expect(interpolateConfig('${MY_VAL}')).toBe('resolved');
    });
  });

  it('interpolates string values in a flat object', () => {
    withEnv({ SECRET: 'abc123', URL: 'http://host' }, () => {
      const result = interpolateConfig({ secret: '${SECRET}', url: '${URL}', count: 5 });
      expect(result).toEqual({ secret: 'abc123', url: 'http://host', count: 5 });
    });
  });

  it('interpolates nested objects recursively', () => {
    withEnv({ HOST: 'db.local', PASS: 's3cr3t' }, () => {
      const result = interpolateConfig({
        database: {
          host: '${HOST}',
          auth: { password: '${PASS}' },
        },
      });
      expect(result).toEqual({
        database: { host: 'db.local', auth: { password: 's3cr3t' } },
      });
    });
  });

  it('interpolates strings inside arrays', () => {
    withEnv({ FLAG: '--verbose' }, () => {
      const result = interpolateConfig(['--cpus', '2', '${FLAG}']);
      expect(result).toEqual(['--cpus', '2', '--verbose']);
    });
  });

  it('interpolates strings inside array of objects', () => {
    withEnv({ REGION: 'eu-west-1' }, () => {
      const result = interpolateConfig([{ region: '${REGION}', count: 1 }]);
      expect(result).toEqual([{ region: 'eu-west-1', count: 1 }]);
    });
  });

  it('throws on missing var in nested object when required=true', () => {
    delete process.env['__DEEP_MISSING__'];
    expect(() =>
      interpolateConfig({ level1: { level2: '${__DEEP_MISSING__}' } }),
    ).toThrow(/__DEEP_MISSING__/);
  });

  it('leaves missing placeholder unresolved when required=false', () => {
    delete process.env['__STILL_MISSING__'];
    const result = interpolateConfig({ key: '${__STILL_MISSING__}' }, false);
    expect((result as { key: string }).key).toBe('${__STILL_MISSING__}');
  });

  it('handles deeply nested mixed structure', () => {
    withEnv({ A: '1', B: '2' }, () => {
      const result = interpolateConfig({
        arr: [{ x: '${A}' }, { y: '${B}', z: [{ nested: '${A}' }] }],
      });
      expect(result).toEqual({
        arr: [{ x: '1' }, { y: '2', z: [{ nested: '1' }] }],
      });
    });
  });
});
