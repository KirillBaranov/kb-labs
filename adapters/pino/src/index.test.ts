import { describe, expect, it, vi } from 'vitest';
import { PinoLoggerAdapter } from './index.js';

describe('PinoLoggerAdapter', () => {
  it('includes child bindings in onLog records', () => {
    const logger = new PinoLoggerAdapter({ level: 'debug' });
    const callback = vi.fn();
    logger.onLog(callback);

    const child = logger.child({
      traceId: 'trace-1',
      requestId: 'req-1',
      invocationId: 'inv-1',
    });

    child.info('hello', { step: 'start' });

    expect(callback).toHaveBeenCalledTimes(1);
    const [record] = callback.mock.calls[0]!;
    expect(record.fields).toMatchObject({
      traceId: 'trace-1',
      requestId: 'req-1',
      invocationId: 'inv-1',
      step: 'start',
    });
  });

  it('propagates nested child bindings in onLog records', () => {
    const logger = new PinoLoggerAdapter({ level: 'debug' });
    const callback = vi.fn();
    logger.onLog(callback);

    const child = logger.child({ traceId: 'trace-1' }).child({ spanId: 'span-2' });
    child.debug('nested');

    expect(callback).toHaveBeenCalledTimes(1);
    const [record] = callback.mock.calls[0]!;
    expect(record.fields).toMatchObject({
      traceId: 'trace-1',
      spanId: 'span-2',
    });
  });
});

