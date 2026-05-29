import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostCallDispatcher } from '../dispatcher.js';
import type { IAgentSocket } from '../dispatcher.js';

function makeMockSocket(): { socket: IAgentSocket; sent: unknown[] } {
  const sent: unknown[] = [];
  const socket: IAgentSocket = {
    send: vi.fn((data: string) => { sent.push(JSON.parse(data)); }),
  };
  return { socket, sent };
}

describe('HostCallDispatcher', () => {
  let dispatcher: HostCallDispatcher;

  beforeEach(() => {
    dispatcher = new HostCallDispatcher();
  });

  describe('registerConnection / connectedCount / firstHost', () => {
    it('counts zero initially', () => {
      expect(dispatcher.connectedCount('ns-1')).toBe(0);
    });

    it('increments count after register', () => {
      const { socket } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);
      expect(dispatcher.connectedCount('ns-1')).toBe(1);
    });

    it('returns first hostId', () => {
      const { socket } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);
      expect(dispatcher.firstHost('ns-1')).toBe('host-a');
    });

    it('returns undefined firstHost when namespace empty', () => {
      expect(dispatcher.firstHost('ns-unknown')).toBeUndefined();
    });

    it('namespaces are isolated', () => {
      const { socket } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);
      expect(dispatcher.connectedCount('ns-2')).toBe(0);
      expect(dispatcher.firstHost('ns-2')).toBeUndefined();
    });
  });

  describe('removeConnection', () => {
    it('decrements count after remove', () => {
      const { socket } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);
      dispatcher.removeConnection('host-a', 'ns-1');
      expect(dispatcher.connectedCount('ns-1')).toBe(0);
    });

    it('removeConnection on unknown host is a no-op', () => {
      expect(() => dispatcher.removeConnection('ghost', 'ns-1')).not.toThrow();
    });
  });

  describe('call', () => {
    it('sends a call message over the socket', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'readFile', ['/tmp/f.txt']);

      expect(sent).toHaveLength(1);
      const msg = sent[0] as Record<string, unknown>;
      expect(msg['type']).toBe('call');
      expect(msg['adapter']).toBe('filesystem');
      expect(msg['method']).toBe('readFile');
      expect(msg['args']).toEqual(['/tmp/f.txt']);
      expect(typeof msg['requestId']).toBe('string');

      // Resolve the call so the promise doesn't hang
      const requestId = msg['requestId'] as string;
      dispatcher.handleInbound({ type: 'chunk', requestId, data: 'file-contents' });
      dispatcher.handleInbound({ type: 'result', requestId });

      const result = await callPromise;
      expect(result).toBe('file-contents');
    });

    it('rejects immediately if host is not connected', async () => {
      await expect(
        dispatcher.call('ns-1', 'missing-host', 'filesystem', 'readFile', []),
      ).rejects.toThrow('Host not connected: missing-host');
    });

    it('resolves with single chunk data on result', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'listDir', ['/tmp']);
      const requestId = (sent[0] as Record<string, unknown>)['requestId'] as string;

      dispatcher.handleInbound({ type: 'chunk', requestId, data: ['a.ts', 'b.ts'] });
      dispatcher.handleInbound({ type: 'result', requestId });

      expect(await callPromise).toEqual(['a.ts', 'b.ts']);
    });

    it('resolves with all chunks as array when multiple chunks arrive', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'stream', []);
      const requestId = (sent[0] as Record<string, unknown>)['requestId'] as string;

      dispatcher.handleInbound({ type: 'chunk', requestId, data: 'chunk-0' });
      dispatcher.handleInbound({ type: 'chunk', requestId, data: 'chunk-1' });
      dispatcher.handleInbound({ type: 'result', requestId });

      expect(await callPromise).toEqual(['chunk-0', 'chunk-1']);
    });

    it('resolves with undefined when result arrives with no chunks', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'writeFile', []);
      const requestId = (sent[0] as Record<string, unknown>)['requestId'] as string;

      dispatcher.handleInbound({ type: 'result', requestId });

      expect(await callPromise).toBeUndefined();
    });

    it('rejects on error message with error.message', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'readFile', []);
      const requestId = (sent[0] as Record<string, unknown>)['requestId'] as string;

      dispatcher.handleInbound({
        type: 'error',
        requestId,
        error: { code: 'NOT_FOUND', message: 'File not found', retryable: false },
      });

      await expect(callPromise).rejects.toThrow('File not found');
    });

    it('rejects on error message with plain string error', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'readFile', []);
      const requestId = (sent[0] as Record<string, unknown>)['requestId'] as string;

      dispatcher.handleInbound({ type: 'error', requestId, error: 'something broke' });

      await expect(callPromise).rejects.toThrow('something broke');
    });
  });

  describe('handleInbound', () => {
    it('ignores messages with no requestId', () => {
      expect(() => dispatcher.handleInbound({ type: 'chunk' })).not.toThrow();
    });

    it('ignores messages for unknown requestId', () => {
      expect(() =>
        dispatcher.handleInbound({ type: 'result', requestId: 'nonexistent' }),
      ).not.toThrow();
    });

    it('cleans up pending map after resolve', async () => {
      const { socket, sent } = makeMockSocket();
      dispatcher.registerConnection('host-a', 'ns-1', socket);

      const callPromise = dispatcher.call('ns-1', 'host-a', 'filesystem', 'readFile', []);
      const requestId = (sent[0] as Record<string, unknown>)['requestId'] as string;

      dispatcher.handleInbound({ type: 'chunk', requestId, data: 'ok' });
      dispatcher.handleInbound({ type: 'result', requestId });
      await callPromise;

      // Second result for the same requestId should be a no-op
      expect(() =>
        dispatcher.handleInbound({ type: 'result', requestId }),
      ).not.toThrow();
    });
  });
});
