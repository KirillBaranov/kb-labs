import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { readSse } from '../sse-reader.js';

/** Tiny in-process SSE server, zero external deps. */
function startSseServer(
  onRequest: (res: {
    write: (s: string) => void;
    end: () => void;
  }) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      onRequest({
        write: (s) => res.write(s),
        end: () => res.end(),
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}/events`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe('readSse', () => {
  let srv: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    srv = await startSseServer((res) => {
      res.write('event: started\ndata: {"id":1}\n\n');
      res.write('event: progress\ndata: {"pct":50}\n\n');
      res.write('event: done\ndata: {"ok":true}\n\n');
      res.end();
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it('yields parsed events in order and terminates on untilEvent', async () => {
    const events = [];
    for await (const ev of readSse(srv.url, { untilEvent: 'done', timeoutMs: 5000 })) {
      events.push(ev);
    }
    expect(events.map((e) => e.event)).toEqual(['started', 'progress', 'done']);
    expect(events[0]?.json).toEqual({ id: 1 });
    expect(events[2]?.json).toEqual({ ok: true });
  });
});
