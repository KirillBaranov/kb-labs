import { describe, it, expect } from 'vitest';
import {
  GatewayConfigSchema,
  HostRegistrationSchema,
  HostDescriptorSchema,
  AuthContextSchema,
  HelloMessageSchema,
  CallMessageSchema,
  ErrorMessageSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../index.js';

describe('GatewayConfigSchema', () => {
  it('parses valid config with defaults', () => {
    const result = GatewayConfigSchema.parse({});
    expect(result.port).toBe(4000);
    expect(result.upstreams).toEqual({});
  });

  it('parses config with upstreams', () => {
    const result = GatewayConfigSchema.parse({
      port: 4001,
      upstreams: {
        ui: { url: 'http://localhost:5050', prefix: '/api/ui' },
      },
    });
    expect(result.port).toBe(4001);
    expect(result.upstreams['ui']!.url).toBe('http://localhost:5050');
    expect(result.upstreams['ui']!.prefix).toBe('/api/ui');
  });

  it('rejects upstream with invalid URL', () => {
    expect(() =>
      GatewayConfigSchema.parse({
        upstreams: { bad: { url: 'not-a-url', prefix: '/api/bad' } },
      }),
    ).toThrow();
  });

  it('rejects upstream prefix without leading slash', () => {
    expect(() =>
      GatewayConfigSchema.parse({
        upstreams: { bad: { url: 'http://localhost:9000', prefix: 'api/no-slash' } },
      }),
    ).toThrow();
  });
});

describe('HostRegistrationSchema', () => {
  const valid = {
    name: 'laptop',
    namespaceId: 'ns-1',
    capabilities: ['filesystem', 'git'],
    workspacePaths: ['/home/user/projects'],
  };

  it('parses valid registration', () => {
    const result = HostRegistrationSchema.parse(valid);
    expect(result.name).toBe('laptop');
    expect(result.capabilities).toContain('filesystem');
  });

  it('accepts all valid capability values', () => {
    for (const cap of ['filesystem', 'git', 'editor-context'] as const) {
      expect(() => HostRegistrationSchema.parse({ ...valid, capabilities: [cap] })).not.toThrow();
    }
  });

  it('rejects invalid capability value', () => {
    expect(() =>
      HostRegistrationSchema.parse({ ...valid, capabilities: ['database'] }),
    ).toThrow();
  });

  it('requires name', () => {
    expect(() => HostRegistrationSchema.parse({ ...valid, name: undefined })).toThrow();
  });

  it('requires namespaceId', () => {
    expect(() => HostRegistrationSchema.parse({ ...valid, namespaceId: undefined })).toThrow();
  });

  it('allows empty capabilities array', () => {
    expect(() => HostRegistrationSchema.parse({ ...valid, capabilities: [] })).not.toThrow();
  });
});

describe('HostDescriptorSchema', () => {
  const valid = {
    hostId: 'host-uuid',
    name: 'laptop',
    namespaceId: 'ns-1',
    capabilities: ['filesystem'],
    status: 'online',
    lastSeen: Date.now(),
    connections: ['conn-1'],
  };

  it('parses valid descriptor', () => {
    const result = HostDescriptorSchema.parse(valid);
    expect(result.status).toBe('online');
  });

  it('accepts all status values', () => {
    for (const status of ['online', 'offline', 'degraded'] as const) {
      expect(() => HostDescriptorSchema.parse({ ...valid, status })).not.toThrow();
    }
  });

  it('rejects invalid status', () => {
    expect(() => HostDescriptorSchema.parse({ ...valid, status: 'unknown' })).toThrow();
  });
});

describe('AuthContextSchema', () => {
  it('parses user auth context', () => {
    const result = AuthContextSchema.parse({
      type: 'user',
      userId: 'user-1',
      namespaceId: 'ns-1',
      tier: 'pro',
      permissions: ['read', 'write'],
    });
    expect(result.type).toBe('user');
    expect(result.tier).toBe('pro');
  });

  it('rejects invalid tier', () => {
    expect(() =>
      AuthContextSchema.parse({
        type: 'user', userId: 'u', namespaceId: 'ns', tier: 'platinum', permissions: [],
      }),
    ).toThrow();
  });

  it('accepts all type values', () => {
    for (const type of ['user', 'cli', 'machine'] as const) {
      expect(() =>
        AuthContextSchema.parse({ type, userId: 'u', namespaceId: 'ns', tier: 'free', permissions: [] }),
      ).not.toThrow();
    }
  });
});

describe('HelloMessageSchema', () => {
  it('parses minimal hello', () => {
    const result = HelloMessageSchema.parse({
      type: 'hello',
      protocolVersion: '1.0',
      agentVersion: '0.1.0',
    });
    expect(result.type).toBe('hello');
    expect(result.hostId).toBeUndefined();
  });

  it('parses hello with reconnect hostId', () => {
    const result = HelloMessageSchema.parse({
      type: 'hello',
      protocolVersion: '1.0',
      agentVersion: '0.1.0',
      hostId: 'host-uuid',
    });
    expect(result.hostId).toBe('host-uuid');
  });

  it('rejects wrong type literal', () => {
    expect(() =>
      HelloMessageSchema.parse({ type: 'world', protocolVersion: '1.0', agentVersion: '0.1.0' }),
    ).toThrow();
  });
});

describe('CallMessageSchema', () => {
  it('parses valid call', () => {
    const result = CallMessageSchema.parse({
      type: 'call',
      requestId: 'req-1',
      adapter: 'fs',
      method: 'readFile',
      args: ['/tmp/test.txt'],
      trace: { traceId: 'tr-1', spanId: 'sp-1' },
    });
    expect(result.adapter).toBe('fs');
    expect(result.args).toEqual(['/tmp/test.txt']);
    expect(result.bulk).toBeUndefined();
  });

  it('parses bulk call', () => {
    const result = CallMessageSchema.parse({
      type: 'call',
      requestId: 'req-2',
      adapter: 'fs',
      method: 'writeFile',
      args: [],
      bulk: true,
      trace: { traceId: 'tr-2', spanId: 'sp-2' },
    });
    expect(result.bulk).toBe(true);
  });

  it('requires trace field', () => {
    expect(() =>
      CallMessageSchema.parse({ type: 'call', requestId: 'r', adapter: 'fs', method: 'm', args: [] }),
    ).toThrow();
  });
});

describe('ErrorMessageSchema', () => {
  it('parses valid error', () => {
    const result = ErrorMessageSchema.parse({
      type: 'error',
      requestId: 'req-1',
      error: { code: 'FS_NOT_FOUND', message: 'File not found', retryable: false },
    });
    expect(result.error.code).toBe('FS_NOT_FOUND');
    expect(result.error.retryable).toBe(false);
  });
});

describe('SUPPORTED_PROTOCOL_VERSIONS', () => {
  it('contains 1.0', () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain('1.0');
  });
});
