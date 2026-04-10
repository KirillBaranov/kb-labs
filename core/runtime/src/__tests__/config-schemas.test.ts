import { describe, it, expect } from 'vitest';
import { validateExecutionConfig } from '../config-schemas.js';

// Valid container config base
// gatewayWsUrl + gatewayJwtSecret moved to adapterOptions.environment.gateway
// (DockerEnvironmentAdapter owns JWT minting)
const validContainer = {
  gatewayDispatchUrl: 'http://localhost:4000/internal/dispatch',
  gatewayInternalSecret: 'super-secret',
};

// ── ContainerExecutionConfig ──────────────────────────────────────────────────

describe('ContainerExecutionConfig validation', () => {
  it('accepts a valid container config', () => {
    const result = validateExecutionConfig({ mode: 'container', container: validContainer });
    expect(result.container).toMatchObject(validContainer);
  });

  it('rejects invalid gatewayDispatchUrl', () => {
    expect(() =>
      validateExecutionConfig({
        mode: 'container',
        container: { ...validContainer, gatewayDispatchUrl: 'not-a-url' },
      }),
    ).toThrow(/gatewayDispatchUrl/);
  });

  it('rejects empty gatewayInternalSecret', () => {
    expect(() =>
      validateExecutionConfig({
        mode: 'container',
        container: { ...validContainer, gatewayInternalSecret: '' },
      }),
    ).toThrow(/gatewayInternalSecret/);
  });

  it('accepts optional fields', () => {
    const result = validateExecutionConfig({
      mode: 'container',
      container: {
        ...validContainer,
        image: 'my-image:latest',
        pullPolicy: 'Always',
        dockerFlags: ['--memory=2g'],
        runtimeCommand: ['node', 'server.js'],
      },
    });
    expect(result.container?.image).toBe('my-image:latest');
    expect(result.container?.pullPolicy).toBe('Always');
    expect(result.container?.dockerFlags).toEqual(['--memory=2g']);
  });

  it('rejects invalid pullPolicy', () => {
    expect(() =>
      validateExecutionConfig({
        mode: 'container',
        container: { ...validContainer, pullPolicy: 'invalid' as 'Always' },
      }),
    ).toThrow();
  });
});

// ── ExecutionConfig mode validation ──────────────────────────────────────────

describe('ExecutionConfig mode', () => {
  it('accepts mode: in-process', () => {
    const result = validateExecutionConfig({ mode: 'in-process' });
    expect(result.mode).toBe('in-process');
  });

  it('accepts mode: worker-pool with workerPool config', () => {
    const result = validateExecutionConfig({
      mode: 'worker-pool',
      workerPool: { min: 2, max: 10, maxRequestsPerWorker: 500 },
    });
    expect(result.workerPool?.min).toBe(2);
    expect(result.workerPool?.max).toBe(10);
  });

  it('accepts mode: auto (no extra required fields)', () => {
    const result = validateExecutionConfig({ mode: 'auto' });
    expect(result.mode).toBe('auto');
  });

  it('accepts empty config (all optional)', () => {
    const result = validateExecutionConfig({});
    expect(result.mode).toBeUndefined();
  });

  it('rejects unknown mode', () => {
    expect(() => validateExecutionConfig({ mode: 'kubernetes' as 'auto' })).toThrow();
  });
});

// ── superRefine cross-field rules ─────────────────────────────────────────────

describe('ExecutionConfig cross-field rules', () => {
  it('requires container block when mode=container', () => {
    expect(() => validateExecutionConfig({ mode: 'container' })).toThrow(
      /execution.container is required/,
    );
  });

  it('does not require container block when mode is not container', () => {
    expect(() => validateExecutionConfig({ mode: 'in-process' })).not.toThrow();
  });

  it('requires remote.endpoint when mode=remote', () => {
    expect(() => validateExecutionConfig({ mode: 'remote' })).toThrow(
      /execution.remote.endpoint is required/,
    );
    expect(() =>
      validateExecutionConfig({ mode: 'remote', remote: {} }),
    ).toThrow(/execution.remote.endpoint is required/);
  });

  it('accepts mode=remote with endpoint', () => {
    const result = validateExecutionConfig({
      mode: 'remote',
      remote: { endpoint: 'http://remote:9000' },
    });
    expect(result.remote?.endpoint).toBe('http://remote:9000');
  });
});

// ── validateExecutionConfig error formatting ──────────────────────────────────

describe('validateExecutionConfig error message', () => {
  it('includes all issue paths in the error message', () => {
    let err: Error | undefined;
    try {
      validateExecutionConfig({
        mode: 'container',
        container: {
          gatewayDispatchUrl: 'bad-url',
          gatewayInternalSecret: '',
        },
      });
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeDefined();
    expect(err!.message).toContain('Invalid execution config');
    // Both issues should appear
    expect(err!.message).toMatch(/gatewayDispatchUrl|gatewayInternalSecret/);
  });

  it('lists multiple issues when there are multiple errors', () => {
    let err: Error | undefined;
    try {
      validateExecutionConfig({ mode: 'container' }); // missing container block
    } catch (e) {
      err = e as Error;
    }
    expect(err!.message).toContain('•');
  });
});

// ── ExecutionRetryConfig ──────────────────────────────────────────────────────

describe('ExecutionRetryConfig', () => {
  it('accepts valid retry config', () => {
    const result = validateExecutionConfig({
      retry: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2, maxDelayMs: 10000, onlyRetryable: true },
    });
    expect(result.retry?.maxAttempts).toBe(3);
  });

  it('rejects maxAttempts < 1', () => {
    expect(() => validateExecutionConfig({ retry: { maxAttempts: 0 } })).toThrow();
  });

  it('rejects negative initialDelayMs', () => {
    expect(() => validateExecutionConfig({ retry: { initialDelayMs: -1 } })).toThrow();
  });
});
