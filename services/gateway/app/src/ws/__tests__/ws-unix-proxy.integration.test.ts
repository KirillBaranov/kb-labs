/**
 * Integration test for the gateway WS-over-unix dialer.
 *
 * Real upstream WS server bound to a Unix socket + the gateway upgrade handler
 * on a loopback TCP port + a real ws client. Proves the dialer relays frames
 * end-to-end (the exact path @fastify/http-proxy cannot do over unix sockets).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { WebSocket, WebSocketServer, type AddressInfo } from 'ws';
import { attachGatewayWs, type SocketWsUpstream } from '../gateway-ws.js';

// Permissive fakes — the dialer path never touches cache/jwt (only gateway-own
// /hosts/connect | /clients/connect handlers do, which these tests don't hit).
const cache = new Proxy({}, { get: () => () => undefined }) as never;
const jwtConfig = { secret: 'test-secret' } as never;
const logger = new Proxy({}, { get: () => () => undefined }) as never;

interface Harness {
  port: number;
  socketPath: string;
  gateway: Server;
  upstreamHttp: Server;
  upstreamWss: WebSocketServer;
}

const harnesses: Harness[] = [];

let counter = 0;
function socketName(): string {
  counter += 1;
  return join(tmpdir(), `kb-ws-it-${process.pid}-${counter}.sock`);
}

/**
 * Start a real upstream WS echo server on a unix socket, and a gateway HTTP
 * server (loopback TCP) whose upgrade handler dials the socket via the dialer.
 * `onUpstreamConn` lets a test customize the upstream side (e.g. force close).
 */
async function startHarness(
  prefix = '/api/v1',
  onUpstreamConn?: (ws: WebSocket) => void,
  brokenSocket = false,
): Promise<Harness> {
  const socketPath = socketName();
  rmSync(socketPath, { force: true });

  const upstreamHttp = createServer();
  const upstreamWss = new WebSocketServer({ server: upstreamHttp });
  upstreamWss.on('connection', (ws) => {
    if (onUpstreamConn) {
      onUpstreamConn(ws);
      return;
    }
    // Default: echo, preserving the binary flag.
    ws.on('message', (data, isBinary) => ws.send(data, { binary: isBinary }));
  });
  if (!brokenSocket) {
    await new Promise<void>((resolve) => { upstreamHttp.listen(socketPath, resolve); });
  }

  const gateway = createServer();
  const upstreams: SocketWsUpstream[] = [
    { prefix, rewritePrefix: prefix, socketPath },
  ];
  attachGatewayWs(gateway, cache, jwtConfig, logger, undefined, upstreams);
  await new Promise<void>((resolve) => { gateway.listen(0, '127.0.0.1', resolve); });
  const port = (gateway.address() as AddressInfo).port;

  const h: Harness = { port, socketPath, gateway, upstreamHttp, upstreamWss };
  harnesses.push(h);
  return h;
}

afterEach(async () => {
  while (harnesses.length > 0) {
    const h = harnesses.pop()!;
    // Force-close lingering sockets so server.close() resolves promptly.
    h.gateway.closeAllConnections?.();
    for (const c of h.upstreamWss.clients) { c.terminate(); }
    await new Promise<void>((r) => { h.gateway.close(() => r()); });
    h.upstreamWss.close();
    await new Promise<void>((r) => { h.upstreamHttp.close(() => r()); });
    rmSync(h.socketPath, { force: true });
  }
});

function connect(port: number, path: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}${path}`);
}

/** Resolve the first argument of an event (e.g. 'open', or 'message' → data). */
function onceArg<T>(ws: WebSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    ws.once(event, (arg: unknown) => { clearTimeout(timer); resolve(arg as T); });
  });
}

/** Resolve [code, reason] from a 'close' event. */
function onceClose(ws: WebSocket, timeoutMs = 4000): Promise<[number, Buffer]> {
  return new Promise<[number, Buffer]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for "close"')), timeoutMs);
    ws.once('close', (code: number, reason: Buffer) => { clearTimeout(timer); resolve([code, reason]); });
  });
}

describe('gateway WS-over-unix dialer (integration)', () => {
  it('opens a connection through the gateway to a socket-bound upstream', async () => {
    const { port } = await startHarness();
    const client = connect(port, '/api/v1/ws/echo');
    await onceArg(client, 'open'); // would time out if the dialer were broken
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  it('relays a text frame round-trip', async () => {
    const { port } = await startHarness();
    const client = connect(port, '/api/v1/ws/echo');
    await onceArg(client, 'open');
    client.send('hello-unix');
    const msg = await onceArg<Buffer>(client, 'message');
    expect(msg.toString()).toBe('hello-unix');
    client.close();
  });

  it('relays a binary frame round-trip intact', async () => {
    const { port } = await startHarness();
    const client = connect(port, '/api/v1/ws/echo');
    await onceArg(client, 'open');
    const payload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    client.send(payload);
    const msg = await onceArg<Buffer>(client, 'message');
    expect(Buffer.compare(msg, payload)).toBe(0);
    client.close();
  });

  it('propagates an upstream-initiated close code to the client', async () => {
    const { port } = await startHarness('/api/v1', (ws) => {
      ws.close(4002, 'bye');
    });
    const client = connect(port, '/api/v1/ws/x');
    const [code, reason] = await onceClose(client);
    expect(code).toBe(4002);
    expect(reason.toString()).toBe('bye');
  });

  it('closes the client cleanly when the upstream socket does not exist (no hang)', async () => {
    const { port } = await startHarness('/api/v1', undefined, /* brokenSocket */ true);
    const client = connect(port, '/api/v1/ws/x');
    const [code] = await onceClose(client, 4000);
    expect(code).toBe(1011);
  });

  it('keeps two concurrent connections isolated', async () => {
    const { port } = await startHarness();
    const a = connect(port, '/api/v1/ws/a');
    const b = connect(port, '/api/v1/ws/b');
    await Promise.all([onceArg(a, 'open'), onceArg(b, 'open')]);
    a.send('for-a');
    b.send('for-b');
    const [ma, mb] = await Promise.all([onceArg<Buffer>(a, 'message'), onceArg<Buffer>(b, 'message')]);
    expect(ma.toString()).toBe('for-a');
    expect(mb.toString()).toBe('for-b');
    a.close();
    b.close();
  });
});
