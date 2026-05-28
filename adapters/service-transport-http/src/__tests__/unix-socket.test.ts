/**
 * Integration tests for HttpServiceTransport over Unix domain sockets.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { HttpServiceTransport } from '../transport.js';

function randomSockPath(): string {
  return join(tmpdir(), `kb-test-${Math.random().toString(36).slice(2)}.sock`);
}

async function startUnixTestService(socketPath: string): Promise<FastifyInstance> {
  rmSync(socketPath, { force: true });
  const app = Fastify({ logger: false });
  app.get('/health', (_, reply) => reply.send({ ok: true }));
  app.post('/echo', (req, reply) => reply.send(req.body));
  app.get('/stream', (_, reply) => {
    reply.raw.writeHead(200, { 'content-type': 'text/plain' });
    for (let i = 0; i < 3; i++) reply.raw.write(`chunk${i}\n`);
    reply.raw.end();
  });
  await app.listen({ path: socketPath });
  return app;
}

// ---------------------------------------------------------------------------
// Unix socket — basic calls
// ---------------------------------------------------------------------------

describe('unix socket mode', () => {
  const sockPath = randomSockPath();
  let app: FastifyInstance;
  let transport: HttpServiceTransport;

  beforeAll(async () => {
    app = await startUnixTestService(sockPath);
    transport = new HttpServiceTransport({
      services: {
        svc: { url: 'http://localhost', socketPath: sockPath },
      },
    });
  });

  afterAll(async () => {
    await transport.destroy?.();
    await app.close();
    rmSync(sockPath, { force: true });
  });

  it('call() connects via socketPath and returns response', async () => {
    const res = await transport.call('svc', { path: '/health' });
    expect(res.ok).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ ok: true });
  });

  it('call() POST with payload works over socket', async () => {
    const res = await transport.call('svc', { path: '/echo', payload: { data: 42 } });
    expect(res.ok).toBe(true);
    expect(res.payload).toEqual({ data: 42 });
  });

  it('stream() yields chunks from a streaming endpoint via socket', async () => {
    const res = await transport.stream('svc', { path: '/stream' });
    expect(res.ok).toBe(true);
    const chunks: string[] = [];
    for await (const chunk of res.body) {
      chunks.push(Buffer.from(chunk).toString());
    }
    const full = chunks.join('');
    expect(full).toContain('chunk0');
    expect(full).toContain('chunk2');
  });

  it('concurrent calls over same pool all succeed', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => transport.call('svc', { path: '/health' })),
    );
    for (const res of results) {
      expect(res.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AbortSignal on unix socket
// ---------------------------------------------------------------------------

describe('AbortSignal on unix socket', () => {
  it('aborted signal cancels the request', async () => {
    const sockPath = randomSockPath();
    const app = Fastify({ logger: false });
    app.get('/slow', async () => {
      await new Promise(r => setTimeout(r, 5000));
      return { ok: true };
    });
    await app.listen({ path: sockPath });

    const transport = new HttpServiceTransport({
      services: { svc: { url: 'http://localhost', socketPath: sockPath } },
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      transport.call('svc', { path: '/slow', signal: controller.signal }),
    ).rejects.toThrow();

    await transport.destroy?.();
    await app.close();
    rmSync(sockPath, { force: true });
  });
});

// ---------------------------------------------------------------------------
// Stale socket cleanup (handled by getListenOptions — verified here for
// awareness; transport itself just connects to whatever is listening)
// ---------------------------------------------------------------------------

describe('service restart resilience', () => {
  it('pool reconnects after service restart at same socket path', async () => {
    const sockPath = randomSockPath();

    const app1 = await startUnixTestService(sockPath);
    const transport = new HttpServiceTransport({
      services: { svc: { url: 'http://localhost', socketPath: sockPath } },
    });

    // First call succeeds
    const r1 = await transport.call('svc', { path: '/health' });
    expect(r1.ok).toBe(true);

    // Stop first server, start new one at same path
    await app1.close();
    rmSync(sockPath, { force: true });
    const app2 = await startUnixTestService(sockPath);

    // Pool should reconnect
    const r2 = await transport.call('svc', { path: '/health' });
    expect(r2.ok).toBe(true);

    await transport.destroy?.();
    await app2.close();
    rmSync(sockPath, { force: true });
  });
});
