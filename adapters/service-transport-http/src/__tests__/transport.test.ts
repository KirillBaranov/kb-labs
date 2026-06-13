/**
 * TDD tests for HttpServiceTransport.
 * Uses a real local Fastify server — no mocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpServiceTransport } from '../transport.js';
import type { HttpServiceTransportConfig } from '../transport.js';

// ---------------------------------------------------------------------------
// Test server helpers
// ---------------------------------------------------------------------------

async function startHttpTestService(): Promise<{ app: FastifyInstance; port: number }> {
  const app = Fastify({ logger: false });

  app.get('/health', (_, reply) => reply.send({ ok: true }));
  app.post('/echo', (req, reply) => reply.send(req.body));
  app.get('/not-found', (_, reply) => reply.status(404).send({ error: 'not found' }));
  app.get('/stream', (_, reply) => {
    reply.raw.writeHead(200, { 'content-type': 'text/plain' });
    for (let i = 0; i < 5; i++) reply.raw.write(`chunk${i}\n`);
    reply.raw.end();
  });
  app.get('/slow', async (_, reply) => {
    await new Promise(r => setTimeout(r, 5000));
    reply.send({ ok: true });
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address() as { port: number };
  return { app, port: addr.port };
}

// ---------------------------------------------------------------------------
// connectionInfo()
// ---------------------------------------------------------------------------

describe('connectionInfo()', () => {
  it('returns { baseUrl, socketPath } for unix config', () => {
    const config: HttpServiceTransportConfig = {
      services: {
        svc: { url: 'http://localhost', socketPath: '/tmp/test.sock' },
      },
    };
    const transport = new HttpServiceTransport(config);
    expect(transport.connectionInfo('svc')).toEqual({
      baseUrl: 'http://localhost',
      socketPath: '/tmp/test.sock',
    });
  });

  it('returns { baseUrl, socketPath: undefined } for TCP config', () => {
    const config: HttpServiceTransportConfig = {
      services: {
        svc: { url: 'http://127.0.0.1:5050' },
      },
    };
    const transport = new HttpServiceTransport(config);
    expect(transport.connectionInfo('svc')).toEqual({
      baseUrl: 'http://127.0.0.1:5050',
      socketPath: undefined,
    });
  });

  it('returns undefined for unknown serviceId', () => {
    const transport = new HttpServiceTransport({ services: {} });
    expect(transport.connectionInfo('unknown')).toBeUndefined();
  });

  it('throws when socketPath contains an unresolved ${...} placeholder', () => {
    // Root cause: config-loader uses required=false so ${KB_SOCKET_HASH} may
    // survive interpolation as a literal string, producing an invalid socket
    // path that causes a cryptic ECONNREFUSED instead of a clear startup error.
    const config: HttpServiceTransportConfig = {
      services: {
        workflow: { url: 'http://localhost', socketPath: '/tmp/kb-${KB_SOCKET_HASH}/workflow.sock' },
      },
    };
    const transport = new HttpServiceTransport(config);
    expect(() => transport.connectionInfo('workflow')).toThrow(/unresolved.*placeholder|KB_SOCKET_HASH/i);
  });
});

// ---------------------------------------------------------------------------
// call()
// ---------------------------------------------------------------------------

describe('call()', () => {
  let app: FastifyInstance;
  let port: number;
  let transport: HttpServiceTransport;

  beforeAll(async () => {
    ({ app, port } = await startHttpTestService());
    transport = new HttpServiceTransport({
      services: {
        svc: { url: `http://127.0.0.1:${port}` },
      },
    });
  });

  afterAll(async () => {
    await transport.destroy?.();
    await app.close();
  });

  it('makes GET request when no payload', async () => {
    const res = await transport.call('svc', { path: '/health' });
    expect(res.ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ ok: true });
  });

  it('makes POST request when payload present', async () => {
    const res = await transport.call('svc', { path: '/echo', payload: { hello: 'world' } });
    expect(res.ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ hello: 'world' });
  });

  it('overrides HTTP method via metadata["http-method"]', async () => {
    const res = await transport.call('svc', {
      path: '/health',
      metadata: { 'http-method': 'GET' },
    });
    expect(res.ok).toBe(true);
  });

  it('ok: false for 404 response', async () => {
    const res = await transport.call('svc', { path: '/not-found' });
    expect(res.ok).toBe(false);
    expect(res.statusCode).toBe(404);
  });

  it('throws on unknown serviceId', async () => {
    await expect(transport.call('unknown', { path: '/health' })).rejects.toThrow('Unknown service: unknown');
  });

  it('propagates AbortSignal — aborted request throws', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport.call('svc', { path: '/slow', signal: controller.signal }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stream()
// ---------------------------------------------------------------------------

describe('stream()', () => {
  let app: FastifyInstance;
  let port: number;
  let transport: HttpServiceTransport;

  beforeAll(async () => {
    ({ app, port } = await startHttpTestService());
    transport = new HttpServiceTransport({
      services: {
        svc: { url: `http://127.0.0.1:${port}` },
      },
    });
  });

  afterAll(async () => {
    await transport.destroy?.();
    await app.close();
  });

  it('returns AsyncIterable body without buffering', async () => {
    const res = await transport.stream('svc', { path: '/stream' });
    expect(res.ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(typeof res.body[Symbol.asyncIterator]).toBe('function');
  });

  it('AsyncIterable yields all chunks', async () => {
    const res = await transport.stream('svc', { path: '/stream' });
    const chunks: string[] = [];
    for await (const chunk of res.body) {
      chunks.push(Buffer.from(chunk).toString());
    }
    const full = chunks.join('');
    expect(full).toContain('chunk0');
    expect(full).toContain('chunk4');
  });

  it('throws on unknown serviceId', async () => {
    await expect(transport.stream('unknown', { path: '/stream' })).rejects.toThrow('Unknown service: unknown');
  });
});

// ---------------------------------------------------------------------------
// health()
// ---------------------------------------------------------------------------

describe('health()', () => {
  it('returns { status: ok } when all services /health → 200', async () => {
    const { app, port } = await startHttpTestService();
    const transport = new HttpServiceTransport({
      services: { svc: { url: `http://127.0.0.1:${port}` } },
    });

    const result = await transport.health!();
    expect(result.status).toBe('ok');
    expect(result.services.svc).toBe(true);

    await transport.destroy?.();
    await app.close();
  });

  it('returns { status: degraded } when a service is unreachable', async () => {
    const transport = new HttpServiceTransport({
      services: { dead: { url: 'http://127.0.0.1:19999' } },
    });

    const result = await transport.health!();
    expect(result.status).toBe('degraded');
    expect(result.services.dead).toBe(false);

    await transport.destroy?.();
  });

  it('individual failure does not throw — captured in results map', async () => {
    const { app, port } = await startHttpTestService();
    const transport = new HttpServiceTransport({
      services: {
        alive: { url: `http://127.0.0.1:${port}` },
        dead: { url: 'http://127.0.0.1:19999' },
      },
    });

    const result = await transport.health!();
    expect(result.status).toBe('degraded');
    expect(result.services.alive).toBe(true);
    expect(result.services.dead).toBe(false);

    await transport.destroy?.();
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// listenAddress()
// ---------------------------------------------------------------------------

describe('listenAddress()', () => {
  it('returns { socketPath } when socketPath is configured', () => {
    const config: HttpServiceTransportConfig = {
      services: {
        svc: { url: 'http://localhost', socketPath: '/tmp/svc.sock' },
      },
    };
    const transport = new HttpServiceTransport(config);
    expect(transport.listenAddress('svc')).toEqual({ socketPath: '/tmp/svc.sock' });
  });

  it('returns { port } for TCP service', () => {
    const config: HttpServiceTransportConfig = {
      services: {
        svc: { url: 'http://127.0.0.1:7778' },
      },
    };
    const transport = new HttpServiceTransport(config);
    expect(transport.listenAddress('svc')).toEqual({ port: 7778 });
  });

  it('returns undefined for unknown serviceId', () => {
    const transport = new HttpServiceTransport({ services: {} });
    expect(transport.listenAddress('unknown')).toBeUndefined();
  });

  it('throws when socketPath contains an unresolved ${...} placeholder', () => {
    // Daemon would bind to literal "${KB_SOCKET_HASH}" path — never matching
    // the gateway's socket path, causing silent ECONNREFUSED.
    const config: HttpServiceTransportConfig = {
      services: {
        workflow: { url: 'http://localhost', socketPath: '/tmp/kb-${KB_SOCKET_HASH}/workflow.sock' },
      },
    };
    const transport = new HttpServiceTransport(config);
    expect(() => transport.listenAddress('workflow')).toThrow(/unresolved.*placeholder|KB_SOCKET_HASH/i);
  });
});
