import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTelegramChannel } from './index.js';
import type { NotificationEvent } from '@kb-labs/core-platform';

const BASE_EVENT: NotificationEvent = {
  id: 'test-id',
  title: 'Test Title',
  body: 'Test body',
  severity: 'info',
  emittedAt: Date.now(),
};

function makeChannel() {
  return createTelegramChannel({ botToken: 'bot123', chatId: '-1001234567890' }, 'tg');
}

describe('TelegramChannel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is available when botToken and chatId are set', () => {
    expect(makeChannel().isAvailable()).toBe(true);
  });

  it('is unavailable when botToken is empty', () => {
    const ch = createTelegramChannel({ botToken: '', chatId: '-1001' }, 'tg');
    expect(ch.isAvailable()).toBe(false);
  });

  it('exposes rateLimit = 30', () => {
    expect(makeChannel().rateLimit).toBe(30);
  });

  it('sends correct request body', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const ch = makeChannel();
    await ch.send(BASE_EVENT);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botbot123/sendMessage');
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe('-1001234567890');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('<b>Test Title</b>');
    expect(body.text).toContain('Test body');
  });

  it('HTML-escapes title and body (R5)', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const ch = makeChannel();
    await ch.send({ ...BASE_EVENT, title: '<script>', body: 'a & b > c' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('&lt;script&gt;');
    expect(body.text).toContain('a &amp; b &gt; c');
  });

  it('truncates body at 3800 chars and appends marker (R4)', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const ch = makeChannel();
    await ch.send({ ...BASE_EVENT, body: 'x'.repeat(4000) });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('…(truncated)');
    expect(body.text.length).toBeLessThan(4096);
  });

  it('includes action link when provided', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const ch = makeChannel();
    await ch.send({ ...BASE_EVENT, action: { url: 'https://example.com', label: 'Open' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain('<a href="https://example.com">Open</a>');
  });

  it('throws retryable error on 429', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'Too Many Requests' });
    const ch = makeChannel();
    await expect(ch.send(BASE_EVENT)).rejects.toThrow('429');
    const err = (await ch.send(BASE_EVENT).catch((e: unknown) => e)) as Error & { retryable?: boolean };
    expect(err.retryable).not.toBe(false);
  });

  it('throws retryable error on 500', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'Server Error' });
    const ch = makeChannel();
    const err = (await ch.send(BASE_EVENT).catch((e: unknown) => e)) as Error & { retryable?: boolean };
    expect(err).toBeInstanceOf(Error);
    expect(err.retryable).not.toBe(false);
  });

  it('marks 400 as non-retryable', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' });
    const ch = makeChannel();
    const err = (await ch.send(BASE_EVENT).catch((e: unknown) => e)) as Error & { retryable?: boolean };
    expect(err).toBeInstanceOf(Error);
    expect(err.retryable).toBe(false);
  });

  it('throws on network/timeout error (retryable)', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    const ch = makeChannel();
    await expect(ch.send(BASE_EVENT)).rejects.toThrow('fetch failed');
  });
});
