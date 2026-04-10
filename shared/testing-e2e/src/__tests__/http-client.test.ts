import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { httpClient } from '../http-client.js';

function startJsonServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.url === '/echo' && req.method === 'POST') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ received: JSON.parse(body || '{}') }));
          return;
        }
        if (req.url === '/health') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.url === '/not-json') {
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('hello');
          return;
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe('HttpClient', () => {
  let srv: { url: string; close: () => Promise<void> };
  beforeAll(async () => { srv = await startJsonServer(); });
  afterAll(async () => { await srv.close(); });

  it('GET parses JSON response', async () => {
    const c = httpClient(srv.url);
    const res = await c.get<{ ok: boolean }>('/health');
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST serializes JSON body and echoes back', async () => {
    const c = httpClient(srv.url);
    const res = await c.post<{ received: { msg: string } }>('/echo', { msg: 'hi' });
    expect(res.body?.received).toEqual({ msg: 'hi' });
  });

  it('leaves body undefined for non-JSON responses but populates text', async () => {
    const c = httpClient(srv.url);
    const res = await c.get('/not-json');
    expect(res.body).toBeUndefined();
    expect(res.text).toBe('hello');
  });

  it('returns ok=false for non-2xx', async () => {
    const c = httpClient(srv.url);
    const res = await c.get('/missing');
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
  });

  it('supports default headers', async () => {
    const c = httpClient(srv.url, { headers: { 'x-test': 'yes' } });
    const res = await c.get('/health');
    expect(res.ok).toBe(true);
  });
});
