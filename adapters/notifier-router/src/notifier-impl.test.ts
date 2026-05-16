import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifierImpl, NOTIFICATION_TOPIC, DELIVERY_SUCCESS_TOPIC, DELIVERY_FAILED_TOPIC } from './notifier-impl.js';
import type { IEventBus, ILogger, INotifierChannel, NotificationEvent } from '@kb-labs/core-platform';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeChannel(id: string, sendFn = vi.fn<(event: NotificationEvent) => Promise<void>>(async () => {})): INotifierChannel {
  return {
    id,
    capabilities: [],
    rateLimit: 10,
    isAvailable: vi.fn(() => true),
    send: sendFn,
  };
}

function makeEventBus() {
  const handlers = new Map<string, Array<(e: unknown) => void>>();
  const bus: IEventBus = {
    publish: vi.fn(async (topic, event) => {
      for (const h of handlers.get(topic) ?? []) {h(event);}
    }),
    subscribe: vi.fn((topic, handler) => {
      if (!handlers.has(topic)) {handlers.set(topic, []);}
      handlers.get(topic)!.push(handler as (e: unknown) => void);
      return () => {
        const arr = handlers.get(topic)!;
        arr.splice(arr.indexOf(handler as (e: unknown) => void), 1);
      };
    }),
  };
  return bus;
}

function makeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => makeLogger()) } as unknown as ILogger;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('NotifierImpl', () => {
  let bus: IEventBus;
  let logger: ILogger;

  beforeEach(() => {
    bus = makeEventBus();
    logger = makeLogger();
  });

  it('subscribes to notification.emitted on construction', () => {
    new NotifierImpl({ eventBus: bus, logger, channels: {}, routing: [] });
    expect(bus.subscribe).toHaveBeenCalledWith(NOTIFICATION_TOPIC, expect.any(Function));
  });

  it('notify() publishes to notification.emitted with autofilled id and emittedAt', async () => {
    const impl = new NotifierImpl({ eventBus: bus, logger, channels: {}, routing: [] });
    await impl.notify({ title: 'T', body: 'B', severity: 'info' });

    expect(bus.publish).toHaveBeenCalledWith(
      NOTIFICATION_TOPIC,
      expect.objectContaining({ title: 'T', body: 'B', severity: 'info', id: expect.any(String), emittedAt: expect.any(Number) }),
    );
  });

  it('routes event to matching channel (severity match)', async () => {
    const ch = makeChannel('ch1');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: { severity: ['critical'] }, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B', severity: 'critical' });
    expect(ch.send).toHaveBeenCalledOnce();
  });

  it('does not route when severity does not match', async () => {
    const ch = makeChannel('ch1');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: { severity: ['critical'] }, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B', severity: 'info' });
    expect(ch.send).not.toHaveBeenCalled();
  });

  it('routes by source match', async () => {
    const ch = makeChannel('ch1');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: { source: 'workflow-engine' }, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B', source: 'workflow-engine' });
    expect(ch.send).toHaveBeenCalledOnce();
  });

  it('routes by code match', async () => {
    const ch = makeChannel('ch1');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: { code: 'workflow.failed' }, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B', code: 'workflow.failed' });
    expect(ch.send).toHaveBeenCalledOnce();
  });

  it('first-match semantics: only first matching rule fires', async () => {
    const ch1 = makeChannel('ch1');
    const ch2 = makeChannel('ch2');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1, ch2 },
      routing: [
        { match: { severity: ['critical'] }, channels: ['ch1'] },
        { match: { severity: ['critical'] }, channels: ['ch2'] },
      ],
    });

    await impl.notify({ title: 'T', body: 'B', severity: 'critical' });
    expect(ch1.send).toHaveBeenCalledOnce();
    expect(ch2.send).not.toHaveBeenCalled();
  });

  it('fan-out to multiple channels in a single rule', async () => {
    const ch1 = makeChannel('ch1');
    const ch2 = makeChannel('ch2');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1, ch2 },
      routing: [{ match: { severity: ['critical'] }, channels: ['ch1', 'ch2'] }],
    });

    await impl.notify({ title: 'T', body: 'B', severity: 'critical' });
    expect(ch1.send).toHaveBeenCalledOnce();
    expect(ch2.send).toHaveBeenCalledOnce();
  });

  it('publishes delivery.success event on successful send', async () => {
    const ch = makeChannel('ch1');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: { severity: ['critical'] }, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B', severity: 'critical' });

    expect(bus.publish).toHaveBeenCalledWith(
      DELIVERY_SUCCESS_TOPIC,
      expect.objectContaining({ channelId: 'ch1', success: true }),
    );
  });

  it('publishes delivery.failed event when channel throws', async () => {
    const ch = makeChannel('ch1', vi.fn<(event: NotificationEvent) => Promise<void>>(async () => { throw new Error('send failed'); }));
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: { severity: ['critical'] }, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B', severity: 'critical' });

    expect(bus.publish).toHaveBeenCalledWith(
      DELIVERY_FAILED_TOPIC,
      expect.objectContaining({ channelId: 'ch1', success: false, error: { message: 'send failed' } }),
    );
  });

  it('warns and skips unavailable channel without throwing', async () => {
    const ch = makeChannel('ch1');
    (ch.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: {}, channels: ['ch1'] }],
    });

    await impl.notify({ title: 'T', body: 'B' });
    expect(ch.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('delivery events use separate topic namespace (no loop)', async () => {
    expect(DELIVERY_SUCCESS_TOPIC).not.toMatch(/^notification\./);
    expect(DELIVERY_FAILED_TOPIC).not.toMatch(/^notification\./);
  });

  it('subscribe() filters by severity', async () => {
    const impl = new NotifierImpl({ eventBus: bus, logger, channels: {}, routing: [] });
    const handler = vi.fn<(event: NotificationEvent) => Promise<void>>(async () => {});

    impl.subscribe({ severity: ['critical'] }, handler);
    await impl.notify({ title: 'T', body: 'B', severity: 'info' });
    await impl.notify({ title: 'T', body: 'B', severity: 'critical' });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.lastCall![0]).toMatchObject({ severity: 'critical' });
  });

  it('subscribe() filters by source', async () => {
    const impl = new NotifierImpl({ eventBus: bus, logger, channels: {}, routing: [] });
    const handler = vi.fn(async () => {});

    impl.subscribe({ source: 'plugin-a' }, handler);
    await impl.notify({ title: 'T', body: 'B', source: 'plugin-b' });
    await impl.notify({ title: 'T', body: 'B', source: 'plugin-a' });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('dispose() stops handling events', async () => {
    const ch = makeChannel('ch1');
    const impl = new NotifierImpl({
      eventBus: bus,
      logger,
      channels: { ch1: ch },
      routing: [{ match: {}, channels: ['ch1'] }],
    });

    impl.dispose();
    await impl.notify({ title: 'T', body: 'B' });

    // bus.publish called for notify(), but channel.send must not be called
    // because the internal handler was unsubscribed
    expect(ch.send).not.toHaveBeenCalled();
  });
});
