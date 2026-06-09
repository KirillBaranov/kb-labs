import { describe, it, expect } from 'vitest';
import { applyPortOffset, HttpServiceTransport } from '../transport.js';

describe('applyPortOffset', () => {
  it('shifts the TCP port, preserving scheme/host', () => {
    expect(applyPortOffset('http://127.0.0.1:5050', 1000)).toBe('http://127.0.0.1:6050');
  });

  it('is a no-op for offset 0', () => {
    expect(applyPortOffset('http://127.0.0.1:5050', 0)).toBe('http://127.0.0.1:5050');
  });

  it('is a no-op for urls without an explicit port (socket placeholders)', () => {
    expect(applyPortOffset('http://localhost', 1000)).toBe('http://localhost');
  });

  it('returns the input unchanged when unparseable', () => {
    expect(applyPortOffset('not-a-url', 1000)).toBe('not-a-url');
  });
});

describe('connectionInfo with offset', () => {
  it('shifts TCP baseUrl by the offset', () => {
    const t = new HttpServiceTransport({
      offset: 1000,
      services: { rest: { url: 'http://127.0.0.1:5050' } },
    });
    expect(t.connectionInfo('rest')?.baseUrl).toBe('http://127.0.0.1:6050');
  });

  it('leaves socket services untouched (route via socketPath)', () => {
    const t = new HttpServiceTransport({
      offset: 1000,
      services: { workflow: { url: 'http://localhost', socketPath: '/tmp/kb-abc/workflow.sock' } },
    });
    const info = t.connectionInfo('workflow');
    expect(info?.baseUrl).toBe('http://localhost');
    expect(info?.socketPath).toBe('/tmp/kb-abc/workflow.sock');
  });

  it('defaults offset to 0 when neither config nor env set', () => {
    const t = new HttpServiceTransport({ services: { rest: { url: 'http://127.0.0.1:5050' } } });
    expect(t.connectionInfo('rest')?.baseUrl).toBe('http://127.0.0.1:5050');
  });
});

describe('listenAddress (bind)', () => {
  it('returns shifted port; bind host independent of route host', () => {
    const t = new HttpServiceTransport({
      offset: 1000,
      services: { rest: { url: 'http://127.0.0.1:5050' } },
    });
    // Port shifted; host omitted (the local adapter doesn't own the bind host).
    expect(t.listenAddress('rest')).toEqual({ port: 6050 });
    // Route still resolves the shifted url.
    expect(t.connectionInfo('rest')?.baseUrl).toBe('http://127.0.0.1:6050');
  });

  it('returns socketPath for socket services (offset is a no-op)', () => {
    const t = new HttpServiceTransport({
      offset: 1000,
      services: { workflow: { url: 'http://localhost', socketPath: '/tmp/kb-abc/workflow.sock' } },
    });
    expect(t.listenAddress('workflow')).toEqual({ socketPath: '/tmp/kb-abc/workflow.sock' });
  });

  it('returns undefined for a TCP service whose url has no explicit port', () => {
    const t = new HttpServiceTransport({ services: { x: { url: 'http://localhost' } } });
    expect(t.listenAddress('x')).toBeUndefined();
  });

  it('returns undefined for unknown service', () => {
    const t = new HttpServiceTransport({ services: {} });
    expect(t.listenAddress('nope')).toBeUndefined();
  });
});
