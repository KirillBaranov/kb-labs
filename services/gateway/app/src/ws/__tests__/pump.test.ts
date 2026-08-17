/**
 * Unit tests for pumpBidirectional — the frame relay between a client WS and
 * an upstream WS opened over a Unix socket. Pure (no network): both sides are
 * EventEmitter fakes with send/close spies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { pumpBidirectional } from '../pump.js';

const OPEN = 1; // WebSocket.OPEN
const CLOSED = 3;

class FakeSocket extends EventEmitter {
  readyState = OPEN;
  send = vi.fn();
  close = vi.fn((..._args: unknown[]) => {
    this.readyState = CLOSED;
  });
}

const logger = {
  trace: vi.fn(), debug: vi.fn(), info: vi.fn(),
  warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
  child: vi.fn(),
};

function wire(opts?: { upstreamOpen?: boolean }) {
  const client = new FakeSocket();
  const upstream = new FakeSocket();
  // upstream starts CONNECTING until 'open' unless told otherwise
  upstream.readyState = opts?.upstreamOpen ? OPEN : 0;
  pumpBidirectional(client as unknown as WebSocket, upstream as unknown as WebSocket, logger);
  return { client, upstream };
}

describe('pumpBidirectional', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards a text frame client → upstream (after open)', () => {
    const { client, upstream } = wire();
    upstream.readyState = OPEN;
    upstream.emit('open');
    client.emit('message', Buffer.from('hi'), false);
    expect(upstream.send).toHaveBeenCalledWith(Buffer.from('hi'), { binary: false });
  });

  it('forwards a text frame upstream → client', () => {
    const { client, upstream } = wire({ upstreamOpen: true });
    upstream.emit('open');
    upstream.emit('message', Buffer.from('yo'), false);
    expect(client.send).toHaveBeenCalledWith(Buffer.from('yo'), { binary: false });
  });

  it('preserves the binary flag in both directions', () => {
    const { client, upstream } = wire();
    upstream.readyState = OPEN;
    upstream.emit('open');
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    client.emit('message', buf, true);
    expect(upstream.send).toHaveBeenCalledWith(buf, { binary: true });
    upstream.emit('message', buf, true);
    expect(client.send).toHaveBeenCalledWith(buf, { binary: true });
  });

  it('buffers client frames sent BEFORE upstream open, flushes on open', () => {
    const { client, upstream } = wire(); // upstream still CONNECTING
    client.emit('message', Buffer.from('early-1'), false);
    client.emit('message', Buffer.from('early-2'), false);
    // nothing delivered yet
    expect(upstream.send).not.toHaveBeenCalled();
    // upstream opens → buffered frames flushed in order
    upstream.readyState = OPEN;
    upstream.emit('open');
    expect(upstream.send).toHaveBeenNthCalledWith(1, Buffer.from('early-1'), { binary: false });
    expect(upstream.send).toHaveBeenNthCalledWith(2, Buffer.from('early-2'), { binary: false });
  });

  it('propagates upstream close(code, reason) to the client', () => {
    const { client, upstream } = wire({ upstreamOpen: true });
    upstream.emit('open');
    upstream.emit('close', 4002, Buffer.from('bye'));
    expect(client.close).toHaveBeenCalledWith(4002, expect.anything());
  });

  it('closes upstream when the client closes', () => {
    const { client, upstream } = wire({ upstreamOpen: true });
    upstream.emit('open');
    client.emit('close', 1000, Buffer.from(''));
    expect(upstream.close).toHaveBeenCalled();
  });

  it('closes both sides with 1011 on upstream error', () => {
    const { client, upstream } = wire();
    upstream.emit('error', new Error('ECONNREFUSED'));
    expect(client.close).toHaveBeenCalledWith(1011);
  });

  it('is idempotent: a second close does not re-close', () => {
    const { client, upstream } = wire({ upstreamOpen: true });
    upstream.emit('open');
    upstream.emit('close', 1000, Buffer.from(''));
    client.emit('close', 1000, Buffer.from(''));
    // client.close called at most once (guard), upstream.close at most once
    expect(client.close.mock.calls.length).toBeLessThanOrEqual(1);
    expect(upstream.close.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('writes one correlated relay summary with frame counters', () => {
    const { client, upstream } = wire({ upstreamOpen: true });
    upstream.emit('open');
    client.emit('message', Buffer.from('in'), false);
    upstream.emit('message', Buffer.from('out'), false);
    client.emit('close', 1000, Buffer.from('done'));

    expect(logger.info).toHaveBeenCalledWith('Gateway WebSocket relay closed', expect.objectContaining({
      event: 'websocket.relay.closed',
      clientToUpstreamMessages: 1,
      upstreamToClientMessages: 1,
      clientToUpstreamBytes: 2,
      upstreamToClientBytes: 3,
    }));
  });

  it('does not send to a non-OPEN peer', () => {
    const { client, upstream } = wire({ upstreamOpen: true });
    upstream.emit('open');
    client.readyState = CLOSED;
    upstream.emit('message', Buffer.from('late'), false);
    expect(client.send).not.toHaveBeenCalled();
  });
});
